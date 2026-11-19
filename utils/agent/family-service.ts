import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { FamilyDataError, publicColumns, uuid } from "@/utils/family/records";
import {
  requireTreeRole,
  personDetail,
  removePerson,
} from "@/utils/family/person-records";
import {
  numberFields,
  privateFields,
  savePerson,
  textFields,
} from "@/utils/family/save-person";
import { AgentError, type Scope } from "./contract";
import {
  audit,
  withAgentCredential,
  type Agent,
  type Transport,
} from "./credentials";

const requiredScope = {
  list_family_trees: "read",
  list_people: "read",
  get_person: "read",
  create_person: "write",
  update_person: "write",
  delete_person: "delete",
} as const satisfies Record<string, Scope>;
export type FamilyAction = keyof typeof requiredScope;
export type FamilyCommand = {
  action: FamilyAction;
  familyTreeId?: string | null;
  id?: string;
  body?: unknown;
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
function personForm(body: unknown, key: Agent, id?: string) {
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    !Object.keys(body).length
  )
    throw new AgentError("INVALID_INPUT");
  const fields = new FormData();
  const numeric: readonly string[] = numberFields;
  const sensitive: readonly string[] = [...privateFields, "email"];
  const strings: readonly string[] = [...textFields, ...sensitive];
  for (const [name, value] of Object.entries(body)) {
    if (sensitive.includes(name) && !key.scopes.includes("private"))
      throw new AgentError("FORBIDDEN");
    if (numeric.includes(name)) {
      if (
        value !== null &&
        (typeof value !== "number" ||
          !Number.isInteger(value) ||
          Math.abs(value) > 2147483647)
      )
        throw new AgentError("INVALID_INPUT");
    } else if (name === "is_deceased" || name === "is_in_law") {
      if (
        typeof value !== "boolean" &&
        !(value === null && name === "is_deceased")
      )
        throw new AgentError("INVALID_INPUT");
    } else if (
      !strings.includes(name) ||
      (value !== null && (typeof value !== "string" || value.includes("\0")))
    )
      throw new AgentError("INVALID_INPUT");
    fields.set(
      name,
      value == null ? (name === "is_deceased" ? "unknown" : "") : String(value),
    );
  }
  if (id) fields.set("id", id);
  else fields.set("submissionId", randomUUID());
  return fields;
}

async function execute(client: PoolClient, key: Agent, command: FamilyCommand) {
  const { action, familyTreeId: tree, id } = command;
  if (!key.scopes.includes(requiredScope[action]))
    throw new AgentError("FORBIDDEN");
  if (action === "list_family_trees" || action === "list_people") {
    const limit = pageNumber(command.limit, 50, 1, 100),
      offset = pageNumber(command.offset, 0, 0, 2147483647);
    if (action === "list_family_trees") {
      const { rows } = await client.query(
        `SELECT t.id,t.name,m.role FROM tree_memberships m JOIN family_trees t ON t.id=m.tree_id
        WHERE m.user_id=$1 AND t.archived_at IS NULL ORDER BY t.created_at,t.id LIMIT $2 OFFSET $3`,
        [key.user_id, limit, offset],
      );
      return { data: rows };
    }
    if (!tree || !uuid.test(tree)) throw new AgentError("INVALID_INPUT");
    await requireTreeRole(client, key.user_id, tree, false);
    const { rows } = await client.query(
      `SELECT ${publicColumns} FROM persons WHERE tree_id=$1 ORDER BY id LIMIT $2 OFFSET $3`,
      [tree, limit, offset],
    );
    return { data: rows };
  }
  if (!tree || !uuid.test(tree)) throw new AgentError("INVALID_INPUT");
  const role = await requireTreeRole(
    client,
    key.user_id,
    tree,
    action !== "get_person",
  );
  if (action !== "create_person" && (!id || !uuid.test(id)))
    throw new AgentError("NOT_FOUND");
  if (action === "get_person") {
    const detail = await personDetail(
      client,
      tree,
      id!,
      role,
      key.scopes.includes("private"),
    );
    if (!detail) throw new AgentError("NOT_FOUND");
    return {
      data: {
        ...detail.person,
        ...(key.scopes.includes("private") && role === "owner"
          ? { privateData: detail.privateData }
          : {}),
      },
    };
  }
  if (action === "delete_person") {
    await removePerson(client, tree, id!);
    return { data: { id: id! }, resourceId: id! };
  }
  const fields = personForm(
    command.body,
    key,
    action === "update_person" ? id : undefined,
  );
  const saved = await savePerson(client, tree, key.user_id, role, fields);
  return { data: { id: saved }, resourceId: saved };
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
  return { data: result.response.data };
}
