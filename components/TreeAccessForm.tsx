"use client";

import { useActionState, useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { submitTreeAccess } from "@/app/actions/tree-membership";
import { useUnsavedNavigation } from "@/hooks/useUnsavedNavigation";
import type { AccessMember } from "@/utils/auth/tree-membership";
import type { NativeAccessOutcome } from "@/utils/auth/native-access-submission";
import type { AccessNotice } from "@/utils/auth/browser-tree-membership";
import { accessOperations, accessPath, accessErrors, treeRoles, type AccessOperation } from "@/utils/tree-access-labels";

const control = "body-md mt-1 block min-h-[52px] w-full min-w-0 rounded-lg border border-border bg-surface px-3";
function subscribe(notify: () => void) {
  window.addEventListener("online", notify);
  window.addEventListener("offline", notify);
  return () => { window.removeEventListener("online", notify); window.removeEventListener("offline", notify); };
}

export default function TreeAccessForm({ tree, operation, member, people, unavailable, submission, permalink, correction }: {
  tree: { id: string; name: string }; operation: AccessOperation; member?: AccessMember;
  people: { id: string; label: string }[]; unavailable: boolean; submission: string; permalink: string; correction?: NativeAccessOutcome;
}) {
  const [form, setForm] = useState({ submission, permalink });
  const [native, action] = useActionState(submitTreeAccess, null, form.permalink);
  const [receiptUrl, setReceiptUrl] = useState<string>();
  const [notice, setNotice] = useState<AccessNotice | null>(native ?? (correction?.rejection ? { code: correction.rejection } : null));
  const [email, setEmail] = useState(correction?.draft.email ?? "");
  const initialRole = member?.role ?? "viewer";
  const [role, setRole] = useState<string>(correction?.draft.role ?? initialRole);
  const [person, setPerson] = useState(correction?.draft.personId ?? "");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const destructive = operation === "unlink" || operation === "remove";
  const submitting = useRef(false);
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
  const code = notice && "code" in notice ? notice.code : null;
  const saved = notice && "ok" in notice;
  const readOnly = Boolean(receiptUrl) || saved || code === "FORBIDDEN" || code === "UNCERTAIN";
  const dirty = Boolean(email || role !== initialRole || person || confirmed);
  useUnsavedNavigation(!receiptUrl && (code === "UNCERTAIN" || (!readOnly && (dirty || busy))), code === "UNCERTAIN"
    ? "Chưa thể xác nhận kết quả. Rời trang sẽ bỏ thông tin đã gửi. Bạn có muốn rời trang?"
    : "Thay đổi quyền truy cập chưa được lưu. Bạn có muốn rời trang?");
  useEffect(() => {
    if (receiptUrl) window.location.replace(receiptUrl);
    else if (saved) window.location.replace(accessPath + "?saved=1&treeId=" + tree.id);
  }, [receiptUrl, saved, tree.id]);

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
      else if (response.ok) {
        const result = await response.json() as AccessNotice & { retryUrl?: string; outcomeUrl?: string };
        if (result.outcomeUrl) setReceiptUrl(result.outcomeUrl);
        if (result.retryUrl) {
          const url = new URL(result.retryUrl, window.location.origin);
          const nextId = url.searchParams.get("submission");
          if (nextId) {
            window.history.replaceState(window.history.state, "", url);
            setForm({ submission: nextId, permalink: result.retryUrl });
          }
        }
        setNotice(result);
      }
      else setNotice({ code: "UNCERTAIN" });
    } catch {
      setNotice({ code: "UNCERTAIN" });
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  if (unavailable && code !== "UNCERTAIN") {
    return <><p role="alert">Thao tác này không còn khả dụng.</p><a className="btn min-h-11" href={accessPath}>Xem quyền truy cập</a></>;
  }
  return <section className="grid min-w-0 gap-3 rounded-[20px] border border-border bg-surface p-4 shadow-soft">
    <h2 className="font-sans text-[22px] font-semibold leading-[30px] text-primary">{accessOperations[operation]}</h2>
    <p className="body-sm text-secondary [overflow-wrap:anywhere]">{tree.name}</p>
    {member && <p className="[overflow-wrap:anywhere]">{member.email}{operation === "unlink" && " · " + member.personName}</p>}
    {code && <p role="alert" className="body-md text-error">{accessErrors[code]}</p>}
    {code === "UNCERTAIN" && <section aria-label="Thông tin đã gửi" className="grid min-w-0 gap-2 [overflow-wrap:anywhere]">
      {email && <p className="whitespace-pre-wrap">Email · {email}</p>}
      {(operation === "role" || operation === "add") && <p>Vai trò · {treeRoles[role as keyof typeof treeRoles]}</p>}
      {operation === "link" && <p>Hồ sơ gia phả · {people.find(p => p.id === person)?.label ?? person}</p>}
    </section>}
    {saved && <p role="status">Đã cập nhật quyền truy cập.</p>}
    {!online && <p role="status" className="text-warning">Đã mất kết nối. Hãy kết nối lại để lưu thay đổi.</p>}
    {!readOnly && <form action={action} onSubmit={submit} aria-busy={busy}>
      <fieldset disabled={busy} className="grid min-w-0 gap-4">
        <input type="hidden" name="operation" value={operation} />
        <input type="hidden" name="treeId" value={tree.id} />
        <input type="hidden" name="submission" value={form.submission} />
        {member && <input type="hidden" name="userId" value={member.userId} />}
        {operation === "unlink" && <input type="hidden" name="personId" value={member?.personId ?? ""} />}
        {(operation === "add" || operation === "link") && <label className="body-md font-semibold">
          Email đầy đủ của tài khoản
          <input required type="text" inputMode="email" name="email" maxLength={512} autoComplete="off" autoCapitalize="none"
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
            {people.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          <span className="body-sm mt-2 block font-normal text-secondary">Tài khoản chưa tham gia sẽ được cấp quyền người xem.</span>
        </label>}
        {destructive && <label className="body-md flex min-h-[52px] items-center gap-3">
          <input required type="checkbox" name="confirm" value="yes" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />
          {operation === "remove" ? "Tôi xác nhận gỡ quyền truy cập cây gia phả này." : "Tôi xác nhận gỡ liên kết giữa tài khoản và hồ sơ này."}
        </label>}
        <button type="submit" className={destructive ? "btn h-[52px] py-0 text-error" : "btn-primary h-[52px] py-0"} disabled={!online || busy}>
          {busy ? "Đang lưu…" : accessOperations[operation]}
        </button>
      </fieldset>
    </form>}
    {code === "UNCERTAIN"
      ? <a href={accessPath + "?treeId=" + tree.id} target="_blank" rel="noopener" className="btn min-h-11">Tải lại danh sách</a>
      : <a href={accessPath} className="btn min-h-11">Xem quyền truy cập</a>}
  </section>;
}
