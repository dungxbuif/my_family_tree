import { pruneTreeMedia } from "../utils/storage/prune";
import { pool } from "../utils/db/client";

try {
  let total = 0;
  let removed;
  do {
    removed = await pruneTreeMedia(null, 50);
    total += removed;
  } while (removed === 50);
  console.log("Removed unused media objects:", total);
} finally {
  await pool.end();
}
