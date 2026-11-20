import MemberForm from "@/components/MemberForm";
import { HeritagePageHero } from "@/components/heritage";
import { currentFamilyPage } from "@/utils/family/browser";
import { notFound } from "next/navigation";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function EditMemberPage({ params }: PageProps) {
  const { id } = await params;

  const { people } = await currentFamilyPage();
  const detail = await people.detail(id);
  if (!detail) notFound();
  const { person, privateData, role } = detail;
  const isOwner = role === "owner";
  const canEdit = role !== "viewer";
  if (!canEdit) return <p className="p-4">Bạn không có quyền chỉnh sửa thành viên.</p>;
  const initialData = { ...person, ...privateData };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-28 pt-4 sm:px-6 md:pb-8 lg:px-8">
      <HeritagePageHero
        title="Chỉnh sửa thành viên"
        backHref={`/dashboard/members/${id}`}
      />

      <main className="relative z-10 w-full flex-1 py-4 sm:py-6">
        <MemberForm treeId={person.tree_id} initialData={initialData} isEditing={true} isOwner={isOwner} />
      </main>
    </div>
  );
}
