import AdminUserList from "@/components/AdminUserList";
import { AdminUserData } from "@/types";
import { getProfile, getDataClient } from "@/utils/data/queries";
import { redirect } from "next/navigation";

export default async function AdminUsersPage() {
  const profile = await getProfile();
  const isAdmin = profile?.role === "admin";

  if (!isAdmin || !profile) {
    redirect("/dashboard");
  }

  const db = getDataClient();

  // Fetch users and profiles to combine into AdminUserData
  const { data: users, error: uError } = await db
    .from<{ id: string; email: string; created_at: string }>("users")
    .select("id, email, created_at");
  const { data: profiles, error: pError } = await db
    .from<{ id: string; role: string; is_active: boolean }>("profiles")
    .select("id, role, is_active");

  if (uError || pError) {
    console.error("Error fetching users/profiles:", uError || pError);
  }

  const typedUsers: AdminUserData[] =
    (users || [])?.map((user) => {
      const p = (profiles || [])?.find((p) => p.id === user.id);
      return {
        id: user.id,
        email: user.email,
        role: (p?.role as UserRole) || "member",
        is_active: p?.is_active || false,
        created_at: user.created_at,
      };
    }) || [];

  return (
    <main className="flex-1 overflow-auto bg-stone-50/50 flex flex-col pt-8 relative w-full">
      <div className="max-w-7xl mx-auto px-4 pb-8 sm:px-6 lg:px-8 w-full relative z-10">
        <div className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center">
          <div>
            <h1 className="title">Quản lý Người dùng</h1>
            <p className="text-stone-500 mt-2 text-sm sm:text-base">
              Danh sách các tài khoản đang tham gia vào hệ thống.
            </p>
          </div>
        </div>
        <AdminUserList initialUsers={typedUsers} currentUserId={profile.id} />
      </div>
    </main>
  );
}
