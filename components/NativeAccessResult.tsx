"use client";

import type { NativeAccessOutcome } from "@/utils/auth/native-access-submission";
import { accessOperations, accessPath, treeRoles } from "@/utils/tree-access-labels";
import { useUnsavedNavigation } from "@/hooks/useUnsavedNavigation";

export default function NativeAccessResult({ outcome }: { outcome: NativeAccessOutcome }) {
  const { confirmed, draft } = outcome;
  useUnsavedNavigation(!confirmed, "Chưa thể xác nhận kết quả. Bạn có muốn rời trang?");
  return <section className="grid min-w-0 gap-3 rounded-[20px] border border-border bg-surface p-4 shadow-soft">
    <h2 className="font-sans text-[22px] font-semibold leading-[30px] text-primary">{accessOperations[draft.operation]}</h2>
    {confirmed
      ? <p role="status" className="text-success">Đã cập nhật quyền truy cập.</p>
      : <p role="alert" className="text-error">Chưa thể xác nhận kết quả. Mở danh sách trong thẻ mới để kiểm tra.</p>}
    <section aria-label="Thông tin đã gửi" className="grid min-w-0 gap-2 [overflow-wrap:anywhere]">
      {draft.email && <p className="whitespace-pre-wrap">Email · {draft.email}</p>}
      {draft.role && <p>Vai trò · {treeRoles[draft.role]}</p>}
      {draft.personId && <p>Mã hồ sơ · {draft.personId}</p>}
      {draft.userId && <p>Mã tài khoản · {draft.userId}</p>}
    </section>
    <a href={accessPath + "?treeId=" + draft.treeId} target={confirmed ? undefined : "_blank"} rel="noopener" className="btn min-h-11">
      {confirmed ? "Xem quyền truy cập" : "Tải lại danh sách"}
    </a>
  </section>;
}
