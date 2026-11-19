import { randomUUID } from "node:crypto";
import { query } from "@/utils/db/client";
import { accessOperations, accessPath, type AccessOperation } from "@/utils/tree-access-labels";
import { hashSessionToken } from "./session";
import { changeBrowserAccess, readAccessDraft, type AccessNotice } from "./browser-tree-membership";
import { isTreeRole } from "./tree-membership";
import type { TreeRole } from "@/types";

export const submissionIdPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
type SubmittedAccess = {
  treeId: string; operation: AccessOperation; email?: string; role?: TreeRole; personId?: string; userId?: string;
};
type Rejection = Exclude<Extract<AccessNotice, { code: string }>["code"], "UNCERTAIN">;
export type NativeAccessOutcome = { confirmed: boolean; pending: boolean; rejection: Rejection | null; draft: SubmittedAccess };

export async function readNativeAccessOutcome(token: string, id: string) {
  if (!submissionIdPattern.test(id)) return null;
  const { rows } = await query<NativeAccessOutcome>(
    `SELECT r.confirmed,r.draft,r.rejection,
        (r.claim_token IS NOT NULL AND r.pending_until>clock_timestamp()) AS pending
      FROM native_access_submissions r JOIN sessions s ON s.id=r.session_id JOIN profiles p ON p.id=s.user_id
      WHERE s.token_hash=$1 AND r.id=$2 AND p.is_active AND s.expires_at>now()`, [hashSessionToken(token), id]);
  return rows[0] ?? null;
}

function submittedAccess(fields: FormData): SubmittedAccess | null {
  const treeId = fields.get("treeId"), operation = fields.get("operation"), userId = fields.get("userId");
  if (typeof treeId !== "string" || !submissionIdPattern.test(treeId)
      || typeof operation !== "string" || !Object.hasOwn(accessOperations, operation)) return null;
  const { email, role, personId } = readAccessDraft(fields);
  const draft: SubmittedAccess = { treeId, operation: operation as AccessOperation };
  if (operation === "link" || operation === "add") draft.email = email;
  if (operation === "add" || operation === "role") draft.role = isTreeRole(role) ? role : "viewer";
  if ((operation === "link" || operation === "unlink") && submissionIdPattern.test(personId)) draft.personId = personId;
  if (["role", "remove", "unlink"].includes(operation) && typeof userId === "string" && submissionIdPattern.test(userId)) draft.userId = userId;
  return draft;
}

function correctionUrl(draft: SubmittedAccess, id: string) {
  const params = new URLSearchParams({ treeId: draft.treeId, operation: draft.operation, submission: randomUUID(), retryOf: id });
  if (draft.userId) params.set("userId", draft.userId);
  if (draft.operation === "unlink" && draft.personId) params.set("personId", draft.personId);
  return accessPath + "/edit?" + params;
}

type SubmissionResult = { notice: AccessNotice; outcomeUrl?: string; retryUrl?: string; duplicate?: boolean };
export async function submitAccessOnce(userId: string, sessionToken: string, fields: FormData): Promise<SubmissionResult> {
  const id = fields.get("submission"), draft = submittedAccess(fields);
  if (!draft || typeof id !== "string" || !submissionIdPattern.test(id)) return { notice: { code: "FORBIDDEN" } };
  const tokenHash = hashSessionToken(sessionToken), claimToken = randomUUID();
  const outcomeUrl = accessPath + "/outcome/" + id;

  // A live session retains its claim even after the pending deadline. GC only
  // removes rows whose session has expired, so a stale ID can never be reclaimed.
  await query(`WITH expired AS (
    SELECT r.session_id,r.id FROM native_access_submissions r
    WHERE r.expires_at<=now() AND NOT EXISTS (SELECT FROM sessions s WHERE s.id=r.session_id AND s.expires_at>now())
    ORDER BY r.expires_at LIMIT 128 FOR UPDATE OF r SKIP LOCKED
  ) DELETE FROM native_access_submissions r USING expired e WHERE (r.session_id,r.id)=(e.session_id,e.id)`);
  const claim = await query(`INSERT INTO native_access_submissions(session_id,id,draft,expires_at,claim_token,pending_until)
    SELECT s.id,$2,$4::jsonb,s.expires_at,$5,clock_timestamp()+interval '30 seconds'
      FROM sessions s JOIN profiles p ON p.id=s.user_id JOIN tree_memberships m ON m.user_id=s.user_id AND m.tree_id=$3
      JOIN family_trees t ON t.id=m.tree_id
    WHERE s.token_hash=$1 AND s.expires_at>now() AND p.is_active AND m.role='owner' AND t.archived_at IS NULL
    ON CONFLICT DO NOTHING`, [tokenHash,id,draft.treeId,JSON.stringify(draft),claimToken]);

  if (!claim.rowCount) {
    const previous = await readNativeAccessOutcome(sessionToken, id);
    if (!previous) return { notice: { code: "FORBIDDEN" } };
    return { notice: previous.confirmed ? { ok: true } : { code: previous.rejection ?? "UNCERTAIN" }, outcomeUrl, duplicate: true };
  }

  let notice: AccessNotice;
  try {
    notice = await changeBrowserAccess(userId, fields, { id, token: claimToken });
  } catch {
    notice = { code: "UNCERTAIN" };
  }
  const rejection = "code" in notice && notice.code !== "UNCERTAIN" ? notice.code : null;
  try {
    const finished = await query(`UPDATE native_access_submissions r
      SET confirmed=$4,rejection=$5,claim_token=NULL,pending_until=NULL FROM sessions s
      WHERE r.session_id=s.id AND s.token_hash=$1 AND r.id=$2 AND r.claim_token=$3`,
      [tokenHash,id,claimToken,"ok" in notice,rejection]);
    if (!finished.rowCount) return { notice: { code: "UNCERTAIN" }, outcomeUrl };
  } catch {
    return { notice: { code: "UNCERTAIN" }, outcomeUrl };
  }
  return { notice, outcomeUrl, retryUrl: rejection && rejection !== "FORBIDDEN" ? correctionUrl(draft,id) : undefined };
}
