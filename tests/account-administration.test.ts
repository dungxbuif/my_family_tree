import { afterAll, afterEach, expect, test } from "bun:test";
import { createHash, randomUUID } from "node:crypto";
import { Pool } from "pg";
import * as accounts from "@/utils/auth/account-administration";
import { verifyPassword } from "@/utils/auth/password";

const connectionString = process.env.FAMILY_TREE_TEST_DATABASE_URL;
if (!connectionString) {
  throw new Error("FAMILY_TREE_TEST_DATABASE_URL is required for account administration tests.");
}
const database = new Pool({ connectionString });
const usersToClean: string[] = [];

async function seedAccount(isSuperAdmin = false, isActive = true, role = "member", expired = false) {
  const id = randomUUID();
  const token = randomUUID();
  usersToClean.push(`${id}@example.test`);
  await database.query(
    `WITH account AS (
       INSERT INTO users (id, email, password_hash) VALUES ($1, $2, 'fixture') RETURNING id
     ), profile AS (
       INSERT INTO profiles (id, role, is_active, is_super_admin) SELECT id, $3, $4, $5 FROM account
     )
     INSERT INTO sessions (user_id, token_hash, expires_at) SELECT id, $6, $7 FROM account`,
    [id, `${id}@example.test`, role, isActive, isSuperAdmin, createHash("sha256").update(token).digest("hex"), new Date(Date.now() + (expired ? -60_000 : 60_000))],
  );
  return { id, token };
}

function newAccount() {
  const email = `${randomUUID()}@example.test`;
  const data = new FormData();
  usersToClean.push(email);
  data.set("email", `\u00a0${email.toUpperCase()}\u3000`);
  data.set("password", "fixture-password");
  return { email, data };
}

afterEach(async () => {
  await database.query("DELETE FROM users WHERE email = ANY($1::text[])", [usersToClean.splice(0)]);
});
afterAll(() => database.end());

test("creating an account requires an active Super Admin session", async () => {
  const normal = await seedAccount();
  const legacyAdmin = await seedAccount(false, true, "admin");
  const suspended = await seedAccount(true, false);
  const expired = await seedAccount(true, true, "member", true);
  const { email, data } = newAccount();

  for (const token of [undefined, normal.token, legacyAdmin.token, suspended.token, expired.token]) {
    expect(await accounts.createSystemUser(token, data, database)).toMatchObject({ code: "FORBIDDEN" });
  }
  const { rowCount } = await database.query("SELECT id FROM users WHERE public.normalize_email(email) = $1", [email]);
  expect(rowCount).toBe(0);
});

test("a Super Admin creates a normalized account without granting Family Tree access", async () => {
  const admin = await seedAccount(true);
  const { email, data } = newAccount();
  data.set("role", "admin");
  data.set("is_super_admin", "true");

  expect(await accounts.createSystemUser(admin.token, data, database)).toEqual({ success: true });
  expect(await accounts.createSystemUser(admin.token, data, database)).toMatchObject({ code: "EMAIL_IN_USE" });
  const { rows } = await database.query(
    `SELECT u.email, u.password_hash, p.role, p.is_active, p.is_super_admin,
      EXISTS (SELECT FROM tree_memberships WHERE user_id = u.id) AS has_membership
    FROM users u LEFT JOIN profiles p ON p.id = u.id WHERE public.normalize_email(u.email) = $1`,
    [email],
  );
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ email, role: "member", is_active: true, is_super_admin: false, has_membership: false });
  expect(rows[0].password_hash).not.toBe("fixture-password");
  expect(await verifyPassword("fixture-password", rows[0].password_hash)).toBe(true);
});

test("suspension denies ordinary accounts and revokes the target's sessions", async () => {
  const admin = await seedAccount(true);
  const normal = await seedAccount();
  const suspended = await seedAccount(true, false);
  const target = await seedAccount(true);
  const state = async () => (await database.query(
    `SELECT is_active, EXISTS (SELECT FROM sessions WHERE user_id = $1) AS has_session
      FROM profiles WHERE id = $1`,
    [target.id],
  )).rows[0];

  for (const token of [normal.token, suspended.token, undefined]) {
    expect(await accounts.setSystemUserActive(token, target.id, false, database)).toMatchObject({ code: "FORBIDDEN" });
  }
  expect(await state()).toEqual({ is_active: true, has_session: true });
  expect(await accounts.setSystemUserActive(admin.token, admin.id, false, database)).toMatchObject({ code: "SELF_PROTECTED" });
  expect(await accounts.setSystemUserActive(admin.token, target.id, false, database)).toEqual({ success: true });
  expect(await state()).toEqual({ is_active: false, has_session: false });

  expect(await accounts.setSystemUserActive(admin.token, target.id, true, database)).toEqual({ success: true });
  expect(await state()).toEqual({ is_active: true, has_session: false });
  expect(await accounts.setSystemUserActive(target.token, admin.id, false, database)).toMatchObject({ code: "FORBIDDEN" });
});

test("only an active Super Admin can delete another account", async () => {
  const admin = await seedAccount(true);
  const normal = await seedAccount();
  const suspended = await seedAccount(true, false);
  const target = await seedAccount();
  const state = async () => (await database.query(
    `SELECT EXISTS (SELECT FROM users WHERE id = $1) AS has_user,
      EXISTS (SELECT FROM profiles WHERE id = $1) AS has_profile,
      EXISTS (SELECT FROM sessions WHERE user_id = $1) AS has_session`,
    [target.id],
  )).rows[0];

  for (const token of [normal.token, suspended.token, undefined]) {
    expect(await accounts.deleteSystemUser(token, target.id, database)).toMatchObject({ code: "FORBIDDEN" });
  }
  expect(await accounts.deleteSystemUser(admin.token, admin.id.toUpperCase(), database)).toMatchObject({ code: "SELF_PROTECTED" });
  expect(await state()).toEqual({ has_user: true, has_profile: true, has_session: true });
  expect(await accounts.deleteSystemUser(admin.token, target.id, database)).toEqual({ success: true });
  expect(await state()).toEqual({ has_user: false, has_profile: false, has_session: false });
});

test("a blocked last-Owner deletion preserves the account and its data", async () => {
  const admin = await seedAccount(true);
  const target = await seedAccount();
  const treeId = randomUUID();
  await database.query(
    `WITH tree AS (INSERT INTO family_trees (id, name) VALUES ($1, 'Fixture') RETURNING id)
     INSERT INTO tree_memberships (tree_id, user_id, role) SELECT id, $2, 'owner' FROM tree`,
    [treeId, target.id],
  );
  try {
    expect(await accounts.deleteSystemUser(admin.token, target.id, database)).toMatchObject({ code: "ACCOUNT_IN_USE" });
    const { rows } = await database.query(
      `SELECT u.id FROM users u
        JOIN profiles p ON p.id = u.id
        JOIN sessions s ON s.user_id = u.id
        JOIN tree_memberships m ON m.user_id = u.id
       WHERE u.id = $1 AND m.tree_id = $2 AND m.role = 'owner'`,
      [target.id, treeId],
    );
    expect(rows).toEqual([{ id: target.id }]);
  } finally {
    await database.query("DELETE FROM family_trees WHERE id = $1", [treeId]);
  }
});

test("concurrent deletion attempts between Super Admins leave one active administrator", async () => {
  const first = await seedAccount(true);
  const second = await seedAccount(true);

  const results = await Promise.all([
    accounts.deleteSystemUser(first.token, second.id, database),
    accounts.deleteSystemUser(second.token, first.id, database),
  ]);
  expect(results).toContainEqual({ success: true });
  expect(results).toContainEqual(expect.objectContaining({ code: "FORBIDDEN" }));
  const { rowCount } = await database.query(
    "SELECT id FROM profiles WHERE id = ANY($1::uuid[]) AND is_active AND is_super_admin",
    [[first.id, second.id]],
  );
  expect(rowCount).toBe(1);
});
