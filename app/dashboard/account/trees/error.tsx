"use client";

export default function FamilyTreesError() {
  return (
    <main className="content-gutter mx-auto w-full max-w-xl space-y-4 py-8">
      <h1 className="headline-lg">Cây gia phả của tôi</h1>
      <p role="alert" className="body-md text-error">Không thể tải danh sách cây gia phả. Vui lòng kiểm tra kết nối.</p>
      <a className="btn min-h-[52px]" href="/dashboard/account/trees">Thử lại</a>
    </main>
  );
}
