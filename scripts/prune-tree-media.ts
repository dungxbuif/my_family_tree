import { pruneTreeMedia } from "../utils/storage/prune";
import { pool } from "../utils/db/client";

try {
  let total = 0,
    failed = 0,
    batch;
  do {
    batch = await pruneTreeMedia(null, 50);
    total += batch.removed;
    failed += batch.failed;
  } while (batch.considered === 50 && batch.removed + batch.failed > 0);
  console.log(
    "Removed unused media objects:",
    total,
    "scheduled retries:",
    failed,
  );
  if (failed) process.exitCode = 1;
} finally {
  await pool.end();
}
