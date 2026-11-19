import { randomUUID } from "node:crypto";
import {
  createMcpHandler,
  isJsonContentType,
  McpServer,
  type StandardSchemaWithJSON,
} from "@modelcontextprotocol/server";
import { AgentError } from "./contract";
import { withAgentCredential } from "./credentials";
import {
  agentError,
  requiredScope,
  runFamilyCommand,
  type FamilyAction,
  type FamilyCommand,
} from "./family-service";
import { bearer, failure, json, readJsonValue } from "./http";
import { toolInputs } from "./schemas";

const descriptions: Record<FamilyAction, string> = {
  list_family_trees:
    "List trees accessible to the credential owner and their current role.",
  list_people: "List public Person records in the tree.",
  get_person:
    "Get one Person. Private details require Owner and private scope.",
  create_person: "Create one Person in the tree.",
  update_person:
    "Apply a partial Person update. Editing life dates can convert an omitted legacy leap lunar month to its negative representation.",
  delete_person: "Delete an unlinked Person without relationships.",
  list_relationships: "List relationships in the tree.",
  create_relationship:
    "Add a relationship between two people in the same tree. For child relationships person_a is the parent.",
  delete_relationship: "Remove one relationship.",
  list_events: "List custom calendar events.",
  create_event: "Create a custom calendar event.",
  update_event:
    "Apply a partial event update, trim the name, and convert empty location and content strings to null, including existing values omitted from the update.",
  delete_event: "Delete one custom event.",
  list_gallery: "List Gallery metadata and owned image references.",
  create_gallery_item:
    "Attach an existing image uploaded to this tree's Gallery.",
  delete_gallery_item: "Delete one Gallery item.",
  get_family_stats:
    "Count people, relationships, custom events and Gallery items.",
  export_family_data:
    "Export a complete metadata backup up to 100 rows per collection and 1 MiB. Requires Owner, read and private.",
};
// Count object fields and array elements. Stop before schema validation and
// avoid recursive calls for deeply nested JSON.
function withinToolInputLimit(value: unknown) {
  const pending: unknown[] = [value];
  let elements = 0;
  while (pending.length) {
    const node = pending.pop();
    if (node === null || typeof node !== "object") continue;
    const record = node as Record<string, unknown>;
    for (const key in record) {
      if (!Object.hasOwn(record, key)) continue;
      if (++elements > 100) return false;
      pending.push(record[key]);
    }
  }
  return true;
}

// Decode an invocation to a command, including validation failures. Keeping a
// rejected command in the normal dispatch path gives it the same sanitized
// tool result and transactional audit as invalid REST input.
function decodeCommand(action: FamilyAction, value: unknown): FamilyCommand {
  const result = withinToolInputLimit(value)
    ? toolInputs[action].safeParse(value)
    : undefined;
  if (!result?.success) {
    const record = value && typeof value === "object" ? value : {};
    return {
      action,
      invalidInput: true,
      familyTreeId:
        "familyTreeId" in record && typeof record.familyTreeId === "string"
          ? record.familyTreeId
          : null,
      id:
        "id" in record && typeof record.id === "string" ? record.id : undefined,
    };
  }
  const args = result.data;
  return {
    action,
    familyTreeId: "familyTreeId" in args ? args.familyTreeId : undefined,
    id: "id" in args && typeof args.id === "string" ? args.id : undefined,
    body: "body" in args ? args.body : undefined,
    limit: "limit" in args ? args.limit?.toString() : undefined,
    offset: "offset" in args ? args.offset?.toString() : undefined,
  };
}
function safeError(error: unknown) {
  const { code, message } = agentError(error);
  return { code, message, requestId: randomUUID() };
}
const maxBodyBytes = 4 * 1024 * 1024;
const handler = createMcpHandler(
  ({ authInfo }) => {
    if (!authInfo) throw new AgentError("UNAUTHORIZED");
    const server = new McpServer(
      { name: "family-tree", version: "1.0.0" },
      { capabilities: { tools: { listChanged: false } } },
    );
    for (const action of Object.keys(toolInputs) as FamilyAction[]) {
      const schema = toolInputs[action];
      const standard = schema["~standard"];
      const inputSchema: StandardSchemaWithJSON<unknown, FamilyCommand> = {
        "~standard": {
          version: standard.version,
          vendor: standard.vendor,
          jsonSchema: standard.jsonSchema,
          validate: (value: unknown) => ({
            value: decodeCommand(action, value),
          }),
        },
      };
      const scope = requiredScope[action];
      server.registerTool(
        action,
        {
          description: descriptions[action],
          inputSchema,
          annotations: {
            readOnlyHint: scope === "read",
            destructiveHint: scope === "delete" || action.startsWith("update_"),
            openWorldHint: false,
          },
        },
        async (command: FamilyCommand) => {
          try {
            const result = await runFamilyCommand(
              authInfo.token,
              "mcp",
              command,
            );
            return {
              structuredContent: result.payload,
              content: [{ type: "text" as const, text: result.text }],
            };
          } catch (error) {
            const result = safeError(error);
            return {
              isError: true,
              structuredContent: result,
              content: [
                { type: "text" as const, text: JSON.stringify(result) },
              ],
            };
          }
        },
      );
    }
    return server;
  },
  { legacy: "stateless", maxRequestBodySize: maxBodyBytes },
);

function checkOrigin(request: Request) {
  const host = request.headers.get("host")?.toLowerCase();
  const origin = request.headers.get("origin");
  const origins = (process.env.MCP_ALLOWED_ORIGINS ?? "").split(",");
  for (const entry of origins) {
    const value = entry.trim();
    if (!value) continue;
    const url = URL.canParse(value) ? new URL(value) : null;
    if (
      url?.protocol === "https:" &&
      url.origin === value &&
      url.host === host &&
      (origin === null || origin === value)
    )
      return;
  }
  throw new AgentError("FORBIDDEN");
}
function rpcFailure(code: number, error: unknown, status: number) {
  const data = safeError(error);
  return json(
    { jsonrpc: "2.0", id: null, error: { code, message: data.message, data } },
    status,
  );
}
export async function mcpPost(request: Request) {
  try {
    checkOrigin(request);
    const token = bearer(request);
    // Discovery and initialization require an active key too. Release the
    // admission lock before reading the body. Each tool holds a fresh lock
    // through its family operation and mutation audit.
    const authInfo = await withAgentCredential(token, async (_client, key) => ({
      token,
      clientId: key.id,
      scopes: key.scopes,
    }));
    if (!isJsonContentType(request.headers.get("content-type")))
      return rpcFailure(-32000, new AgentError("INVALID_INPUT"), 415);
    let parsedBody: unknown;
    try {
      parsedBody = await readJsonValue(request, maxBodyBytes);
    } catch (error) {
      const reason = agentError(error);
      return rpcFailure(
        reason.status === 413 ? -32000 : -32700,
        reason,
        reason.status,
      );
    }
    if (
      !parsedBody ||
      typeof parsedBody !== "object" ||
      Array.isArray(parsedBody)
    )
      return rpcFailure(-32600, new AgentError("INVALID_INPUT"), 400);
    const response = await handler.fetch(request, { authInfo, parsedBody });
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  } catch (error) {
    return failure(error);
  }
}
