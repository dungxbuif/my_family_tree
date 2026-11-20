#!/usr/bin/env bun
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

function migrate() {
  const url = new URL(process.env.DATABASE_URL);
  if (!["postgres:", "postgresql:"].includes(url.protocol)) throw new Error();
  const env = { ...process.env };
  delete env.DATABASE_URL;
  // Supply authentication through libpq's environment. Preserve the URI's
  // database name, host, SSL configuration and other connection options.
  const password = url.searchParams.get("password") ?? decodeURIComponent(url.password);
  if (password) env.PGPASSWORD = password;
  url.password = "";
  url.searchParams.delete("password");
  const schema = process.argv[2] ?? fileURLToPath(new URL("../docs/schema.sql", import.meta.url));
  return spawnSync("psql", ["-Xw", "-v", "ON_ERROR_STOP=1", "-d", url.href, "-f", schema], {
    env, stdio: "inherit",
  }).status ?? 1;
}

try {
  process.exitCode = migrate();
} catch {
  console.error("A valid PostgreSQL DATABASE_URL is required for migration.");
  process.exitCode = 1;
}
