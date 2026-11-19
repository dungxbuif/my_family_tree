import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import {
  FamilyDataError,
  publicColumns,
  personTextFields,
  uuid,
} from "@/utils/family/records";
import {
  requireTreeRole,
  personDetail,
  removePerson,
} from "@/utils/family/person-records";
import type { z } from "zod";
import { privateFields, savePerson } from "@/utils/family/save-person";
import { readRows, responseSizeMessage } from "@/utils/family/read-rows";
import { familyMedia } from "@/utils/family/media";
import { exportBackup } from "@/utils/family/backup";
import {
  insertEdge,
  removeEdge,
  listEdges,
} from "@/utils/family/relationships";
import {
  toolInputs,
  personCreate,
  personUpdate,
  edgeCreate,
  eventCreate,
  eventUpdate,
  galleryCreate,
} from "./schemas";
import { AgentError, type Scope } from "./contract";
import {
  audit,
  withAgentCredential,
  type Agent,
  type Transport,
} from "./credentials";

const maxResponseBytes = 1024 * 1024;
export const requiredScope = {
  list_family_trees: "read",
  list_people: "read",
  get_person: "read",
  create_person: "write",
  update_person: "write",
  delete_person: "delete",
  list_relationships: "read",
  create_relationship: "write",
  delete_relationship: "delete",
  list_events: "read",
  create_event: "write",
  update_event: "write",
  delete_event: "delete",
  list_gallery: "read",
  create_gallery_item: "write",
  delete_gallery_item: "delete",
  get_family_stats: "read",
  export_family_data: "read",
} as const satisfies Record<keyof typeof toolInputs, Scope>;
export type FamilyAction = keyof typeof requiredScope;
export type FamilyCommand = {
  action: FamilyAction;
  familyTreeId?: string | null;
  id?: string;
  body?: unknown;
  invalidInput?: boolean;
  limit?: string | null;
  offset?: string | null;
};
export function agentError(error: unknown): AgentError {
  if (error instanceof AgentError) return error;
  if (error instanceof FamilyDataError) {
    const codes = {
      invalid: "INVALID_INPUT",
      forbidden: "FORBIDDEN",
      unavailable: "NOT_FOUND",
      conflict: "CONFLICT",
    } as const;
    return new AgentError(codes[error.kind], error.message);
  }
  return new AgentError("INTERNAL_ERROR");
}
function pageNumber(
  value: string | null | undefined,
  fallback: number,
  min: number,
  max: number,
) {
  if (value == null) return fallback;
  const n = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(n) || n < min || n > max)
    throw new AgentError("INVALID_INPUT");
  return n;
}
function parse<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (!result.success) throw new AgentError("INVALID_INPUT");
  return result.data;
}
function personForm(body: unknown, key: Agent, id?: string) {
  const data = parse(id ? personUpdate : personCreate, body);
  const fields = new FormData();
  const sensitive: readonly string[] = [...privateFields, "email"];
  for (const [name, value] of Object.entries(data)) {
    if (sensitive.includes(name) && !key.scopes.includes("private"))
      throw new AgentError("FORBIDDEN");
    fields.set(
      name,
      value == null ? (name === "is_deceased" ? "unknown" : "") : String(value),
    );
  }
  if (id) fields.set("id", id);
  else fields.set("submissionId", randomUUID());
  return fields;
}

async function execute(
  client: PoolClient,
  key: Agent,
  command: FamilyCommand,
): Promise<{ data: unknown; resourceId?: string }> {
  const { action, familyTreeId: tree, id, body } = command;
  const scope = requiredScope[action];
  if (!key.scopes.includes(scope)) throw new AgentError("FORBIDDEN");
  if (command.invalidInput) throw new AgentError("INVALID_INPUT");
  const page = () => ({
    limit: pageNumber(command.limit, 50, 1, 100),
    offset: pageNumber(command.offset, 0, 0, 2147483647),
    maxBytes: maxResponseBytes,
  });
  if (action === "list_family_trees") {
    const { limit, offset } = page();
    const rows = await readRows(
      client,
      `SELECT t.id,t.name,m.role FROM tree_memberships m JOIN family_trees t ON t.id=m.tree_id
        WHERE m.user_id=$1 AND t.archived_at IS NULL ORDER BY t.created_at,t.id LIMIT $2 OFFSET $3`,
      [key.user_id, limit, offset],
      ["name"],
      maxResponseBytes,
    );
    return { data: rows };
  }
  if (!tree || !uuid.test(tree)) throw new AgentError("INVALID_INPUT");
  const role = await requireTreeRole(
    client,
    key.user_id,
    tree,
    scope !== "read",
  );
  // Browser and agent operations use the same media rules. The agent already
  // holds this tree's role lock and audit transaction.
  const media = familyMedia(key.user_id, tree, (_write, fn) =>
    fn(client, role),
  );
  function itemId() {
    if (!id || !uuid.test(id)) throw new AgentError("NOT_FOUND");
    return id;
  }
  const saved = (resourceId: string) => ({
    data: { id: resourceId },
    resourceId,
  });
  switch (action) {
    case "list_people": {
      const { limit, offset } = page();
      return {
        data: await readRows(
          client,
          `SELECT ${publicColumns} FROM persons WHERE tree_id=$1 ORDER BY id LIMIT $2 OFFSET $3`,
          [tree, limit, offset],
          personTextFields,
          maxResponseBytes,
        ),
      };
    }
    case "get_person": {
      const privateAccess = role === "owner" && key.scopes.includes("private");
      const detail = await personDetail(
        client,
        tree,
        itemId(),
        role,
        privateAccess,
        maxResponseBytes,
      );
      if (!detail) throw new AgentError("NOT_FOUND");
      return {
        data: {
          ...detail.person,
          ...(privateAccess ? { privateData: detail.privateData } : {}),
        },
      };
    }
    case "delete_person":
      await removePerson(client, tree, itemId());
      return saved(id!);
    case "create_person":
    case "update_person":
      return saved(
        await savePerson(
          client,
          tree,
          key.user_id,
          role,
          personForm(
            body,
            key,
            action === "update_person" ? itemId() : undefined,
          ),
        ),
      );
    case "list_relationships":
      return { data: await listEdges(client, tree, page()) };
    case "create_relationship":
      return saved(await insertEdge(client, tree, parse(edgeCreate, body)));
    case "delete_relationship":
      await removeEdge(client, tree, itemId());
      return saved(id!);
    case "list_events":
      return { data: await media.calendar(page()) };
    case "create_event": {
      const event = parse(eventCreate, body);
      return saved(
        await media.saveEvent({
          ...event,
          content: event.content ?? null,
          location: event.location ?? null,
        }),
      );
    }
    case "update_event": {
      const eventId = itemId(),
        patch = parse(eventUpdate, body);
      return saved(
        await media.saveEvent({
          ...(await media.event(eventId)),
          ...patch,
          id: eventId,
        }),
      );
    }
    case "delete_event":
      await media.deleteEvent(itemId());
      return saved(id!);
    case "list_gallery":
      return { data: await media.gallery(page()) };
    case "create_gallery_item": {
      const item = parse(galleryCreate, body);
      return saved(
        await media.saveGallery({
          title: item.title,
          description: item.description ?? "",
          eventDate: item.event_date ?? "",
          imageUrl: item.image_url,
        }),
      );
    }
    case "delete_gallery_item":
      await media.deleteGallery(itemId());
      return saved(id!);
    case "get_family_stats": {
      const {
        rows: [counts],
      } = await client.query(
        `SELECT (SELECT count(*)::int FROM persons WHERE tree_id=$1) AS persons,
          (SELECT count(*)::int FROM relationships WHERE tree_id=$1) AS relationships,
          (SELECT count(*)::int FROM custom_events WHERE tree_id=$1) AS events,
          (SELECT count(*)::int FROM gallery_items WHERE tree_id=$1) AS gallery`,
        [tree],
      );
      return { data: counts };
    }
    case "export_family_data": {
      if (role !== "owner" || !key.scopes.includes("private"))
        throw new AgentError("FORBIDDEN");
      const data = await exportBackup(client, tree, undefined, {
        maxRows: 100,
        maxBytes: maxResponseBytes,
      });
      return { data };
    }
  }
}

// Hold the authenticated key and the tree locks through the mutation and its audit.
// A savepoint lets a denied or failed mutation keep only its metadata.
export async function runFamilyCommand(
  token: string,
  transport: Transport,
  command: FamilyCommand,
) {
  const result = await withAgentCredential(token, async (client, key) => {
    const mutation = requiredScope[command.action] !== "read";
    if (!mutation) return { response: await execute(client, key, command) };
    const tree =
      command.familyTreeId && uuid.test(command.familyTreeId)
        ? command.familyTreeId
        : null;
    await client.query("SAVEPOINT family_mutation");
    try {
      const response = await execute(client, key, command);
      await audit(
        client,
        key,
        transport,
        command.action,
        tree,
        response.resourceId ?? null,
        "success",
      );
      return { response };
    } catch (error) {
      await client.query("ROLLBACK TO SAVEPOINT family_mutation");
      const reason = agentError(error);
      await audit(
        client,
        key,
        transport,
        command.action,
        tree,
        command.id && uuid.test(command.id) ? command.id : null,
        reason.status === 403 ? "denied" : "failed",
      );
      return { error: reason };
    }
  });
  if (result.error) throw result.error;
  const payload = { data: result.response.data };
  const text = JSON.stringify(payload);
  // The database bounds original text before transport. JSON escaping,
  // timestamps, fixed-width fields and the envelope count toward the same cap.
  if (Buffer.byteLength(text) > maxResponseBytes)
    throw new AgentError("INVALID_INPUT", responseSizeMessage);
  return { payload, text };
}
