"use client";

import { adminCreateUser, deleteUser, toggleUserStatus } from "@/app/actions/user";
import type { AdminUserData } from "@/types";
import type { AccountMutationResult } from "@/utils/auth/account-administration";
import { useState, useTransition, type FormEvent } from "react";

interface AdminUserListProps {
  users: AdminUserData[];
  currentUserId: string;
}

export default function AdminUserList({ users, currentUserId }: AdminUserListProps) {
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<{ message: string; isError: boolean } | null>(null);

  function submit(
    operation: () => Promise<AccountMutationResult>,
    successMessage: string,
    onSuccess?: () => void,
  ) {
    setNotice(null);
    startTransition(async () => {
      try {
        const result = await operation();
        if ("error" in result) {
          setNotice({ message: result.error, isError: true });
        } else {
          onSuccess?.();
          setNotice({ message: successMessage, isError: false });
        }
      } catch {
        setNotice({ message: "Không thể cập nhật tài khoản. Vui lòng thử lại.", isError: true });
      }
    });
  }

  function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    submit(() => adminCreateUser(data), "Đã tạo tài khoản.", () => form.reset());
  }

  return (
    <div className="space-y-4" aria-busy={pending}>
      {notice && (
        <p role={notice.isError ? "alert" : "status"} className={notice.isError ? "body-sm text-error" : "body-sm text-success"}>
          {notice.message}
        </p>
      )}
      {pending && <p role="status" className="body-sm text-secondary">Đang cập nhật…</p>}

      <details className="rounded-[20px] border border-border bg-surface p-4 shadow-soft">
        <summary className="min-h-11 cursor-pointer py-2 font-semibold text-primary">Thêm tài khoản</summary>
        <form onSubmit={createAccount} className="pt-2">
          <fieldset disabled={pending} className="grid gap-4 sm:grid-cols-2">
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
                      disabled={pending}
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
                      disabled={pending}
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
