import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import { execFileSync, spawnSync } from "node:child_process";

const container = `family-migration-test-${crypto.randomUUID()}`;
const legacy = "00000000-0000-0000-0000-000000000001";
const owner = "10000000-0000-0000-0000-000000000001";
const editor = "10000000-0000-0000-0000-000000000002";
const viewer = "10000000-0000-0000-0000-000000000003";
const person = "20000000-0000-0000-0000-000000000001";
const spouse = "20000000-0000-0000-0000-000000000002";
const other = "30000000-0000-0000-0000-000000000001";
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
  sql(`DELETE FROM users WHERE email LIKE ' %'; SET session_replication_role=replica; UPDATE relationships SET person_b='${other}';`);
  expect(migrate).toThrow(/legacy reference/i);
  expect(sql("SELECT to_regclass('public.family_trees') IS NULL")).toBe("t");
});

test("both relationship endpoints, private details and Person Links respect their tree", () => {
  migrate();
  expect(sql("SELECT to_regclass('public.tree_memberships') IS NOT NULL")).toBe("t");
  sql(`BEGIN; INSERT INTO family_trees(id,name) VALUES ('${other}','Second');
      INSERT INTO tree_memberships(tree_id,user_id,role) VALUES ('${other}','${owner}','owner');
      INSERT INTO persons(id,tree_id,full_name,gender,linked_user_id) VALUES ('${other}','${other}','C','other','${owner}'); COMMIT;`);
  for (const [a,b] of [[person,other], [other,person]]) {
    expect(() => sql(`INSERT INTO relationships(tree_id,type,person_a,person_b) VALUES ('${legacy}','marriage','${a}','${b}')`)).toThrow(/foreign key/i);
  }
  expect(() => sql(`INSERT INTO person_details_private(tree_id,person_id) VALUES ('${legacy}','${other}')`)).toThrow(/foreign key/i);
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
  sql(`BEGIN; INSERT INTO family_trees(id,name) VALUES ('${other}','Sample');
    INSERT INTO tree_memberships(tree_id,user_id,role) VALUES ('${other}','${owner}','owner'); COMMIT;
\\set tree_id '${other}'
\\i /app/docs/seed.sql`);
  expect(sql(`SELECT count(*) FROM persons WHERE tree_id='${legacy}'`)).toBe("2");
  expect(Number(sql(`SELECT count(*) FROM persons WHERE tree_id='${other}'`))).toBeGreaterThan(20);
});

test("an inactive legacy admin keeps the owner membership and inactive account state", () => {
  sql(`UPDATE profiles SET is_active=false WHERE id='${owner}'`);
  migrate();
  expect(sql(`SELECT role || '|' || p.is_active FROM tree_memberships m
    JOIN (SELECT id,is_active FROM profiles) p ON p.id=m.user_id
    WHERE m.user_id='${owner}'`)).toBe("owner|false");
});
