"use server";

import { redirect } from "next/navigation";
import { getSessionToken, getUser } from "@/utils/auth/session";
import type { AccessNotice } from "@/utils/auth/browser-tree-membership";
import { submitAccessOnce } from "@/utils/auth/native-access-submission";

export async function submitTreeAccess(_previous: AccessNotice | null, fields: FormData): Promise<AccessNotice> {
  const user = await getUser(), token = await getSessionToken();
  if (!user || !token) return { code: "FORBIDDEN" };
  const result = await submitAccessOnce(user.id, token, fields);
  if (result.retryUrl) redirect(result.retryUrl);
  if (result.outcomeUrl) redirect(result.outcomeUrl);
  return result.notice;
}
