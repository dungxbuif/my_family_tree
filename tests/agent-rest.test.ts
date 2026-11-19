import { beforeAll, afterAll, expect, test } from "bun:test";
import { createHash, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { agentTlsIngress } from "./fixtures/agent-tls-ingress.mjs";
import { createFamilyTree } from "@/utils/auth/tree-access";

const base = process.env.FAMILY_TREE_TEST_APP_URL;
const connectionString = process.env.FAMILY_TREE_TEST_DATABASE_URL;
if (!base || !connectionString)
  throw Error(
    "Agent REST tests require a running test app and migrated PostgreSQL.",
  );
const db = new Pool({ connectionString });
const owner = randomUUID(),
  peer = randomUUID();
const sessions = new Map([
  [owner, randomUUID()],
  [peer, randomUUID()],
]);
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const trees: string[] = [];
const allScopes = ["read", "private", "write", "delete"];
let ingress: ReturnType<typeof agentTlsIngress>;
beforeAll(async () => {
  ingress = agentTlsIngress(base!);
  for (const [id, session] of sessions) {
    await db.query(
      "WITH u AS (INSERT INTO users(id,email,password_hash) VALUES($1,$2,'test') RETURNING id) INSERT INTO profiles(id,is_active,is_super_admin) SELECT id,true,true FROM u",
      [id, id + "@example.test"],
    );
    await db.query(
      "INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '1 hour')",
      [id, hash(session)],
    );
    trees.push((await createFamilyTree(id, "Agent REST", db)).tree!.id);
  }
});
afterAll(async () => {
  await db.query("DELETE FROM family_trees WHERE id=ANY($1::uuid[])", [trees]);
  await db.query("DELETE FROM users WHERE id=ANY($1::uuid[])", [[owner, peer]]);
  if (
    (await db.query("SELECT to_regclass('api_audit_logs') AS name")).rows[0]
      .name
  ) {
    await db.query("DELETE FROM api_audit_logs WHERE user_id=ANY($1::uuid[])", [
      [owner, peer],
    ]);
  }
  await ingress.close();
  await db.end();
});
const manage = (user: string, method = "GET", body?: unknown) =>
  fetch(base + "/dashboard/api-keys/manage", {
    method,
    headers: {
      origin: base!,
      cookie: "family_tree_session=" + sessions.get(user),
      "content-type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
async function issue(scopes: string[], user = owner) {
  const response = await manage(user, "POST", { name: "Fixture", scopes });
  expect(response.status).toBe(201);
  const { secret, credential } = await response.json();
  return { secret: secret as string, id: credential.id as string };
}
function rest(key: string, path: string, method = "GET", body?: unknown) {
  return ingress.fetch("/api/v1/" + path, {
    method,
    headers: {
      authorization: "Bearer " + key,
      "content-type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
test("only the active owner can create, list and revoke, only creation reveals the secret", async () => {
  const { secret, id } = await issue(["read"]);
  expect(/^gptree_[a-f0-9]{24}_[A-Za-z0-9_-]{43}$/.test(secret)).toBe(true);
  const saved = (await db.query("SELECT * FROM api_keys WHERE id=$1", [id]))
    .rows[0];
  expect(saved.token_hash).toBe(hash(secret));
  expect(JSON.stringify(saved).includes(secret.slice(-43))).toBe(false);
  expect(saved.public_prefix).toBe(secret.slice(7, 31));
  const mine = await (await manage(owner)).text();
  expect(mine).toContain(id);
  expect(mine.includes(secret) || mine.includes(hash(secret))).toBe(false);
  expect(await (await manage(peer)).text()).not.toContain(id);
  expect((await manage(peer, "DELETE", { id })).status).toBe(404);
  const treesResponse = await rest(secret, "family-trees");
  expect(treesResponse.status).toBe(200);
  expect(
    (await db.query("SELECT last_used_at FROM api_keys WHERE id=$1", [id]))
      .rows[0].last_used_at,
  ).toBeTruthy();
  expect((await manage(owner, "DELETE", { id })).status).toBe(200);
  expect((await rest(secret, "family-trees")).status).toBe(401);
  const events = (
    await db.query(
      "SELECT * FROM api_audit_logs WHERE key_id=$1 ORDER BY created_at",
      [id],
    )
  ).rows;
  expect(events.map((e) => e.action)).toEqual([
    "create_credential",
    "revoke_credential",
  ]);
  expect(JSON.stringify(events).includes(secret)).toBe(false);
}, 30000);
test("expired, suspended, deleted and query-only credentials receive generic authentication errors", async () => {
  const { secret, id } = await issue(["read"]);
  await db.query(
    "UPDATE api_keys SET expires_at=now()-interval '1 minute' WHERE id=$1",
    [id],
  );
  expect((await rest(secret, "family-trees")).status).toBe(401);
  await db.query("UPDATE api_keys SET expires_at=NULL WHERE id=$1", [id]);
  // Peer owns a second tree so suspending this fixture preserves an active owner.
  await db.query(
    "INSERT INTO tree_memberships(tree_id,user_id,role) VALUES($1,$2,'owner')",
    [trees[0], peer],
  );
  await db.query("UPDATE profiles SET is_active=false WHERE id=$1", [owner]);
  try {
    expect((await rest(secret, "family-trees")).status).toBe(401);
    expect(
      (await manage(owner, "POST", { name: "Denied", scopes: ["read"] }))
        .status,
    ).toBe(401);
  } finally {
    await db.query("UPDATE profiles SET is_active=true WHERE id=$1", [owner]);
  }
  const response = await ingress.fetch("/api/v1/family-trees?key=invalid");
  expect(response.status).toBe(401);
  expect(await response.json()).toMatchObject({
    code: "UNAUTHORIZED",
    requestId: expect.any(String),
    message: expect.any(String),
  });
  const gone = randomUUID(),
    session = randomUUID();
  sessions.set(gone, session);
  await db.query(
    "WITH u AS (INSERT INTO users(id,email,password_hash) VALUES($1,$2,'test') RETURNING id) INSERT INTO profiles(id,is_active) SELECT id,true FROM u",
    [gone, gone + "@example.test"],
  );
  await db.query(
    "INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '1 hour')",
    [gone, hash(session)],
  );
  try {
    const key = await issue(["read"], gone);
    await db.query("DELETE FROM users WHERE id=$1", [gone]);
    expect((await rest(key.secret, "family-trees")).status).toBe(401);
  } finally {
    await db.query("DELETE FROM users WHERE id=$1", [gone]);
    await db.query("DELETE FROM api_audit_logs WHERE user_id=$1", [gone]);
  }
}, 30000);
test("REST CRUD intersects independent scopes with the current membership, paginates reads and audits without private values", async () => {
  const keys = await Promise.all(
    [allScopes, ["read", "write"], ["delete"], ["read", "private"]].map(
      (scopes) => issue(scopes),
    ),
  );
  const [full, basic, del, reader] = keys.map((k) => k.secret);
  const collection = "persons?familyTreeId=" + trees[0];
  const detail = (id: string, tree = trees[0]) =>
    "persons/" + id + "?familyTreeId=" + tree;
  const path = "persons?familyTreeId=" + trees[1];
  expect((await rest(full, path)).status).toBe(403);
  expect(
    (await (await rest(full, "family-trees")).json()).data.map(
      (t: { id: string }) => t.id,
    ),
  ).toEqual([trees[0]]);
  await db.query(
    "INSERT INTO tree_memberships(tree_id,user_id,role) VALUES($1,$2,'editor')",
    [trees[1], owner],
  );
  expect((await rest(full, "family-trees?limit=1")).status).toBe(200);
  expect((await rest(full, collection + "&limit=101")).status).toBe(400);
  const create = await rest(full, collection, "POST", {
    full_name: "Public",
    is_deceased: null,
    birth_year: 1961,
    phone_number: "PRIVATE_FIXTURE",
  });
  expect(create.status).toBe(201);
  const id = (await create.json()).data.id;
  const asOwner = (await (await rest(full, detail(id))).json()).data;
  expect(asOwner).toMatchObject({
    full_name: "Public",
    birth_year: 1961,
    is_deceased: null,
    privateData: { phone_number: "PRIVATE_FIXTURE" },
  });
  expect(await (await rest(basic, detail(id))).text()).not.toContain(
    "PRIVATE_FIXTURE",
  );
  expect(
    (await rest(basic, detail(id), "PATCH", { phone_number: "denied" })).status,
  ).toBe(403);
  expect(
    (await rest(reader, detail(id), "PATCH", { full_name: "denied" })).status,
  ).toBe(403);
  expect((await rest(basic, detail(id), "DELETE")).status).toBe(403);
  expect((await rest(del, detail(id))).status).toBe(403);
  expect(
    (await rest(full, detail(id), "PATCH", { birth_month: 13 })).status,
  ).toBe(400);
  expect(
    (await rest(basic, detail(id), "PATCH", { full_name: "Updated" })).status,
  ).toBe(200);
  expect((await (await rest(full, detail(id))).json()).data).toMatchObject({
    full_name: "Updated",
    birth_year: 1961,
  });
  expect((await rest(full, detail(id, trees[1]))).status).toBe(404);
  expect(
    (await rest(full, detail(id, trees[1]), "PATCH", { full_name: "X" }))
      .status,
  ).toBe(404);
  expect((await rest(full, detail(id, trees[1]), "DELETE")).status).toBe(404);
  const local = await rest(full, path, "POST", { full_name: "Second" });
  const second = (await local.json()).data.id;
  expect(
    (
      await rest(full, detail(second, trees[1]), "PATCH", {
        email: "a@example.test",
      })
    ).status,
  ).toBe(403);
  await db.query(
    "INSERT INTO person_details_private(tree_id,person_id,phone_number) VALUES($1,$2,'EDITOR_SECRET')",
    [trees[1], second],
  );
  expect(
    await (await rest(full, detail(second, trees[1]))).text(),
  ).not.toContain("EDITOR_SECRET");
  await db.query(
    "UPDATE tree_memberships SET role='viewer' WHERE tree_id=$1 AND user_id=$2",
    [trees[1], owner],
  );
  expect((await rest(full, detail(second, trees[1]))).status).toBe(200);
  expect(
    (await rest(full, detail(second, trees[1]), "PATCH", { full_name: "X" }))
      .status,
  ).toBe(403);
  await db.query(
    "DELETE FROM tree_memberships WHERE tree_id=$1 AND user_id=$2",
    [trees[1], owner],
  );
  expect((await rest(full, path)).status).toBe(403);
  const another = await rest(basic, collection, "POST", {
    full_name: "Another",
  });
  expect(another.status).toBe(201);
  const page1 = (await (await rest(full, collection + "&limit=1")).json()).data;
  const page2 = (
    await (await rest(full, collection + "&limit=1&offset=1")).json()
  ).data;
  expect(page1).toHaveLength(1);
  expect(page2[0].id).not.toBe(page1[0].id);
  expect((await rest(del, detail(id), "DELETE")).status).toBe(200);
  expect((await rest(full, detail(id))).status).toBe(404);
  const audit = (
    await db.query(
      "SELECT * FROM api_audit_logs WHERE user_id=$1 AND transport='rest'",
      [owner],
    )
  ).rows;
  expect(audit).toContainEqual(
    expect.objectContaining({
      tree_id: trees[0],
      resource_id: id,
      action: "delete_person",
      outcome: "success",
    }),
  );
  expect(audit.some((a) => a.outcome === "denied")).toBe(true);
  expect(
    JSON.stringify(audit).includes("PRIVATE_FIXTURE") ||
      JSON.stringify(audit).includes(full),
  ).toBe(false);
}, 30000);

test("a repeated revoke preserves the original timestamp and a single lifecycle event", async () => {
  const { id } = await issue(["write"]);
  const first = await (await manage(owner, "DELETE", { id })).json();
  const retry = await (await manage(owner, "DELETE", { id })).json();
  expect(retry.credential.revoked_at).toBe(first.credential.revoked_at);
  expect(
    (
      await db.query(
        "SELECT FROM api_audit_logs WHERE key_id=$1 AND action='revoke_credential'",
        [id],
      )
    ).rowCount,
  ).toBe(1);
});
test("management rejects invalid scopes and expiration timestamps without issuing a key", async () => {
  for (const input of [
    { scopes: [] },
    { scopes: ["admin"] },
    { scopes: ["read", "read"] },
    { expiresAt: "2000-01-01T00:00:00Z" },
    { expiresAt: "2040-02-31T00:00:00Z" },
  ]) {
    const response = await manage(owner, "POST", {
      name: "Invalid",
      scopes: ["read"],
      ...input,
    });
    expect(response.status).toBe(400);
  }
  expect(
    (
      await db.query(
        "SELECT FROM api_keys WHERE name='Invalid' AND user_id=$1",
        [owner],
      )
    ).rowCount,
  ).toBe(0);
});
test("Person Link conflicts and audit failures roll back Person changes", async () => {
  const { secret, id: key } = await issue(allScopes);
  const path = "persons?familyTreeId=" + trees[0];
  const create = await rest(secret, path, "POST", {
    full_name: "Link fixture",
    email: owner + "@example.test",
  });
  expect(create.status).toBe(201);
  const id = (await create.json()).data.id;
  expect(
    (await db.query("SELECT linked_user_id FROM persons WHERE id=$1", [id]))
      .rows[0].linked_user_id,
  ).toBe(owner);
  const detail = "persons/" + id + "?familyTreeId=" + trees[0];
  expect((await rest(secret, detail, "DELETE")).status).toBe(409);
  const fn = "test_agent_audit_" + randomUUID().replaceAll("-", "");
  await db.query(
    `CREATE FUNCTION ${fn}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit fixture'; END $$`,
  );
  try {
    await db.query(
      `CREATE TRIGGER ${fn} BEFORE INSERT ON api_audit_logs FOR EACH ROW WHEN (NEW.key_id='${key}' AND NEW.outcome='success') EXECUTE FUNCTION ${fn}()`,
    );
    const failed = await rest(secret, detail, "PATCH", {
      full_name: "Should roll back",
    });
    expect(failed.status).toBe(500);
    expect(await failed.json()).toMatchObject({
      code: "INTERNAL_ERROR",
      requestId: expect.any(String),
    });
    expect(
      (await db.query("SELECT full_name FROM persons WHERE id=$1", [id]))
        .rows[0].full_name,
    ).toBe("Link fixture");
  } finally {
    await db.query(`DROP FUNCTION ${fn}() CASCADE`);
  }
});

test("production Bearer parsing accepts HTTPS from a configured TLS ingress and ignores query credentials", async () => {
  const { bearer } = await import("@/utils/agent/http");
  const env = process.env as Record<string, string | undefined>;
  const nodeEnv = env.NODE_ENV,
    trust = env.AGENT_TRUST_TLS_PROXY;
  const sample = "gptree_" + "a".repeat(24) + "_" + "a".repeat(43);
  const request = (url: string, proto?: string) =>
    new Request(url, {
      headers: {
        authorization: "Bearer " + sample,
        ...(proto ? { "x-forwarded-proto": proto } : {}),
      },
    });
  try {
    env.NODE_ENV = "development";
    expect(() => bearer(request("http://localhost/"))).toThrow();
    env.NODE_ENV = "production";
    delete env.AGENT_TRUST_TLS_PROXY;
    expect(() => bearer(request("http://localhost/"))).toThrow();
    expect(() => bearer(request("https://localhost/", "https"))).toThrow();
    env.AGENT_TRUST_TLS_PROXY = "1";
    expect(() => bearer(request("http://localhost/", "http"))).toThrow();
    expect(() => bearer(request("https://localhost/", "https,http"))).toThrow();
    expect(bearer(request("http://localhost/", "https")) === sample).toBe(true);
    expect(() =>
      bearer(new Request("https://localhost/?key=" + sample)),
    ).toThrow();
  } finally {
    if (nodeEnv === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = nodeEnv;
    if (trust === undefined) delete env.AGENT_TRUST_TLS_PROXY;
    else env.AGENT_TRUST_TLS_PROXY = trust;
  }
});

test("TLS ingress accepts a key while direct plaintext requests are rejected", async () => {
  const { secret } = await issue(["read"]);
  expect(
    (
      await fetch(base + "/api/v1/family-trees", {
        headers: { Authorization: "Bearer " + secret },
      })
    ).status,
  ).toBe(401);
  expect((await rest(secret, "family-trees")).status).toBe(200);
});

test("authenticated failures update last-use and a telemetry error leaves the command result intact", async () => {
  const key = await issue(["read"]);
  const last = async () =>
    (await db.query("SELECT last_used_at FROM api_keys WHERE id=$1", [key.id]))
      .rows[0].last_used_at;
  for (const [path, status] of [
    ["persons/" + randomUUID() + "?familyTreeId=" + trees[0], 404],
    ["persons?familyTreeId=" + trees[1], 403],
    ["family-trees?limit=0", 400],
    ["family-trees", 200],
  ] as const) {
    await db.query("UPDATE api_keys SET last_used_at=NULL WHERE id=$1", [
      key.id,
    ]);
    expect((await rest(key.secret, path)).status).toBe(status);
    expect(await last()).toBeTruthy();
  }
  await db.query("UPDATE api_keys SET last_used_at=NULL WHERE id=$1", [key.id]);
  expect(
    (
      await rest(
        key.secret.slice(0, -1) + (key.secret.endsWith("A") ? "B" : "A"),
        "family-trees",
      )
    ).status,
  ).toBe(401);
  expect(await last()).toBeNull();
  const fn = "test_key_usage_" + randomUUID().replaceAll("-", "");
  await db.query(
    `CREATE FUNCTION ${fn}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'telemetry unavailable'; END $$`,
  );
  try {
    await db.query(
      `CREATE TRIGGER ${fn} BEFORE UPDATE OF last_used_at ON api_keys FOR EACH ROW WHEN (NEW.id='${key.id}') EXECUTE FUNCTION ${fn}()`,
    );
    expect((await rest(key.secret, "family-trees")).status).toBe(200);
    expect((await rest(key.secret, "family-trees?limit=0")).status).toBe(400);
  } finally {
    await db.query(`DROP FUNCTION ${fn}() CASCADE`);
  }
});
test("same-key reads complete across a bounded pool while another read is admitted, then revoke waits for the admitted read", async () => {
  const key = await issue(["read"]);
  const lock = await db.connect();
  async function waitingOn(holder: number) {
    for (let i = 0; i < 120; i++) {
      const { rows } = await db.query<{ pid: number }>(
        "SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND $1=ANY(pg_blocking_pids(pid))",
        [holder],
      );
      if (rows.length) return rows[0].pid;
      await Bun.sleep(20);
    }
    throw Error("Expected request to wait on its row lock");
  }
  await lock.query("BEGIN");
  await lock.query("SELECT FROM family_trees WHERE id=$1 FOR UPDATE", [
    trees[0],
  ]);
  const slow = rest(key.secret, "persons?familyTreeId=" + trees[0]);
  let fast: Promise<number[]> | undefined,
    revoke: Promise<Response> | undefined;
  try {
    const holder = (await lock.query("SELECT pg_backend_pid() AS pid")).rows[0]
      .pid;
    const reader = await waitingOn(holder);
    fast = Promise.all(
      Array.from(
        { length: 12 },
        async () => (await rest(key.secret, "family-trees")).status,
      ),
    );
    expect(await Promise.race([fast, Bun.sleep(2500).then(() => [])])).toEqual(
      Array(12).fill(200),
    );
    revoke = manage(owner, "DELETE", { id: key.id });
    await waitingOn(reader);
    await lock.query("COMMIT");
    expect((await slow).status).toBe(200);
    expect((await revoke).status).toBe(200);
    expect((await rest(key.secret, "family-trees")).status).toBe(401);
  } finally {
    await lock.query("ROLLBACK");
    lock.release();
    await Promise.allSettled([slow, fast, revoke]);
  }
}, 15000);

test("credential history uses an owner-scoped cursor and retains revoked rows at timestamp ties", async () => {
  const { rows } = await db.query(
    `INSERT INTO api_keys(user_id,name,public_prefix,token_hash,scopes,revoked_at)
    SELECT $1,'Listed '||i,substr(md5(gen_random_uuid()::text),1,24),encode(digest(gen_random_uuid()::text,'sha256'),'hex'),ARRAY['read'],now() FROM generate_series(1,45)i RETURNING id`,
    [peer],
  );
  async function page(user: string, cursor = "") {
    return fetch(
      base + "/dashboard/api-keys/manage" + (cursor ? "?cursor=" + cursor : ""),
      { headers: { cookie: "family_tree_session=" + sessions.get(user) } },
    );
  }
  try {
    const seen: string[] = [];
    let cursor = "";
    for (let n = 0; n < 3; n++) {
      const data = await (await page(peer, cursor)).json();
      expect(data.credentials.length).toBe(n < 2 ? 20 : 5);
      seen.push(...data.credentials.map((k: { id: string }) => k.id));
      cursor = data.nextCursor;
      if (n < 2) expect(cursor).toBeTruthy();
      else expect(cursor).toBeNull();
    }
    expect(new Set(seen)).toEqual(new Set(rows.map((r) => r.id)));
    expect((await (await page(owner, rows[0].id)).json()).credentials).toEqual(
      [],
    );
    expect((await page(peer, "broken")).status).toBe(400);
  } finally {
    await db.query("DELETE FROM api_keys WHERE id=ANY($1::uuid[])", [
      rows.map((r) => r.id),
    ]);
  }
});
test("Person email syntax and length yield 400 while duplicate email and Person Links yield 409", async () => {
  const { secret } = await issue(allScopes),
    path = "persons?familyTreeId=" + trees[0];
  for (const email of [
    "invalid",
    "two@@example.test",
    "bad@-hostname.test",
    "colon:name@example.test",
    "z".repeat(65) + "@example.test",
    "a".repeat(513) + "@example.test",
  ]) {
    const bad = await rest(secret, path, "POST", {
      full_name: "Invalid email",
      email,
    });
    expect(bad.status).toBe(400);
    expect((await bad.json()).code).toBe("INVALID_INPUT");
  }
  const email = randomUUID() + "@example.test";
  expect(
    (await rest(secret, path, "POST", { full_name: "With email", email }))
      .status,
  ).toBe(201);
  expect(
    (await rest(secret, path, "POST", { full_name: "Duplicate", email }))
      .status,
  ).toBe(409);
  // Free a linked account's email without unlinking its Person.
  const linked = (
    await db.query(
      "SELECT id FROM persons WHERE tree_id=$1 AND linked_user_id=$2",
      [trees[0], owner],
    )
  ).rows[0];
  const linkedId =
    linked?.id ??
    (
      await (
        await rest(secret, path, "POST", {
          full_name: "Linked",
          email: owner + "@example.test",
        })
      ).json()
    ).data.id;
  expect(
    (
      await rest(
        secret,
        "persons/" + linkedId + "?familyTreeId=" + trees[0],
        "PATCH",
        { email: null },
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await rest(secret, path, "POST", {
        full_name: "Conflicting link",
        email: owner + "@example.test",
      })
    ).status,
  ).toBe(409);
});

test("best-effort telemetry yields the shared pool to waiting family work", async () => {
  const key = await issue(["read"]);
  const { pool } = await import("@/utils/db/client");
  const { withAgentCredential } = await import("@/utils/agent/credentials");
  const occupied = await Promise.all(
    Array.from({ length: 9 }, () => pool.connect()),
  );
  let queued: Promise<import("pg").PoolClient> | undefined;
  let command: Promise<string> | undefined;
  try {
    command = withAgentCredential(key.secret, async () => {
      queued = pool.connect();
      return "completed";
    });
    expect(
      await Promise.race([command, Bun.sleep(500).then(() => "timed-out")]),
    ).toBe("completed");
  } finally {
    for (const connection of occupied) connection.release();
    (await queued)?.release();
    await command;
  }
});
