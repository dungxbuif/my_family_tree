"use server";

import { cookies } from "next/headers";
import { refresh } from "next/cache";
import { getUser } from "@/utils/auth/session";
import { createFamilyTree, selectFamilyTree } from "@/utils/auth/tree-access";

export type TreeNotice = { error: string; draft?: string } | { message: string; treeId: string };

export async function changeFamilyTree(_previous: TreeNotice | null, fields: FormData): Promise<TreeNotice> {
  const user = await getUser();
  if (!user) return { error: "Vui lòng đăng nhập lại." };
  const creating = fields.get("operation") === "create";
  const name = fields.get("name");
  const draft = creating && typeof name === "string" ? name.slice(0, 120) : undefined;
  try {
    const result = creating
      ? await createFamilyTree(user.id, name)
      : await selectFamilyTree(user.id, fields.get("treeId"));
    if (!result.tree) {
      refresh();
      return {
        error: result.code === "INVALID_NAME"
          ? "Vui lòng nhập tên cây gia phả từ 1 đến 120 ký tự."
          : creating ? "Tài khoản của bạn không thể tạo cây gia phả." : "Bạn không có quyền chọn cây gia phả này.",
        draft,
      };
    }
    (await cookies()).set("family_tree_selected", result.tree.id, {
      httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return { message: creating ? "Đã tạo và chọn cây gia phả." : "Đã chuyển cây gia phả.", treeId: result.tree.id };
  } catch {
    return { error: "Không thể cập nhật cây gia phả. Vui lòng thử lại.", draft };
  }
}
