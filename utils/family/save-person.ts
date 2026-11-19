import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import type { TreeRole } from "@/types";
import { updatePersonEmailInTransaction } from "@/utils/auth/tree-membership";
import { FamilyDataError, forbidden, requirePerson, uuid } from "./records";
import { validateLifeDates } from "./life-dates";
import { requireAttachment } from "./media";
import { insertEdge } from "./relationships";

export type Relation =
  | "child"
  | "parent"
  | "spouse"
  | "adopted_child"
  | "adoptive_parent";
const relations: Relation[] = [
  "child",
  "parent",
  "spouse",
  "adopted_child",
  "adoptive_parent",
];
export const textFields = [
  "full_name",
  "gender",
  "note",
  "avatar_url",
  "other_names",
] as const;
export const numberFields = [
  "birth_year",
  "birth_month",
  "birth_day",
  "death_year",
  "death_month",
  "death_day",
  "death_lunar_year",
  "death_lunar_month",
  "death_lunar_day",
  "generation",
  "birth_order",
] as const;
export const privateFields = [
  "phone_number",
  "occupation",
  "current_residence",
] as const;
type Value = string | number | boolean | null;
export function formText(fields: FormData, key: string) {
  const value = fields.get(key);
  if (value === null) return "";
  if (typeof value !== "string" || value.includes("\0"))
    throw new FamilyDataError("Dữ liệu không hợp lệ.");
  return value;
}
export async function createOnce(
  client: PoolClient,
  tree: string,
  actor: string,
  key: string,
  input: unknown,
  create: () => Promise<string[]>,
) {
  if (!uuid.test(key))
    throw new FamilyDataError("Biểu mẫu không hợp lệ. Vui lòng mở lại.");
  const hash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  const {
    rows: [prior],
  } = await client.query(
    "SELECT fingerprint,person_ids FROM person_creation_receipts WHERE tree_id=$1 AND user_id=$2 AND submission_id=$3",
    [tree, actor, key],
  );
  if (prior) {
    if (prior.fingerprint !== hash)
      throw new FamilyDataError(
        "Lần lưu trước đã hoàn tất. Vui lòng kiểm tra danh sách.",
      );
    for (const id of prior.person_ids) await requirePerson(client, tree, id);
    return prior.person_ids as string[];
  }
  const ids = await create();
  await client.query(
    "INSERT INTO person_creation_receipts(tree_id,user_id,submission_id,fingerprint,person_ids) VALUES($1,$2,$3,$4,$5)",
    [tree, actor, key, hash, ids],
  );
  return ids;
}

export async function savePerson(
  client: PoolClient,
  tree: string,
  actor: string,
  role: TreeRole,
  fields: FormData,
) {
  const existing = formText(fields, "id");
  const values: Record<string, Value> = {};
  for (const key of textFields)
    if (fields.has(key)) values[key] = formText(fields, key);
  if (!existing || fields.has("full_name")) {
    const name = formText(fields, "full_name").trim();
    if (!name) throw new FamilyDataError("Vui lòng nhập họ tên.");
    values.full_name = name;
  }
  if (!existing || fields.has("gender")) {
    const gender = formText(fields, "gender") || "other";
    if (!["male", "female", "other"].includes(gender))
      throw new FamilyDataError("Giới tính không hợp lệ.");
    values.gender = gender;
  }
  for (const key of numberFields) {
    if (!fields.has(key)) continue;
    const raw = formText(fields, key);
    if (raw && !/^-?\d+$/.test(raw))
      throw new FamilyDataError("Giá trị số không hợp lệ.");
    values[key] = raw ? Number(raw) : null;
  }
  if (fields.has("is_in_law"))
    values.is_in_law = formText(fields, "is_in_law") === "true";
  if (fields.has("is_deceased")) {
    const status = formText(fields, "is_deceased");
    if (!["true", "false", "unknown"].includes(status))
      throw new FamilyDataError("Tình trạng không hợp lệ.");
    values.is_deceased = status === "unknown" ? null : status === "true";
  }

  const privateKeys = privateFields.filter((key) => fields.has(key));
  if (role !== "owner" && (privateKeys.length || fields.has("email")))
    throw forbidden();
  const related = formText(fields, "relatedTo"),
    relation = formText(fields, "relation") as Relation;
  if (
    (related || relation) &&
    (existing || !related || !relations.includes(relation))
  )
    throw new FamilyDataError("Vui lòng chọn quan hệ hợp lệ.");
  const save = async () => {
    let id = existing;
    const original = id ? await requirePerson(client, tree, id) : null;
    if (values.avatar_url && values.avatar_url !== original?.avatar_url)
      await requireAttachment(client, tree, "avatars", String(values.avatar_url));
    if (
      !id ||
      Object.keys(values).some((key) => /^(birth|death)(_lunar)?_(day|month|year)$/.test(key))
    ) {
      const record = { ...original, ...values };
      const month = validateLifeDates(record);
      if (month !== null && month !== record.death_lunar_month) values.death_lunar_month = month;
    }
    const keys = Object.keys(values), params = Object.values(values);
    if (!id) {
      const { rows } = await client.query(
        `INSERT INTO persons(tree_id,${keys.join(",")})
        VALUES($1,${keys.map((_, i) => "$" + (i + 2)).join(",")}) RETURNING id`,
        [tree, ...params],
      );
      id = rows[0].id;
    }
    if (fields.has("email")) {
      const result = await updatePersonEmailInTransaction(
        client,
        actor,
        tree,
        id,
        formText(fields, "email"),
      );
      if ("code" in result && result.code === "INVALID_EMAIL")
        throw new FamilyDataError("Địa chỉ email không hợp lệ.");
      if (!("ok" in result))
        throw new FamilyDataError("Không thể cập nhật email.", { kind: "conflict" });
    }
    if (existing && keys.length)
      await client.query(
        `UPDATE persons SET ${keys.map((k, i) => k + "=$" + (i + 3)).join(",")} WHERE tree_id=$1 AND id=$2`,
        [tree, id, ...params],
      );
    if (privateKeys.length)
      await client.query(
        `INSERT INTO person_details_private(tree_id,person_id,${privateKeys.join(",")})
      VALUES($1,$2,${privateKeys.map((_, i) => "$" + (i + 3)).join(",")}) ON CONFLICT(person_id)
      DO UPDATE SET ${privateKeys.map((k) => k + "=excluded." + k).join(",")} WHERE person_details_private.tree_id=excluded.tree_id`,
        [tree, id, ...privateKeys.map((k) => formText(fields, k) || null)],
      );
    if (related) {
      const parent = relation === "parent" || relation === "adoptive_parent";
      await insertEdge(client, tree, {
        person_a: parent ? id : related,
        person_b: parent ? related : id,
        type:
          relation === "spouse"
            ? "marriage"
            : relation.startsWith("adopt")
              ? "adopted_child"
              : "biological_child",
        note: formText(fields, "relationshipNote") || null,
      });
    }
    return id;
  };
  if (existing) return save();
  const input = Array.from(fields.entries()).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  const [id] = await createOnce(
    client,
    tree,
    actor,
    formText(fields, "submissionId"),
    input,
    async () => [await save()],
  );
  return id;
}
