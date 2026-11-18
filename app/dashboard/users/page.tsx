import AdminUserList from "@/components/AdminUserList";
import type { AdminUserData } from "@/types";
import { getProfile } from "@/utils/auth/session";
import { query } from "@/utils/db/client";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function AdminUsersPage() {
  const profile = await getProfile();
  if (!profile?.is_active || !profile.is_super_admin) redirect("/dashboard");

  let users: AdminUserData[] | null = null;
  try {
    const { rows } = await query<Omit<AdminUserData, "created_at"> & { created_at: Date }>(
      `SELECT u.id, u.email, u.created_at, COALESCE(p.is_active, false) AS is_active,
              COALESCE(p.is_super_admin, false) AS is_super_admin
         FROM users u LEFT JOIN profiles p ON p.id = u.id
        ORDER BY u.email`,
    );
    users = rows.map((user) => ({ ...user, created_at: user.created_at.toISOString() }));
  } catch {
    console.error("Could not load account list");
  }

  return (
    <main className="content-gutter mx-auto w-full max-w-5xl flex-1 py-8">
      <Link href="/dashboard/account" className="inline-flex min-h-11 items-center text-primary hover:underline">
        Về tài khoản
      </Link>
      <h1 className="title mb-4">Quản lý người dùng</h1>
      {users ? (
        <AdminUserList users={users} currentUserId={profile.id} />
      ) : (
        <p role="alert" className="body-sm text-error">Không thể tải danh sách tài khoản. Vui lòng tải lại trang.</p>
      )}
    </main>
  );
}
