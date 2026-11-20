import { afterAll, afterEach, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import * as access from "./tree-access";

const connectionString = process.env.FAMILY_TREE_TEST_DATABASE_URL;
if (!connectionString) throw new Error("Set FAMILY_TREE_TEST_DATABASE_URL to a migrated test database.");
const database = new Pool({ connectionString });
const actors: string[] = [];

async function account(superAdmin = false) {
  const id = randomUUID();
  actors.push(id);
  await database.query(
    `WITH u AS (INSERT INTO users(id,email,password_hash) VALUES ($1,$2,'fixture') RETURNING id)
     INSERT INTO profiles(id,is_active,is_super_admin) SELECT id,true,$3 FROM u`,
    [id, id + "@example.test", superAdmin],
  );
  return id;
}

afterEach(async () => {
  await database.query(
    "DELETE FROM family_trees WHERE id IN (SELECT tree_id FROM tree_memberships WHERE user_id=ANY($1::uuid[]) AND role='owner')",
    [actors],
  );
  await database.query("DELETE FROM users WHERE id=ANY($1::uuid[])", [actors.splice(0)]);
});
afterAll(() => database.end());

test("an ordinary active account creates multiple trees with an initial Owner", async () => {
  const actor = await account();
  const first = await access.createFamilyTree(actor, "  Họ Bùi  ", database);
  const second = await access.createFamilyTree(actor, "Bên ngoại", database);
  expect(first).toMatchObject({ tree: { name: "Họ Bùi", role: "owner" } });
  expect(second).toMatchObject({ tree: { name: "Bên ngoại", role: "owner" } });
  expect(first.tree.id).not.toBe(second.tree.id);
  const { rows } = await database.query(
    "SELECT tree_id FROM tree_memberships WHERE user_id=$1 AND role='owner' ORDER BY tree_id",
    [actor],
  );
  expect(rows.map(row => row.tree_id)).toEqual([first.tree.id, second.tree.id].sort());
});

test("an empty or invalid name leaves the account without a new tree", async () => {
  const actor = await account();
  for (const name of ["   ", null, "a".repeat(121)]) {
    expect(await access.createFamilyTree(actor, name, database)).toEqual({ code: "INVALID_NAME" });
  }
  expect((await database.query("SELECT FROM tree_memberships WHERE user_id=$1", [actor])).rowCount).toBe(0);
});

test("selection resolves the current membership role independently in two trees", async () => {
  const actor = await account(true);
  const owner = await account();
  const { tree: first } = await access.createFamilyTree(owner, "A", database);
  const { tree: second } = await access.createFamilyTree(owner, "B", database);
  const { tree: third } = await access.createFamilyTree(owner, "C", database);
  await database.query(
    "INSERT INTO tree_memberships(tree_id,user_id,role) VALUES ($1,$3,'editor'),($2,$3,'viewer')",
    [first.id, second.id, actor],
  );
  const firstRole = { ...first, role: "editor" };
  const secondRole = { ...second, role: "viewer" };
  expect(await access.getTreeSelection(actor, second.id, database)).toEqual({
    trees: [firstRole, secondRole], current: secondRole,
  });
  for (const hint of [undefined, "invalid", third.id]) {
    expect(await access.getTreeSelection(actor, hint, database)).toEqual({
      trees: [firstRole, secondRole], current: firstRole,
    });
  }
});

test("revocation invalidates an explicit switch and falls back to another accessible tree or empty", async () => {
  const actor = await account(true);
  const owner = await account();
  const { tree: first } = await access.createFamilyTree(owner, "First", database);
  const { tree: second } = await access.createFamilyTree(owner, "Second", database);
  await database.query(
    "INSERT INTO tree_memberships(tree_id,user_id,role) VALUES ($1,$3,'viewer'),($2,$3,'editor')",
    [first.id, second.id, actor],
  );
  expect(await access.selectFamilyTree(actor, second.id, database)).toMatchObject({ tree: { id: second.id, role: "editor" } });
  await database.query("DELETE FROM tree_memberships WHERE tree_id=$1 AND user_id=$2", [second.id, actor]);
  for (const id of [second.id, "forged", null]) {
    expect(await access.selectFamilyTree(actor, id, database)).toEqual({ code: "FORBIDDEN" });
  }
  expect((await access.getTreeSelection(actor, second.id, database)).current?.id).toBe(first.id);
  await database.query("UPDATE family_trees SET archived_at=now() WHERE id=$1", [first.id]);
  expect(await access.getTreeSelection(actor, second.id, database)).toEqual({ trees: [], current: null });
  expect(await access.selectFamilyTree(actor, first.id, database)).toEqual({ code: "FORBIDDEN" });
});

test("an inactive account loses access to list, create and select immediately", async () => {
  const actor = await account(true);
  const { tree } = await access.createFamilyTree(actor, "Before suspension", database);
  await database.query("UPDATE profiles SET is_active=false WHERE id=$1", [actor]);
  expect(await access.getTreeSelection(actor, tree.id, database)).toEqual({ code: "FORBIDDEN" });
  expect(await access.createFamilyTree(actor, "After suspension", database)).toEqual({ code: "FORBIDDEN" });
  expect(await access.selectFamilyTree(actor, tree.id, database)).toEqual({ code: "FORBIDDEN" });
  expect((await database.query("SELECT FROM tree_memberships WHERE user_id=$1", [actor])).rowCount).toBe(1);
});
