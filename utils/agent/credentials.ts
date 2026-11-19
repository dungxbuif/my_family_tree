import { createHash, randomBytes } from "node:crypto";
import type { PoolClient } from "pg";
import { pool, withTransaction } from "@/utils/db/client";
import { accountAccessLock } from "@/utils/auth/account-access-lock";
import { uuid } from "@/utils/family/records";
import {
  AgentError,
  scopes,
  credentialPageSize,
  type CredentialPage,
  type Scope,
  type CredentialSummary,
} from "./contract";

const summaryColumns =
  "id,name,public_prefix,scopes,expires_at,last_used_at,revoked_at,created_at";
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export type Agent = { id: string; user_id: string; scopes: Scope[] };
export type Transport = "rest" | "mcp";
export function audit(
  client: PoolClient,
  key: Pick<Agent, "id" | "user_id">,
  transport: Transport | "account",
  action: string,
  tree: string | null,
  id: string | null,
  outcome: "success" | "denied" | "failed",
) {
  return client.query(
    "INSERT INTO api_audit_logs(key_id,user_id,transport,action,tree_id,resource_id,outcome) VALUES($1,$2,$3,$4,$5,$6,$7)",
    [key.id, key.user_id, transport, action, tree, id, outcome],
  );
}
async function authenticate(client: PoolClient, token: string) {
  if (!/^gptree_[0-9a-f]{24}_[A-Za-z0-9_-]{43}$/.test(token))
    throw new AgentError("UNAUTHORIZED");
  await client.query(accountAccessLock.shared);
  const {
    rows: [key],
  } = await client.query<Agent & { admitted_at: Date }>(
    `SELECT k.id,k.user_id,k.scopes,clock_timestamp() AS admitted_at
       FROM api_keys k JOIN profiles p ON p.id=k.user_id
      WHERE k.token_hash=$1 AND p.is_active AND k.revoked_at IS NULL
        AND (k.expires_at IS NULL OR k.expires_at>clock_timestamp())
      FOR KEY SHARE OF k`,
    [digest(token)],
  );
  if (!key) throw new AgentError("UNAUTHORIZED");
  return key;
}
// Authentication holds KEY SHARE through the command. Last-use updates touch
// only non-key columns and skip a concurrent revoke or another usage writer.
async function recordAgentUse(id: string, admitted: Date) {
  // Never queue a response behind other operations just to write telemetry.
  if (pool.idleCount === 0 || pool.waitingCount > 0) return;
  try {
    await pool.query(
      `WITH candidate AS (
      SELECT id FROM api_keys WHERE id=$1 AND
        (last_used_at IS NULL OR last_used_at <= $2::timestamptz - interval '1 minute')
      FOR NO KEY UPDATE SKIP LOCKED
    ) UPDATE api_keys k SET last_used_at=$2 FROM candidate WHERE k.id=candidate.id`,
      [id, admitted],
    );
  } catch {
    // Telemetry is best effort and independent of family data and its audit.
  }
}
// Keep the admission lock through the protected operation. Usage is recorded
// only after its transaction releases the connection, including on failure.
export async function withAgentCredential<T>(
  token: string,
  operation: (client: PoolClient, key: Agent) => Promise<T>,
) {
  let admitted: Awaited<ReturnType<typeof authenticate>> | undefined;
  try {
    return await withTransaction(async (client) => {
      admitted = await authenticate(client, token);
      return operation(client, admitted);
    });
  } finally {
    if (admitted) await recordAgentUse(admitted.id, admitted.admitted_at);
  }
}

export function ownCredentials(user: string) {
  function active<T>(fn: (client: PoolClient) => Promise<T>) {
    return withTransaction(async (client) => {
      await client.query(accountAccessLock.shared);
      if (
        !(
          await client.query(
            "SELECT FROM profiles WHERE id=$1 AND is_active FOR SHARE",
            [user],
          )
        ).rowCount
      )
        throw new AgentError("UNAUTHORIZED");
      return fn(client);
    });
  }
  return {
    list: (cursor?: string | null): Promise<CredentialPage> =>
      active(async (client) => {
        if (cursor != null && !uuid.test(cursor))
          throw new AgentError("INVALID_INPUT");
        const { rows } = await client.query<CredentialSummary>(
          `SELECT ${summaryColumns}
        FROM api_keys WHERE user_id=$1 AND ($2::uuid IS NULL OR (created_at,id) <
          (SELECT created_at,id FROM api_keys WHERE user_id=$1 AND id=$2))
        ORDER BY created_at DESC,id DESC LIMIT $3`,
          [user, cursor, credentialPageSize + 1],
        );
        const credentials = rows.slice(0, credentialPageSize);
        return {
          credentials,
          nextCursor:
            rows.length > credentialPageSize
              ? credentials[credentialPageSize - 1].id
              : null,
        };
      }),
    create: (input: Record<string, unknown>) =>
      active(async (client) => {
        const name = typeof input.name === "string" ? input.name.trim() : "";
        const selected = input.scopes;
        if (
          !name ||
          name.length > 100 ||
          name.includes("\0") ||
          !Array.isArray(selected) ||
          !selected.length ||
          selected.length > 4 ||
          new Set(selected).size !== selected.length ||
          selected.some((s) => !scopes.includes(s))
        )
          throw new AgentError("INVALID_INPUT");
        const expiry = input.expiresAt;
        if (
          expiry != null &&
          (typeof expiry !== "string" ||
            !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(expiry) ||
            !(Date.parse(expiry) > Date.now()) ||
            new Date(expiry).toISOString().slice(0, 19) !== expiry.slice(0, 19))
        )
          throw new AgentError(
            "INVALID_INPUT",
            "Thời điểm hết hạn phải ở tương lai.",
          );
        for (;;) {
          const prefix = randomBytes(12).toString("hex");
          const secret =
            "gptree_" + prefix + "_" + randomBytes(32).toString("base64url");
          const {
            rows: [credential],
          } = await client.query<CredentialSummary>(
            `INSERT INTO api_keys(user_id,name,public_prefix,token_hash,scopes,expires_at)
          VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(public_prefix) DO NOTHING RETURNING ${summaryColumns}`,
            [user, name, prefix, digest(secret), selected, expiry ?? null],
          );
          if (!credential) continue;
          await audit(
            client,
            { id: credential.id, user_id: user },
            "account",
            "create_credential",
            null,
            credential.id,
            "success",
          );
          return { secret, credential };
        }
      }),
    revoke: (id: unknown) =>
      active(async (client) => {
        if (typeof id !== "string" || !uuid.test(id))
          throw new AgentError("INVALID_INPUT");
        // FOR UPDATE conflicts with the KEY SHARE held by each admitted
        // command. A retry sees the committed revocation and its original time.
        const {
          rows: [prior],
        } = await client.query<CredentialSummary>(
          `SELECT ${summaryColumns} FROM api_keys WHERE user_id=$1 AND id=$2 FOR UPDATE`,
          [user, id],
        );
        if (!prior) throw new AgentError("NOT_FOUND");
        if (prior.revoked_at) return { credential: prior };
        const {
          rows: [credential],
        } = await client.query<CredentialSummary>(
          `UPDATE api_keys SET revoked_at=clock_timestamp() WHERE user_id=$1 AND id=$2 RETURNING ${summaryColumns}`,
          [user, id],
        );
        await audit(
          client,
          { id, user_id: user },
          "account",
          "revoke_credential",
          null,
          id,
          "success",
        );
        return { credential };
      }),
  };
}
