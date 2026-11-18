import MemberForm from "@/components/MemberForm";
import { HeritagePageHero } from "@/components/heritage";
import { Person } from "@/types";
import { getProfile, getDataClient } from "@/utils/data/queries";
import { notFound } from "next/navigation";

interface PageProps {
  params: Promise<{ id: string }>;
}

interface PrivateDetails extends Record<string, unknown> {
  person_id: string;
  phone_number: string | null;
  occupation: string | null;
  current_residence: string | null;
}

export default async function EditMemberPage({ params }: PageProps) {
  const { id } = await params;

  const profile = await getProfile();
  const isAdmin = profile?.role === "admin";
  const isEditor = profile?.role === "editor";
  if (!isAdmin && !isEditor) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-stone-800">
            Truy cập bị từ chối
          </h1>
          <p className="text-stone-600 mt-2">
            Bạn không có quyền chỉnh sửa thành viên.
          </p>
        </div>
      </div>
    );
  }

  const db = getDataClient();

  // Fetch Public Data
  const { data: person, error } = await db
    .from<Person>("persons")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !person) {
    notFound();
  }

  // Fetch Private Data
  let privateData: PrivateDetails | null = null;
  if (isAdmin) {
    const { data } = await db
      .from<PrivateDetails>("person_details_private")
      .select("*")
      .eq("person_id", id)
      .single();
    privateData = data;
  }

  const initialData = isAdmin ? { ...person, ...(privateData ?? {}) } : person;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-28 pt-4 sm:px-6 md:pb-8 lg:px-8">
      <HeritagePageHero
        title="Chỉnh sửa thành viên"
        backHref={`/dashboard/members/${id}`}
      />

      <main className="relative z-10 w-full flex-1 py-4 sm:py-6">
        <MemberForm initialData={initialData} isEditing={true} isAdmin={isAdmin} />
      </main>
    </div>
  );
}
