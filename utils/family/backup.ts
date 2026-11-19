import type { PoolClient, QueryResultRow } from "pg";
import { createHash } from "node:crypto";
import type {
  Backup,
  BackupEdge,
  BackupEvent,
  BackupGallery,
  BackupPerson,
  BackupPrivate,
} from "./backup-format";
import { requireUploadedImage } from "@/utils/storage/s3";
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
  bounds?: { maxRows: number; maxBytes: number },
): Promise<Backup> {
  // Refuse oversized agent backups as a whole. The row and byte checks run in
  // PostgreSQL before any potentially large historical values cross the wire.
  async function collection<T extends QueryResultRow>(
    sql: string,
  ): Promise<T[]> {
    if (!bounds) return (await client.query<T>(sql, [tree])).rows;
    const {
      rows: [page],
    } = await client.query(
      `WITH page AS MATERIALIZED (${sql} LIMIT $2),
       size AS (SELECT count(*) AS n, coalesce(sum(octet_length(row_to_json(p)::text)),0) AS bytes FROM page p)
       SELECT CASE WHEN n < $2 AND bytes <= $3 THEN (SELECT coalesce(json_agg(p),'[]') FROM page p) END AS items FROM size`,
      [tree, bounds.maxRows + 1, bounds.maxBytes],
    );
    if (page.items === null)
      throw new FamilyDataError("Bản xuất vượt giới hạn. Vui lòng sử dụng công cụ sao lưu của cây.");
    return page.items;
  }

  const persons = await collection<BackupPerson>(
    `
    SELECT ${backupFields.persons.map((k) => (k === "avatar_url" ? "m.object_url AS avatar_url" : "p." + k)).join(",")}
    FROM persons p LEFT JOIN tree_media m ON m.object_url=p.avatar_url AND m.tree_id=p.tree_id AND m.folder='avatars' AND m.cleanup_claim IS NULL
    WHERE p.tree_id=$1 ORDER BY p.id`,
  );
  const relationships = await collection<BackupEdge>(
    "SELECT id,type,person_a,person_b,note FROM relationships WHERE tree_id=$1 ORDER BY id",
  );
  const details = await collection<BackupPrivate>(
    "SELECT person_id,phone_number,occupation,current_residence FROM person_details_private WHERE tree_id=$1 ORDER BY person_id",
  );
  const events = await collection<BackupEvent>(
    "SELECT id,name,content,event_date::text,location FROM custom_events WHERE tree_id=$1 ORDER BY id",
  );
  const gallery = await collection<BackupGallery>(
    `SELECT g.id,g.title,g.description,g.event_date::text,m.object_url AS image_url
    FROM gallery_items g LEFT JOIN tree_media m ON m.object_url=g.image_url AND m.tree_id=g.tree_id AND m.folder='gallery' AND m.cleanup_claim IS NULL
    WHERE g.tree_id=$1 ORDER BY g.id`,
  );
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
type Candidate = {
  object_url: string;
  expected_bytes: number | null;
  folder: UploadFolder;
};
type OwnerAccess = <T>(
  write: boolean,
  operation: (client: PoolClient) => Promise<T>,
) => Promise<T>;
type RestoreData = ReturnType<typeof parseBackup>;

async function mediaCandidates(
  client: PoolClient,
  tree: string,
  data: RestoreData,
) {
  const avatars = data.persons.flatMap((p) =>
    p.avatar_url ? [p.avatar_url] : [],
  );
  const gallery = data.gallery_items.flatMap((g) =>
    g.image_url ? [g.image_url] : [],
  );
  return (
    await client.query<Candidate>(
      "SELECT object_url,expected_bytes,folder FROM tree_media WHERE tree_id=$1 AND cleanup_claim IS NULL AND ((folder='avatars' AND object_url=ANY($2)) OR (folder='gallery' AND object_url=ANY($3)))",
      [tree, avatars, gallery],
    )
  ).rows;
}

async function verifyImages(candidates: Candidate[]) {
  const deadline = AbortSignal.timeout(5000);
  const verified = new Set<string>();
  const remaining = candidates.values();
  async function work() {
    for (const candidate of remaining) {
      if (deadline.aborted) return;
      try {
        await requireUploadedImage(
          candidate.object_url,
          candidate.expected_bytes,
          deadline,
        );
        verified.add(candidate.object_url);
      } catch {
        /* An unavailable object leaves the restored metadata without an attachment. */
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(4, candidates.length) }, work),
  );
  return verified;
}

export async function importBackup(
  access: OwnerAccess,
  tree: string,
  input: unknown,
) {
  const { data, candidates } = await access(false, async (client) => {
    const data = parseBackup(input);
    return { data, candidates: await mediaCandidates(client, tree, data) };
  });
  const verified = await verifyImages(candidates);
  return access(true, (client) => replaceBackup(client, tree, data, verified));
}

async function replaceBackup(
  client: PoolClient,
  tree: string,
  data: RestoreData,
  verified: Set<string>,
) {
  // Reauthorize after network I/O and fence attachment against cleanup until commit.
  const media = (
    await client.query<Candidate>(
      "SELECT object_url,folder FROM tree_media WHERE tree_id=$1 AND cleanup_claim IS NULL AND object_url=ANY($2) ORDER BY object_url FOR SHARE",
      [tree, [...verified]],
    )
  ).rows;
  const avatars = new Set(
    media.filter((m) => m.folder === "avatars").map((m) => m.object_url),
  );
  const images = new Set(
    media.filter((m) => m.folder === "gallery").map((m) => m.object_url),
  );
  const people = (
    await client.query<{ id: string; linked_user_id: string | null }>(
      "SELECT id,linked_user_id FROM persons WHERE tree_id=$1",
      [tree],
    )
  ).rows;
  const links = new Map(
    people.flatMap((p) =>
      p.linked_user_id ? [[p.id, p.linked_user_id] as const] : [],
    ),
  );
  const localIds = async (
    table: "relationships" | "custom_events" | "gallery_items",
  ) =>
    (
      await client.query<{ id: string }>(
        `SELECT id FROM ${table} WHERE tree_id=$1`,
        [tree],
      )
    ).rows;
  const current = {
    persons: people,
    relationships: await localIds("relationships"),
    custom_events: await localIds("custom_events"),
    gallery_items: await localIds("gallery_items"),
  };
  const ids = new Map<string, string>();
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
      linked_user_id: links.get(p.id) ?? null,
      avatar_url:
        p.avatar_url && avatars.has(p.avatar_url) ? p.avatar_url : null,
    };
  });
  const destinations = new Set(ids.values());
  if ([...links.keys()].some((id) => !destinations.has(id)))
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
