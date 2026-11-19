import type { PoolClient } from "pg";
import type { Person } from "@/types";
import { tableColumns } from "@/utils/db/schema";

export class FamilyDataError extends Error {
  readonly kind;
  constructor(
    message: string,
    options?: ErrorOptions & {
      kind?: "invalid" | "forbidden" | "unavailable" | "conflict";
    },
  ) {
    super(message, options);
    this.kind = options?.kind ?? "invalid";
  }
}
export const forbidden = () =>
  new FamilyDataError("Từ chối truy cập.", { kind: "forbidden" });
export const unavailable = () =>
  new FamilyDataError("Không tìm thấy hồ sơ hoặc quan hệ trong cây gia phả.", {
    kind: "unavailable",
  });
export const uuid = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;
export const ownedAvatar =
  "(SELECT m.object_url FROM tree_media m WHERE m.tree_id=persons.tree_id AND m.folder='avatars' AND m.object_url=persons.avatar_url AND m.cleanup_claim IS NULL) AS avatar_url";
export const publicColumns =
  "tree_id," +
  tableColumns.persons
    .map((k) => (k === "avatar_url" ? ownedAvatar : k))
    .join(",");
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
