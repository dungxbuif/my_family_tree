import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Pool } from "pg";
import checkMembership, { checkNativeOutcome, checkUnconfirmedDrafts } from "../tests/browser/tree-membership.mjs";

const connectionString = process.env.FAMILY_TREE_TEST_DATABASE_URL;
const appUrl = process.env.FAMILY_TREE_TEST_APP_URL;
if (!connectionString || !appUrl) throw Error("Set FAMILY_TREE_TEST_DATABASE_URL and FAMILY_TREE_TEST_APP_URL to the same migrated test instance.");
const db = new Pool({ connectionString });
const owner = randomUUID(), target = randomUUID(), tree = randomUUID(), token = randomUUID();
const targetEmail = target + "." + "nguyen".repeat(4) + "@intranet";
const url = new URL(appUrl), output = resolve("output/playwright/tree-membership");
mkdirSync(output, { recursive: true });
function cli(...args) {
  const wrapper = process.env.PLAYWRIGHT_CLI;
  return execFileSync(wrapper ?? "npx", [
    ...(wrapper ? [] : ["--yes", "--package", "@playwright/cli", "playwright-cli"]),
    "--session", "access-" + owner.slice(0, 8), "--raw", ...args,
  ], { cwd: output, encoding: "utf8" });
}
try {
  await db.query(`WITH u AS (INSERT INTO users(id,email,password_hash) VALUES ($1,$3,'fixture'),($2,$4,'fixture') RETURNING id)
    INSERT INTO profiles(id,is_active) SELECT id,true FROM u`, [owner,target,owner + "@example.test",targetEmail]);
  await db.query("INSERT INTO sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '10 minutes')",
    [owner,createHash("sha256").update(token).digest("hex")]);
  await db.query(`WITH t AS (INSERT INTO family_trees(id,name) VALUES($1,'Cây gia phả kiểm tra') RETURNING id)
    INSERT INTO tree_memberships(tree_id,user_id,role) SELECT id,$2,'owner' FROM t`, [tree,owner]);
  const { rows: people } = await db.query(`INSERT INTO persons(tree_id,full_name,gender)
    VALUES($1,'Người liên kết','other'),($1,'Người liên kết','other') RETURNING id`, [tree]);
  cli("open", new URL("/login", url).href, "--browser=chrome");
  cli("cookie-set", "family_tree_session", token, "--domain", url.hostname, "--path", "/", "--httpOnly");
  function run(check) {
    const result = JSON.parse(cli("run-code", "async page => (" + check.toString() + ")(page, " + JSON.stringify(targetEmail) + "," + JSON.stringify(people[1].id)
      + ").catch(error => ({failure:error.message}))"));
    if (result.failure) throw new Error(result.failure);
    return result;
  }
  const drafts = run(checkUnconfirmedDrafts);
  const result = { ...run(checkMembership), drafts, native: run(checkNativeOutcome) };
  const report = JSON.stringify(result, null, 2) + "\n";
  writeFileSync(resolve(output, "measurements.json"), report);
  process.stdout.write(report);
} finally {
  try { cli("close"); } finally {
    try {
      await db.query("DELETE FROM family_trees WHERE id=$1", [tree]);
      await db.query("DELETE FROM users WHERE id=ANY($1::uuid[])", [[owner,target]]);
    } finally { await db.end(); }
  }
}
