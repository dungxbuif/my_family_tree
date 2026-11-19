"use server";

import { redirect } from "next/navigation";
import { getUser } from "@/utils/auth/session";
import { changeBrowserAccess, readAccessDraft, type AccessDraft, type AccessNotice } from "@/utils/auth/browser-tree-membership";

export type AccessFormState = { notice: AccessNotice; draft?: AccessDraft };
export async function submitTreeAccess(_previous: AccessFormState | null, fields: FormData): Promise<AccessFormState> {
  const user = await getUser();
  if (!user) return { notice: { code: "FORBIDDEN" } };
  let notice: AccessNotice;
  try {
    notice = await changeBrowserAccess(user.id, fields);
  } catch {
    return { notice: { code: "UNCERTAIN" } };
  }
  if ("ok" in notice) redirect("/dashboard/account/trees/access?saved=1&treeId=" + encodeURIComponent(String(fields.get("treeId"))));
  return { notice, draft: readAccessDraft(fields) };
}
