import type { PoolClient } from "pg";
import type { Person } from "@/types";
import { tableColumns } from "@/utils/db/schema";

export class FamilyDataError extends Error {}
export const forbidden = () => new FamilyDataError("Từ chối truy cập.");
export const unavailable = () =>
  new FamilyDataError("Không tìm thấy hồ sơ hoặc quan hệ trong cây gia phả.");
export const uuid = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;
export const publicColumns = "tree_id," + tableColumns.persons.join(",");
export async function requirePerson(
  client: PoolClient,
  tree: string,
  id: string,
) {
  if (!uuid.test(id)) throw unavailable();
  const {
    rows: [person],
  } = await client.query<Person>(
    `SELECT ${publicColumns},linked_user_id FROM persons WHERE tree_id=$1 AND id=$2`,
    [tree, id],
  );
  if (!person) throw unavailable();
  return person;
}
