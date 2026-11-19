import { createHash, randomBytes } from "node:crypto";
import type { PoolClient } from "pg";
import { withTransaction } from "@/utils/db/client";
import { accountAccessLock } from "@/utils/auth/account-access-lock";
import { uuid } from "@/utils/family/records";
import {
  AgentError,
  scopes,
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
export async function authenticate(client: PoolClient, token: string) {
  if (!/^gptree_[0-9a-f]{24}_[A-Za-z0-9_-]{43}$/.test(token))
    throw new AgentError("UNAUTHORIZED");
  await client.query(accountAccessLock.shared);
  const {
    rows: [key],
  } = await client.query<Agent>(
    `UPDATE api_keys k SET last_used_at=clock_timestamp() FROM profiles p
     WHERE k.token_hash=$1 AND k.user_id=p.id AND p.is_active AND k.revoked_at IS NULL
     AND (k.expires_at IS NULL OR k.expires_at>clock_timestamp()) RETURNING k.id,k.user_id,k.scopes`,
    [digest(token)],
  );
  if (!key) throw new AgentError("UNAUTHORIZED");
  return key;
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
    list: () =>
      active(
        async (client) =>
          (
            await client.query<CredentialSummary>(
              `SELECT ${summaryColumns} FROM api_keys WHERE user_id=$1 ORDER BY created_at DESC,id`,
              [user],
            )
          ).rows,
      ),
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
        const {
          rows: [credential],
        } = await client.query<CredentialSummary>(
          `UPDATE api_keys SET revoked_at=now() WHERE user_id=$1 AND id=$2 AND revoked_at IS NULL RETURNING ${summaryColumns}`,
          [user, id],
        );
        if (!credential) {
          const {
            rows: [prior],
          } = await client.query<CredentialSummary>(
            `SELECT ${summaryColumns} FROM api_keys WHERE user_id=$1 AND id=$2`,
            [user, id],
          );
          if (!prior) throw new AgentError("NOT_FOUND");
          return { credential: prior };
        }
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
