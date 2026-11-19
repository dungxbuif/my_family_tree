"use server";

import { refresh } from "next/cache";
import { getUser } from "@/utils/auth/session";
import { changeBrowserTree, type TreeNotice } from "@/utils/auth/browser-tree-selection";

export async function changeFamilyTree(_previous: TreeNotice | null, fields: FormData): Promise<TreeNotice> {
  const user = await getUser();
  if (!user) return { error: "Vui lòng đăng nhập lại." };
  const notice = await changeBrowserTree(user.id, fields);
  if ("error" in notice) refresh();
  return notice;
}
