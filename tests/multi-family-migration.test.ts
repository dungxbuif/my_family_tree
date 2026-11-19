import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { execFileSync, spawnSync } from "node:child_process";

const container = `family-migration-test-${crypto.randomUUID()}`;
const legacy = "00000000-0000-0000-0000-000000000001";
const owner = "10000000-0000-0000-0000-000000000001";
const editor = "10000000-0000-0000-0000-000000000002";
const viewer = "10000000-0000-0000-0000-000000000003";
const person = "20000000-0000-0000-0000-000000000001";
const spouse = "20000000-0000-0000-0000-000000000002";
const secondTreeId = "30000000-0000-0000-0000-000000000001";
const secondPersonId = "40000000-0000-0000-0000-000000000001";
const migration = "docs/migrations/20261119100000_add_family_trees.sql";
const baseline = "docs/migrations/00000000000000_legacy_schema.sql";

function sql(statement: string) {
  const result = spawnSync("docker", ["exec", "-i", container, "psql", "-XqAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres"], { input: statement, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}

function migrate() {
  sql(`\\i /app/${migration}`);
}

beforeAll(async () => {
  execFileSync("docker", ["run", "-d", "--rm", "--name", container, "--network", "none", "-e", "POSTGRES_HOST_AUTH_METHOD=trust", "-v", `${process.cwd()}:/app:ro`, "postgres:16-alpine"]);
  for (let attempt = 0; attempt < 100; attempt++) {
    // TCP becomes available only after the initialization server exits.
    if (spawnSync("docker", ["exec", container, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"]).status === 0) return;
    await Bun.sleep(100);
  }
  throw new Error("Disposable PostgreSQL did not start");
}, 60000);

afterAll(() => { spawnSync("docker", ["rm", "-f", container]); });

beforeEach(() => {
  sql(`DROP SCHEMA public CASCADE; CREATE SCHEMA public;
\\i /app/${baseline}
INSERT INTO users(id,email,password_hash) VALUES ('${owner}','A@Example.Test','hash'), ('${editor}','b@example.test','hash'), ('${viewer}','c@example.test','hash');
INSERT INTO profiles(id,role,is_active) VALUES ('${owner}','admin',true), ('${editor}','editor',true), ('${viewer}','member',false);
INSERT INTO persons(id,full_name,gender,updated_at) VALUES ('${person}','A','male','2012-01-01'), ('${spouse}','B','female','2012-01-01');
INSERT INTO relationships(type,person_a,person_b) VALUES ('marriage','${person}','${spouse}');
INSERT INTO person_details_private(person_id,phone_number) VALUES ('${person}','fixture');
INSERT INTO custom_events(name,event_date,created_by) VALUES ('birthday','2000-01-01','${editor}');
INSERT INTO gallery_items(title,image_url,created_by) VALUES ('picture','/fixture','${editor}');`);
});

test("all family records retain their identities, timestamps and mapped access on rerun", () => {
  migrate();
  expect(sql("SELECT to_regclass('public.family_trees') IS NOT NULL")).toBe("t");
  expect(sql("SELECT id FROM family_trees")).toBe(legacy);
  expect(sql(`SELECT m.role || '|' || is_super_admin || '|' || is_active FROM tree_memberships m JOIN profiles p ON p.id=m.user_id WHERE tree_id='${legacy}' ORDER BY m.user_id`)).toBe("owner|true|true\neditor|false|true\nviewer|false|false");
  for (const table of ["persons", "person_details_private", "relationships", "custom_events", "gallery_items"]) {
    expect(sql(`SELECT count(*) FROM ${table} WHERE tree_id='${legacy}'`)).toBe(table === "persons" ? "2" : "1");
  }
  expect(sql("SELECT person_a || '|' || person_b FROM relationships")).toBe(`${person}|${spouse}`);
  expect(sql("SELECT DISTINCT updated_at::date FROM persons")).toBe("2012-01-01");
  sql(`DELETE FROM tree_memberships WHERE user_id='${viewer}'; UPDATE tree_memberships SET role='viewer' WHERE user_id='${editor}'`);
  migrate();
  expect(sql("SELECT role FROM tree_memberships ORDER BY user_id")).toBe("owner\nviewer");
});

test("normalized email collisions and broken legacy references abort atomically", () => {
  sql("INSERT INTO users(email,password_hash) VALUES (' a@example.test ','hash')");
  expect(migrate).toThrow(/normalized email/i);
  expect(sql("SELECT to_regclass('public.family_trees') IS NULL")).toBe("t");
  sql(`DELETE FROM users WHERE email LIKE ' %'; SET session_replication_role=replica; UPDATE relationships SET person_b='${secondPersonId}';`);
  expect(migrate).toThrow(/legacy reference/i);
  expect(sql("SELECT to_regclass('public.family_trees') IS NULL")).toBe("t");
});

test("both relationship endpoints, private details and Person Links respect their tree", () => {
  migrate();
  expect(sql("SELECT to_regclass('public.tree_memberships') IS NOT NULL")).toBe("t");
  sql(`BEGIN; INSERT INTO family_trees(id,name) VALUES ('${secondTreeId}','Second');
      INSERT INTO tree_memberships(tree_id,user_id,role) VALUES ('${secondTreeId}','${owner}','owner');
      INSERT INTO persons(id,tree_id,full_name,gender,linked_user_id) VALUES ('${secondPersonId}','${secondTreeId}','C','other','${owner}'); COMMIT;`);
  for (const [a,b] of [[person, secondPersonId], [secondPersonId, person]]) {
    expect(() => sql(`INSERT INTO relationships(tree_id,type,person_a,person_b) VALUES ('${legacy}','marriage','${a}','${b}')`)).toThrow(/foreign key/i);
  }
  expect(() => sql(`INSERT INTO person_details_private(tree_id,person_id) VALUES ('${legacy}','${secondPersonId}')`)).toThrow(/foreign key/i);
  sql(`UPDATE persons SET linked_user_id='${owner}', email='a@example.test' WHERE id='${person}'`);
  expect(() => sql(`UPDATE persons SET linked_user_id='${owner}' WHERE id='${spouse}'`)).toThrow(/unique/i);
  expect(() => sql(`UPDATE persons SET email=' A@Example.Test ' WHERE id='${spouse}'`)).toThrow(/check constraint/i);
});

test("the final owner cannot leave, be demoted, or disappear through account deletion", () => {
  migrate();
  expect(sql("SELECT to_regclass('public.tree_memberships') IS NOT NULL")).toBe("t");
  for (const query of [`DELETE FROM tree_memberships WHERE user_id='${owner}'`, `UPDATE tree_memberships SET role='viewer' WHERE user_id='${owner}'`, `DELETE FROM users WHERE id='${owner}'`]) {
    expect(() => sql(query)).toThrow(/owner/i);
  }
  expect(() => sql("INSERT INTO family_trees(name) VALUES ('Unowned')")).toThrow(/owner/i);
  sql(`BEGIN; UPDATE tree_memberships SET role='owner' WHERE user_id='${editor}'; DELETE FROM tree_memberships WHERE user_id='${owner}'; COMMIT;`);
});

test("fresh schema bootstraps twice without an ownerless tree", () => {
  sql("DROP SCHEMA public CASCADE; CREATE SCHEMA public;\n\\i /app/docs/schema.sql\n\\i /app/docs/schema.sql");
  expect(sql("SELECT to_regclass('public.family_trees') IS NOT NULL")).toBe("t");
  expect(sql("SELECT count(*) FROM family_trees")).toBe("0");
});

test("concurrent owner removals leave exactly one owner", async () => {
  migrate();
  sql(`UPDATE tree_memberships SET role='owner' WHERE user_id='${editor}'`);
  const args = ["docker", "exec", container, "psql", "-XqAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-c"];
  function remove(id: string) {
    return Bun.spawn([...args, `BEGIN; DELETE FROM tree_memberships WHERE user_id='${id}'; SELECT pg_sleep(0.2); COMMIT;`], { stdout: "pipe", stderr: "pipe" });
  }
  const results = await Promise.all([remove(owner).exited, remove(editor).exited]);
  expect(results.filter(status => status === 0)).toHaveLength(1);
  expect(sql("SELECT count(*) FROM tree_memberships WHERE role='owner'")).toBe("1");
});

test("sample data replaces only the requested tree", () => {
  migrate();
  sql(`BEGIN; INSERT INTO family_trees(id,name) VALUES ('${secondTreeId}','Sample');
    INSERT INTO tree_memberships(tree_id,user_id,role) VALUES ('${secondTreeId}','${owner}','owner'); COMMIT;
\\set tree_id '${secondTreeId}'
\\i /app/docs/seed.sql`);
  expect(sql(`SELECT count(*) FROM persons WHERE tree_id='${legacy}'`)).toBe("2");
  expect(Number(sql(`SELECT count(*) FROM persons WHERE tree_id='${secondTreeId}'`))).toBeGreaterThan(20);
});

test("an inactive legacy admin keeps the owner membership and inactive account state", () => {
  sql(`UPDATE profiles SET is_active=false WHERE id='${owner}'`);
  migrate();
  expect(sql(`SELECT role || '|' || p.is_active FROM tree_memberships m
    JOIN (SELECT id,is_active FROM profiles) p ON p.id=m.user_id
    WHERE m.user_id='${owner}'`)).toBe("owner|false");
});

test("changing a tree UUID cannot commit an ownerless tree", () => {
  migrate();
  sql(`BEGIN; INSERT INTO family_trees(id,name) VALUES ('${secondTreeId}','Second');
    INSERT INTO tree_memberships(tree_id,user_id,role) VALUES ('${secondTreeId}','${owner}','owner'); COMMIT;`);
  expect(() => sql(`BEGIN; DELETE FROM tree_memberships WHERE tree_id='${secondTreeId}';
    UPDATE family_trees SET id=gen_random_uuid() WHERE id='${secondTreeId}'; COMMIT;`)).toThrow(/owner/i);
  expect(sql(`SELECT role FROM tree_memberships WHERE tree_id='${secondTreeId}'`)).toBe("owner");
});

test("a Person Link requires explicit unlink before removal or reassignment", () => {
  migrate();
  sql(`UPDATE persons SET linked_user_id='${editor}' WHERE id='${person}'`);
  expect(() => sql(`DELETE FROM tree_memberships WHERE tree_id='${legacy}' AND user_id='${editor}'`)).toThrow(/foreign key/i);
  expect(() => sql(`UPDATE persons SET linked_user_id='${viewer}' WHERE id='${person}'`)).toThrow(/unlink/i);
  expect(sql(`SELECT linked_user_id FROM persons WHERE id='${person}'`)).toBe(editor);
  sql(`BEGIN; UPDATE persons SET linked_user_id=NULL WHERE id='${person}';
    DELETE FROM tree_memberships WHERE user_id='${editor}';
    UPDATE persons SET linked_user_id='${viewer}' WHERE id='${person}'; COMMIT;`);
  expect(sql(`SELECT linked_user_id FROM persons WHERE id='${person}'`)).toBe(viewer);
});

test("System User and Person email use ECMAScript surrounding whitespace", () => {
  const paddedEmail = "\t\n\u00A0A@Example.Test\u2003\uFEFF";
  sql(`INSERT INTO users(email,password_hash) VALUES ('${paddedEmail}', 'fixture')`);
  expect(migrate).toThrow(/normalized email/i);
  sql(`DELETE FROM users WHERE email='${paddedEmail}'`);
  migrate();
  expect(() => sql(`INSERT INTO users(email,password_hash) VALUES ('${paddedEmail}','fixture')`)).toThrow(/unique/i);
  expect(() => sql(`UPDATE persons SET email='${paddedEmail.toLowerCase()}' WHERE id='${person}'`)).toThrow(/check constraint/i);
  expect(sql(`SELECT public.normalize_email('${paddedEmail}')`)).toBe(paddedEmail.trim().toLowerCase());
});

test("backup, rehearsal and rollback compare each account’s captured access", () => {
  const preflight = "\\i /app/scripts/preflight-multi-family-migration.sql";
  const verify = "\\i /app/scripts/verify-multi-family-migration.sql";
  const snapshot = JSON.parse(sql(preflight));
  expect(snapshot.access).toEqual([
    {user_id: owner, tree_id: legacy, role: "owner", is_super_admin: true, is_active: true},
    {user_id: editor, tree_id: legacy, role: "editor", is_super_admin: false, is_active: true},
    {user_id: viewer, tree_id: legacy, role: "viewer", is_super_admin: false, is_active: false},
  ]);
  execFileSync("docker", ["exec", container, "pg_dump", "-Fc", "-U", "postgres", "-f", "/tmp/cutover.dump", "postgres"]);
  for (const target of ["rehearsal","recovery"]) {
    sql(`CREATE DATABASE ${target}`);
    execFileSync("docker", ["exec", container, "pg_restore", "--exit-on-error", "--single-transaction", "-U", "postgres", "-d", target, "/tmp/cutover.dump"]);
    const check = target === "rehearsal" ? `\\i /app/docs/schema.sql\n${verify}` : preflight;
    expect(JSON.parse(sql(`\\c ${target}\n${check}`).split("\n").at(-1)!)).toEqual(snapshot);
  }
});

test("receipt and life-status upgrades use the public schema under a custom search path and preserve existing flags", () => {
  migrate();
  const receipt = "\\i /app/docs/migrations/20261119104000_person_creation_receipts.sql";
  const lifeStatus = "\\i /app/docs/migrations/20261119105000_unknown_person_life_status.sql";
  sql([
    `UPDATE persons SET is_deceased=true WHERE id='${spouse}'; CREATE SCHEMA another;`,
    "SET search_path=another,pg_catalog;", receipt, lifeStatus, receipt, lifeStatus,
  ].join("\n"));
  expect(sql("SELECT to_regclass('another.person_creation_receipts') IS NULL AND to_regclass('public.person_creation_receipts') IS NOT NULL")).toBe("t");
  expect(sql(`SELECT is_deceased FROM persons WHERE id='${person}'`)).toBe("f");
  expect(sql(`SELECT is_deceased FROM persons WHERE id='${spouse}'`)).toBe("t");
  expect(sql(`INSERT INTO persons(tree_id,full_name,gender) VALUES('${legacy}','Chưa rõ','other') RETURNING is_deceased IS NULL`)).toBe("t");
});

test("legacy adoption accepts only single-owner generated keys and leaves ambiguous metadata for review", () => {
  migrate();
  const media = "\\i /app/docs/migrations/20261119110000_tree_media.sql";
  const shared = "/api/storage/family-tree/gallery/"+crypto.randomUUID()+".png";
  const accepted = "/api/storage/gallery/"+crypto.randomUUID()+".jpg";
  const oldAvatar = "/api/storage/family-tree/avatars/" + "b".repeat(64) + ".webp";
  sql(`UPDATE persons SET avatar_url='${oldAvatar}' WHERE id='${person}'`);
  const owners = () => sql("SELECT object_url FROM tree_media ORDER BY object_url").split("\n");
  const verified = [oldAvatar,accepted].sort();
  const rejected = ["/api/storage/other/gallery/"+crypto.randomUUID()+".png",
    "/api/storage/family-tree/trees/"+secondTreeId+"/gallery/"+"a".repeat(64)+".png",
    "/api/storage/gallery/portrait.png","/api/storage/gallery/"+"a".repeat(64)+".png"];
  sql(`UPDATE gallery_items SET image_url='${shared}';
    WITH t AS (INSERT INTO family_trees(id,name) VALUES('${secondTreeId}','Second') RETURNING id),
    m AS (INSERT INTO tree_memberships(tree_id,user_id,role) SELECT id,'${owner}','owner' FROM t)
    INSERT INTO gallery_items(tree_id,title,image_url) SELECT id,'copy','${shared}' FROM t;`);
  const copied = "/api/storage/gallery/"+crypto.randomUUID()+".png";
  sql(`INSERT INTO gallery_items(tree_id,title,image_url) VALUES('${legacy}','Original','${copied}'),('${secondTreeId}','Copied','${copied}');
      DELETE FROM gallery_items WHERE tree_id='${legacy}' AND image_url='${copied}';`);
  for (const url of [accepted,...rejected]) sql(`INSERT INTO gallery_items(tree_id,title,image_url) VALUES('${legacy}','Photo','${url}')`);
  sql(`CREATE SCHEMA media_migration_fixture; SET search_path=media_migration_fixture,pg_catalog;\n${media}`);
  expect(owners()).toEqual(verified);
  expect(sql("SELECT count(*) FROM gallery_items")).toBe("8");
  sql(`DELETE FROM gallery_items WHERE tree_id='${secondTreeId}';\n${media}`);
  expect(owners()).toEqual(verified);
  // An already-applied preview migration could have imported a nested URL.
  // Quarantine that old ledger row without authorizing any object deletion.
  sql(`INSERT INTO tree_media(object_url,tree_id,folder,cleanup_after) VALUES('${rejected[1]}','${legacy}','gallery',now())`);
  const claims="\\i /app/docs/migrations/20261119111000_media_cleanup_claims.sql";
  sql(claims);
  expect(owners()).toEqual(verified);
  expect(sql(`SELECT count(*) FROM gallery_items WHERE image_url='${rejected[1]}'`)).toBe("1");
  // Simulate an installation that already imported the sole surviving copy in another tree.
  const issued = "/api/storage/trees/"+secondTreeId+"/avatars/"+"a".repeat(64)+".png";
  sql(`INSERT INTO tree_media(object_url,tree_id,folder,cleanup_after,expected_bytes) VALUES
      ('${copied}','${secondTreeId}','gallery',now(),NULL),('${issued}','${secondTreeId}','avatars',now(),42);
      INSERT INTO gallery_items(tree_id,title,image_url) VALUES('${secondTreeId}','Copied','${copied}');\n${claims}`);
  const generations = "\\i /app/docs/migrations/20261119112000_media_generations.sql";
  sql(`${generations}\n${generations}`);
  expect(owners()).toEqual([...verified,issued].sort());
  expect(sql(`SELECT logical_url FROM tree_media WHERE expected_bytes=42`)).toBe(issued);
  expect(sql(`SELECT count(*) FROM gallery_items WHERE image_url='${copied}'`)).toBe("1");
});

test("release migration installs Agent Credentials and audit records and can run again", () => {
  sql("\\i /app/docs/schema.sql");
  expect(sql("SELECT to_regclass('public.api_keys') IS NOT NULL AND to_regclass('public.api_audit_logs') IS NOT NULL")).toBe("t");
  sql("\\i /app/docs/schema.sql");
  expect(sql("SELECT count(*) FROM schema_migrations WHERE version='20261119120000'")).toBe("1");
});
