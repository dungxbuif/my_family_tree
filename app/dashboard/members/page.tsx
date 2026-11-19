import { MemberListProvider } from "@/context/MemberListContext";
import MembersViews from "@/components/MembersViews";
import MemberDetailModal from "@/components/modal/MemberDetailModal";
import ViewToggle from "@/components/ViewToggle";
import { currentFamilyPage } from "@/utils/family/browser";

import { ViewMode } from "@/components/ViewToggle";
import { HeritagePageHero } from "@/components/heritage";

interface PageProps {
  searchParams: Promise<{ view?: string; rootId?: string; avatar?: string }>;
}
export default async function FamilyTreePage({ searchParams }: PageProps) {
  const { view, rootId, avatar } = await searchParams;
  const initialView = view as ViewMode | undefined;
  const initialShowAvatar = avatar !== "hide";

  const { people } = await currentFamilyPage();
  const { persons, relationships, role, treeId } = await people.graph();
  const canEdit = role !== "viewer";

  // Prepare map and roots for tree views
  const personsMap = new Map();
  persons.forEach((p) => personsMap.set(p.id, p));

  const childIds = new Set(
    relationships
      .filter(
        (r) => r.type === "biological_child" || r.type === "adopted_child",
      )
      .map((r) => r.person_b),
  );

  let finalRootId = rootId;

  // If no rootId is provided, fallback to the earliest created person
  if (!finalRootId || !personsMap.has(finalRootId)) {
    const rootsFallback = persons.filter((p) => !childIds.has(p.id));
    if (rootsFallback.length > 0) {
      finalRootId = rootsFallback[0].id;
    } else if (persons.length > 0) {
      finalRootId = persons[0].id; // ultimate fallback
    }
  }

  return (
    <MemberListProvider
      key={treeId}
      initialView={initialView}
      initialRootId={finalRootId}
      initialShowAvatar={initialShowAvatar}
    >
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 pb-24 pt-4 sm:px-6 md:pb-8 lg:px-8">
        <HeritagePageHero title={initialView === "list" ? "Thành viên" : "Cây gia phả"} subtitle={initialView === "list" ? "Danh sách thành viên trong dòng họ" : "Sơ đồ các thế hệ trong dòng họ"} backHref="/dashboard" />
        <ViewToggle />
        <MembersViews treeId={treeId} persons={persons} relationships={relationships} canEdit={canEdit} />
      </div>

      <MemberDetailModal treeId={treeId} role={role} graph />
    </MemberListProvider>
  );
}
