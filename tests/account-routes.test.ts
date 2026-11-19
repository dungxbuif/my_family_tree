import { afterAll, beforeAll, expect, test } from "bun:test";
import { createHash, randomUUID } from "node:crypto";
import { encodeReply } from "next/dist/compiled/react-server-dom-turbopack/cjs/react-server-dom-turbopack-client.node.production";
import { Pool } from "pg";

// Run against the dev or production server backed by the same disposable database.
const appUrl = process.env.FAMILY_TREE_TEST_APP_URL;
const routeTest = test.skipIf(!appUrl);
const database = new Pool({ connectionString: process.env.FAMILY_TREE_TEST_DATABASE_URL });
const fixtureIds: string[] = [];
let adminCookie: string;

async function seedAccount(isSuperAdmin: boolean, isActive = true) {
  const id = randomUUID();
  const sessionToken = randomUUID();
  fixtureIds.push(id);
  await database.query(
    `WITH account AS (
       INSERT INTO users (id, email, password_hash) VALUES ($1, $2, 'fixture') RETURNING id
     ), profile AS (
       INSERT INTO profiles (id, is_active, is_super_admin) SELECT id, $3, $4 FROM account
     )
     INSERT INTO sessions (user_id, token_hash, expires_at)
     SELECT id, $5, now() + interval '10 minutes' FROM account`,
    [id, `${id}@example.test`, isActive, isSuperAdmin, createHash("sha256").update(sessionToken).digest("hex")],
  );
  return { id, cookie: `family_tree_session=${sessionToken}` };
}

beforeAll(async () => {
  if (!appUrl) return;
  if (!process.env.FAMILY_TREE_TEST_DATABASE_URL) throw new Error("Set FAMILY_TREE_TEST_DATABASE_URL for route tests.");
  adminCookie = (await seedAccount(true)).cookie;
});

afterAll(async () => {
  try {
    if (fixtureIds.length) await database.query("DELETE FROM users WHERE id = ANY($1::uuid[])", [fixtureIds]);
  } finally {
    await database.end();
  }
});

type RenderedForm = { method: string; action: string; inputs: FormData };
const htmlEntities: Record<string, string> = { "&quot;": '"', "&#x27;": "'", "&lt;": "<", "&gt;": ">", "&amp;": "&" };

function renderedForm(html: string, field = "password"): RenderedForm {
  const forms: RenderedForm[] = [];
  new HTMLRewriter()
    .on("form", {
      element(form) {
        forms.push({
          method: form.getAttribute("method") ?? "get",
          action: form.getAttribute("action") ?? "",
          inputs: new FormData(),
        });
      },
    })
    .on("form input[name]", {
      element(input) {
        const value = (input.getAttribute("value") ?? "").replace(
          /&(?:quot|#x27|lt|gt|amp);/g,
          (entity) => htmlEntities[entity],
        );
        forms.at(-1)?.inputs.set(input.getAttribute("name")!, value);
      },
    })
    .transform(html);
  const form = forms.find((item) => item.inputs.has(field));
  if (!form) throw new Error("Expected a rendered form containing " + field);
  return form;
}

routeTest("the initial HTML submits account-creation credentials by POST", async () => {
  const url = `${appUrl}/dashboard/users`;
  const response = await fetch(url, { headers: { cookie: adminCookie } });
  expect(response.status).toBe(200);
  const form = renderedForm(await response.text());
  expect(form.method.toLowerCase()).toBe("post");
  expect([...form.inputs.keys()].some((name) => name.startsWith("$ACTION_"))).toBe(true);
  const email = `${randomUUID()}@example.test`;
  form.inputs.set("email", email);
  form.inputs.set("password", "fixture-password");
  try {
    const submitted = await fetch(new URL(form.action || url, url), {
      method: "POST",
      headers: { cookie: adminCookie },
      body: form.inputs,
    });
    expect(submitted.status).toBe(200);
    expect(await submitted.text()).toContain("Đã tạo tài khoản.");
    const result = await database.query("SELECT p.is_active FROM users u JOIN profiles p ON p.id = u.id WHERE u.email = $1", [email]);
    expect(result.rows).toEqual([{ is_active: true }]);
  } finally {
    await database.query("DELETE FROM users WHERE email = $1", [email]);
  }
}, 15_000);

routeTest("rejected login renders the entered email and a cleared password field", async () => {
  const loginUrl = `${appUrl}/login`;
  const form = renderedForm(await (await fetch(loginUrl)).text());
  expect(form.method.toLowerCase()).toBe("post");
  const email = "Rejected.Login@Example.Test";
  const password = "incorrect-demo-password";
  form.inputs.set("email", email);
  form.inputs.set("password", password);

  const response = await fetch(new URL(form.action || loginUrl, loginUrl), {
    method: "POST",
    body: form.inputs,
  });
  const html = await response.text();
  expect(response.status).toBe(200);
  expect(html).toContain("Email hoặc mật khẩu không đúng.");
  const returned = renderedForm(html);
  expect(returned.inputs.get("email")).toBe(email);
  expect(returned.inputs.get("password")).toBe("");
  expect(html).not.toContain(password);
}, 15_000);

routeTest("ordinary sessions cannot invoke exported account mutations", async () => {
  const ordinary = await seedAccount(false);
  const active = await seedAccount(false);
  const suspended = await seedAccount(false, false);
  const email = `${randomUUID()}@example.test`;
  const url = new URL("/dashboard/users", appUrl);
  // Warm the users page in dev before reading the action references generated by Next.
  expect((await fetch(url, { headers: { cookie: adminCookie } })).status).toBe(200);
  const manifestPath = process.env.FAMILY_TREE_TEST_ACTION_MANIFEST ?? ".next/dev/server/server-reference-manifest.json";
  const manifest = await Bun.file(manifestPath).json();
  const ids = new Map(
    Object.entries<{ filename: string; exportedName: string }>(manifest.node)
      .filter(([, action]) => action.filename === "app/actions/user.ts")
      .map(([id, action]) => [action.exportedName, id]),
  );

  const state = async () => (await database.query(
    `SELECT to_jsonb(u) AS account, to_jsonb(p) AS profile,
            ARRAY(SELECT to_jsonb(s) FROM sessions s WHERE s.user_id = u.id ORDER BY s.id) AS sessions
       FROM users u LEFT JOIN profiles p ON p.id = u.id
      WHERE u.id = ANY($1::uuid[]) OR u.email = $2
      ORDER BY u.id`,
    [[ordinary.id, active.id, suspended.id], email],
  )).rows;
  const before = await state();
  const fields = new FormData();
  fields.set("email", email);
  fields.set("password", "fixture-password");
  const calls = [
    { action: "adminCreateUser", args: [null, fields] },
    { action: "toggleUserStatus", args: [suspended.id, true] },
    { action: "toggleUserStatus", args: [active.id, false] },
    { action: "deleteUser", args: [active.id] },
  ];
  try {
    for (const { action, args } of calls) {
      const actionId = ids.get(action);
      if (!actionId) throw new Error(`Missing server action ${action}`);
      const response = await fetch(url, {
        method: "POST",
        headers: { cookie: ordinary.cookie, origin: url.origin, "Next-Action": actionId },
        body: await encodeReply(args),
        redirect: "manual",
      });
      expect(response.status).toBe(200);
      expect(await response.text()).toContain('"code":"FORBIDDEN"');
      expect(await state()).toEqual(before);
    }
  } finally {
    await database.query("DELETE FROM users WHERE email = $1", [email]);
  }
}, 15_000);

function countElements(html: string, selector: string) {
  let count = 0;
  new HTMLRewriter().on(selector, { element() { count++; } }).transform(html);
  return count;
}

routeTest("account management has no top-level bottom navigation", async () => {
  const account = await fetch(`${appUrl}/dashboard/account`, { headers: { cookie: adminCookie } });
  const management = await fetch(`${appUrl}/dashboard/users`, { headers: { cookie: adminCookie } });
  expect(account.status).toBe(200);
  expect(management.status).toBe(200);
  const bottomNav = 'nav[aria-label="Điều hướng chính"]';
  expect(countElements(await account.text(), bottomNav)).toBe(1);
  expect(countElements(await management.text(), bottomNav)).toBe(0);
}, 15_000);

routeTest("an ordinary user's dashboard header has an account link", async () => {
  const ordinary = await seedAccount(false);
  const response = await fetch(`${appUrl}/dashboard`, { headers: { cookie: ordinary.cookie } });
  expect(response.status).toBe(200);
  expect(countElements(await response.text(), 'header a[href="/dashboard/account"]')).toBe(1);
}, 15_000);

routeTest("an ordinary account can open its empty Family Tree selector and creation form", async () => {
  const ordinary = await seedAccount(false);
  const headers = { cookie: ordinary.cookie };
  const account = await fetch(new URL("/dashboard/account", appUrl), { headers });
  expect(countElements(await account.text(), 'a[href="/dashboard/account/trees"]')).toBe(1);
  const selector = await fetch(new URL("/dashboard/account/trees", appUrl), { headers });
  expect(selector.status).toBe(200);
  const html = await selector.text();
  expect(countElements(html, 'nav[aria-label="Điều hướng chính"]')).toBe(0);
  expect(html).toContain("Bạn chưa có cây gia phả");
  expect(countElements(html, "form input[name=name][required]")).toBe(1);
}, 15_000);

routeTest("the native tree forms create, switch and reject a stale selection", async () => {
  const ordinary = await seedAccount(false);
  const url = new URL("/dashboard/account/trees", appUrl);
  let cookie = ordinary.cookie;
  async function page() {
    return (await fetch(url, { headers: { cookie } })).text();
  }
  async function submit(field: string, value: string) {
    const form = renderedForm(await page(), field === "name" ? "name" : "operation");
    expect(form.method.toLowerCase()).toBe("post");
    form.inputs.set(field, value);
    return fetch(url, { method: "POST", headers: { cookie, origin: url.origin }, body: form.inputs });
  }

  try {
    const names = ["Gia phả miền Bắc", "Gia phả miền Nam"];
    const treeIds: string[] = [];
    for (const name of names) {
      const response = await submit("name", name);
      const hint = response.headers.getSetCookie().find(c => c.startsWith("family_tree_selected="));
      expect(hint).toBeDefined();
      expect(hint).toMatch(/HttpOnly/i);
      cookie = ordinary.cookie + "; " + hint!.split(";")[0];
      treeIds.push(hint!.split(";")[0].split("=")[1]);
      expect(await response.text()).toContain(name);
    }
    const switched = await submit("treeId", treeIds[0]);
    expect(switched.headers.getSetCookie().join(" ")).toContain("family_tree_selected=" + treeIds[0]);
    cookie = ordinary.cookie + "; family_tree_selected=" + treeIds[0];
    expect(countElements(await page(), 'button[aria-pressed="true"][value="' + treeIds[0] + '"]')).toBe(1);
    await database.query("DELETE FROM family_trees WHERE id=$1", [treeIds[0]]);
    const stale = await submit("treeId", treeIds[0]);
    expect(stale.headers.getSetCookie().join(" ")).not.toContain(treeIds[0]);
    const html = await stale.text();
    expect(html).toContain("Bạn không có quyền chọn cây gia phả này.");
    expect(html).not.toContain(names[0]);
    expect(countElements(html, 'button[aria-pressed="true"][value="' + treeIds[1] + '"]')).toBe(1);
  } finally {
    await database.query("DELETE FROM family_trees WHERE id IN (SELECT tree_id FROM tree_memberships WHERE user_id=$1)", [ordinary.id]);
  }
}, 15_000);
