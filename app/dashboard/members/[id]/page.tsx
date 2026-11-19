import { HeritagePageHero } from "@/components/heritage";
import DeleteMemberButton from "@/components/DeleteMemberButton";
import MemberDetailContent from "@/context/MemberDetailContent";
import { currentFamilyPage } from "@/utils/family/browser";
import { GitBranch, Pencil } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function MemberDetailPage({ params }: PageProps) {
  const { id } = await params;

  const { people } = await currentFamilyPage();
  const detail = await people.detail(id);
  if (!detail) notFound();
  const { person, privateData, role } = detail;
  const isOwner = role === "owner";
  const canEdit = role !== "viewer";

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 pb-28 pt-4 sm:px-6 md:pb-8 lg:px-8">
      {/* Decorative background blurs */}
      {/* <div className="absolute -top-[20%] left-0 w-[500px] h-[500px] bg-amber-200/20 rounded-full blur-[120px] pointer-events-none" /> */}
      {/* <div className="absolute top-[40%] right-0 w-[400px] h-[400px] bg-stone-300/20 rounded-full blur-[100px] pointer-events-none" /> */}

      <HeritagePageHero title="Hồ sơ thành viên" backHref="/dashboard/members?view=list" />

      <main className="relative z-10 w-full flex-1 py-4 sm:py-6">
        <div className="overflow-hidden rounded-[20px] border border-border bg-surface shadow-soft">
          <MemberDetailContent
            person={person}
            privateData={privateData}
            isOwner={isOwner}
            canEdit={canEdit}
          />
        </div>
        {canEdit && (
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Link href={`/dashboard/members/${id}/edit`} className="btn min-h-13 border-amber-500 text-primary"><Pencil className="size-5" />Chỉnh sửa</Link>
            <Link href="#relationships" className="btn-primary min-h-13"><GitBranch className="size-5" />Thêm quan hệ</Link>
            <DeleteMemberButton memberId={id} treeId={person.tree_id} className="col-span-2" />
          </div>
        )}
      </main>
    </div>
  );
}
