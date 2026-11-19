"use client";

import { useActionState, useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { submitTreeAccess } from "@/app/actions/tree-membership";
import { useUnsavedNavigation } from "@/hooks/useUnsavedNavigation";
import type { AccessMember, AccessSnapshot } from "@/utils/auth/tree-membership";
import type { AccessNotice } from "@/utils/auth/browser-tree-membership";
import { accessOperations, accessPath, deniedAccess, treeRoles, type AccessOperation } from "@/utils/tree-access-labels";

const control = "body-md mt-1 block min-h-[52px] w-full min-w-0 rounded-lg border border-border bg-surface px-3";
const errors = {
  FORBIDDEN: deniedAccess,
  UNAVAILABLE: "Không thể thực hiện thay đổi với thông tin đã nhập.",
  CONFIRM: "Vui lòng xác nhận thay đổi trước khi tiếp tục.",
  LAST_OWNER: "Cây gia phả cần ít nhất một chủ sở hữu. Hãy cấp quyền chủ sở hữu cho người khác trước.",
  LINKED: "Hãy gỡ liên kết hồ sơ trước khi gỡ quyền truy cập.",
  UNCERTAIN: "Chưa thể xác nhận kết quả. Hãy tải lại danh sách để kiểm tra.",
};
function subscribe(notify: () => void) {
  window.addEventListener("online", notify);
  window.addEventListener("offline", notify);
  return () => { window.removeEventListener("online", notify); window.removeEventListener("offline", notify); };
}

export default function TreeAccessForm({ tree, operation, member, people }: {
  tree: { id: string; name: string }; operation: AccessOperation; member?: AccessMember; people: AccessSnapshot["people"];
}) {
  const [native, action] = useActionState(submitTreeAccess, null);
  const [notice, setNotice] = useState<AccessNotice | null>(native?.notice ?? null);
  const [email, setEmail] = useState(native?.draft?.email ?? "");
  const initialRole = member?.role ?? "viewer";
  const [role, setRole] = useState(native?.draft?.role || initialRole);
  const [person, setPerson] = useState(native?.draft?.personId ?? "");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const destructive = operation === "unlink" || operation === "remove";
  const submitting = useRef(false);
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
  const code = notice && "code" in notice ? notice.code : null;
  const saved = notice && "ok" in notice;
  const readOnly = saved || code === "FORBIDDEN" || code === "UNCERTAIN";
  const dirty = Boolean(email || role !== initialRole || person || confirmed);
  useUnsavedNavigation(!readOnly && (dirty || busy), "Thay đổi quyền truy cập chưa được lưu. Bạn có muốn rời trang?");
  useEffect(() => {
    if (saved) window.location.replace(accessPath + "?saved=1&treeId=" + tree.id);
  }, [saved, tree.id]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    const body = new FormData(event.currentTarget);
    setBusy(true);
    setNotice(null);
    try {
      const response = await fetch(accessPath + "/mutation", {
        method: "POST", headers: { "X-Requested-With": "TreeAccessManager" }, body, redirect: "error",
      });
      if (response.status === 401 || response.status === 403) setNotice({ code: "FORBIDDEN" });
      else if (response.ok) setNotice(await response.json() as AccessNotice);
      else setNotice({ code: "UNCERTAIN" });
    } catch {
      setNotice({ code: "UNCERTAIN" });
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return <section className="grid min-w-0 gap-3 rounded-[20px] border border-border bg-surface p-4 shadow-soft">
    <h2 className="font-sans text-[22px] font-semibold leading-[30px] text-primary">{accessOperations[operation]}</h2>
    <p className="body-sm text-secondary [overflow-wrap:anywhere]">{tree.name}</p>
    {member && <p className="[overflow-wrap:anywhere]">{member.email}{operation === "unlink" && " · " + member.personName}</p>}
    {code && <p role="alert" className="body-md text-error">{errors[code]}</p>}
    {saved && <p role="status">Đã cập nhật quyền truy cập.</p>}
    {!online && <p role="status" className="text-warning">Đã mất kết nối. Hãy kết nối lại để lưu thay đổi.</p>}
    {!readOnly && <form action={action} onSubmit={submit} aria-busy={busy}>
      <fieldset disabled={busy} className="grid min-w-0 gap-4">
        <input type="hidden" name="operation" value={operation} />
        <input type="hidden" name="treeId" value={tree.id} />
        {member && <input type="hidden" name="userId" value={member.userId} />}
        {operation === "unlink" && <input type="hidden" name="personId" value={member?.personId ?? ""} />}
        {(operation === "add" || operation === "link") && <label className="body-md font-semibold">
          Email đầy đủ của tài khoản
          <input required type="email" name="email" maxLength={254} autoComplete="off" autoCapitalize="none"
            spellCheck={false} value={email} onChange={event => setEmail(event.target.value)} className={control} />
        </label>}
        {(operation === "add" || operation === "role") && <label className="body-md font-semibold">Vai trò
          <select name="role" value={role} onChange={event => setRole(event.target.value)} className={control}>
            {Object.entries(treeRoles).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>}
        {operation === "link" && <label className="body-md font-semibold">Hồ sơ gia phả
          <select required name="personId" value={person} onChange={event => setPerson(event.target.value)} className={control}>
            <option value="">Chọn hồ sơ</option>
            {people.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <span className="body-sm mt-2 block font-normal text-secondary">Tài khoản chưa tham gia sẽ được cấp quyền người xem.</span>
        </label>}
        {destructive && <label className="body-md flex min-h-[52px] items-center gap-3">
          <input required type="checkbox" name="confirm" value="yes" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />
          {operation === "remove" ? "Tôi xác nhận gỡ quyền truy cập cây gia phả này." : "Tôi xác nhận gỡ liên kết giữa tài khoản và hồ sơ này."}
        </label>}
        <button type="submit" className={destructive ? "btn min-h-[52px] text-error" : "btn-primary min-h-[52px]"} disabled={!online || busy}>
          {busy ? "Đang lưu…" : accessOperations[operation]}
        </button>
      </fieldset>
    </form>}
    <a href={accessPath} className="btn min-h-11">{code === "UNCERTAIN" ? "Tải lại danh sách" : "Xem quyền truy cập"}</a>
  </section>;
}
