"use server";

import { redirect } from "next/navigation";
import type { Person } from "@/types";
import {
  changePeople,
  currentPeople,
} from "@/utils/family/browser";
import { unavailable } from "@/utils/family/records";

export async function fetchMemberDetail(id: string, treeId: string) {
  const result = await (await currentPeople(treeId)).detail(id);
  if (!result) throw unavailable();
  return result;
}
export async function batchUpdateLineage(
  updates: Pick<Person, "id" | "generation" | "birth_order" | "is_in_law">[],
  treeId: string,
) {
  return changePeople(async () => {
    await (await currentPeople(treeId)).lineage(updates);
    return {};
  });
}
export async function searchMembers(
  query: string,
  excludeId: string,
  treeId: string,
) {
  return (await currentPeople(treeId)).search(query, excludeId);
}
export async function getRecentMembers(excludeId: string, treeId: string) {
  return (await currentPeople(treeId)).recent(excludeId);
}
export async function saveMember(fields: FormData) {
  return changePeople(async () => ({
    id: await (await currentPeople(String(fields.get("treeId")))).save(fields),
  }));
}
export async function deleteMemberProfile(id: string, treeId: string) {
  const result = await changePeople(async () => {
    await (await currentPeople(treeId)).remove(id);
    return {};
  });
  if (result.error) return result;
  redirect("/dashboard/members?view=list");
}
