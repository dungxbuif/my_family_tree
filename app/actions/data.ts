"use server";

import { changeFamily, currentPeople } from "@/utils/family/browser";
import type { EventDraft } from "@/utils/family/media";

import { FamilyDataError } from "@/utils/family/records";
import { revalidatePath } from "next/cache";

export async function saveCustomEvent(draft: EventDraft, treeId: string) {
  return changeFamily("/dashboard/events", async () => ({
    id: await (await currentPeople(treeId)).saveEvent(draft),
  }));
}

export async function deleteCustomEvent(id: string, treeId: string) {
  return changeFamily("/dashboard/events", async () => {
    await (await currentPeople(treeId)).deleteEvent(id);
    return {};
  });
}

export async function exportData(treeId: string, root?: string) {
  try {
    return await (await currentPeople(treeId)).exportBackup(root);
  } catch (error) {
    return {
      error:
        error instanceof FamilyDataError
          ? error.message
          : "Không thể xuất dữ liệu.",
    };
  }
}

export async function importData(treeId: string, input: unknown) {
  return changeFamily("/dashboard/data", async () => {
    const imported = await (await currentPeople(treeId)).importBackup(input);
    revalidatePath("/dashboard", "layout");
    return { imported };
  });
}
