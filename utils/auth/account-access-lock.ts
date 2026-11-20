// Acquire this transaction lock before any Family Tree, membership, Person or
// account row locks. Tree access can run concurrently across trees. Account
// lifecycle changes run exclusively because deletion cascades into those trees.
const accountLifecycleKey = 917208342;
export const accountAccessLock = {
  shared: `SELECT pg_advisory_xact_lock_shared(${accountLifecycleKey})`,
  exclusive: `SELECT pg_advisory_xact_lock(${accountLifecycleKey})`,
} as const;
