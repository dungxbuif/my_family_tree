export const treeRoles = { owner: "Chủ sở hữu", editor: "Biên tập viên", viewer: "Người xem" } as const;
export const accessPath = "/dashboard/account/trees/access";
export const accessOperations = {
  add: "Thêm quyền truy cập", role: "Đổi vai trò", remove: "Gỡ quyền truy cập",
  link: "Liên kết hồ sơ", unlink: "Gỡ liên kết",
} as const;
export type AccessOperation = keyof typeof accessOperations;
export const deniedAccess = "Chỉ chủ sở hữu của cây gia phả đang chọn mới có thể quản lý quyền truy cập.";
