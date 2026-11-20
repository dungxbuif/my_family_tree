import type { PoolClient } from "pg";
import { readRows } from "./read-rows";
import type { Person, TreeRole } from "@/types";
import { accountAccessLock } from "@/utils/auth/account-access-lock";
import {
  FamilyDataError,
  forbidden,
  publicColumns,
  personTextFields,
  requirePerson,
  uuid,
} from "./records";
type PrivateDetails = Pick<
  Person,
  "phone_number" | "occupation" | "current_residence"
>;

export async function requireTreeRole(
  client: PoolClient,
  actor: string,
  treeId: string,
  write: boolean,
) {
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
  return member.role;
}

export async function removePerson(
  client: PoolClient,
  treeId: string,
  id: string,
) {
  const person = await requirePerson(client, treeId, id);
  if (person.linked_user_id)
    throw new FamilyDataError(
      "Vui lòng hủy liên kết tài khoản trước khi xoá.",
      { kind: "conflict" },
    );
  const edges = await client.query(
    "SELECT FROM relationships WHERE tree_id=$1 AND $2 IN (person_a,person_b) LIMIT 1",
    [treeId, id],
  );
  if (edges.rowCount)
    throw new FamilyDataError("Vui lòng xoá các quan hệ trước khi xoá hồ sơ.", {
      kind: "conflict",
    });
  await client.query("DELETE FROM persons WHERE tree_id=$1 AND id=$2", [
    treeId,
    id,
  ]);
}

export async function personDetail(
  client: PoolClient,
  treeId: string,
  id: string,
  role: TreeRole,
  includePrivate: boolean,
  maxBytes?: number,
) {
  if (!uuid.test(id)) return null;
  const privateAccess = includePrivate && role === "owner";
  const [person] = await readRows<Person>(
    client,
    `SELECT ${publicColumns}${privateAccess ? ",email" : ""} FROM persons WHERE tree_id=$1 AND id=$2`,
    [treeId, id],
    privateAccess ? [...personTextFields, "email"] : personTextFields,
    maxBytes,
  );
  if (!person) return null;
  const privateData = privateAccess
    ? ((
        await readRows<PrivateDetails>(
          client,
          "SELECT phone_number,occupation,current_residence FROM person_details_private WHERE tree_id=$1 AND person_id=$2",
          [treeId, id],
          ["phone_number", "occupation", "current_residence"],
          maxBytes,
        )
      )[0] ?? null)
    : null;
  return { person, privateData, role };
}
