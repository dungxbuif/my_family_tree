import { withTransaction } from "@/utils/db/client";
import { mediaReferenced } from "@/utils/family/media";
import { deleteObject } from "./s3";

// A failed S3 delete rolls back the row, so the next sweep retries it.
// New attachments take a share lock on the same ownership row.
export async function pruneTreeMedia(tree: string | null, limit = 10) {
  return withTransaction(async (client) => {
    const candidates = await client.query<{ object_url: string }>(
      `
      SELECT m.object_url FROM tree_media m
      WHERE ($1::uuid IS NULL OR m.tree_id=$1) AND m.cleanup_after <= now()
      AND NOT ${mediaReferenced}
      ORDER BY m.cleanup_after,m.object_url LIMIT $2 FOR UPDATE OF m SKIP LOCKED`,
      [tree, limit],
    );
    let removed = 0;
    for (const { object_url } of candidates.rows) {
      // Recheck after obtaining the row lock using a fresh READ COMMITTED snapshot.
      const unused = await client.query(
        `SELECT FROM tree_media m WHERE m.object_url=$1 AND NOT ${mediaReferenced}`,
        [object_url],
      );
      if (!unused.rowCount) continue;
      await deleteObject(object_url);
      await client.query("DELETE FROM tree_media WHERE object_url=$1", [
        object_url,
      ]);
      removed++;
    }
    return removed;
  });
}
