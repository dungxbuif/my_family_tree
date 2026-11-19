import { randomUUID } from "node:crypto";
import { pool, withTransaction } from "@/utils/db/client";
import { mediaReferenced } from "@/utils/family/media";
import { deleteObject } from "./s3";

export async function pruneTreeMedia(
  tree: string | null,
  limit = 10,
  remove = deleteObject,
) {
  const candidates = await pool.query<{ object_url: string }>(
    `
    SELECT m.object_url FROM tree_media m WHERE ($1::uuid IS NULL OR tree_id=$1)
    AND cleanup_after<=now() AND NOT ${mediaReferenced}
    ORDER BY cleanup_after,object_url LIMIT $2`,
    [tree, limit],
  );
  let removed = 0,
    failed = 0;
  for (const { object_url: url } of candidates.rows) {
    const claim = randomUUID();
    const deadline = Date.now() + 15000;
    const signal = AbortSignal.timeout(15000);
    const claimed = await withTransaction(async (client) => {
      // Attachments hold a matching share lock until their reference commits.
      const row = await client.query(
        "SELECT FROM tree_media WHERE object_url=$1 AND cleanup_after<=now() FOR UPDATE SKIP LOCKED",
        [url],
      );
      if (!row.rowCount) return false;
      const changed = await client.query(
        `UPDATE tree_media m SET cleanup_claim=$2,
        cleanup_attempts=cleanup_attempts+1,cleanup_after=now()+interval '10 minutes'
        WHERE object_url=$1 AND NOT ${mediaReferenced}`,
        [url, claim],
      );
      return Boolean(changed.rowCount);
    });
    if (!claimed) continue;
    try {
      // The durable claim blocks attachments and signing, without holding a
      // database connection during bucket I/O. The S3 request has a deadline.
      if (Date.now() >= deadline) throw new Error("Cleanup request expired");
      await remove(url, signal);
      const result = await pool.query(
        "DELETE FROM tree_media WHERE object_url=$1 AND cleanup_claim=$2",
        [url, claim],
      );
      removed += result.rowCount ?? 0;
    } catch {
      await pool.query(
        "UPDATE tree_media SET cleanup_after=now()+interval '5 minutes' WHERE object_url=$1 AND cleanup_claim=$2",
        [url, claim],
      );
      failed++;
    }
  }
  return { removed, failed, considered: candidates.rowCount ?? 0 };
}
