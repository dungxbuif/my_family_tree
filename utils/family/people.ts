import type { Pool, PoolClient } from "pg";
import type { Person, PersonOption, TreeRole } from "@/types";
import { pool, withTransaction } from "@/utils/db/client";
import {
  FamilyDataError,
  forbidden,
  publicColumns,
  ownedAvatar,
  requirePerson,
  unavailable,
  uuid,
} from "./records";
import { exportBackup, importBackup } from "./backup";
import { familyMedia } from "./media";
import { insertEdge, readFamily, listEdges, removeEdge, type Edge } from "./relationships";
import { validateLifeDates } from "./life-dates";
import { createOnce, savePerson } from "./save-person";
import { requireTreeRole, removePerson, personDetail } from "./person-records";

export type ChildrenDraft = {
  submissionId: string;
  parentId: string;
  spouseId?: string | null;
  children: {
    name: string;
    gender: string;
    birthYear: string;
    birthOrder: string;
  }[];
};

export function familyPeople(
  actor: string,
  treeId: string,
  database: Pick<Pool, "connect"> = pool,
) {
  function access<T>(
    write: boolean,
    operation: (client: PoolClient, role: TreeRole) => Promise<T>,
  ) {
    return withTransaction(async (client) => {
      const role = await requireTreeRole(client, actor, treeId, write);
      return operation(client, role);
    }, database);
  }

  function ownerAccess<T>(
    write: boolean,
    operation: (client: PoolClient) => Promise<T>,
  ) {
    return access(write, (client, role) => {
      if (role !== "owner") throw forbidden();
      return operation(client);
    });
  }
  return {
    exportBackup: (root?: string) =>
      ownerAccess(false, (client) => exportBackup(client, treeId, root)),
    importBackup: (input: unknown) =>
      importBackup(ownerAccess, treeId, input).catch((error: unknown) => {
        if (error instanceof FamilyDataError) throw error;
        throw new FamilyDataError("Không thể phục hồi bản sao lưu.", {
          cause: error,
        });
      }),
    ...familyMedia(actor, treeId, access),
    children: (draft: ChildrenDraft) =>
      access(true, (client) =>
        createOnce(
          client,
          treeId,
          actor,
          draft.submissionId,
          draft,
          async () => {
            const parent = await requirePerson(client, treeId, draft.parentId);
            const second =
              draft.spouseId && draft.spouseId !== "unknown"
                ? draft.spouseId
                : null;
            if (second) await requirePerson(client, treeId, second);
            if (!draft.children.length || second === parent.id)
              throw new FamilyDataError(
                "Thông tin cha mẹ hoặc con không hợp lệ.",
              );
            const ids: string[] = [];
            for (const child of draft.children) {
              if (
                !child.name.trim() ||
                !["male", "female", "other"].includes(child.gender)
              )
                throw new FamilyDataError("Thông tin con không hợp lệ.");
              const birthYear = child.birthYear
                ? Number(child.birthYear)
                : null;
              validateLifeDates({ birth_year: birthYear });
              const {
                rows: [row],
              } = await client.query(
                `INSERT INTO persons(tree_id,full_name,gender,birth_year,birth_order)
          VALUES($1,$2,$3,$4,$5) RETURNING id`,
                [
                  treeId,
                  child.name.trim(),
                  child.gender,
                  birthYear,
                  child.birthOrder || null,
                ],
              );
              for (const id of second ? [parent.id, second] : [parent.id])
                await insertEdge(client, treeId, {
                  person_a: id,
                  person_b: row.id,
                  type: "biological_child",
                });
              ids.push(row.id);
            }
            return ids;
          },
        ),
      ),
    save: (fields: FormData) =>
      access(true, (client, role) =>
        savePerson(client, treeId, actor, role, fields),
      ),
    family: (id: string) =>
      access(false, (client) => readFamily(client, treeId, id)),
    addEdge: (edge: Edge) =>
      access(true, (client) => insertEdge(client, treeId, edge)),
    removeEdge: (id: string) =>
      access(true, (client) => removeEdge(client, treeId, id)),
    remove: (id: string) =>
      access(true, (client) => removePerson(client, treeId, id)),
    lineage: (
      updates: Pick<
        Person,
        "id" | "generation" | "birth_order" | "is_in_law"
      >[],
    ) =>
      access(true, async (client) => {
        for (const update of updates) {
          if (!uuid.test(update.id)) throw unavailable();
          const changed = await client.query(
            "UPDATE persons SET generation=$3,birth_order=$4,is_in_law=$5 WHERE tree_id=$1 AND id=$2",
            [
              treeId,
              update.id,
              update.generation,
              update.birth_order,
              update.is_in_law,
            ],
          );
          if (!changed.rowCount) throw unavailable();
        }
      }),
    graph: () =>
      access(false, async (client, role) => ({
        treeId,
        role,
        persons: (
          await client.query<Person>(
            `SELECT ${publicColumns} FROM persons WHERE tree_id=$1 ORDER BY birth_year,id`,
            [treeId],
          )
        ).rows,
        relationships: await listEdges(client, treeId),
      })),
    selector: () =>
      access(
        false,
        async (client) =>
          (
            await client.query<PersonOption>(
              `SELECT id,full_name,birth_year,gender,${ownedAvatar},generation FROM persons WHERE tree_id=$1 ORDER BY birth_year,id`,
              [treeId],
            )
          ).rows,
      ),
    search: (name: string, exclude?: string) =>
      access(
        false,
        async (client) =>
          (
            await client.query<Person>(
              `SELECT ${publicColumns} FROM persons WHERE tree_id=$1 AND full_name ILIKE $2 AND id IS DISTINCT FROM $3
       ORDER BY full_name,id LIMIT 5`,
              [
                treeId,
                "%" + name + "%",
                exclude && uuid.test(exclude) ? exclude : null,
              ],
            )
          ).rows,
      ),
    recent: (exclude?: string, limit = 10) =>
      access(
        false,
        async (client) =>
          (
            await client.query<Person>(
              `SELECT ${publicColumns} FROM persons WHERE tree_id=$1 AND id IS DISTINCT FROM $2 ORDER BY created_at DESC,id LIMIT $3`,
              [
                treeId,
                exclude && uuid.test(exclude) ? exclude : null,
                Math.min(100, Math.max(0, Math.trunc(limit))),
              ],
            )
          ).rows,
      ),
    detail: (id: string) =>
      access(false, (client, role) => personDetail(client, treeId, id, role, true)),
  };
}
