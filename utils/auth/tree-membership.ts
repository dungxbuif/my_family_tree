import type { Pool, PoolClient } from "pg";
import { domainToASCII } from "node:url";
import { pool, withTransaction } from "@/utils/db/client";
import type { TreeRole } from "@/types";
import { accountAccessLock } from "./account-access-lock";

type Database = Pick<Pool, "connect">;
export type AccessCommand =
  | { operation: "add"; email: string; role?: TreeRole }
  | { operation: "role"; userId: string; role: TreeRole }
  | { operation: "remove"; userId: string }
  | { operation: "link"; personId: string; email: string }
  | { operation: "person-email"; personId: string; email: string }
  | { operation: "unlink"; personId: string; userId: string };
type AccessCode = "INVALID_EMAIL" | "FORBIDDEN" | "UNAVAILABLE" | "LAST_OWNER" | "LINKED" | "UNCERTAIN";
export type AccessResult = { ok: true } | { code: AccessCode };
const forbidden = { code: "FORBIDDEN" } as const;
const unavailable = { code: "UNAVAILABLE" } as const;
const success = { ok: true } as const;
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
export function isTreeRole(value: unknown): value is TreeRole {
  return value === "owner" || value === "editor" || value === "viewer";
}

async function lockOwnedTree(client: PoolClient, actor: string, treeId: string) {
  if (!uuid.test(treeId) || !uuid.test(actor)) return false;
  await client.query(accountAccessLock.shared);
  // Serialize access decisions per tree, then check the current Owner in a fresh snapshot.
  const tree = await client.query(`SELECT t.id FROM family_trees t
    WHERE id=$1 AND archived_at IS NULL AND EXISTS
      (SELECT FROM tree_memberships WHERE tree_id=t.id AND user_id=$2 AND role='owner')
    FOR UPDATE`, [treeId, actor]);
  if (!tree.rowCount) return false;
  const membership = await client.query(`SELECT m.user_id FROM tree_memberships m JOIN profiles p ON p.id=m.user_id
    WHERE m.tree_id=$1 AND m.user_id=$2 AND m.role='owner' AND p.is_active FOR SHARE OF m,p`, [treeId, actor]);
  return membership.rowCount === 1;
}

async function normalizeEmail(client: PoolClient, email: string) {
  if (typeof email !== "string" || email.length > 512 || email.includes("\0")) return null;
  const { rows: [{ value }] } = await client.query<{ value: string }>("SELECT public.normalize_email($1) AS value", [email]);
  // Existing accounts can have legacy mailbox syntax. The normalized equality
  // match establishes identity, including quoted names and single-label domains.
  const separator = value.lastIndexOf("@");
  return separator > 0 && separator < value.length - 1 ? value : null;
}

// Person email can use a quoted local name or a single-label internal domain.
function validPersonEmail(email: string) {
  const at = email.lastIndexOf("@");
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const atom = /^[\p{L}\p{N}\p{M}!#$%&'*+/=?^_`{|}~.-]+$/u;
  const quoted = /^"(?:[^"\\\r\n]|\\.)+"$/u;
  const validLocal = quoted.test(local) || (atom.test(local) && !local.startsWith(".") && !local.endsWith(".") && !local.includes(".."));
  if (at < 1 || !validLocal || Buffer.byteLength(local) > 64 || Buffer.byteLength(email) > 254) return false;
  // Reject URL punctuation before IDNA conversion, which also parses URL hosts.
  if (!/^[\p{L}\p{M}\p{N}.-]+$/u.test(domain)) return false;
  return domainToASCII(domain).split(".").every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label));
}

async function activeUser(client: PoolClient, email: string) {
  const { rows } = await client.query<{ id: string }>(`SELECT u.id FROM users u JOIN profiles p ON p.id=u.id
    WHERE public.normalize_email(u.email)=$1 AND p.is_active FOR SHARE OF u,p`, [email]);
  return rows[0]?.id;
}

// Caller holds the tree and Person locks and has checked that this Person is unlinked.
async function linkAccount(client: PoolClient, treeId: string, personId: string, userId: string) {
  const existing = await client.query("SELECT FROM persons WHERE tree_id=$1 AND linked_user_id=$2", [treeId, userId]);
  if (existing.rowCount) return unavailable;
  await client.query(`INSERT INTO tree_memberships(tree_id,user_id,role) VALUES ($1,$2,'viewer')
    ON CONFLICT DO NOTHING`, [treeId, userId]);
  await client.query("UPDATE persons SET linked_user_id=$3 WHERE tree_id=$1 AND id=$2", [treeId, personId, userId]);
  return success;
}

// Call inside an open transaction, before taking Person row locks. The caller may
// then save the rest of the Person edit and commit all changes together.
export async function updatePersonEmailInTransaction(
  client: PoolClient, actor: string, treeId: string, personId: string, rawEmail: string,
): Promise<AccessResult> {
  if (!await lockOwnedTree(client, actor, treeId)) return forbidden;
  return updatePersonEmail(client, treeId, personId, rawEmail);
}

async function updatePersonEmail(client: PoolClient, treeId: string, personId: string, rawEmail: string) {
  if (!uuid.test(personId) || typeof rawEmail !== "string") return unavailable;
  const email = await normalizeEmail(client, rawEmail);
  if (rawEmail.length > 512 || (rawEmail.trim() && (!email || !validPersonEmail(email)))) {
    return { code: "INVALID_EMAIL" } as const;
  }
  const { rows: [person] } = await client.query<{ email: string | null; linked_user_id: string | null }>(
    "SELECT email,linked_user_id FROM persons WHERE tree_id=$1 AND id=$2 FOR UPDATE", [treeId, personId]);
  if (!person) return unavailable;
  if (email === person.email) return success;
  const conflict = await client.query("SELECT FROM persons WHERE tree_id=$1 AND email=$2", [treeId, email]);
  if (conflict.rowCount) return unavailable;
  if (email && !person.linked_user_id) {
    const target = await activeUser(client, email);
    if (target) {
      const link = await linkAccount(client, treeId, personId, target);
      if (!("ok" in link)) return link;
    }
  }
  await client.query("UPDATE persons SET email=$3 WHERE tree_id=$1 AND id=$2", [treeId, personId, email]);
  return success;
}

async function changeMember(
  client: PoolClient, treeId: string, command: Extract<AccessCommand, { operation: "role" | "remove" }>,
): Promise<AccessResult> {
  if (!uuid.test(command.userId) || (command.operation === "role" && !isTreeRole(command.role))) return unavailable;
  const { rows: [target] } = await client.query<{ role: TreeRole }>(
    "SELECT role FROM tree_memberships WHERE tree_id=$1 AND user_id=$2 FOR UPDATE", [treeId, command.userId]);
  if (!target) return unavailable;
  if (target.role === "owner" && (command.operation === "remove" || command.role !== "owner")) {
    const others = await client.query(`SELECT FROM tree_memberships m JOIN profiles p ON p.id=m.user_id
      WHERE m.tree_id=$1 AND m.user_id<>$2 AND m.role='owner' AND p.is_active LIMIT 1 FOR SHARE OF p`,
      [treeId, command.userId]);
    if (!others.rowCount) return { code: "LAST_OWNER" } as const;
  }
  if (command.operation === "remove") {
    const linked = await client.query("SELECT FROM persons WHERE tree_id=$1 AND linked_user_id=$2", [treeId, command.userId]);
    if (linked.rowCount) return { code: "LINKED" } as const;
    await client.query("DELETE FROM tree_memberships WHERE tree_id=$1 AND user_id=$2", [treeId, command.userId]);
  } else {
    await client.query("UPDATE tree_memberships SET role=$3 WHERE tree_id=$1 AND user_id=$2", [treeId, command.userId, command.role]);
  }
  return success;
}

export async function manageTreeAccess(actor: string, treeId: string, command: AccessCommand, database: Database = pool,
  claim?: { id: string; token: string }): Promise<AccessResult> {
  return withTransaction(async client => {
    if (claim) await client.query("SET LOCAL statement_timeout='30s'");
    if (!await lockOwnedTree(client, actor, treeId)) return forbidden;
    if (claim) {
      // Recheck after waiting for the tree lock. An abandoned form cannot start
      // a mutation after its deadline, even if its original process resumes.
      const current = await client.query(`SELECT FROM native_access_submissions r JOIN sessions s ON s.id=r.session_id
        WHERE r.id=$1 AND r.claim_token=$2 AND s.user_id=$3 AND r.pending_until>clock_timestamp()
          AND r.draft->>'treeId'=$4 AND s.expires_at>clock_timestamp()`, [claim.id, claim.token, actor, treeId]);
      if (!current.rowCount) return { code: "UNCERTAIN" } as const;
    }
    if (command.operation === "person-email") return updatePersonEmail(client, treeId, command.personId, command.email);
    if (command.operation === "role" || command.operation === "remove") return changeMember(client, treeId, command);
    if (command.operation === "unlink") {
      if (!uuid.test(command.personId) || !uuid.test(command.userId)) return unavailable;
      const result = await client.query("UPDATE persons SET linked_user_id=NULL WHERE tree_id=$1 AND id=$2 AND linked_user_id=$3",
        [treeId, command.personId, command.userId]);
      return result.rowCount ? success : unavailable;
    }
    const email = await normalizeEmail(client, command.email);
    const target = email && await activeUser(client, email);
    if (!target) return unavailable;
    if (command.operation === "link") {
      if (!uuid.test(command.personId)) return unavailable;
      const person = await client.query("SELECT FROM persons WHERE tree_id=$1 AND id=$2 AND linked_user_id IS NULL FOR UPDATE",
        [treeId, command.personId]);
      return person.rowCount ? linkAccount(client, treeId, command.personId, target) : unavailable;
    }
    if (command.operation !== "add") return unavailable;
    const role = command.role ?? "viewer";
    if (!isTreeRole(role)) return unavailable;
    const added = await client.query(`INSERT INTO tree_memberships(tree_id,user_id,role)
      VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [treeId,target,role]);
    return added.rowCount ? success : unavailable;
  }, database);
}

export type AccessMember = { userId: string; email: string; role: TreeRole; personId: string | null; personName: string | null };
export type AccessSnapshot = { members: AccessMember[]; people: { id: string; name: string }[] };
export async function readTreeAccess(actor: string, treeId: string, database: Database = pool): Promise<AccessSnapshot | null> {
  return withTransaction(async client => {
    if (!await lockOwnedTree(client, actor, treeId)) return null;
    const members = await client.query<AccessMember>(`SELECT m.user_id AS "userId", u.email, m.role,
        person.id AS "personId", person.full_name AS "personName"
      FROM tree_memberships m JOIN users u ON u.id=m.user_id
      LEFT JOIN persons person ON person.tree_id=m.tree_id AND person.linked_user_id=m.user_id
      WHERE m.tree_id=$1 ORDER BY u.email, m.user_id`, [treeId]);
    const people = await client.query<{ id: string; name: string }>(
      "SELECT id,full_name AS name FROM persons WHERE tree_id=$1 AND linked_user_id IS NULL ORDER BY full_name,id", [treeId]);
    return { members: members.rows, people: people.rows };
  }, database);
}
