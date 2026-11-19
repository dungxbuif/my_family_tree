"use server";

import { currentPeople, changeFamily } from "@/utils/family/browser";
import { formText } from "@/utils/family/save-person";

export async function uploadGalleryItem(fields: FormData) {
  return changeFamily("/dashboard/gallery", async () => {
    const family = await currentPeople(fields.get("treeId"));
    const id = await family.saveGallery({
      id: formText(fields, "id") || undefined,
      title: formText(fields, "title"),
      description: formText(fields, "description"),
      eventDate: formText(fields, "eventDate"),
      imageUrl: formText(fields, "imageUrl"),
    });
    return { id };
  });
}

export async function deleteGalleryItem(id: string, treeId: string) {
  return changeFamily("/dashboard/gallery", async () => {
    await (await currentPeople(treeId)).deleteGallery(id);
    return {};
  });
}
