export const treeRoles = { owner: "Chủ sở hữu", editor: "Biên tập viên", viewer: "Người xem" } as const;
export const accessPath = "/dashboard/account/trees/access";
export const accessOperations = {
  add: "Thêm quyền truy cập", role: "Đổi vai trò", remove: "Gỡ quyền truy cập",
  link: "Liên kết hồ sơ", unlink: "Gỡ liên kết",
} as const;
export type AccessOperation = keyof typeof accessOperations;
export const deniedAccess = "Chỉ chủ sở hữu của cây gia phả đang chọn mới có thể quản lý quyền truy cập.";

export const accessErrors = {
  FORBIDDEN: deniedAccess,
  UNAVAILABLE: "Không thể thực hiện thay đổi với thông tin đã nhập.",
  CONFIRM: "Vui lòng xác nhận thay đổi trước khi tiếp tục.",
  LAST_OWNER: "Cây gia phả cần ít nhất một chủ sở hữu đang hoạt động. Hãy cấp quyền chủ sở hữu cho người khác trước.",
  LINKED: "Hãy gỡ liên kết hồ sơ trước khi gỡ quyền truy cập.",
  UNCERTAIN: "Chưa thể xác nhận kết quả. Mở danh sách trong thẻ mới để kiểm tra. Thông tin đã gửi được giữ ở đây.",
};
