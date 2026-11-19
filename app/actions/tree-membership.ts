"use server";

import { redirect } from "next/navigation";
import { getSessionToken, getUser } from "@/utils/auth/session";
import { changeBrowserAccess, readAccessDraft, type AccessDraft, type AccessNotice } from "@/utils/auth/browser-tree-membership";
import { claimNativeAccess, finishNativeAccess } from "@/utils/auth/native-access-submission";
import { accessPath } from "@/utils/tree-access-labels";

export type AccessFormState = { notice: AccessNotice; draft?: AccessDraft };
export async function submitTreeAccess(_previous: AccessFormState | null, fields: FormData): Promise<AccessFormState> {
  const user = await getUser(), token = await getSessionToken(), id = fields.get("submission");
  if (!user || !token || typeof id !== "string") return { notice: { code: "FORBIDDEN" } };
  const outcomeUrl = accessPath + "/outcome/" + encodeURIComponent(id);
  const claim = await claimNativeAccess(token, id, fields);
  if (claim === "existing") redirect(outcomeUrl);
  if (claim === "denied") return { notice: { code: "FORBIDDEN" } };
  let notice: AccessNotice;
  try {
    notice = await changeBrowserAccess(user.id, fields);
    if ("ok" in notice || notice.code !== "UNCERTAIN") await finishNativeAccess(token, id, "ok" in notice);
  } catch {
    notice = { code: "UNCERTAIN" };
  }
  if ("ok" in notice || notice.code === "UNCERTAIN") redirect(outcomeUrl);
  return { notice, draft: readAccessDraft(fields) };
}
