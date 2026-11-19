import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Pool } from "pg";
import checkSelector, { checkRevokedSelection } from "../tests/browser/tree-selector.mjs";

const connectionString = process.env.FAMILY_TREE_TEST_DATABASE_URL;
const appUrl = process.env.FAMILY_TREE_TEST_APP_URL;
if (!connectionString || !appUrl) throw new Error("Set FAMILY_TREE_TEST_DATABASE_URL and FAMILY_TREE_TEST_APP_URL to the same migrated test instance.");
const url = new URL(appUrl);
const output = resolve("output/playwright/tree-selector");
mkdirSync(output, { recursive: true });

const database = new Pool({ connectionString });
const userId = randomUUID();
const token = randomUUID();
const session = "tree-selector-" + userId.slice(0, 8);
function cli(...args) {
  const wrapper = process.env.PLAYWRIGHT_CLI;
  const command = wrapper ?? "npx";
  const prefix = wrapper ? [] : ["--yes", "--package", "@playwright/cli", "playwright-cli"];
  return execFileSync(command, [...prefix, "--session", session, "--raw", ...args], { cwd: output, encoding: "utf8" });
}

try {
  await database.query(
    `WITH u AS (INSERT INTO users(id,email,password_hash) VALUES ($1,$2,'fixture') RETURNING id),
          p AS (INSERT INTO profiles(id,is_active) SELECT id,true FROM u)
     INSERT INTO sessions(user_id,token_hash,expires_at) SELECT id,$3,now()+interval '10 minutes' FROM u`,
    [userId, userId + "@example.test", createHash("sha256").update(token).digest("hex")],
  );
  await database.query(
    `WITH trees AS (INSERT INTO family_trees(name) VALUES ('Họ Bùi'),(repeat('Nguyễn',20)) RETURNING id)
     INSERT INTO tree_memberships(tree_id,user_id,role) SELECT id,$1,'owner' FROM trees`, [userId],
  );
  cli("open", new URL("/login", url).href, "--browser=chrome");
  cli("cookie-set", "family_tree_session", token, "--domain", url.hostname, "--path", "/", "--httpOnly");
  const results = JSON.parse(cli("run-code", checkSelector.toString()));
  if (!results.failures.length) {
    await database.query(
      `DELETE FROM family_trees WHERE name='Cây vừa tạo'
         AND id IN (SELECT tree_id FROM tree_memberships WHERE user_id=$1 AND role='owner')`, [userId],
    );
    results.recoveredFromRevocation = JSON.parse(cli("run-code", checkRevokedSelection.toString()));
    if (!results.recoveredFromRevocation) results.failures.push("Stale switch error remained after creation");
  }
  const report = JSON.stringify(results, null, 2) + "\n";
  writeFileSync(resolve(output, "measurements.json"), report);
  process.stdout.write(report);
  if (results.failures.length) throw new Error(results.failures.join("\n"));
} finally {
  try {
    cli("close");
  } finally {
    try {
      await database.query("DELETE FROM family_trees WHERE id IN (SELECT tree_id FROM tree_memberships WHERE user_id=$1 AND role='owner')", [userId]);
      await database.query("DELETE FROM users WHERE id=$1", [userId]);
    } finally {
      await database.end();
    }
  }
}
