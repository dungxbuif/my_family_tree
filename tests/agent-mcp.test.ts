import { afterAll, beforeAll, expect, test } from "bun:test";
import { createHash, randomUUID } from "node:crypto";
import { Pool } from "pg";
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import { createFamilyTree } from "@/utils/auth/tree-access";
import { ownCredentials } from "@/utils/agent/credentials";
import { familyPeople } from "@/utils/family/people";
import { deleteObject } from "@/utils/storage/s3";
import { agentTlsIngress } from "./fixtures/agent-tls-ingress.mjs";

const database = process.env.FAMILY_TREE_TEST_DATABASE_URL;
const base = process.env.FAMILY_TREE_TEST_APP_URL;
if (!base || !database)
  throw Error("Agent MCP tests require Next and migrated PostgreSQL");
const db = new Pool({ connectionString: database });
const user = randomUUID(),
  other = randomUUID();
let tree: string, second: string, token: string;
let ingress: ReturnType<typeof agentTlsIngress>;
const clients: Client[] = [];
beforeAll(async () => {
  ingress = agentTlsIngress(base!);
  for (const id of [user, other])
    await db.query(
      "WITH u AS (INSERT INTO users(id,email,password_hash) VALUES($1,$2,'test') RETURNING id) INSERT INTO profiles(id,is_active) SELECT id,true FROM u",
      [id, id + "@example.test"],
    );
  tree = (await createFamilyTree(user, "MCP A", db)).tree!.id;
  second = (await createFamilyTree(other, "MCP B", db)).tree!.id;
  token = (
    await ownCredentials(user).create({
      name: "MCP",
      scopes: ["read", "private", "write", "delete"],
    })
  ).secret;
});
afterAll(async () => {
  await Promise.all(clients.map((c) => c.close()));
  await ingress.close();
  await db.query("DELETE FROM family_trees WHERE id=ANY($1::uuid[])", [
    [tree, second],
  ]);
  await db.query("DELETE FROM users WHERE id=ANY($1::uuid[])", [[user, other]]);
  await db.query("DELETE FROM api_audit_logs WHERE user_id=ANY($1::uuid[])", [
    [user, other],
  ]);
  await db.end();
});
async function connect(key: string, modern = false) {
  const client = new Client(
    { name: "family-test", version: "1" },
    modern ? { versionNegotiation: { mode: "auto" } } : {},
  );
  clients.push(client);
  await client.connect(
    new StreamableHTTPClientTransport(new URL("/api/mcp", ingress.url), {
      requestInit: {
        headers: {
          authorization: "Bearer " + key,
          origin: "https://family.test",
        },
      },
      fetch: (url, init) =>
        ingress.fetch(new URL(url.toString()).pathname, init),
    }),
  );
  return client;
}
const call = (
  client: Client,
  name: string,
  args: Record<string, unknown> = {},
) => client.callTool({ name, arguments: args });
function rest(path: string, method = "GET", body?: unknown, treeId = tree) {
  return ingress.fetch(
    "/api/v1/" +
      path +
      (path.includes("?") ? "&" : "?") +
      "familyTreeId=" +
      treeId,
    {
      method,
      headers: {
        authorization: "Bearer " + token,
        "content-type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
  );
}
test("MCP validates origin and host before auth, checks TLS, bounds bodies, and serves POST only", async () => {
  for (const method of ["GET", "DELETE"]) {
    const res = await ingress.fetch("/api/mcp", { method });
    expect(res.status).toBe(405);
    expect(res.headers.get("allow")).toBe("POST");
  }
  for (const headers of [
    { origin: "https://other.test" },
    { host: "other.test" },
    { origin: "null" },
  ]) {
    expect(
      (await ingress.fetch("/api/mcp", { method: "POST", headers })).status,
    ).toBe(403);
  }
  for (const headers of [{}, { authorization: "Bearer bad" }])
    expect(
      (await ingress.fetch("/api/mcp", { method: "POST", headers })).status,
    ).toBe(401);
  expect(
    (
      await fetch(base + "/api/mcp", {
        method: "POST",
        headers: { host: "family.test", authorization: "Bearer " + token },
      })
    ).status,
  ).toBe(401);
  await expect(
    connect(token.slice(0, -1) + (token.endsWith("A") ? "B" : "A")),
  ).rejects.toThrow();
  const large = await ingress.fetch("/api/mcp", {
    method: "POST",
    headers: {
      authorization: "Bearer " + token,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: " ".repeat(4 * 1024 * 1024 + 1),
  });
  expect(large.status).toBe(413);
}, 30000);

test("official client initializes, discovers only family tools with bounded inputs and reads current memberships", async () => {
  for (const modern of [false, true]) {
    const client = await connect(token, modern);
    expect(client.getProtocolEra()).toBe(modern ? "modern" : "legacy");
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(
      [
        "list_family_trees",
        "list_people",
        "get_person",
        "create_person",
        "update_person",
        "delete_person",
        "list_relationships",
        "create_relationship",
        "delete_relationship",
        "list_events",
        "create_event",
        "update_event",
        "delete_event",
        "list_gallery",
        "create_gallery_item",
        "delete_gallery_item",
        "get_family_stats",
        "export_family_data",
      ].sort(),
    );
    for (const t of tools) {
      if (t.name !== "list_family_trees")
        expect(t.inputSchema.required).toContain("familyTreeId");
      if (t.name.startsWith("list_"))
        expect(t.inputSchema.properties?.limit).toMatchObject({ maximum: 100 });
      if (t.name.startsWith("delete_"))
        expect(t.annotations?.destructiveHint).toBe(true);
    }
    const result = await call(client, "list_family_trees", { limit: 1 });
    expect(result.structuredContent).toMatchObject({ data: [{ id: tree }] });
    expect(result.content).toMatchObject([
      { type: "text", text: expect.stringContaining(tree) },
    ]);
    expect(
      (await call(client, "list_people", { familyTreeId: second })).isError,
    ).toBe(true);
    for (const args of [
      {},
      { familyTreeId: tree, limit: 101 },
      { familyTreeId: tree, userId: other },
    ])
      expect((await call(client, "list_people", args)).isError).toBe(true);
    const invalid = await call(client, "update_person", {
      familyTreeId: tree,
      id: other,
      body: { PRIVATE_INPUT: "PRIVATE_VALUE" },
    });
    expect(invalid.isError).toBe(true);
    expect(JSON.stringify(invalid)).not.toContain("PRIVATE_");
  }
}, 30000);

test("REST and MCP share secondary CRUD, cross-tree isolation, role and private scopes", async () => {
  const client = await connect(token);
  const full = async (name: string, args: Record<string, unknown> = {}) => {
    const result = await call(client, name, { familyTreeId: tree, ...args });
    expect(result.isError).not.toBe(true);
    return result.structuredContent!.data;
  };
  const a = (
    await full("create_person", {
      body: { full_name: "Parent", phone_number: "PRIVATE_PHONE" },
    })
  ).id;
  const b = (
    await (await rest("persons", "POST", { full_name: "Child" })).json()
  ).data.id;
  const outsider = (
    await db.query(
      "INSERT INTO persons(tree_id,full_name,gender) VALUES($1,'Other','other') RETURNING id",
      [second],
    )
  ).rows[0].id;
  const edge = { person_a: a, person_b: b, type: "biological_child" };
  expect(
    (await rest("relationships", "POST", { ...edge, person_b: outsider }))
      .status,
  ).toBe(404);
  const created = await rest("relationships", "POST", edge);
  expect(created.status).toBe(201);
  const id = (await created.json()).data.id;
  expect(await full("list_relationships", { limit: 1 })).toMatchObject([
    { id },
  ]);
  expect((await rest("relationships", "POST", edge)).status).toBe(409);
  expect((await rest("relationships?offset=1")).status).toBe(200);
  expect((await rest("relationships/" + outsider, "DELETE")).status).toBe(404);
  await full("delete_relationship", { id });
  expect((await (await rest("relationships")).json()).data).toEqual([]);
  const secondEdge = await full("create_relationship", { body: edge });
  expect((await rest("relationships/" + secondEdge.id, "DELETE")).status).toBe(
    200,
  );
  const event = {
    name: "Meeting",
    event_date: "2026-11-19",
    location: "Hà Nội",
  };
  const eid = (await full("create_event", { body: event })).id;
  expect((await rest("events/" + eid, "PATCH", { name: "Next" })).status).toBe(
    200,
  );
  expect(await full("list_events")).toMatchObject([
    { id: eid, name: "Next", location: "Hà Nội" },
  ]);
  expect(
    (await rest("events/" + outsider, "PATCH", { name: "Next" })).status,
  ).toBe(404);
  expect(
    (await rest("events", "POST", { ...event, event_date: "2026-02-30" }))
      .status,
  ).toBe(400);
  await full("update_event", { id: eid, body: { location: null } });
  expect((await (await rest("events")).json()).data[0].location).toBeNull();
  await full("delete_event", { id: eid });
  const newEvent = await rest("events", "POST", event);
  expect(newEvent.status).toBe(201);
  expect(
    (await rest("events/" + (await newEvent.json()).data.id, "DELETE")).status,
  ).toBe(200);
  expect(await full("get_family_stats")).toMatchObject({
    persons: 2,
    relationships: 0,
  });
  expect((await rest("stats")).status).toBe(200);
  expect(await full("export_family_data")).toMatchObject({
    person_details_private: [{ phone_number: "PRIVATE_PHONE" }],
  });
  expect((await rest("export")).status).toBe(200);
  const basic = await ownCredentials(user).create({
    name: "basic",
    scopes: ["read", "write"],
  });
  const limited = await connect(basic.secret);
  for (const [name, args] of [
    ["delete_person", { id: a }],
    ["export_family_data", {}],
  ] as const)
    expect(
      (await call(limited, name, { familyTreeId: tree, ...args })).isError,
    ).toBe(true);
  expect(
    JSON.stringify(
      await call(limited, "get_person", { familyTreeId: tree, id: a }),
    ),
  ).not.toContain("PRIVATE_PHONE");
  await db.query(
    "INSERT INTO tree_memberships(tree_id,user_id,role) VALUES($1,$2,'owner')",
    [tree, other],
  );
  await db.query(
    "UPDATE tree_memberships SET role='viewer' WHERE tree_id=$1 AND user_id=$2",
    [tree, user],
  );
  try {
    expect(
      (
        await call(client, "update_person", {
          familyTreeId: tree,
          id: a,
          body: { full_name: "Denied" },
        })
      ).isError,
    ).toBe(true);
    expect(
      JSON.stringify(
        await call(client, "get_person", { familyTreeId: tree, id: a }),
      ),
    ).not.toContain("PRIVATE_PHONE");
    expect(
      (await call(client, "export_family_data", { familyTreeId: tree }))
        .isError,
    ).toBe(true);
  } finally {
    await db.query(
      "UPDATE tree_memberships SET role='owner' WHERE tree_id=$1 AND user_id=$2",
      [tree, user],
    );
  }
  expect(
    (
      await db.query(
        "SELECT transport,outcome FROM api_audit_logs WHERE tree_id=$1 AND action='update_person'",
        [tree],
      )
    ).rows,
  ).toContainEqual({ transport: "mcp", outcome: "denied" });
  await full("update_person", { id: a, body: { full_name: "Parent updated" } });
  await full("delete_person", { id: a });
  await full("delete_person", { id: b });
}, 30000);

test("agent export rejects over 100 rows instead of returning a partial backup", async () => {
  const client = await connect(token);
  const ids = (
    await db.query(
      "INSERT INTO persons(tree_id,full_name,gender) SELECT $1,'Bound','other' FROM generate_series(1,101) RETURNING id",
      [tree],
    )
  ).rows.map((r) => r.id);
  try {
    const result = await call(client, "export_family_data", {
      familyTreeId: tree,
    });
    expect(result.isError).toBe(true);
    expect((await rest("export")).status).toBe(400);
    await db.query("DELETE FROM persons WHERE id=$1", [ids[100]]);
    expect((await rest("export")).status).toBe(200);
    await db.query("UPDATE persons SET note=repeat('x',1048577) WHERE id=$1", [
      ids[0],
    ]);
    expect((await rest("export")).status).toBe(400);
  } finally {
    await db.query("DELETE FROM persons WHERE id=ANY($1::uuid[])", [ids]);
  }
});

test("same-tree uploaded Gallery metadata round-trips across REST and MCP", async () => {
  const client = await connect(token);
  const bytes = Buffer.from("gallery fixture");
  const signed = await familyPeople(user, tree, db).issueUpload(
    "gallery",
    "fixture.png",
    "image/png",
    bytes.length,
    {
      submissionId: randomUUID(),
      sha256: createHash("sha256").update(bytes).digest("hex"),
    },
  );
  const body = { title: "Ảnh", image_url: signed.publicUrl };
  try {
    expect((await rest("gallery", "POST", body)).status).toBe(400);
    expect(
      (
        await fetch(signed.uploadUrl, {
          method: "PUT",
          headers: { "content-type": "image/png" },
          body: bytes,
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await rest("gallery", "POST", {
          ...body,
          image_url: "data:image/png;base64,QUFB",
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await rest("gallery", "POST", {
          ...body,
          image_url: "https://other.test/x.png",
        })
      ).status,
    ).toBe(400);
    const otherKey = await ownCredentials(other).create({
      name: "Other gallery",
      scopes: ["write"],
    });
    const otherClient = await connect(otherKey.secret);
    expect(
      (
        await call(otherClient, "create_gallery_item", {
          familyTreeId: second,
          body,
        })
      ).isError,
    ).toBe(true);
    const created = await rest("gallery", "POST", body);
    expect(created.status).toBe(201);
    const {
      data: { id },
    } = await created.json();
    expect(
      (await call(client, "list_gallery", { familyTreeId: tree }))
        .structuredContent,
    ).toMatchObject({ data: [{ id, image_url: signed.publicUrl }] });
    expect(
      (await call(client, "delete_gallery_item", { familyTreeId: tree, id }))
        .isError,
    ).not.toBe(true);
    const again = await call(client, "create_gallery_item", {
      familyTreeId: tree,
      body,
    });
    expect(again.isError).not.toBe(true);
    const items = (await (await rest("gallery")).json()).data;
    expect(items).toMatchObject([{ id: again.structuredContent!.data.id }]);
    expect((await rest("gallery/" + items[0].id, "DELETE")).status).toBe(200);
  } finally {
    await deleteObject(signed.publicUrl);
  }
}, 30000);

test("concurrent calls on one client recheck credential scopes and revocation", async () => {
  const key = await ownCredentials(user).create({
    name: "Concurrent",
    scopes: ["read", "write"],
  });
  const client = await connect(key.secret);
  const results = await Promise.all(
    Array.from({ length: 10 }, () =>
      call(client, "list_events", { familyTreeId: tree }),
    ),
  );
  expect(results.every((r) => !r.isError)).toBe(true);
  await db.query("UPDATE api_keys SET scopes=ARRAY['read'] WHERE id=$1", [
    key.credential.id,
  ]);
  expect(
    (
      await call(client, "create_event", {
        familyTreeId: tree,
        body: { name: "Changed", event_date: "2026-01-01" },
      })
    ).isError,
  ).toBe(true);
  const lock = await db.connect();
  async function waitForBlocker(holder: number) {
    for (let i = 0; i < 120; i++) {
      const { rows } = await db.query(
        "SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND $1=ANY(pg_blocking_pids(pid))",
        [holder],
      );
      if (rows.length) return rows[0].pid as number;
      await Bun.sleep(20);
    }
    throw Error("Timed out waiting for PostgreSQL row lock");
  }
  await lock.query("BEGIN");
  await lock.query("SELECT FROM family_trees WHERE id=$1 FOR UPDATE", [tree]);
  const admitted = call(client, "list_events", { familyTreeId: tree });
  let revoke: Promise<unknown> | undefined;
  try {
    const holder = (await lock.query("SELECT pg_backend_pid() AS pid")).rows[0]
      .pid;
    const reader = await waitForBlocker(holder);
    revoke = ownCredentials(user).revoke(key.credential.id);
    await waitForBlocker(reader);
    await lock.query("COMMIT");
    expect((await admitted).isError).not.toBe(true);
    await revoke;
    await expect(client.listTools()).rejects.toThrow();
  } finally {
    await lock.query("ROLLBACK");
    lock.release();
    await Promise.allSettled([admitted, revoke]);
  }
}, 30000);
test("REST rejects out-of-range pages and fields through each secondary collection", async () => {
  for (const name of ["relationships", "events", "gallery"]) {
    const r = await rest(name + "?limit=101");
    expect(r.status).toBe(400);
    expect(await r.json()).toMatchObject({
      code: "INVALID_INPUT",
      requestId: expect.any(String),
    });
  }
  for (const [name, body] of [
    ["events", { name: "X".repeat(501), event_date: "2026-01-01" }],
    ["persons", { full_name: "X".repeat(501) }],
    ["events", { name: "x", event_date: "2026-01-01", userId: user }],
  ] as const)
    expect((await rest(name, "POST", body)).status).toBe(400);
});

test("malformed JSON and batches fail safely without echoing submitted data", async () => {
  const headers = {
    authorization: "Bearer " + token,
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  };
  for (const [body, code] of [
    ['{"private":"PRIVATE_MARKER",INVALID}', -32700],
    [JSON.stringify([{ jsonrpc: "2.0", id: 1, method: "tools/list" }]), -32600],
  ] as const) {
    const response = await ingress.fetch("/api/mcp", {
      method: "POST",
      headers,
      body,
    });
    expect(response.status).toBe(400);
    const text = await response.text();
    expect(text).not.toContain("PRIVATE_MARKER");
    expect(JSON.parse(text)).toMatchObject({
      jsonrpc: "2.0",
      id: null,
      error: { code, data: { requestId: expect.any(String) } },
    });
  }
}, 30000);

test("invalid mutation arguments leave only safe audit metadata and a structured error", async () => {
  const client = await connect(token);
  const id = randomUUID();
  const result = await call(client, "update_event", {
    familyTreeId: tree,
    id,
    body: { name: "", content: "PRIVATE_INPUT" },
  });
  expect(result.isError).toBe(true);
  expect(JSON.stringify(result)).not.toContain("PRIVATE_INPUT");
  expect(result.structuredContent).toMatchObject({
    code: "INVALID_INPUT",
    requestId: expect.any(String),
  });
  expect(
    (
      await db.query(
        "SELECT tree_id,user_id,transport,action,outcome FROM api_audit_logs WHERE resource_id=$1",
        [id],
      )
    ).rows,
  ).toEqual([
    {
      tree_id: tree,
      user_id: user,
      transport: "mcp",
      action: "update_event",
      outcome: "failed",
    },
  ]);
}, 30000);
