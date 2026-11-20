import {
  CreateBucketCommand,
  HeadBucketCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { fileURLToPath } from "node:url";

if (!process.env.FAMILY_TREE_TEST_DATABASE_URL) {
  throw new Error(
    "Set FAMILY_TREE_TEST_DATABASE_URL to a migrated test database.",
  );
}

const port = "33115";
const appUrl = `http://127.0.0.1:${port}`;
// Webpack avoids Turbopack's hashed pg externals on the CI Bun runtime.
const app = Bun.spawn(
  [
    "node",
    "node_modules/next/dist/bin/next",
    "dev",
    "--webpack",
    "--hostname",
    "127.0.0.1",
    "--port",
    port,
  ],
  {
    env: {
      ...process.env,
      DATABASE_URL: process.env.FAMILY_TREE_TEST_DATABASE_URL,
      // Loopback-only backend of the disposable HTTPS integration ingress.
      MCP_ALLOWED_ORIGINS: "https://family.test",
      AGENT_TRUST_TLS_PROXY: "1",
      NEXT_TELEMETRY_DISABLED: "1",
      NEXT_FONT_GOOGLE_MOCKED_RESPONSES: fileURLToPath(
        new URL("../tests/fixtures/next-font-responses.cjs", import.meta.url),
      ),
    },
    stdout: "pipe",
    stderr: "pipe",
  },
);
const logs = Promise.all([
  new Response(app.stdout).text(),
  new Response(app.stderr).text(),
]);

async function waitForApp() {
  for (let attempt = 0; attempt < 40 && app.exitCode === null; attempt++) {
    try {
      const response = await fetch(`${appUrl}/readyz`, {
        signal: AbortSignal.timeout(1_000),
      });
      if (response.ok) return;
    } catch {
      // Retry until Next has bound the port and compiled the readiness route.
    }
    await Bun.sleep(250);
  }
  throw new Error("The account test app did not become ready.");
}

async function ensureTestBucket(client) {
  let lastError;
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      await client.send(new HeadBucketCommand({ Bucket: process.env.S3_BUCKET }));
      return;
    } catch (error) {
      lastError = error;
      if (error.$metadata?.httpStatusCode === 404) {
        try {
          await client.send(
            new CreateBucketCommand({ Bucket: process.env.S3_BUCKET }),
          );
          return;
        } catch (createError) {
          lastError = createError;
        }
      }
    }
    await Bun.sleep(500);
  }
  throw lastError ?? new Error("The isolated S3 service did not become ready.");
}

try {
  await waitForApp();
  if (process.env.FAMILY_TREE_TEST_LIVE_S3 === "1") {
    if (process.env.S3_BUCKET !== "family-tree-test")
      throw new Error("Use the isolated family-tree-test bucket.");
    const client = new S3Client({
      region: "us-east-1",
      endpoint: process.env.S3_ENDPOINT,
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
      },
    });
    await ensureTestBucket(client);
  }
  const env = {
    ...process.env,
    DATABASE_URL: process.env.FAMILY_TREE_TEST_DATABASE_URL,
    FAMILY_TREE_TEST_APP_URL: appUrl,
    FAMILY_TREE_TEST_ACTION_MANIFEST:
      ".next/dev/server/server-reference-manifest.json",
  };
  const tests = Bun.spawn(
    [
      process.execPath,
      "test",
      "--timeout",
      "90000",
      "tests/account-routes.test.ts",
      "tests/tree-isolation.test.ts",
      "tests/secondary-tree-isolation.test.ts",
      "tests/data-tools-isolation.test.ts",
      "tests/discovery.test.ts",
    ],
    {
      env,
      stdout: "inherit",
      stderr: "inherit",
    },
  );
  process.exitCode = await tests.exited;
  if (!process.exitCode && process.argv.includes("--gate")) {
    process.exitCode = await Bun.spawn(["sh", "scripts/verify-tree-scope.sh"], {
      env,
      stdout: "inherit",
      stderr: "inherit",
    }).exited;
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  app.kill();
  await app.exited;
  if (process.exitCode) console.error((await logs).join("\n"));
}
