"use client";

import { adminCreateUser, deleteUser, toggleUserStatus } from "@/app/actions/user";
import type { AdminUserData } from "@/types";
import type { AccountMutationResult } from "@/utils/auth/account-administration";
import { useActionState, useEffect, useState, useTransition } from "react";

interface AdminUserListProps {
  users: AdminUserData[];
  currentUserId: string;
}

export default function AdminUserList({ users, currentUserId }: AdminUserListProps) {
  const [pending, startTransition] = useTransition();
  const [creation, createAccount, creating] = useActionState(adminCreateUser, null);
  const [notice, setNotice] = useState<{ message: string; isError: boolean } | null>(null);
  const [hasDraft, setHasDraft] = useState(false);
  const busy = pending || creating;

  useEffect(() => {
    if (!hasDraft) return;

    function warnBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = " ";
    }

    function confirmNavigation(event: MouseEvent) {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      if (!(event.target instanceof Element)) return;
      const link = event.target.closest<HTMLAnchorElement>("a[href]");
      const logout = event.target.closest("button[data-logout]");
      if (!link && !logout) return;
      if (link && (link.target || link.origin !== location.origin || link.pathname === location.pathname)) return;

      if (!window.confirm("Thông tin tạo tài khoản chưa được lưu. Bạn có muốn rời trang?")) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }

    window.addEventListener("beforeunload", warnBeforeUnload);
    document.addEventListener("click", confirmNavigation, true);
    return () => {
      window.removeEventListener("beforeunload", warnBeforeUnload);
      document.removeEventListener("click", confirmNavigation, true);
    };
  }, [hasDraft]);

  function submit(
    operation: () => Promise<AccountMutationResult>,
    successMessage: string,
  ) {
    setNotice(null);
    startTransition(async () => {
      try {
        const result = await operation();
        if ("error" in result) {
          setNotice({ message: result.error, isError: true });
        } else {
          setNotice({ message: successMessage, isError: false });
        }
      } catch {
        setNotice({ message: "Không thể cập nhật tài khoản. Vui lòng thử lại.", isError: true });
      }
    });
  }

  return (
    <div className="space-y-4" aria-busy={busy}>
      {notice && (
        <p role={notice.isError ? "alert" : "status"} className={notice.isError ? "body-sm text-error" : "body-sm text-success"}>
          {notice.message}
        </p>
      )}
      {busy && <p role="status" className="body-sm text-secondary">Đang cập nhật…</p>}
      {!creating && creation && (
        "error" in creation
          ? <p role="alert" className="body-sm text-error">{creation.error}</p>
          : <p role="status" className="body-sm text-success">Đã tạo tài khoản.</p>
      )}

      <details className="rounded-[20px] border border-border bg-surface p-4 shadow-soft">
        <summary className="min-h-11 cursor-pointer py-2 font-semibold text-primary">Thêm tài khoản</summary>
        <form
          action={createAccount}
          onChange={(event) => {
            const fields = new FormData(event.currentTarget);
            setHasDraft(Boolean(fields.get("email") || fields.get("password") || fields.get("is_active") === "false"));
          }}
          onSubmit={() => setHasDraft(false)}
          className="pt-2"
        >
          <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
            <label className="body-sm font-semibold">
              Email
              <input
                name="email"
                type="email"
                autoComplete="off"
                required
                maxLength={254}
                className="mt-2 block min-h-12 w-full rounded-lg border border-border bg-surface px-3 text-foreground"
              />
            </label>
            <label className="body-sm font-semibold">
              Mật khẩu (ít nhất 6 ký tự)
              <input
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                maxLength={1024}
                className="mt-2 block min-h-12 w-full rounded-lg border border-border bg-surface px-3 text-foreground"
              />
            </label>
            <label className="body-sm font-semibold">
              Trạng thái
              <select
                name="is_active"
                defaultValue="true"
                className="mt-2 block min-h-12 w-full rounded-lg border border-border bg-surface px-3 text-foreground"
              >
                <option value="true">Đang hoạt động</option>
                <option value="false">Bị khóa</option>
              </select>
            </label>
            <button type="submit" className="btn-primary min-h-13 self-end py-2! disabled:opacity-70">
              Tạo tài khoản
            </button>
          </fieldset>
        </form>
      </details>

      {users.length ? (
        <ul className="space-y-3">
          {users.map((user) => {
            const isSelf = user.id === currentUserId;
            const statusAction = user.is_active ? "Khóa" : "Kích hoạt";
            return (
              <li key={user.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-border bg-surface p-4 shadow-soft">
                <div className="min-w-0">
                  <p className="break-all font-semibold text-foreground">{user.email}{isSelf && " (bạn)"}</p>
                  <p className="body-sm text-secondary">
                    {user.is_super_admin && "Quản trị viên hệ thống · "}
                    {user.is_active ? "Đang hoạt động" : "Bị khóa"}
                    {" · "}{new Date(user.created_at).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}
                  </p>
                </div>
                {!isSelf && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      aria-label={`${statusAction} tài khoản ${user.email}`}
                      className="min-h-11 rounded-lg border border-border px-3 body-sm font-medium text-primary hover:bg-primary-soft disabled:opacity-50"
                      onClick={() => {
                        if (user.is_active && !confirm(`Khóa tài khoản ${user.email} và kết thúc mọi phiên đăng nhập?`)) return;
                        submit(() => toggleUserStatus(user.id, !user.is_active), user.is_active ? "Đã khóa tài khoản." : "Đã kích hoạt tài khoản.");
                      }}
                    >
                      {statusAction}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      aria-label={`Xóa tài khoản ${user.email}`}
                      className="min-h-11 rounded-lg border border-border px-3 body-sm font-medium text-error hover:bg-neutral disabled:opacity-50"
                      onClick={() => {
                        if (!confirm(`Xóa vĩnh viễn tài khoản ${user.email}?`)) return;
                        submit(() => deleteUser(user.id), "Đã xóa tài khoản.");
                      }}
                    >
                      Xóa
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="body-sm text-secondary">Chưa có tài khoản.</p>
      )}
    </div>
  );
}
