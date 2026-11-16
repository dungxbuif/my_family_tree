"use server";

import { revalidatePath } from "next/cache";
import { getDataClient, getProfile } from "@/utils/data/queries";
import { deleteObject } from "@/utils/storage/s3";

export async function uploadGalleryItem(formData: FormData) {
  const profile = await getProfile();
  if (!profile || (profile.role !== "admin" && profile.role !== "editor")) {
    return { error: "Từ chối truy cập." };
  }

  const title = formData.get("title")?.toString();
  const description = formData.get("description")?.toString();
  const eventDate = formData.get("eventDate")?.toString();
  const id = formData.get("id")?.toString(); // For update

  if (!title) return { error: "Tiêu đề là bắt buộc." };

  try {
    const db = getDataClient();
    const imageUrl = formData.get("imageUrl")?.toString();


    if (!imageUrl) return { error: "Ảnh là bắt buộc." };

    const itemData = {
      title,
      description: description || null,
      image_url: imageUrl,
      event_date: eventDate || null,
    };

    if (id) {
      const { error } = await db.from("gallery_items").update(itemData).eq("id", id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await db.from("gallery_items").insert({
        ...itemData,
        created_by: profile.id,
      });
      if (error) throw new Error(error.message);
    }

    revalidatePath("/dashboard/gallery");
    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { error: message };
  }
}

export async function deleteGalleryItem(id: string, imageUrl: string) {
  const profile = await getProfile();
  if (!profile || (profile.role !== "admin" && profile.role !== "editor")) {
    return { error: "Từ chối truy cập." };
  }

  try {
    const db = getDataClient();

    // Delete from DB first
    const { error } = await db.from("gallery_items").delete().eq("id", id);
    if (error) throw new Error(error.message);

    // Then delete from storage
    await deleteObject(imageUrl);

    revalidatePath("/dashboard/gallery");
    return { success: true };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { error: message };
  }
}
