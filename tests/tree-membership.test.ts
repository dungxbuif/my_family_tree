import { afterEach, afterAll, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { createFamilyTree } from "@/utils/auth/tree-access";
import { manageTreeAccess, readTreeAccess, updatePersonEmailInTransaction, type AccessCommand } from "@/utils/auth/tree-membership";

const connectionString = process.env.FAMILY_TREE_TEST_DATABASE_URL;
if (!connectionString) throw new Error("Set FAMILY_TREE_TEST_DATABASE_URL to a migrated test database.");
const db = new Pool({ connectionString });
const accounts: string[] = [];
const trees: string[] = [];
async function account(active = true) {
  const id = randomUUID();
  const email = id + "@example.test";
  accounts.push(id);
  await db.query(`WITH u AS (INSERT INTO users(id,email,password_hash) VALUES($1,$2,'fixture') RETURNING id)
    INSERT INTO profiles(id,is_active) SELECT id,$3 FROM u`, [id, email, active]);
  return { id, email };
}
async function tree(ownerId: string) {
  const { tree } = await createFamilyTree(ownerId, "Test", db);
  trees.push(tree!.id);
  return tree!.id;
}
afterEach(async () => {
  await db.query("DELETE FROM family_trees WHERE id=ANY($1::uuid[])", [trees.splice(0)]);
  await db.query("DELETE FROM users WHERE id=ANY($1::uuid[])", [accounts.splice(0)]);
});
afterAll(() => db.end());

test("only an active Owner adds by exact normalized email, with a generic unavailable result", async () => {
  const owner = await account(), target = await account(), inactive = await account(false);
  const treeId = await tree(owner.id);
  const add = (actor: string, email: string) => manageTreeAccess(actor, treeId, { operation: "add", email }, db);
  expect(await add(owner.id, "\u2002" + target.email.toUpperCase() + "\n")).toEqual({ ok: true });
  expect((await db.query("SELECT role FROM tree_memberships WHERE tree_id=$1 AND user_id=$2", [treeId, target.id])).rows)
    .toEqual([{ role: "viewer" }]);
  for (const email of [target.email, inactive.email, owner.email.slice(0, 3), "other@example.test"]) {
    expect(await add(owner.id, email)).toEqual({ code: "UNAVAILABLE" });
  }
  for (const role of ["viewer","editor"]) {
    await db.query("UPDATE tree_memberships SET role=$3 WHERE tree_id=$1 AND user_id=$2", [treeId, target.id, role]);
    expect(await add(target.id, inactive.email)).toEqual({ code: "FORBIDDEN" });
  }
  await db.query("UPDATE profiles SET is_active=false WHERE id=$1", [owner.id]);
  expect(await add(owner.id, inactive.email)).toEqual({ code: "FORBIDDEN" });
});
test("competing Owner demotion and removal preserve one Owner and unrelated memberships", async () => {
  const a = await account(), b = await account();
  const treeId = await tree(a.id), other = await tree(a.id);
  for (const id of [treeId, other]) {
    expect(await manageTreeAccess(a.id, id, { operation: "add", role: "owner", email: b.email }, db)).toEqual({ ok: true });
  }
  const results = await Promise.all([
    manageTreeAccess(a.id, treeId, { operation: "role", userId: a.id, role: "editor" }, db),
    manageTreeAccess(b.id, treeId, { operation: "remove", userId: b.id }, db),
  ]);
  expect(results.filter(result => "ok" in result)).toHaveLength(1);
  expect(results).toContainEqual({ code: "LAST_OWNER" });
  expect((await db.query("SELECT FROM tree_memberships WHERE role='owner' AND tree_id=$1", [treeId])).rowCount).toBe(1);
  expect((await db.query("SELECT FROM tree_memberships WHERE role='owner' AND tree_id=$1", [other])).rowCount).toBe(2);
  expect((await db.query("SELECT FROM users WHERE id=ANY($1::uuid[])", [[a.id, b.id]])).rowCount).toBe(2);
});

async function person(treeId: string, name = "Một") {
  const { rows } = await db.query("INSERT INTO persons(tree_id,full_name,gender) VALUES ($1,$2,'other') RETURNING id", [treeId, name]);
  return rows[0].id as string;
}
test("link creates only the required viewer, and requires explicit unlink before removal or reassignment", async () => {
  const owner = await account(), first = await account(), second = await account();
  const treeId = await tree(owner.id), other = await tree(owner.id);
  const a = await person(treeId), b = await person(treeId), c = await person(other);
  const link = (personId: string, email: string) => manageTreeAccess(owner.id, treeId, { operation: "link", personId, email }, db);
  expect(await link(a, first.email)).toEqual({ ok: true });
  expect(await link(a, second.email)).toEqual({ code: "UNAVAILABLE" });
  expect(await link(b, first.email)).toEqual({ code: "UNAVAILABLE" });
  expect(await link(c, second.email)).toEqual({ code: "UNAVAILABLE" });
  expect((await db.query("SELECT role FROM tree_memberships WHERE tree_id=$1 AND user_id=$2", [treeId, first.id])).rows).toEqual([{ role: "viewer" }]);
  expect((await db.query("SELECT FROM tree_memberships WHERE tree_id=$1 AND user_id=$2", [treeId, second.id])).rowCount).toBe(0);
  const remove = () => manageTreeAccess(owner.id, treeId, { operation: "remove", userId: first.id }, db);
  expect(await remove()).toEqual({ code: "LINKED" });
  expect(await manageTreeAccess(owner.id, treeId, { operation: "unlink", personId: a, userId: second.id }, db)).toEqual({ code: "UNAVAILABLE" });
  expect(await manageTreeAccess(owner.id, treeId, { operation: "unlink", personId: a, userId: first.id }, db)).toEqual({ ok: true });
  expect(await remove()).toEqual({ ok: true });
  expect(await link(a, second.email)).toEqual({ ok: true });
  expect((await db.query("SELECT linked_user_id FROM persons WHERE tree_id=$1 AND id=$2", [treeId, a])).rows).toEqual([{ linked_user_id: second.id }]);
});

test("editing a Person email establishes a missing link and never transfers an existing identity", async () => {
  const owner = await account(), user = await account(), another = await account();
  const treeId = await tree(owner.id), a = await person(treeId);
  const update = (email: string, actor = owner.id) => manageTreeAccess(actor, treeId, { operation: "person-email", personId: a, email }, db);
  expect(await update(user.email.toUpperCase() + " ")).toEqual({ ok: true });
  const read = async () => (await db.query("SELECT email,linked_user_id FROM persons WHERE tree_id=$1 AND id=$2", [treeId,a])).rows[0];
  expect(await read()).toEqual({ email: user.email, linked_user_id: user.id });
  expect(await update(another.email, user.id)).toEqual({ code: "FORBIDDEN" });
  expect(await update(another.email)).toEqual({ ok: true });
  expect(await read()).toEqual({ email: another.email, linked_user_id: user.id });
  expect((await db.query("SELECT FROM tree_memberships WHERE tree_id=$1 AND user_id=$2", [treeId,another.id])).rowCount).toBe(0);
  expect(await update("")).toEqual({ ok: true });
  expect(await read()).toEqual({ email: null, linked_user_id: user.id });
});
test("the access manager reads only memberships and available Persons in the owned tree", async () => {
  const owner = await account(), viewer = await account();
  const treeId = await tree(owner.id), other = await tree(owner.id);
  const a = await person(treeId), b = await person(treeId, "Hai");
  await person(other, "Ngoài");
  await manageTreeAccess(owner.id, treeId, { operation: "link", personId: a, email: viewer.email }, db);
  const data = await readTreeAccess(owner.id, treeId, db);
  expect(data?.members).toContainEqual({ userId: viewer.id, email: viewer.email, role: "viewer", personId: a, personName: "Một" });
  expect(data?.members).toHaveLength(2);
  expect(data?.people).toEqual([{ id: b, name: "Hai" }]);
  expect(await readTreeAccess(viewer.id, treeId, db)).toBeNull();
});
test("a larger Person edit can roll back its email, new viewer and automated link together", async () => {
  const owner = await account(), user = await account(), treeId = await tree(owner.id);
  const id = await person(treeId);
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    expect(await updatePersonEmailInTransaction(client, owner.id, treeId, id, user.email))
      .toEqual({ ok: true });
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
  expect((await db.query("SELECT email,linked_user_id FROM persons WHERE tree_id=$1 AND id=$2", [treeId,id])).rows)
    .toEqual([{ email: null, linked_user_id: null }]);
  expect((await db.query("SELECT FROM tree_memberships WHERE tree_id=$1 AND user_id=$2", [treeId,user.id])).rowCount).toBe(0);
});
test("an Owner in another tree cannot manage this tree as an Editor or Viewer, including with Super Admin status", async () => {
  const owner = await account(), actor = await account(), other = await account();
  const treeId = await tree(owner.id);
  await tree(actor.id);
  await db.query("UPDATE profiles SET is_super_admin=true WHERE id=$1", [actor.id]);
  const id = await person(treeId);
  await manageTreeAccess(owner.id, treeId, { operation: "link", email: owner.email, personId: id }, db);
  await manageTreeAccess(owner.id, treeId, { operation: "add", email: actor.email }, db);
  const commands: AccessCommand[] = [
    { operation: "add", email: other.email }, { operation: "role", userId: actor.id, role: "owner" },
    { operation: "remove", userId: owner.id }, { operation: "link", personId: id, email: other.email },
    { operation: "unlink", personId: id, userId: owner.id }, { operation: "person-email", personId: id, email: other.email },
  ];
  for (const role of ["editor", "viewer"] as const) {
    await manageTreeAccess(owner.id, treeId, { operation: "role", userId: actor.id, role }, db);
    for (const command of commands) expect(await manageTreeAccess(actor.id, treeId, command, db)).toEqual({ code: "FORBIDDEN" });
    expect(await readTreeAccess(actor.id, treeId, db)).toBeNull();
  }
});
