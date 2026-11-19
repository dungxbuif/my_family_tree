import type { PoolClient } from "pg";
import { createHash } from "node:crypto";
import type {
  Backup,
  BackupEdge,
  BackupEvent,
  BackupGallery,
  BackupPerson,
  BackupPrivate,
} from "./backup-format";
import { requireAttachment } from "./media";
import type { UploadFolder } from "@/utils/storage/s3";
import { backupFields, parseBackup } from "./backup-format";
import { FamilyDataError, unavailable } from "./records";

const collections = {
  ...backupFields,
  persons: [...backupFields.persons, "linked_user_id"],
};

// Metadata-only exports expose references proven to belong to this tree.
export async function exportBackup(
  client: PoolClient,
  tree: string,
  root?: string,
): Promise<Backup> {
  const persons = (
    await client.query<BackupPerson>(
      `
    SELECT ${backupFields.persons.map((k) => (k === "avatar_url" ? "m.object_url AS avatar_url" : "p." + k)).join(",")}
    FROM persons p LEFT JOIN tree_media m ON m.object_url=p.avatar_url AND m.tree_id=p.tree_id AND m.folder='avatars' AND m.cleanup_claim IS NULL
    WHERE p.tree_id=$1 ORDER BY p.id`,
      [tree],
    )
  ).rows;
  const relationships = (
    await client.query<BackupEdge>(
      "SELECT id,type,person_a,person_b,note FROM relationships WHERE tree_id=$1 ORDER BY id",
      [tree],
    )
  ).rows;
  const details = (
    await client.query<BackupPrivate>(
      "SELECT person_id,phone_number,occupation,current_residence FROM person_details_private WHERE tree_id=$1 ORDER BY person_id",
      [tree],
    )
  ).rows;
  const events = (
    await client.query<BackupEvent>(
      "SELECT id,name,content,event_date::text,location FROM custom_events WHERE tree_id=$1 ORDER BY id",
      [tree],
    )
  ).rows;
  const gallery = (
    await client.query<BackupGallery>(
      `SELECT g.id,g.title,g.description,g.event_date::text,m.object_url AS image_url
    FROM gallery_items g LEFT JOIN tree_media m ON m.object_url=g.image_url AND m.tree_id=g.tree_id AND m.folder='gallery' AND m.cleanup_claim IS NULL
    WHERE g.tree_id=$1 ORDER BY g.id`,
      [tree],
    )
  ).rows;
  let included: Set<string> | undefined;
  if (root !== undefined) {
    if (!persons.some((p) => p.id === root)) throw unavailable();
    const children = new Map<string, string[]>();
    for (const r of relationships)
      if (r.type !== "marriage") {
        const list = children.get(r.person_a) ?? [];
        list.push(r.person_b);
        children.set(r.person_a, list);
      }
    const descendants = new Set([root]);
    for (const id of descendants)
      for (const child of children.get(id) ?? []) descendants.add(child);
    included = new Set(descendants);
    for (const r of relationships)
      if (r.type === "marriage") {
        if (descendants.has(r.person_a)) included.add(r.person_b);
        if (descendants.has(r.person_b)) included.add(r.person_a);
      }
  }
  const keep = (id: string) => !included || included.has(id);
  return {
    version: 4,
    timestamp: new Date().toISOString(),
    persons: persons.filter((p) => keep(p.id)),
    relationships: relationships.filter(
      (r) => keep(r.person_a) && keep(r.person_b),
    ),
    person_details_private: details.filter((p) => keep(p.person_id)),
    custom_events: events,
    gallery_items: gallery,
  };
}

function restoreId(
  tree: string,
  table: string,
  source: string,
  local: Set<string>,
) {
  if (local.has(source)) return source;
  // A tree-specific UUID gives repeat imports stable results without looking up any other tree.
  const hex = createHash("sha256")
    .update([tree, table, source].join("/"))
    .digest("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    "8" + hex.slice(13, 16),
    "8" + hex.slice(17, 20),
    hex.slice(20, 32),
  ].join("-");
}
async function restorableImages(
  client: PoolClient,
  tree: string,
  folder: UploadFolder,
  incoming: (string | null)[],
  attached: (string | null)[],
) {
  const candidates = [
    ...new Set(incoming.filter((url): url is string => !!url)),
  ];
  const live = new Set(attached);
  const { rows } = await client.query<{ object_url: string }>(
    "SELECT object_url FROM tree_media WHERE tree_id=$1 AND folder=$2 AND object_url=ANY($3::text[]) AND cleanup_claim IS NULL ORDER BY object_url FOR SHARE",
    [tree, folder, candidates],
  );
  // Existing attachments remain under the tree lock. A detached object must
  // still exist in the private bucket before a restore can attach it again.
  for (const row of rows)
    if (!live.has(row.object_url))
      await requireAttachment(client, tree, folder, row.object_url);
  return new Set(rows.map((row) => row.object_url));
}
export async function importBackup(
  client: PoolClient,
  tree: string,
  input: unknown,
) {
  const data = parseBackup(input);
  const current = await exportBackup(client, tree);
  const linked = (
    await client.query<{ id: string; linked_user_id: string }>(
      "SELECT id,linked_user_id FROM persons WHERE tree_id=$1 AND linked_user_id IS NOT NULL",
      [tree],
    )
  ).rows;
  const links = new Map(linked.map((p) => [p.id, p.linked_user_id]));
  const ids = new Map<string, string>();
  const avatars = await restorableImages(
    client,
    tree,
    "avatars",
    data.persons.map((p) => p.avatar_url),
    current.persons.map((p) => p.avatar_url),
  );
  const images = await restorableImages(
    client,
    tree,
    "gallery",
    data.gallery_items.map((g) => g.image_url),
    current.gallery_items.map((g) => g.image_url),
  );
  const remap = <T extends { id: string }>(
    table: "persons" | "relationships" | "custom_events" | "gallery_items",
    rows: T[],
  ) => {
    const local = new Set(current[table].map((r) => r.id));
    const mapped = rows.map((row) => ({
      ...row,
      id: restoreId(tree, table, row.id, local),
    }));
    if (new Set(mapped.map((r) => r.id)).size !== rows.length)
      throw new FamilyDataError("Bản sao lưu chứa mã trùng lặp.");
    return mapped;
  };
  const persons = remap("persons", data.persons).map((p, i) => {
    const original = data.persons[i].id;
    ids.set(original, p.id);
    return {
      ...p,
      linked_user_id: links.get(original) ?? null,
      avatar_url:
        p.avatar_url && avatars.has(p.avatar_url) ? p.avatar_url : null,
    };
  });
  if (linked.some((p) => !ids.has(p.id)))
    throw new FamilyDataError(
      "Vui lòng hủy liên kết tài khoản trước khi thay thế hồ sơ.",
    );
  const records = {
    persons,
    relationships: remap("relationships", data.relationships).map((r) => ({
      ...r,
      person_a: ids.get(r.person_a),
      person_b: ids.get(r.person_b),
    })),
    person_details_private: data.person_details_private.map((p) => ({
      ...p,
      person_id: ids.get(p.person_id),
    })),
    custom_events: remap("custom_events", data.custom_events),
    gallery_items: remap("gallery_items", data.gallery_items).map((g) => ({
      ...g,
      image_url: g.image_url && images.has(g.image_url) ? g.image_url : "",
    })),
  };
  // The service holds the tree lock for the entire transaction. Dependent Person rows cascade.
  await client.query("DELETE FROM custom_events WHERE tree_id=$1", [tree]);
  if (data.replaceGallery)
    await client.query("DELETE FROM gallery_items WHERE tree_id=$1", [tree]);
  await client.query("DELETE FROM persons WHERE tree_id=$1", [tree]);
  for (const table of Object.keys(
    collections,
  ) as (keyof typeof collections)[]) {
    if (!records[table].length) continue;
    const fields = collections[table].join(",");
    await client.query(
      `INSERT INTO ${table}(tree_id,${fields}) SELECT $1,${fields} FROM jsonb_populate_recordset(NULL::${table},$2::jsonb)`,
      [tree, JSON.stringify(records[table])],
    );
  }
  return {
    persons: persons.length,
    relationships: records.relationships.length,
    person_details_private: records.person_details_private.length,
    custom_events: records.custom_events.length,
    gallery_items: records.gallery_items.length,
  };
}
