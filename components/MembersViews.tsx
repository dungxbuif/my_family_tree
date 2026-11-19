"use client";

import { useMemberListView } from "@/context/MemberListContext";
import MemberList from "@/components/MemberList";
import TreeAddMember from "./TreeAddMember";
import RootSelector from "@/components/RootSelector";
import { Person, Relationship } from "@/types";
import { useEffect, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";

const FamilyTree = dynamic(() => import("@/components/FamilyTree"));
const MindmapTree = dynamic(() => import("@/components/MindmapTree"));
const BubbleMapTree = dynamic(
  () =>
    import("@/components/BubbleMapTree").catch((err) => {
      console.error("Failed to load BubbleMapTree:", err);
      return {
        default: () => (
          <div className="flex absolute inset-0 items-center justify-center p-4 text-center bg-stone-50 rounded-2xl border border-stone-200/60 shadow-inner text-stone-500">
            Tính năng này không được hỗ trợ trên trình duyệt của bạn. Vui lòng
            cập nhật hoặc sử dụng trình duyệt khác.
          </div>
        ),
      };
    }),
  { ssr: false },
);

interface MembersViewsProps {
  treeId: string;
  persons: Person[];
  relationships: Relationship[];
  canEdit?: boolean;
}

export default function MembersViews({
  treeId,
  persons,
  relationships,
  canEdit = false,
}: MembersViewsProps) {
  const { view: currentView, rootId, setRootId } = useMemberListView();
  const searchParams = useSearchParams();
  const hasRestored = useRef(false);

  // Prepare map and roots for tree views
  const { personsMap, roots, defaultRootId } = useMemo(() => {
    const pMap = new Map<string, Person>();
    persons.forEach((p) => pMap.set(p.id, p));

    const childIds = new Set(
      relationships
        .filter(
          (r) => r.type === "biological_child" || r.type === "adopted_child",
        )
        .map((r) => r.person_b),
    );

    let finalRootId = rootId;

    // If no rootId is provided, fallback to generation 1 or earliest birth year
    if (!finalRootId || !pMap.has(finalRootId)) {
      const rootsFallback = persons.filter((p) => !childIds.has(p.id));
      if (rootsFallback.length > 0) {
        const gen1 = rootsFallback.filter((p) => p.generation === 1);
        const sortByBirthYear = (a: Person, b: Person) => {
          const ya = a.birth_year ?? Infinity;
          const yb = b.birth_year ?? Infinity;
          return ya - yb;
        };

        if (gen1.length > 0) {
          finalRootId = gen1.sort(sortByBirthYear)[0].id;
        } else {
          finalRootId = rootsFallback.sort(sortByBirthYear)[0].id;
        }
      } else if (persons.length > 0) {
        finalRootId = persons[0].id; // ultimate fallback
      }
    }

    let calculatedRoots: Person[] = [];
    if (finalRootId && pMap.has(finalRootId)) {
      calculatedRoots = [pMap.get(finalRootId)!];
    }

    return {
      personsMap: pMap,
      roots: calculatedRoots,
      defaultRootId: finalRootId,
    };
  }, [persons, relationships, rootId]);

  const activeRootId = defaultRootId;

  // Khôi phục lựa chọn từ localStorage
  useEffect(() => {
    if (hasRestored.current) return;

    const urlRootId = searchParams.get("rootId");

    if (!urlRootId) {
      try {
        const savedRootId = localStorage.getItem(`members_rootId_${treeId}`);

        if (!urlRootId && savedRootId && personsMap.has(savedRootId) && savedRootId !== rootId) {
          setRootId(savedRootId);
        }
      } catch (e) {
        console.warn("Failed to read from localStorage:", e);
      }
    }

    hasRestored.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Lưu lựa chọn vào localStorage
  useEffect(() => {
    if (!hasRestored.current) return;

    const timeout = setTimeout(() => {
      try {
        if (activeRootId) localStorage.setItem(`members_rootId_${treeId}`, activeRootId);
      } catch (e) {
        console.warn("Failed to write to localStorage:", e);
      }
    }, 100);

    return () => clearTimeout(timeout);
  }, [currentView, activeRootId, treeId]);

  return (
    <>
      <main className="flex min-h-0 flex-1 flex-col overflow-visible bg-transparent">
        {currentView !== "list" && canEdit && <div className="py-2"><TreeAddMember treeId={treeId} /></div>}
        {currentView !== "list" && persons.length > 0 && activeRootId && (
          <div className="sticky top-20 z-30 mx-auto flex w-full flex-col flex-wrap items-stretch gap-3 border-b border-border bg-neutral/95 py-3 sm:flex-row sm:items-center sm:justify-between">
            <RootSelector persons={persons} currentRootId={activeRootId} />
            <div
              id="tree-toolbar-portal"
              className="flex items-center gap-2 flex-wrap justify-stretch sm:justify-center"
            />
          </div>
        )}

        {currentView === "list" && (
          <div className="relative z-10 mx-auto w-full overflow-y-auto py-4 sm:py-6">
            <MemberList
              initialPersons={persons}
              relationships={relationships}
              canEdit={canEdit}
            />
          </div>
        )}

        <div className="relative z-10 flex min-h-0 flex-1 w-full flex-col">
          {currentView === "tree" && (
            <FamilyTree
              personsMap={personsMap}
              relationships={relationships}
              roots={roots}
              canEdit={canEdit}
            />
          )}
          {currentView === "mindmap" && (
            <MindmapTree
              personsMap={personsMap}
              relationships={relationships}
              roots={roots}
              canEdit={canEdit}
            />
          )}
          {currentView === "bubble" && (
            <BubbleMapTree
              personsMap={personsMap}
              relationships={relationships}
              roots={roots}
              canEdit={canEdit}
            />
          )}
        </div>
      </main>
    </>
  );
}
