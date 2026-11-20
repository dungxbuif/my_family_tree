import { query } from "@/utils/db/client";
import { Profile, UserRole, AppUser } from "@/types";
import { randomBytes, createHash } from "crypto";
import { cookies } from "next/headers";
import { cache } from "react";

const SESSION_COOKIE = "family_tree_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function getSessionToken() {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);

  // A suspension waits for sign-in to finish writing, then removes its session.
  const { rowCount } = await query(
    `INSERT INTO sessions (user_id, token_hash, expires_at)
     SELECT id, $2, $3 FROM profiles WHERE id = $1 AND is_active
     FOR SHARE`,
    [userId, tokenHash, expiresAt],
  );
  if (!rowCount) return false;

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
  });
  return true;
}

export async function destroySession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    await query("DELETE FROM sessions WHERE token_hash = $1", [
      hashSessionToken(token),
    ]);
  }
  cookieStore.delete(SESSION_COOKIE);
}

export const getSessionUser = cache(async () => {
  const token = await getSessionToken();
  if (!token) return null;

  const result = await query<AppUser & Profile>(
    `SELECT
      users.id,
      users.email,
      users.created_at,
      users.updated_at,
      profiles.role,
      profiles.is_active,
      profiles.is_super_admin
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    LEFT JOIN profiles ON profiles.id = users.id
    WHERE sessions.token_hash = $1
      AND sessions.expires_at > now()
    LIMIT 1`,
    [hashSessionToken(token)],
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
    "SELECT id, role, is_active, is_super_admin, created_at, updated_at FROM profiles WHERE id = $1",
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

