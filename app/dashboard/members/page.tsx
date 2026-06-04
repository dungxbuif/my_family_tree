import { MemberListProvider } from "@/context/MemberListContext";
import MembersViews from "@/components/MembersViews";
import MemberDetailModal from "@/components/modal/MemberDetailModal";
import ViewToggle from "@/components/ViewToggle";
import { getProfile, getDataClient } from "@/utils/data/queries";

import { ViewMode } from "@/components/ViewToggle";
import { Person, Relationship } from "@/types";

interface PageProps {
  searchParams: Promise<{ view?: string; rootId?: string; avatar?: string }>;
}
export default async function FamilyTreePage({ searchParams }: PageProps) {
  const { view, rootId, avatar } = await searchParams;
  const initialView = view as ViewMode | undefined;
  const initialShowAvatar = avatar !== "hide";

  const profile = await getProfile();
  const canEdit = profile?.role === "admin" || profile?.role === "editor";

  const db = getDataClient();

  const [personsRes, relsRes] = await Promise.all([
    db
      .from<Person>("persons")
      .select("*")
      .order("birth_year", { ascending: true }),
    db.from<Relationship>("relationships").select("*"),
  ]);

  const persons = personsRes.data || [];
  const relationships = relsRes.data || [];

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
      initialView={initialView}
      initialRootId={finalRootId}
      initialShowAvatar={initialShowAvatar}
    >
      <ViewToggle />
      <MembersViews
        persons={persons}
        relationships={relationships}
        canEdit={canEdit}
      />

      <MemberDetailModal />
    </MemberListProvider>
  );
}
