import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Pool } from "pg";
import { createUserAndProfile } from "./signup";

const connectionString = process.env.FAMILY_TREE_TEST_DATABASE_URL;

if (!connectionString) {
  throw new Error("FAMILY_TREE_TEST_DATABASE_URL is required for signup tests.");
}

const pool = new Pool({ connectionString });

beforeAll(async () => {
  await pool.query("TRUNCATE sessions, profiles, users CASCADE");
});

afterAll(async () => {
  await pool.end();
});

describe("createUserAndProfile", () => {
  test("assigns the active admin role to exactly one concurrent first signup", async () => {
    const [first, second] = await Promise.all([
      createUserAndProfile(pool, {
        email: "first@example.test",
        passwordHash: "hash-one",
      }),
      createUserAndProfile(pool, {
        email: "second@example.test",
        passwordHash: "hash-two",
      }),
    ]);

    const { rows } = await pool.query<{
      admin_count: number;
      active_count: number;
      user_count: number;
    }>(`
      SELECT
        COUNT(*) FILTER (WHERE role = 'admin')::int AS admin_count,
        COUNT(*) FILTER (WHERE is_active)::int AS active_count,
        COUNT(*)::int AS user_count
      FROM profiles
    `);

    expect(rows[0]).toEqual({
      admin_count: 1,
      active_count: 1,
      user_count: 2,
    });
    expect([first, second].filter((result) => result.isFirstUser)).toHaveLength(1);
  });
});
