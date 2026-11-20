"use client";

export default function FamilyTreesError() {
  return (
    <div className="space-y-4">
      <p role="alert" className="body-md text-error">Không thể tải danh sách cây gia phả. Vui lòng kiểm tra kết nối.</p>
      <a className="btn min-h-[52px]" href="/dashboard/account/trees">Thử lại</a>
    </div>
  );
}
