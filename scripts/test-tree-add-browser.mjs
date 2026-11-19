import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Pool } from "pg";
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
  const results = JSON.parse(cli("run-code", checkAdd.toString()));
  const {
    rows: [edge],
  } = await database.query(
    `SELECT a.full_name AS parent,b.full_name AS child,r.type
    FROM relationships r JOIN persons a ON a.id=r.person_a AND a.tree_id=r.tree_id
    JOIN persons b ON b.id=r.person_b AND b.tree_id=r.tree_id WHERE r.tree_id=$1 AND b.id=$2`,
    [tree.tree_id, results.focused],
  );
  if (
    edge?.parent !== "Người mới" ||
    edge.child !== "Con của người mới" ||
    edge.type !== "biological_child"
  )
    throw new Error(
      "The focused Person and saved parent-child relationship differ.",
    );
  await database.query(
    "UPDATE tree_memberships SET role='viewer' WHERE tree_id=$1 AND user_id=$2",
    [tree.tree_id, userId],
  );
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
