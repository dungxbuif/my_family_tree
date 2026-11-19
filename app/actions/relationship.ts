"use server";

import { changePeople, currentPeople } from "@/utils/family/browser";
import type { Edge } from "@/utils/family/relationships";
import type { ChildrenDraft } from "@/utils/family/people";
export type { EnrichedRelationship } from "@/utils/family/relationships";

export async function fetchMemberRelationships(
  personId: string,
  treeId: string,
) {
  return (await currentPeople(treeId)).family(personId);
}
export async function addRelationship(data: Edge, treeId: string) {
  return changePeople(async () => {
    await (await currentPeople(treeId)).addEdge(data);
    return {};
  });
}
export async function deleteRelationship(id: string, treeId: string) {
  return changePeople(async () => {
    await (await currentPeople(treeId)).removeEdge(id);
    return {};
  });
}
export async function quickAddSpouse(
  data: {
    personId: string;
    name: string;
    gender: string;
    is_in_law: boolean;
    birthYear?: number;
    note: string | null;
    submissionId: string;
  },
  treeId: string,
) {
  return changePeople(async () => {
    const fields = new FormData();
    const values = {
      full_name: data.name,
      gender: data.gender,
      is_in_law: String(data.is_in_law),
      birth_year: String(data.birthYear ?? ""),
      relatedTo: data.personId,
      relation: "spouse",
      relationshipNote: data.note ?? "",
      submissionId: data.submissionId,
    };
    for (const [key, value] of Object.entries(values)) fields.set(key, value);
    return { id: await (await currentPeople(treeId)).save(fields) };
  });
}
export async function bulkAddChildren(data: ChildrenDraft, treeId: string) {
  return changePeople(async () => ({
    count: (await (await currentPeople(treeId)).children(data)).length,
  }));
}
