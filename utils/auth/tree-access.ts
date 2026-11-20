import { FAMILY_TREE_NAME_LIMIT, type TreeRole } from "@/types";
import type { Pool } from "pg";
import { pool } from "@/utils/db/client";
import { accountAccessLock } from "./account-access-lock";

export type AccessibleTree = { id: string; name: string; role: TreeRole };
type TreeDatabase = Pick<Pool, "query">;

// actorId comes from the authenticated server session, never from a form or cookie hint.
export async function createFamilyTree(actorId: string, name: unknown, database: TreeDatabase = pool) {
  if (typeof name !== "string" || !name.trim() || name.trim().length > FAMILY_TREE_NAME_LIMIT || name.includes("\0")) {
    return { code: "INVALID_NAME" as const };
  }
  const { rows } = await database.query<AccessibleTree>(
    `WITH access_lock AS MATERIALIZED (${accountAccessLock.shared}),
          actor AS (SELECT p.id FROM access_lock CROSS JOIN profiles p WHERE p.id=$1 AND p.is_active FOR SHARE OF p),
          tree AS (INSERT INTO family_trees(name) SELECT $2 FROM actor RETURNING id,name),
          membership AS (
            INSERT INTO tree_memberships(tree_id,user_id,role)
            SELECT tree.id,actor.id,'owner' FROM tree CROSS JOIN actor RETURNING tree_id,role
          )
     SELECT tree.id, tree.name, membership.role FROM tree JOIN membership ON tree.id=membership.tree_id`,
    [actorId, name.trim()],
  );
  return rows[0] ? { tree: rows[0] } : { code: "FORBIDDEN" as const };
}

export async function getTreeSelection(actorId: string, hint?: string, database: TreeDatabase = pool) {
  // The outer join distinguishes an active account with no trees from a denied account.
  const { rows } = await database.query<{ tree: AccessibleTree | null }>(
    `SELECT CASE WHEN t.id IS NOT NULL THEN
        json_build_object('id',t.id,'name',t.name,'role',m.role) END AS tree
       FROM profiles p
       LEFT JOIN (tree_memberships m JOIN family_trees t ON t.id=m.tree_id AND t.archived_at IS NULL)
         ON m.user_id=p.id
      WHERE p.id=$1 AND p.is_active
      ORDER BY t.created_at,t.id`,
    [actorId],
  );
  if (!rows.length) return { code: "FORBIDDEN" as const };
  const trees = rows.flatMap(({ tree }) => tree ? [tree] : []);
  return { trees, current: trees.find(tree => tree.id === hint) ?? trees[0] ?? null };
}

export async function selectFamilyTree(actorId: string, treeId: unknown, database: TreeDatabase = pool) {
  if (typeof treeId !== "string") return { code: "FORBIDDEN" as const };
  const { current } = await getTreeSelection(actorId, treeId, database);
  return current?.id === treeId ? { tree: current } : { code: "FORBIDDEN" as const };
}
