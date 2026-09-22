import type { Pool } from "pg";
import { randomUUID } from "crypto";
import { withTransaction } from "@/utils/db/client";

const FIRST_ACCOUNT_LOCK = "917208341";

export interface SignupPersistenceInput {
  email: string;
  passwordHash: string;
}

export interface SignupPersistenceResult {
  userId: string;
  isFirstUser: boolean;
}

export async function createUserAndProfile(
  database: Pick<Pool, "connect">,
  input: SignupPersistenceInput,
): Promise<SignupPersistenceResult> {
  return withTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock($1::bigint)", [
      FIRST_ACCOUNT_LOCK,
    ]);

    const existingUser = await client.query("SELECT id FROM users WHERE email = $1", [
      input.email,
    ]);
    if (existingUser.rows.length > 0) {
      throw new Error("EMAIL_EXISTS");
    }

    const usersCount = await client.query<{ count: number }>(
      "SELECT COUNT(*)::int AS count FROM users",
    );
    const isFirstUser = usersCount.rows[0].count === 0;
    const userId = randomUUID();

    await client.query(
      "INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3)",
      [userId, input.email, input.passwordHash],
    );
    await client.query(
      "INSERT INTO profiles (id, role, is_active) VALUES ($1, $2, $3)",
      [userId, isFirstUser ? "admin" : "member", isFirstUser],
    );

    return { userId, isFirstUser };
  }, database);
}
