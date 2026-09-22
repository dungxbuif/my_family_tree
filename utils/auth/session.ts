import { query } from "@/utils/db/client";
import { Profile, UserRole, AppUser } from "@/types";
import { randomBytes, createHash } from "crypto";
import { cookies } from "next/headers";
import { cache } from "react";

const SESSION_COOKIE = "family_tree_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);

  await query(
    "INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3)",
    [userId, tokenHash, expiresAt],
  );

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
  });
}

export async function destroySession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    await query("DELETE FROM sessions WHERE token_hash = $1", [
      hashToken(token),
    ]);
  }
  cookieStore.delete(SESSION_COOKIE);
}

export const getSessionUser = cache(async () => {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const result = await query<AppUser & Profile>(
    `SELECT
      users.id,
      users.email,
      users.created_at,
      users.updated_at,
      profiles.role,
      profiles.is_active
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    LEFT JOIN profiles ON profiles.id = users.id
    WHERE sessions.token_hash = $1
      AND sessions.expires_at > now()
    LIMIT 1`,
    [hashToken(token)],
  );

  return result.rows[0] ?? null;
});

export const getUser = cache(async () => {
  const row = await getSessionUser();
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    created_at: row.created_at,
    updated_at: row.updated_at,
  } satisfies AppUser;
});

export const getProfile = cache(async (userId?: string) => {
  const id = userId ?? (await getUser())?.id;
  if (!id) return null;

  const result = await query<Profile>(
    "SELECT id, role, is_active, created_at, updated_at FROM profiles WHERE id = $1",
    [id],
  );
  return result.rows[0] ?? null;
});

export const getIsAdmin = cache(async () => {
  const profile = await getProfile();
  return profile?.role === "admin";
});

export async function requireRole(roles: UserRole[]) {
  const profile = await getProfile();
  if (!profile || !profile.is_active || !roles.includes(profile.role)) {
    throw new Error("Access denied.");
  }
  return profile;
}

