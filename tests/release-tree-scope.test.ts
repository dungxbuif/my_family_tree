import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

test("release validation requires passing authorization and scoped writes", () => {
  const gate = resolve("scripts/verify-tree-scope.sh");
  const root = mkdtempSync(join(tmpdir(), "tree-release-"));
  const run = () => spawnSync("sh", [gate], { cwd: root, encoding: "utf8" });
  const passing =
    'import { test, expect } from "bun:test"; test("scope", () => expect(true).toBe(true));';
  try {
    mkdirSync(join(root, "utils/auth"), { recursive: true });
    mkdirSync(join(root, "tests"));
    writeFileSync(join(root, "utils/auth/tree-access.test.ts"), passing);
    expect(run().stderr).toContain("tests/tree-isolation.test.ts");
    writeFileSync(
      join(root, "tests/tree-isolation.test.ts"),
      passing.replace("toBe(true)", "toBe(false)"),
    );
    expect(run().status).not.toBe(0);
    writeFileSync(
      join(root, "tests/tree-isolation.test.ts"),
      passing.replace('test("scope"', 'test.skip("scope"'),
    );
    expect(run().status).not.toBe(0);
    // A source file with no test definitions exits successfully on Bun 1.3.5.
    writeFileSync(join(root, "tests/tree-isolation.test.ts"), "export {};");
    expect(run().status).not.toBe(0);
    writeFileSync(join(root, "tests/tree-isolation.test.ts"), passing);
    for (const suite of [
      "tests/secondary-tree-isolation.test.ts",
      "tests/data-tools-isolation.test.ts",
      "tests/agent-rest.test.ts",
      "tests/agent-mcp.test.ts",
    ]) {
      expect(run().stderr).toContain(suite);
      writeFileSync(join(root, suite), passing);
    }
    expect(run().status).toBe(0);
    writeFileSync(
      join(root, "tests/data-tools-isolation.test.ts"),
      passing + 'test.skip("live isolation", () => {});',
    );
    expect(run().status).not.toBe(0);
  } finally {
    rmSync(root, { recursive: true });
  }
});
