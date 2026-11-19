// Run against a disposable migrated application, database and private S3 bucket.
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { Pool } from "pg";

const app = process.env.FAMILY_TREE_TEST_APP_URL;
const database = process.env.FAMILY_TREE_TEST_DATABASE_URL;
if (!app || !database)
  throw new Error(
    "Set FAMILY_TREE_TEST_APP_URL and FAMILY_TREE_TEST_DATABASE_URL.",
  );
const db = new Pool({ connectionString: database });
const session = "media-" + randomUUID().slice(0, 8);
const user = randomUUID(),
  token = randomUUID(),
  owner = randomUUID();
const trees = [];
const output = resolve("output/playwright/secondary");
mkdirSync(output, { recursive: true });
function cli(...args) {
  const command = process.env.PLAYWRIGHT_CLI;
  return execFileSync(
    command || "npx",
    [
      ...(command
        ? []
        : ["--yes", "--package", "@playwright/cli", "playwright-cli"]),
      "--session",
      session,
      "--raw",
      ...args,
    ],
    { encoding: "utf8", cwd: output },
  );
}

async function workflow(page, app, tree, other, width) {
  await page.setViewportSize({ width, height: width === 320 ? 568 : 932 });
  page.setDefaultTimeout(10000);
  const select = async (id) => {
    await page.goto(app + "/dashboard/account/trees");
    const name = id === tree ? "Album editor" : "Album viewer";
    const active = page.getByRole("button", {
      name: new RegExp(name),
      pressed: true,
    });
    const choice = page.getByRole("button", { name: new RegExp(name) });
    await choice.waitFor();
    if (!(await active.count())) await choice.click();
    await active.waitFor();
  };
  const goto = async (path) => {
    await page.goto(app + "/dashboard/" + path);
    await page.locator("main").first().waitFor();
  };
  const checkGeometry = async () => {
    const errors = await page
      .locator("main, [role=dialog]")
      .evaluateAll((roots) => {
        const errors = [];
        if (document.documentElement.scrollWidth > innerWidth)
          errors.push("overflow");
        for (const el of new Set(
          roots.flatMap((root) => [
            ...root.querySelectorAll("button, [role=button]"),
          ]),
        )) {
          const r = el.getBoundingClientRect();
          if (
            r.width &&
            r.height &&
            (el.offsetWidth < 44 || el.offsetHeight < 44)
          )
            errors.push([
              el.getAttribute("aria-label") || el.textContent,
              el.offsetWidth,
              el.offsetHeight,
            ]);
        }
        return errors;
      });
    if (errors.length)
      throw new Error("Mobile controls: " + JSON.stringify(errors));
  };
  await select(tree);
  await goto("events");
  await page.getByRole("button", { name: "Thêm sự kiện" }).click();
  let dialog = page.getByRole("dialog", { name: "Sự kiện" });
  await dialog.getByLabel("Tên sự kiện").fill("Họp mặt " + width);
  await checkGeometry();
  await dialog.locator("button[type=submit]").click();
  const event = page.getByRole("button", {
    name: new RegExp("Họp mặt " + width),
  });
  await event.click();
  await dialog.getByLabel("Địa điểm").fill("Nhà chung");
  await dialog.locator("button[type=submit]").click();
  await page.getByText("Nhà chung", { exact: true }).waitFor();
  await event.click();
  await page.evaluate(() => {
    window.confirm = () => true;
  });
  await dialog.getByRole("button", { name: /Xoá|Xóa/ }).click();
  await event.waitFor({ state: "detached" });

  await goto("gallery");
  await page.getByRole("button", { name: "Thêm hình ảnh" }).click();
  dialog = page.getByRole("dialog", { name: "Hình ảnh" });
  await dialog
    .locator("input[type=file]")
    .setInputFiles({
      name: "notes.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("ghi chú"),
    });
  await dialog
    .getByRole("alert")
    .filter({ hasText: "Vui lòng chọn ảnh" })
    .waitFor();
  await dialog.locator("input[type=file]").setInputFiles({
    name: "ảnh.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/arcAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await dialog.getByLabel("Tiêu đề ảnh").fill("Ảnh " + width);
  await checkGeometry();
  await dialog.getByRole("button", { name: "Lưu hình ảnh" }).click();
  await dialog.waitFor({ state: "detached" });
  const photo = page
    .getByRole("img", { name: "Ảnh " + width, exact: true })
    .first();
  await photo.waitFor();
  if (!(await photo.evaluate((el) => el.complete && el.naturalWidth > 0)))
    await page.waitForFunction(() =>
      [...document.querySelectorAll("main img")].some(
        (el) => el.naturalWidth > 0,
      ),
    );
  await photo.click();
  await page.getByRole("button", { name: "Sửa", exact: true }).click();
  await dialog.getByLabel("Tiêu đề ảnh").fill("Kỷ niệm " + width);
  await dialog.getByRole("button", { name: "Lưu thay đổi" }).click();
  await dialog.waitFor({ state: "detached" });
  await page
    .getByRole("img", { name: "Kỷ niệm " + width, exact: true })
    .first()
    .click();
  await page.evaluate(() => {
    window.confirm = () => true;
  });
  await page.getByRole("button", { name: "Xóa", exact: true }).click();
  await page.getByText("Chưa có hình ảnh nào").waitFor();
  await select(other);
  for (const path of ["gallery", "events"]) {
    await goto(path);
    await page.getByText("Chỉ xem", { exact: true }).waitFor();
    await checkGeometry();
  }
  return true;
}

try {
  for (const id of [user, owner])
    await db.query(
      `WITH u AS (INSERT INTO users(id,email,password_hash) VALUES($1,$2,'fixture') RETURNING id)
    INSERT INTO profiles(id,is_active) SELECT id,true FROM u`,
      [id, id + "@example.test"],
    );
  await db.query(
    "INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '10 minutes')",
    [user, createHash("sha256").update(token).digest("hex")],
  );
  for (const role of ["editor", "viewer"]) {
    const {
      rows: [{ id }],
    } = await db.query(
      `WITH t AS (INSERT INTO family_trees(name) VALUES($1) RETURNING id),
      memberships AS (INSERT INTO tree_memberships(tree_id,user_id,role) SELECT t.id, v.actor,v.role FROM t CROSS JOIN (VALUES ($2::uuid,'owner'),($3::uuid,$4)) v(actor,role)) SELECT id FROM t`,
      ["Album " + role, owner, user, role],
    );
    trees.push(id);
  }
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
  for (const width of [320, 430]) {
    const result = cli(
      "run-code",
      `async page => (${workflow.toString()})(page,...${JSON.stringify([app, ...trees, width])})`,
    );
    if (result.trim() !== "true") throw new Error(result);
    console.log("Gallery upload, edit, delete and calendar passed at", width);
  }
} finally {
  try {
    cli("close");
  } finally {
    await db.query("DELETE FROM family_trees WHERE id=ANY($1::uuid[])", [
      trees,
    ]);
    await db.query("DELETE FROM users WHERE id=ANY($1::uuid[])", [
      [user, owner],
    ]);
    await db.end();
  }
}
