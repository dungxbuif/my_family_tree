import type { Pool, PoolClient } from "pg";
import { pool, withTransaction } from "@/utils/db/client";
import { hashPassword } from "./password";
import { hashSessionToken } from "./session";
import { accountAccessLock } from "./account-access-lock";

const errors = {
  FORBIDDEN: "Chỉ Quản trị viên hệ thống đang hoạt động mới có quyền thực hiện thao tác này.",
  INVALID_ACCOUNT: "Vui lòng nhập email hợp lệ, mật khẩu từ 6 đến 1024 ký tự và chọn trạng thái tài khoản.",
  EMAIL_IN_USE: "Email này đã được dùng cho một tài khoản.",
  INVALID_TARGET: "Tài khoản hoặc trạng thái không hợp lệ.",
  ACCOUNT_NOT_FOUND: "Không tìm thấy tài khoản.",
  SELF_PROTECTED: "Bạn không thể khóa hoặc xóa tài khoản đang đăng nhập.",
  ACCOUNT_IN_USE: "Tài khoản còn liên kết với hồ sơ thành viên hoặc một cây gia phả vẫn cần chủ sở hữu này.",
  LAST_ACTIVE_OWNER: "Hãy cấp quyền chủ sở hữu cho một tài khoản đang hoạt động khác trước khi khóa tài khoản này.",
  ACCOUNT_UPDATE_FAILED: "Không thể cập nhật tài khoản. Vui lòng thử lại.",
} as const;

function failure(code: keyof typeof errors) {
  return { code, error: errors[code] };
}

export type AccountMutationResult = { success: true } | ReturnType<typeof failure>;
type AccountDatabase = Pick<Pool, "connect">;
const accountIdPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

// Called under the exclusive account lifecycle lock, before suspension or
// cascading deletion. Tree-access transactions cannot change this answer.
async function isLastActiveOwner(client: PoolClient, userId: string) {
  const result = await client.query(`SELECT FROM tree_memberships m JOIN profiles p ON p.id=m.user_id
    WHERE m.user_id=$1 AND m.role='owner' AND p.is_active AND NOT EXISTS (
      SELECT FROM tree_memberships other JOIN profiles active ON active.id=other.user_id
      WHERE other.tree_id=m.tree_id AND other.user_id<>m.user_id AND other.role='owner' AND active.is_active
    ) LIMIT 1`, [userId]);
  return result.rowCount === 1;
}

async function mutateAccounts(
  token: string | undefined,
  mutate: (client: PoolClient, actorId: string) => Promise<AccountMutationResult>,
  database: AccountDatabase,
): Promise<AccountMutationResult> {
  if (!token) return failure("FORBIDDEN");

  try {
    return await withTransaction(async (client) => {
      // Serialize account mutations so simultaneous changes cannot revoke each
      // other's authority after the session check.
      await client.query(accountAccessLock.exclusive);
      const { rows: [actor] } = await client.query<{ id: string }>(
        `SELECT p.id
           FROM sessions s JOIN profiles p ON p.id = s.user_id
          WHERE s.token_hash = $1 AND s.expires_at > clock_timestamp()
            AND p.is_active AND p.is_super_admin
          FOR UPDATE OF p`,
        [hashSessionToken(token)],
      );
      if (!actor) return failure("FORBIDDEN");

      return mutate(client, actor.id);
    }, database);
  } catch (error) {
    const dbError = error as { code?: string; constraint?: string };
    if (dbError.code === "23505" &&
      (dbError.constraint === "users_normalized_email" || dbError.constraint === "users_email_key")) {
      return failure("EMAIL_IN_USE");
    }
    if (dbError.code === "23503" || dbError.code === "23514") {
      return failure("ACCOUNT_IN_USE");
    }
    console.error("Account administration failed", dbError.code ?? "unknown");
    return failure("ACCOUNT_UPDATE_FAILED");
  }
}

export async function createSystemUser(
  token: string | undefined,
  formData: FormData,
  database: AccountDatabase = pool,
): Promise<AccountMutationResult> {
  return mutateAccounts(token, async (client) => {
    const email = formData.get("email");
    const password = formData.get("password");
    const status = formData.get("is_active") ?? "true";
    if (typeof email !== "string" || email.length > 512 ||
        typeof password !== "string" || password.length < 6 || password.length > 1024 ||
        (status !== "true" && status !== "false")) {
      return failure("INVALID_ACCOUNT");
    }

    const { rows: [{ normalized }] } = await client.query<{ normalized: string }>(
      "SELECT public.normalize_email($1) AS normalized", [email],
    );
    if (normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      return failure("INVALID_ACCOUNT");
    }

    const { rows: [user] } = await client.query<{ id: string }>(
      "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id",
      [normalized, await hashPassword(password)],
    );
    await client.query("INSERT INTO profiles (id, is_active) VALUES ($1, $2)", [user.id, status === "true"]);
    return { success: true };
  }, database);
}

export async function setSystemUserActive(
  token: string | undefined,
  userId: string,
  active: boolean,
  database: AccountDatabase = pool,
): Promise<AccountMutationResult> {
  return mutateAccounts(token, async (client, actorId) => {
    if (typeof userId !== "string" || !accountIdPattern.test(userId) || typeof active !== "boolean") {
      return failure("INVALID_TARGET");
    }
    if (!active && userId.toLowerCase() === actorId) return failure("SELF_PROTECTED");
    if (!active && await isLastActiveOwner(client, userId)) return failure("LAST_ACTIVE_OWNER");

    const { rowCount } = await client.query("UPDATE profiles SET is_active = $2 WHERE id = $1", [userId, active]);
    if (rowCount === 0) return failure("ACCOUNT_NOT_FOUND");
    if (!active) await client.query("DELETE FROM sessions WHERE user_id = $1", [userId]);
    return { success: true };
  }, database);
}

export async function deleteSystemUser(
  token: string | undefined,
  userId: string,
  database: AccountDatabase = pool,
): Promise<AccountMutationResult> {
  return mutateAccounts(token, async (client, actorId) => {
    if (typeof userId !== "string" || !accountIdPattern.test(userId)) return failure("INVALID_TARGET");
    if (userId.toLowerCase() === actorId) return failure("SELF_PROTECTED");
    if (await isLastActiveOwner(client, userId)) return failure("ACCOUNT_IN_USE");

    const { rowCount } = await client.query("DELETE FROM users WHERE id = $1", [userId]);
    if (rowCount === 0) return failure("ACCOUNT_NOT_FOUND");
    return { success: true };
  }, database);
}
