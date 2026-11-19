import { FAMILY_TREE_NAME_LIMIT } from "@/types";
import { cookies } from "next/headers";
import { createFamilyTree, getTreeSelection, selectFamilyTree } from "@/utils/auth/tree-access";

export type TreeNotice = { error: string; draft?: string } | { message: string; treeId: string };

const TREE_COOKIE = "family_tree_selected";

export async function getBrowserTreeSelection(userId: string) {
  const hint = (await cookies()).get(TREE_COOKIE)?.value;
  return getTreeSelection(userId, hint);
}

export async function changeBrowserTree(userId: string, fields: FormData): Promise<TreeNotice> {
  const creating = fields.get("operation") === "create";
  const name = fields.get("name");
  const draft = creating && typeof name === "string" ? name.slice(0, FAMILY_TREE_NAME_LIMIT) : undefined;
  try {
    const result = creating
      ? await createFamilyTree(userId, name)
      : await selectFamilyTree(userId, fields.get("treeId"));
    if (!result.tree) {
      return {
        error: result.code === "INVALID_NAME"
          ? `Vui lòng nhập tên cây gia phả từ 1 đến ${FAMILY_TREE_NAME_LIMIT} ký tự.`
          : creating ? "Tài khoản của bạn không thể tạo cây gia phả." : "Bạn không có quyền chọn cây gia phả này.",
        draft,
      };
    }
    (await cookies()).set(TREE_COOKIE, result.tree.id, {
      httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return { message: creating ? "Đã tạo và chọn cây gia phả." : "Đã chuyển cây gia phả.", treeId: result.tree.id };
  } catch {
    return { error: "Không thể cập nhật cây gia phả. Vui lòng thử lại.", draft };
  }
}
