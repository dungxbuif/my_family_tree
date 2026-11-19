"use client";

import { accessPath } from "@/utils/tree-access-labels";

export default function AccessError() {
  return <div className="grid gap-3">
    <p role="alert">Không thể tải quyền truy cập. Vui lòng kiểm tra kết nối.</p>
    <a href={accessPath} className="btn min-h-11">Tải lại danh sách</a>
  </div>;
}
