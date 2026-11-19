import type { CustomEventRecord } from "@/utils/eventHelpers";
import type { Pool, PoolClient } from "pg";
import type { Person, PersonOption, Relationship, TreeRole } from "@/types";
import { pool, withTransaction } from "@/utils/db/client";
import {
  FamilyDataError,
  forbidden,
  publicColumns,
  requirePerson,
  unavailable,
  uuid,
} from "./records";
import { familyMedia } from "./media";
import { insertEdge, readFamily, type Edge } from "./relationships";
import { validateLifeDates } from "./life-dates";
import { createOnce, savePerson } from "./save-person";
import { accountAccessLock } from "@/utils/auth/account-access-lock";

type PrivateDetails = Pick<
  Person,
  "phone_number" | "occupation" | "current_residence"
>;

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
      if (!uuid.test(actor) || !uuid.test(treeId)) throw forbidden();
      await client.query(accountAccessLock.shared);
      // Same ordering as access management: tree before membership, account and Person.
      const tree = await client.query(
        `SELECT id FROM family_trees t WHERE id=$1 AND archived_at IS NULL
        AND EXISTS (SELECT FROM tree_memberships WHERE tree_id=t.id AND user_id=$2)
        FOR ${write ? "UPDATE" : "SHARE"}`,
        [treeId, actor],
      );
      if (!tree.rowCount) throw forbidden();
      const {
        rows: [member],
      } = await client.query<{ role: TreeRole }>(
        `SELECT m.role FROM tree_memberships m
        JOIN profiles p ON p.id=m.user_id WHERE m.tree_id=$1 AND m.user_id=$2 AND p.is_active FOR SHARE OF m,p`,
        [treeId, actor],
      );
      if (!member || (write && member.role === "viewer")) throw forbidden();
      return operation(client, member.role);
    }, database);
  }

  return {
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
              const birthYear = child.birthYear ? Number(child.birthYear) : null;
              validateLifeDates({birth_year: birthYear});
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
      access(true, async (client) => {
        if (!uuid.test(id)) throw unavailable();
        const deleted = await client.query(
          "DELETE FROM relationships WHERE tree_id=$1 AND id=$2",
          [treeId, id],
        );
        if (!deleted.rowCount) throw unavailable();
      }),
    remove: (id: string) =>
      access(true, async (client) => {
        const person = await requirePerson(client, treeId, id);
        if (person.linked_user_id)
          throw new FamilyDataError(
            "Vui lòng hủy liên kết tài khoản trước khi xoá.",
          );
        const edges = await client.query(
          "SELECT FROM relationships WHERE tree_id=$1 AND $2 IN (person_a,person_b) LIMIT 1",
          [treeId, id],
        );
        if (edges.rowCount)
          throw new FamilyDataError(
            "Vui lòng xoá các quan hệ trước khi xoá hồ sơ.",
          );
        await client.query("DELETE FROM persons WHERE tree_id=$1 AND id=$2", [
          treeId,
          id,
        ]);
      }),
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
        relationships: (
          await client.query<Relationship>(
            "SELECT * FROM relationships WHERE tree_id=$1 ORDER BY id",
            [treeId],
          )
        ).rows,
      })),
    calendar: () =>
      access(
        false,
        async (client) =>
          (
            await client.query<CustomEventRecord>(
              "SELECT id,name,content,event_date::text,location,created_by FROM custom_events WHERE tree_id=$1",
              [treeId],
            )
          ).rows,
      ),
    selector: () =>
      access(
        false,
        async (client) =>
          (
            await client.query<PersonOption>(
              "SELECT id,full_name,birth_year,gender,avatar_url,generation FROM persons WHERE tree_id=$1 ORDER BY birth_year,id",
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
      access(false, async (client, role) => {
        if (!uuid.test(id)) return null;
        const person = (
          await client.query<Person>(
            `SELECT ${publicColumns}${role === "owner" ? ",email" : ""}
        FROM persons WHERE tree_id=$1 AND id=$2`,
            [treeId, id],
          )
        ).rows[0];
        if (!person) return null;
        const privateData =
          role === "owner"
            ? ((
                await client.query<PrivateDetails>(
                  "SELECT phone_number,occupation,current_residence FROM person_details_private WHERE tree_id=$1 AND person_id=$2",
                  [treeId, id],
                )
              ).rows[0] ?? null)
            : null;
        return { person, privateData, role };
      }),
  };
}
