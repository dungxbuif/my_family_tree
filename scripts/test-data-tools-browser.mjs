// Run against a disposable, migrated PostgreSQL database and the built app.
import { mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { createFamilyTree } from "../utils/auth/tree-access";

const app = process.env.FAMILY_TREE_TEST_APP_URL,
  connectionString = process.env.FAMILY_TREE_TEST_DATABASE_URL;
if (!app || !connectionString)
  throw Error("A test app and database are required.");
const db = new Pool({ connectionString });
const owner = randomUUID(),
  token = randomUUID(),
  session = "data-" + randomUUID().slice(0, 8);
const output = "output/playwright/data-tools";
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
let tree;
async function workflow(page, app, tree, width) {
  page.setDefaultTimeout(8000);
  await page.setViewportSize({ width, height: width === 320 ? 568 : 932 });
  const go = (path) => page.goto(app + "/dashboard/" + path);
  const geometry = async () => {
    const bad = await page.evaluate(() => {
      const small = [
        ...document.querySelectorAll("main button, [role=dialog] button"),
      ].filter(
        (el) => el.offsetWidth && (el.offsetWidth < 44 || el.offsetHeight < 44),
      );
      return [
        ...(document.documentElement.scrollWidth > innerWidth
          ? ["overflow"]
          : []),
        ...small.map((el) => el.textContent),
      ];
    });
    if (bad.length) throw Error("Control geometry " + JSON.stringify(bad));
  };
  await go("data");
  await page.evaluate(
    (tree) => localStorage.removeItem("kinship:" + tree),
    tree,
  );
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Xuất JSON" }).click();
  if (!(await download).suggestedFilename().includes(tree))
    throw Error("Missing selected tree in backup name");
  await geometry();
  const picker = page.locator("input[type=file]");
  const choose = async (data) =>
    picker.setInputFiles({
      name: "backup.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(data)),
    });
  await choose({ version: 999 });
  const dialog = page.getByRole("dialog", { name: "Xác nhận phục hồi" });
  await dialog.waitFor();
  if (
    !(await page.evaluate(
      () =>
        !window.dispatchEvent(
          new Event("familytreecheckdraft", { cancelable: true }),
        ),
    ))
  )
    throw Error("Missing unsaved navigation guard");
  await dialog.getByRole("button", { name: "Xác nhận thay thế" }).click();
  await dialog.getByRole("alert").waitFor();
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "detached" });
  const a = "f0a46095-a516-4f49-91b6-000000000001",
    b = "f0a46095-a516-4f49-91b6-000000000002";
  await choose({
    version: 3,
    persons: [
      { id: a, full_name: "Cha thử", gender: "male" },
      { id: b, full_name: "Con thử", gender: "female" },
    ],
    relationships: [{ person_a: a, person_b: b, type: "biological_child" }],
  });
  await geometry();
  await dialog.getByRole("button", { name: "Xác nhận thay thế" }).click();
  await page.getByText(/Đã phục hồi 2 thành viên/).waitFor();
  await go("stats");
  await page.getByText("Thống kê gia phả", { exact: true }).first().waitFor();
  await geometry();
  await go("lineage");
  await page.getByRole("button", { name: "Tính toán", exact: true }).click();
  await page.getByRole("button", { name: /Áp dụng/ }).click();
  await page
    .getByText(/Đã áp dụng thành công/)
    .first()
    .waitFor();
  await geometry();
  await go("kinship");
  await page.getByRole("button", { name: /Thành viên A ·/ }).click();
  await page.getByRole("button", { name: /Cha thử/ }).click();
  await page.waitForURL((url) => url.searchParams.has("p1"));
  await page.getByRole("button", { name: /Thành viên B ·/ }).click();
  await page.getByRole("button", { name: /Con thử/ }).click();
  await page.getByText("Cha thử gọi Con thử là", { exact: true }).waitFor();
  await geometry();
  return true;
}
try {
  await db.query(
    "WITH u AS(INSERT INTO users(id,email,password_hash) VALUES($1,$2,'test') RETURNING id) INSERT INTO profiles(id,is_active) SELECT id,true FROM u",
    [owner, owner + "@example.test"],
  );
  tree = (await createFamilyTree(owner, "Sao lưu thử", db)).tree.id;
  await db.query(
    "INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '15 minutes')",
    [owner, createHash("sha256").update(token).digest("hex")],
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
  for (const width of [320, 430]) {
    const result = cli(
      "run-code",
      `async page=>(${workflow.toString()})(page,...${JSON.stringify([app, tree, width])})`,
    );
    if (result.trim() !== "true") throw Error(result);
    console.log("Data, stats, lineage and kinship verified at", width);
  }
} finally {
  try {
    cli("close");
  } finally {
    await db.query("DELETE FROM family_trees WHERE id=$1", [tree]);
    await db.query("DELETE FROM users WHERE id=$1", [owner]);
    await db.end();
  }
}
