import { query } from "@/utils/db/client";
import { accessOperations, type AccessOperation } from "@/utils/tree-access-labels";
import { hashSessionToken } from "./session";
import { readAccessDraft } from "./browser-tree-membership";
import { isTreeRole } from "./tree-membership";
import type { TreeRole } from "@/types";

export const submissionIdPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
type SubmittedAccess = {
  treeId: string; operation: AccessOperation; email?: string; role?: TreeRole; personId?: string; userId?: string;
};
export type NativeAccessOutcome = { confirmed: boolean; draft: SubmittedAccess };

export async function readNativeAccessOutcome(token: string, id: string) {
  if (!submissionIdPattern.test(id)) return null;
  const { rows } = await query<NativeAccessOutcome>(
    `SELECT r.confirmed,r.draft FROM native_access_submissions r JOIN sessions s ON s.id=r.session_id
      JOIN profiles p ON p.id=s.user_id
      WHERE s.token_hash=$1 AND r.id=$2 AND p.is_active AND s.expires_at>now()`, [hashSessionToken(token), id]);
  return rows[0] ?? null;
}

export async function claimNativeAccess(token: string, id: string, fields: FormData) {
  const treeId = fields.get("treeId"), operation = fields.get("operation"), userId = fields.get("userId");
  if (!submissionIdPattern.test(id) || typeof treeId !== "string" || !submissionIdPattern.test(treeId)
      || typeof operation !== "string" || !Object.hasOwn(accessOperations, operation)) return "denied";
  const { email, role, personId } = readAccessDraft(fields);
  const draft: SubmittedAccess = { treeId, operation: operation as AccessOperation };
  if (operation === "link" || operation === "add") draft.email = email;
  if (operation === "add" || operation === "role") draft.role = isTreeRole(role) ? role : "viewer";
  if ((operation === "link" || operation === "unlink") && submissionIdPattern.test(personId)) draft.personId = personId;
  if (["role", "remove", "unlink"].includes(operation) && typeof userId === "string" && submissionIdPattern.test(userId)) draft.userId = userId;

  await query("DELETE FROM native_access_submissions WHERE expires_at<=now()");
  // Commit the submitted fields before starting the domain transaction. A lost
  // acknowledgement leaves a readable outcome and the unique claim prevents replay.
  const result = await query(`INSERT INTO native_access_submissions(session_id,id,draft,expires_at)
    SELECT s.id,$2,$4::jsonb,s.expires_at FROM sessions s JOIN profiles p ON p.id=s.user_id
      JOIN tree_memberships m ON m.user_id=s.user_id AND m.tree_id=$3
      JOIN family_trees t ON t.id=m.tree_id
    WHERE s.token_hash=$1 AND s.expires_at>now() AND p.is_active AND m.role='owner' AND t.archived_at IS NULL
    ON CONFLICT DO NOTHING`, [hashSessionToken(token),id,treeId,JSON.stringify(draft)]);
  if (result.rowCount) return "claimed";
  return await readNativeAccessOutcome(token, id) ? "existing" : "denied";
}

export async function finishNativeAccess(token: string, id: string, confirmed: boolean) {
  // A rejected command did not mutate. Release it so the same form can be corrected.
  const sql = confirmed
    ? "UPDATE native_access_submissions r SET confirmed=true FROM sessions s"
    : "DELETE FROM native_access_submissions r USING sessions s";
  await query(sql + " WHERE r.session_id=s.id AND s.token_hash=$1 AND r.id=$2", [hashSessionToken(token),id]);
}
