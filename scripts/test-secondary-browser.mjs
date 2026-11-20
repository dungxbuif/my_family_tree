// Run against a disposable migrated application, database and private S3 bucket.
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { pruneTreeMedia } from "../utils/storage/prune";
import {
  freezeAcknowledgement,
  editQuarantinedPhoto,
  openEditor,
  refreshDemotedEditor,
  interruptAvatarSave,
  retryPrunedAvatar,
} from "../tests/browser/secondary-review.mjs";

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
  await page.setViewportSize({ width, height: width === 320 ? 568 : width === 430 ? 932 : 800 });
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
  const checkFocus = async (dialog, opener) => {
    await dialog.waitFor();
    for (const key of ["Shift+Tab", "Tab", "Tab"]) {
      if (!(await dialog.evaluate((el) => el.contains(document.activeElement))))
        throw Error(
          "Focus escaped " + (await dialog.getAttribute("aria-label")),
        );
      await page.keyboard.press(key);
    }
    await page.keyboard.press("Escape");
    await dialog.waitFor({ state: "detached" });
    if (!(await opener.evaluate((el) => el === document.activeElement)))
      throw Error("Focus did not return to the opener");
    await opener.click();
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
  await checkFocus(dialog, page.getByRole("button", { name: "Thêm sự kiện" }));
  await dialog.getByLabel("Tên sự kiện").fill("Họp mặt " + width);
  await checkGeometry();
  await page.screenshot({ path: "event-form-" + width + ".png" });
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
  await checkFocus(dialog, page.getByRole("button", { name: "Thêm hình ảnh" }));
  await dialog.locator("input[type=file]").setInputFiles({
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
  await checkFocus(
    page.getByRole("dialog", { name: "Ảnh " + width }),
    photo.locator(".."),
  );
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
  for (const width of process.argv.includes("--review") ? [] : [320, 430, 1280]) {
    const result = cli(
      "run-code",
      `async page => (${workflow.toString()})(page,...${JSON.stringify([app, ...trees, width])})`,
    );
    if (result.trim() !== "true") throw new Error(result);
    console.log("Gallery upload, edit, delete and calendar passed at", width);
  }
  const run = (fn, ...args) => {
    const result = cli(
      "run-code",
      `async page => (${fn.toString()})(page,...${JSON.stringify(args)})`,
    );
    if (result.trim() !== "true") throw Error(result);
  };
  for (const section of ["events", "gallery"]) {
    run(freezeAcknowledgement, app, section);
    const original = "Bản nháp đang lưu " + section;
    const result = await db.query(
      section === "events"
        ? "SELECT name AS title FROM custom_events WHERE tree_id=$1 AND name=ANY($2)"
        : "SELECT title FROM gallery_items WHERE tree_id=$1 AND title=ANY($2)",
      [trees[0], [original, original + " đã chỉnh sửa"]],
    );
    if (
      result.rowCount !== 1 ||
      result.rows[0].title !== original + " đã chỉnh sửa"
    )
      throw Error(
        "Restored save must update the committed " +
          section +
          " row: " +
          JSON.stringify(result.rows),
      );
    console.log("Restored and updated a single committed row for", section);
  }
  const {
    rows: [quarantined],
  } = await db.query(
    "INSERT INTO gallery_items(tree_id,title,image_url) VALUES($1,'Ảnh cũ cần sửa','https://example.test/unverified') RETURNING id",
    [trees[0]],
  );
  run(editQuarantinedPhoto, app);
  const replacement = await db.query(
    "SELECT FROM gallery_items g JOIN tree_media m ON m.object_url=g.image_url AND m.tree_id=g.tree_id WHERE g.id=$1 AND m.tree_id=$2",
    [quarantined.id, trees[0]],
  );
  if (!replacement.rowCount) throw Error("Replacement missing ownership");
  for (const section of ["events", "gallery"]) {
    run(openEditor, app, section);
    await db.query(
      "UPDATE tree_memberships SET role='viewer' WHERE tree_id=$1 AND user_id=$2",
      [trees[0], user],
    );
    run(refreshDemotedEditor, trees[0]);
    await db.query(
      "UPDATE tree_memberships SET role='editor' WHERE tree_id=$1 AND user_id=$2",
      [trees[0], user],
    );
  }
  const avatar = JSON.parse(
    cli(
      "run-code",
      `async page => (${interruptAvatarSave.toString()})(page,${JSON.stringify(app)})`,
    ),
  );
  if (!avatar.startsWith("/api/storage/"))
    throw Error("Missing issued avatar URL");
  await db.query(
    "UPDATE tree_media SET cleanup_after=now() WHERE object_url=$1 AND tree_id=$2",
    [avatar, trees[0]],
  );
  if ((await pruneTreeMedia(trees[0])).removed !== 1)
    throw Error("Expected one reclaimed avatar");
  run(retryPrunedAvatar);
  const recovered = await db.query(
    "SELECT FROM persons p JOIN tree_media m ON m.object_url=p.avatar_url AND m.tree_id=p.tree_id WHERE p.tree_id=$1 AND full_name='Ảnh sau khi dọn tệp' AND avatar_url<>$2",
    [trees[0], avatar],
  );
  if (recovered.rowCount !== 1)
    throw Error("Expected one Person with a registered replacement object key");
  console.log(
    "Verified quarantined replacement, demotion of both open editors and same-file avatar recovery",
  );
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
