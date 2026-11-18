import LogoutButton from "@/components/LogoutButton";
import { getProfile, getUser } from "@/utils/auth/session";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function AccountPage() {
  const user = await getUser();
  if (!user) redirect("/login");

  const profile = await getProfile();
  if (!profile?.is_active) redirect("/dashboard");

  return (
    <main className="content-gutter mx-auto w-full max-w-xl flex-1 py-8">
      <h1 className="title mb-4">Tài khoản</h1>
      <section className="space-y-4 rounded-[20px] border border-border bg-surface p-4 shadow-soft sm:p-6">
        <div>
          <p className="body-sm text-secondary">Email</p>
          <p className="break-all text-foreground">{user.email}</p>
        </div>
        {profile.is_super_admin && (
          <Link href="/dashboard/users" className="btn min-h-11">
            Quản lý người dùng
          </Link>
        )}
        <LogoutButton />
      </section>
    </main>
  );
}
