import LogoutButton from "@/components/LogoutButton";
import { getProfile, getUser } from "@/utils/auth/session";
import { redirect } from "next/navigation";

export default async function AccountPage() {
  const user = await getUser();
  if (!user) redirect("/login");

  const profile = await getProfile();
  if (!profile?.is_active) redirect("/dashboard");

  return (
    <main className="content-gutter mx-auto w-full max-w-xl flex-1 py-8">
      <h1 className="mb-4 font-sans text-[26px] font-bold leading-[34px] text-primary">Tài khoản</h1>
      <section className="space-y-4 rounded-[20px] border border-border bg-surface p-4 shadow-soft sm:p-6">
        <div>
          <p className="body-sm text-secondary">Email</p>
          <p className="break-all text-foreground">{user.email}</p>
        </div>
        <a href="/dashboard/account/trees" className="btn min-h-11">
          Cây gia phả của tôi
        </a>
        {profile.is_super_admin && (
          // Open a document so browser Back also triggers the form's unload guard.
          <a href="/dashboard/users" className="btn min-h-11">
            Quản lý người dùng
          </a>
        )}
        <LogoutButton />
      </section>
    </main>
  );
}
