import type { PoolClient } from "pg";
import type { GalleryItem, TreeRole } from "@/types";
import { FamilyDataError, uuid } from "./records";
import {
  presignUpload,
  readObject,
  requireUploadedImage,
  type UploadFolder,
  type UploadIdentity,
} from "@/utils/storage/s3";
import type { CustomEventRecord } from "@/utils/eventHelpers";

type Access = <T>(
  write: boolean,
  operation: (client: PoolClient, role: TreeRole) => Promise<T>,
) => Promise<T>;
export type EventDraft = Pick<
  CustomEventRecord,
  "name" | "event_date" | "location" | "content"
> & { id?: string };
export type GalleryDraft = {
  id?: string;
  title: string;
  description: string;
  eventDate: string;
  imageUrl: string;
};
const missing = () =>
  new FamilyDataError("Không tìm thấy mục này trong cây gia phả.");
export class MediaUploadConflict extends FamilyDataError {}
export class UnavailableImage extends FamilyDataError {}
const invalidImage = () =>
  new UnavailableImage("Ảnh không hợp lệ hoặc chưa được tải lên.");

export const mediaReferenced = `(EXISTS(SELECT FROM gallery_items g WHERE g.tree_id=m.tree_id AND g.image_url=m.object_url)
  OR EXISTS(SELECT FROM persons p WHERE p.tree_id=m.tree_id AND p.avatar_url=m.object_url))`;

// Serialize attachment with cleanup. Only the signer or legacy migration can
// create ownership. A user-supplied URL can never establish it.
export async function requireMedia(
  client: PoolClient,
  tree: string,
  folder: UploadFolder,
  url: string,
) {
  const media = await client.query(
    "SELECT expected_bytes FROM tree_media WHERE tree_id=$1 AND folder=$2 AND object_url=$3 AND cleanup_claim IS NULL FOR SHARE",
    [tree, folder, url],
  );
  if (!media.rowCount) throw invalidImage();
  return media.rows[0].expected_bytes as number | null;
}

export async function requireAttachment(
  client: PoolClient,
  tree: string,
  folder: UploadFolder,
  url: string,
) {
  const size = await requireMedia(client, tree, folder, url);
  try {
    await requireUploadedImage(url, size);
  } catch {
    throw invalidImage();
  }
}

export function familyMedia(actor: string, tree: string, access: Access) {
  return {
    saveEvent: (draft: EventDraft) =>
      access(true, async (client) => {
        if (!draft.name?.trim() || !/^\d{4}-\d\d-\d\d$/.test(draft.event_date))
          throw new FamilyDataError("Vui lòng nhập tên và ngày sự kiện.");
        const values = [
          tree,
          draft.name.trim(),
          draft.event_date,
          draft.location || null,
          draft.content || null,
        ];
        if (draft.id !== undefined && !uuid.test(draft.id)) throw missing();
        const result = draft.id
          ? await client.query(
              "UPDATE custom_events SET name=$2,event_date=$3,location=$4,content=$5 WHERE tree_id=$1 AND id=$6 RETURNING id",
              [...values, draft.id],
            )
          : await client.query(
              "INSERT INTO custom_events(tree_id,name,event_date,location,content,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id",
              [...values, actor],
            );
        if (!result.rowCount) throw missing();
        return result.rows[0].id as string;
      }),
    deleteEvent: (id: string) =>
      access(true, async (client) => {
        if (
          !uuid.test(id) ||
          !(
            await client.query(
              "DELETE FROM custom_events WHERE tree_id=$1 AND id=$2",
              [tree, id],
            )
          ).rowCount
        )
          throw missing();
      }),
    gallery: () =>
      access(
        false,
        async (client) =>
          (
            await client.query<GalleryItem>(
              `SELECT g.id,g.tree_id,g.title,g.description,m.object_url AS image_url,g.event_date::text,g.created_at::text,g.created_by
      FROM gallery_items g LEFT JOIN tree_media m ON m.tree_id=g.tree_id AND m.object_url=g.image_url AND m.folder='gallery' AND m.cleanup_claim IS NULL
      WHERE g.tree_id=$1 ORDER BY g.event_date DESC NULLS LAST,g.created_at DESC,g.id`,
              [tree],
            )
          ).rows,
      ),
    saveGallery: (draft: GalleryDraft) =>
      access(true, async (client) => {
        if (!draft.title?.trim())
          throw new FamilyDataError("Vui lòng nhập tiêu đề.");
        let original: string | undefined;
        if (draft.id !== undefined) {
          if (!uuid.test(draft.id)) throw missing();
          const record = await client.query(
            "SELECT image_url FROM gallery_items WHERE tree_id=$1 AND id=$2",
            [tree, draft.id],
          );
          if (!record.rowCount) throw missing();
          original = record.rows[0].image_url;
        }
        if (original === draft.imageUrl)
          await requireMedia(client, tree, "gallery", draft.imageUrl);
        else await requireAttachment(client, tree, "gallery", draft.imageUrl);
        const values = [
          tree,
          draft.title.trim(),
          draft.description || null,
          draft.eventDate || null,
          draft.imageUrl,
        ];
        if (draft.id) {
          await client.query(
            "UPDATE gallery_items SET title=$2,description=$3,event_date=$4,image_url=$5 WHERE tree_id=$1 AND id=$6",
            [...values, draft.id],
          );
          return draft.id;
        }
        // Retrying a completed upload after losing the response returns its item.
        const prior = await client.query(
          "SELECT id FROM gallery_items WHERE tree_id=$1 AND image_url=$2 LIMIT 1",
          [tree, draft.imageUrl],
        );
        if (prior.rowCount) return prior.rows[0].id as string;
        const created = await client.query(
          "INSERT INTO gallery_items(tree_id,title,description,event_date,image_url,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING id",
          [...values, actor],
        );
        return created.rows[0].id as string;
      }),
    deleteGallery: (id: string) =>
      access(true, async (client) => {
        if (
          !uuid.test(id) ||
          !(
            await client.query(
              "DELETE FROM gallery_items WHERE tree_id=$1 AND id=$2",
              [tree, id],
            )
          ).rowCount
        )
          throw missing();
      }),
    issueUpload: (
      folder: UploadFolder,
      fileName: string,
      type: string,
      size: number,
      identity: Pick<UploadIdentity, "submissionId" | "sha256">,
    ) =>
      access(true, async (client) => {
        const upload = await presignUpload(folder, fileName, type, size, {
          ...identity,
          actorId: actor,
          treeId: tree,
        });
        const result = await client.query(
          `INSERT INTO tree_media(object_url,tree_id,folder,expected_bytes,cleanup_after) VALUES($1,$2,$3,$4,now()+interval '1 day')
          ON CONFLICT(object_url) DO UPDATE SET cleanup_after=excluded.cleanup_after WHERE tree_media.tree_id=excluded.tree_id AND tree_media.folder=excluded.folder AND tree_media.cleanup_claim IS NULL AND tree_media.expected_bytes=excluded.expected_bytes`,
          [upload.publicUrl, tree, folder, size],
        );
        if (!result.rowCount)
          throw new MediaUploadConflict(
            "Ảnh đang được cập nhật. Vui lòng thử lại.",
          );
        return upload;
      }),
    readMedia: (url: string, range?: string) =>
      access(false, async (client) => {
        const record = await client.query(
          `SELECT FROM tree_media m WHERE m.tree_id=$1 AND m.object_url=$2 AND m.cleanup_claim IS NULL AND ${mediaReferenced}`,
          [tree, url],
        );
        if (!record.rowCount) throw missing();
        return readObject(url, range);
      }),
  };
}
