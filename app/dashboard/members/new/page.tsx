import MemberForm from "@/components/MemberForm";
import { getProfile } from "@/utils/data/queries";
import { HeritagePageHero } from "@/components/heritage";

export default async function NewMemberPage() {
  const profile = await getProfile();

  const isAdmin = profile?.role === "admin";
  const canEdit = profile?.role === "admin" || profile?.role === "editor";

  // If user cannot edit, reject access
  if (!canEdit) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-stone-800">
            Truy cập bị từ chối
          </h1>
          <p className="text-stone-600 mt-2">
            Bạn không có quyền thêm thành viên.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-28 pt-4 sm:px-6 md:pb-8 lg:px-8">
      <HeritagePageHero title="Thêm thành viên" backHref="/dashboard/members?view=list" />

      <main className="relative z-10 w-full flex-1 py-4 sm:py-6">
        <MemberForm isAdmin={isAdmin} />
      </main>
    </div>
  );
}
