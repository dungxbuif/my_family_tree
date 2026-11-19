import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Pool } from "pg";
import {
  formStates,
  focusModes,
  avatarRetry,
  treeSwitch,
  historySwitch,
} from "../tests/browser/tree-add-review.mjs";
import {
  recoverSelectionBody,
  restoreDirtyTree,
  recoverAvatarPut,
  reopenLeapDate,
} from "../tests/browser/tree-recovery.mjs";
import { checkFrozenModal } from "../tests/browser/tree-frozen-modal.mjs";
import checkAdd, { checkDemotion } from "../tests/browser/tree-add.mjs";

const connectionString = process.env.FAMILY_TREE_TEST_DATABASE_URL;
const appUrl = process.env.FAMILY_TREE_TEST_APP_URL;
if (!connectionString || !appUrl)
  throw new Error(
    "Set FAMILY_TREE_TEST_DATABASE_URL and FAMILY_TREE_TEST_APP_URL to the same migrated test instance.",
  );
const url = new URL(appUrl);
const output = resolve("output/playwright/tree-add");
mkdirSync(output, { recursive: true });

const database = new Pool({ connectionString });
const userId = randomUUID();
const owner = randomUUID();
const token = randomUUID();
const session = "tree-add-" + userId.slice(0, 8);
function cli(...args) {
  const wrapper = process.env.PLAYWRIGHT_CLI;
  const command = wrapper ?? "npx";
  const prefix = wrapper
    ? []
    : ["--yes", "--package", "@playwright/cli", "playwright-cli"];
  return execFileSync(
    command,
    [...prefix, "--session", session, "--raw", ...args],
    { cwd: output, encoding: "utf8" },
  );
}

try {
  await database.query(
    `WITH u AS (INSERT INTO users(id,email,password_hash) VALUES ($1,$2,'fixture') RETURNING id),
          p AS (INSERT INTO profiles(id,is_active) SELECT id,true FROM u)
     INSERT INTO sessions(user_id,token_hash,expires_at) SELECT id,$3,now()+interval '10 minutes' FROM u`,
    [
      userId,
      userId + "@example.test",
      createHash("sha256").update(token).digest("hex"),
    ],
  );
  await database.query(
    `WITH u AS (INSERT INTO users(id,email,password_hash) VALUES($1,$2,'fixture') RETURNING id)
    INSERT INTO profiles(id,is_active) SELECT id,true FROM u`,
    [owner, owner + "@example.test"],
  );
  const {
    rows: [tree],
  } = await database.query(
    `WITH t AS (INSERT INTO family_trees(name) VALUES ('Gia phả kiểm thử') RETURNING id)
     INSERT INTO tree_memberships(tree_id,user_id,role) SELECT id,$1,'owner' FROM t RETURNING tree_id`,
    [owner],
  );
  await database.query(
    "INSERT INTO tree_memberships(tree_id,user_id,role) VALUES($1,$2,'editor')",
    [tree.tree_id, userId],
  );
  await database.query(
    "INSERT INTO persons(tree_id,full_name,gender) VALUES($1,'An','other')",
    [tree.tree_id],
  );
  await database.query(
    `WITH t AS (INSERT INTO family_trees(name) VALUES('Cây thứ hai') RETURNING id),
    m AS (INSERT INTO tree_memberships(tree_id,user_id,role) SELECT t.id,v.id,v.role FROM t CROSS JOIN (VALUES($1::uuid,'owner'),($2::uuid,'viewer')) v(id,role))
    INSERT INTO persons(tree_id,full_name,gender) SELECT id,'Nhà khác','other' FROM t`,
    [owner, userId],
  );
  cli("open", new URL("/login", url).href, "--browser=chrome");
  cli(
    "cookie-set",
    "family_tree_session",
    token,
    "--domain",
    url.hostname,
    "--path",
    "/",
    "--httpOnly",
  );
  const review = {};
  for (const scenario of [
    "backFirst",
    "storageFirst",
    "backFirstLegacy",
    "restoreRead",
    "headerBack",
    "headerClose",
    "browserBack",
  ]) {
    try {
      review[scenario] = JSON.parse(
        cli(
          "run-code",
          `async page => (${checkFrozenModal.toString()})(page, ${JSON.stringify(scenario)})`,
        ),
      );
    } catch (error) {
      review[scenario] = String(error.stdout ?? error.message).slice(-500);
    }
  }
  for (const check of [
    recoverAvatarPut,
    formStates,
    focusModes,
    avatarRetry,
    treeSwitch,
    historySwitch,
    recoverSelectionBody,
    restoreDirtyTree,
  ]) {
    try {
      const live =
        check === recoverAvatarPut &&
        process.env.FAMILY_TREE_TEST_LIVE_S3 === "1";
      const code = live
        ? `async page => (${check.toString()})(page,true)`
        : check.toString();
      review[check.name] = JSON.parse(cli("run-code", code));
    } catch (e) {
      review[check.name] = String(e.stdout ?? e.message).slice(-400);
    }
  }
  const leap = await database.query(
    `
    INSERT INTO persons(tree_id,full_name,gender,birth_year,birth_month,birth_day,death_year,death_month,death_day,
    death_lunar_year,death_lunar_month,death_lunar_day,is_deceased)
    VALUES($1,'Hồ sơ tháng nhuận','other',2023,3,24,2023,3,25,2023,2,4,true) RETURNING id`,
    [tree.tree_id],
  );
  cli(
    "goto",
    new URL("/dashboard/members/" + leap.rows[0].id + "/edit", url).href,
  );
  review.reopenLeapDate = JSON.parse(
    cli("run-code", reopenLeapDate.toString()),
  );
  writeFileSync(
    resolve(output, "review.json"),
    JSON.stringify(review, null, 2),
  );
  if (
    review.backFirst !== true ||
    review.storageFirst !== true ||
    review.backFirstLegacy !== true ||
    review.restoreRead !== true ||
    review.headerBack !== true ||
    review.headerClose !== true ||
    review.browserBack !== true ||
    review.reopenLeapDate !== true ||
    review.recoverSelectionBody !== true ||
    review.restoreDirtyTree !== true ||
    review.recoverAvatarPut.keys !== 1 ||
    review.recoverAvatarPut.puts !== 3 ||
    review.recoverAvatarPut.writes !== 2 ||
    !Array.isArray(review.formStates.failures) ||
    review.formStates.failures.length ||
    review.focusModes.length ||
    review.avatarRetry.uploads !== 1 ||
    review.avatarRetry.puts !== 1 ||
    !review.avatarRetry.detail ||
    review.avatarRetry.writes !== 2 ||
    review.treeSwitch.newPerson !== 1 ||
    !review.historySwitch.viewer ||
    review.treeSwitch.previousControls !== 0
  )
    throw new Error(JSON.stringify(review));
  const avatar = await database.query(
    `SELECT p.id FROM persons p JOIN person_creation_receipts r ON r.tree_id=p.tree_id AND p.id=ANY(r.person_ids)
    WHERE p.tree_id=$1 AND p.full_name='Avatar retry'`,
    [tree.tree_id],
  );
  if (avatar.rowCount !== 1)
    throw new Error(
      "Expected one Person and receipt for the recovered avatar creation.",
    );
  const recovered = await database.query(
    `
    SELECT p.full_name,count(DISTINCT p.id)::int AS persons,count(r.submission_id)::int AS receipts
    FROM persons p LEFT JOIN person_creation_receipts r ON r.tree_id=p.tree_id AND p.id=ANY(r.person_ids)
    WHERE p.tree_id=$1 AND p.full_name=ANY($2::text[]) GROUP BY p.full_name`,
    [tree.tree_id, ["Đã tiếp tục trong cây gốc", "Ảnh sau tải lại"]],
  );
  if (
    recovered.rowCount !== 2 ||
    recovered.rows.some((row) => row.persons !== 1 || row.receipts !== 1)
  )
    throw new Error(
      "Two recovered drafts must produce one Person and receipt each in the original tree.",
    );
  const results = JSON.parse(cli("run-code", checkAdd.toString()));
  const {
    rows: [edge],
  } = await database.query(
    `SELECT a.full_name AS parent,b.full_name AS child,r.type,a.generation AS parent_generation,b.generation AS child_generation
    FROM relationships r JOIN persons a ON a.id=r.person_a AND a.tree_id=r.tree_id
    JOIN persons b ON b.id=r.person_b AND b.tree_id=r.tree_id WHERE r.tree_id=$1 AND b.id=$2`,
    [tree.tree_id, results.focused],
  );
  if (
    edge?.parent !== "Người mới" ||
    edge.child !== "Con của người mới" ||
    edge.type !== "biological_child" ||
    edge.parent_generation !== null ||
    edge.child_generation !== null
  )
    throw new Error(
      "The focused Person and saved parent-child relationship differ.",
    );
  await database.query(
    "UPDATE tree_memberships SET role='viewer' WHERE tree_id=$1 AND user_id=$2",
    [tree.tree_id, userId],
  );
  cli("reload");
  cli("dialog-dismiss");
  results.reloadProtected = true;
  results.viewer = JSON.parse(cli("run-code", checkDemotion.toString()));
  const { rowCount } = await database.query(
    "SELECT FROM persons WHERE tree_id=$1 AND full_name='Bản nháp'",
    [tree.tree_id],
  );
  if (rowCount) throw new Error("The demoted Editor created a Person.");
  const report = JSON.stringify(results, null, 2) + "\n";
  writeFileSync(resolve(output, "measurements.json"), report);
  process.stdout.write(report);
} finally {
  try {
    cli("close");
  } finally {
    try {
      await database.query(
        "DELETE FROM family_trees WHERE id IN (SELECT tree_id FROM tree_memberships WHERE user_id=$1 AND role='owner')",
        [owner],
      );
      await database.query("DELETE FROM users WHERE id=ANY($1::uuid[])", [
        [owner, userId],
      ]);
    } finally {
      await database.end();
    }
  }
}
