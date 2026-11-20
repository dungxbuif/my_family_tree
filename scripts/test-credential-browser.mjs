// Run against a disposable, migrated PostgreSQL database and the built app.
import { mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { Pool } from "pg";

const app = process.env.FAMILY_TREE_TEST_APP_URL,
  connectionString = process.env.FAMILY_TREE_TEST_DATABASE_URL;
if (!app || !connectionString)
  throw Error("A test app and database are required.");
const db = new Pool({ connectionString });
const owner = randomUUID(),
  token = randomUUID(),
  session = "keys-" + randomUUID().slice(0, 8);
const output = "output/playwright/agent-credentials";
mkdirSync(output, { recursive: true });
const cli = (...args) =>
  execFileSync(
    process.env.PLAYWRIGHT_CLI || "npx",
    [
      ...(process.env.PLAYWRIGHT_CLI
        ? []
        : ["--yes", "--package", "@playwright/cli", "playwright-cli"]),
      "--session",
      session,
      "--raw",
      ...args,
    ],
    { encoding: "utf8", cwd: output },
  );
async function workflow(page, app, width) {
  page.setDefaultTimeout(6000);
  await page.setViewportSize({
    width,
    height: width === 320 ? 568 : width === 430 ? 932 : 768,
  });
  await page.goto(app + "/dashboard/account");
  await page.getByRole("link", { name: "Khóa API" }).click();
  async function checkLayout() {
    const fits = await page.evaluate(() => {
      const targets = [
        ...document.querySelectorAll(
          "main button,main input:not([type=checkbox]),main label:has(input[type=checkbox])",
        ),
      ];
      return (
        !targets.some(
          (el) =>
            el.offsetWidth && (el.offsetWidth < 44 || el.offsetHeight < 44),
        ) && document.documentElement.scrollWidth <= innerWidth
      );
    });
    if (!fits) throw Error("Overflow or undersized controls");
  }
  async function stayOnPage() {
    await page.evaluate(() => {
      window.confirm = () => {
        document.body.dataset.keyGuard = "shown";
        return false;
      };
    });
    await page.locator('main a[href="/dashboard/account"]').click();
    if (
      !page.url().endsWith("/dashboard/api-keys") ||
      !(await page.evaluate(() => document.body.dataset.keyGuard === "shown"))
    )
      throw Error("Navigation discarded unsaved work");
  }
  await page.getByText("Khóa lịch sử 1", { exact: true }).waitFor();
  await checkLayout();
  const create = page.getByRole("button", { name: "Tạo khóa" });
  await create.scrollIntoViewIfNeeded();
  await create.focus();
  if (!(await create.evaluate((el) => {
    const box = el.getBoundingClientRect();
    return el === document.activeElement && el.contains(document.elementFromPoint(
      box.x + box.width / 2, box.y + box.height / 2,
    ));
  }))) throw Error("The create action is obscured or cannot receive focus");
  await page.screenshot({ path: "credential-form-" + width + ".png" });
  if ((await page.getByRole("article").count()) !== 20)
    throw Error("Credential history did not limit its first page to 20");
  const next = page.getByRole("button", { name: "Trang sau" }),
    prev = page.getByRole("button", { name: "Trang trước" });
  await next.click();
  await page.getByText("Khóa lịch sử 25", { exact: true }).waitFor();
  await checkLayout();
  if ((await page.getByRole("article").count()) > 20)
    throw Error("Credential page exceeded its limit");
  await prev.click();
  await page.getByText("Khóa lịch sử 1", { exact: true }).waitFor();
  await next.click();
  await page.getByText("Khóa lịch sử 25", { exact: true }).waitFor();
  const name = "Khóa " + width + "x".repeat(90);
  await page.getByLabel("Tên khóa").fill(name);
  const guards = () =>
    page.evaluate(
      () =>
        !window.dispatchEvent(new Event("beforeunload", { cancelable: true })),
    );
  if (!(await guards())) throw Error("Dirty form lost unload protection");
  await stayOnPage();
  await page.getByRole("button", { name: "Tạo khóa" }).click();
  const reveal = page.locator("code[data-secret]");
  await reveal.waitFor();
  if (!(await guards())) throw Error("Unsaved key lost unload protection");
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.getByRole("button", { name: "Sao chép" }).click();
  if (
    !(await page.evaluate(
      async () =>
        (await navigator.clipboard.readText()) ===
        document.querySelector("code[data-secret]").textContent,
    ))
  )
    throw Error("Copy failed");
  await checkLayout();
  await stayOnPage();
  if (width === 430) {
    await page.evaluate(() =>
      window.dispatchEvent(
        new PageTransitionEvent("pagehide", { persisted: true }),
      ),
    );
    if (await reveal.count()) throw Error("One-time secret survived pagehide");
    await page.reload();
  } else {
    await page.getByRole("button", { name: "Đã lưu khóa" }).click();
    await page.reload();
  }
  if (await reveal.count()) throw Error("Secret reappeared");
  const row = page.getByRole("article").filter({ hasText: name });
  await row.getByRole("button", { name: "Thu hồi" }).click();
  await checkLayout();
  await row.getByRole("button", { name: "Hủy" }).click();
  await row.getByRole("button", { name: "Thu hồi" }).click();
  await row.getByRole("button", { name: "Xác nhận thu hồi" }).click();
  await row.getByText("Đã thu hồi", { exact: true }).waitFor();
  return true;
}
try {
  await db.query(
    "WITH u AS (INSERT INTO users(id,email,password_hash) VALUES($1,$2,'test') RETURNING id) INSERT INTO profiles(id,is_active) SELECT id,true FROM u",
    [owner, "agent-" + "x".repeat(65) + owner + "@example.test"],
  );
  await db.query(
    "INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '15 minutes')",
    [owner, createHash("sha256").update(token).digest("hex")],
  );
  await db.query(
    `INSERT INTO api_keys(user_id,name,public_prefix,token_hash,scopes,revoked_at,created_at)
    SELECT $1,'Khóa lịch sử '||i,substr(md5(gen_random_uuid()::text),1,24),encode(digest(gen_random_uuid()::text,'sha256'),'hex'),ARRAY['read'],now(),now()-i*interval '1 day'
    FROM generate_series(1,25)i`,
    [owner],
  );
  cli("open", app + "/login", "--browser=chrome");
  cli(
    "cookie-set",
    "family_tree_session",
    token,
    "--domain",
    new URL(app).hostname,
    "--path",
    "/",
    "--httpOnly",
  );
  for (const width of [320, 430, 1024]) {
    const result = cli(
      "run-code",
      `async page=>(${workflow.toString()})(page,...${JSON.stringify([app, width])})`,
    );
    if (result.trim() !== "true") throw Error(result);
    console.log(
      "Creation, copy, navigation guard and revocation verified at",
      width,
    );
  }
} finally {
  try {
    cli("close");
  } finally {
    await db.query("DELETE FROM users WHERE id=$1", [owner]);
    if (
      (await db.query("SELECT to_regclass('api_audit_logs') AS name")).rows[0]
        .name
    )
      await db.query("DELETE FROM api_audit_logs WHERE user_id=$1", [owner]);
    await db.end();
  }
}
