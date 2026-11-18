import { expect, test } from "bun:test";
import { buildObjectKey, presignUpload, validateUpload } from "./s3";
import { mkdtempSync, rmSync, writeFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("creates a safe avatar key from a permitted image", () => {
  expect(
    buildObjectKey("avatars", "Portrait.JPG", "image/jpeg", "abc123"),
  ).toBe("avatars/abc123.jpg");
});

test("rejects uploads larger than 10 MiB", () => {
  expect(() =>
    validateUpload("gallery", "family.png", "image/png", 10 * 1024 * 1024 + 1),
  ).toThrow("10 MiB");
});

test("rejects non-image upload paths", () => {
  expect(() => validateUpload("other", "note.txt", "text/plain", 1)).toThrow(
    "Loại tệp",
  );
});

test("keeps uploaded objects private behind the app storage proxy", async () => {
  const previous = {
    endpoint: process.env.S3_ENDPOINT,
    bucket: process.env.S3_BUCKET,
    prefix: process.env.S3_PREFIX,
    accessKey: process.env.S3_ACCESS_KEY_ID,
    secretKey: process.env.S3_SECRET_ACCESS_KEY,
  };

  process.env.S3_ENDPOINT = "http://rustfs.test:9000";
  process.env.S3_BUCKET = "family-tree";
  process.env.S3_PREFIX = "family-tree";
  process.env.S3_ACCESS_KEY_ID = "test-access";
  process.env.S3_SECRET_ACCESS_KEY = "test-secret";

  try {
    const result = await presignUpload(
      "gallery",
      "family photo.png",
      "image/png",
      128,
    );

    expect(result.publicUrl).toMatch(
      /^\/api\/storage\/family-tree\/gallery\/[0-9a-f-]+\.png$/,
    );
    expect(result.uploadUrl).toContain("X-Amz-Algorithm");
  } finally {
    if (previous.endpoint === undefined) delete process.env.S3_ENDPOINT;
    else process.env.S3_ENDPOINT = previous.endpoint;
    if (previous.bucket === undefined) delete process.env.S3_BUCKET;
    else process.env.S3_BUCKET = previous.bucket;
    if (previous.prefix === undefined) delete process.env.S3_PREFIX;
    else process.env.S3_PREFIX = previous.prefix;
    if (previous.accessKey === undefined) delete process.env.S3_ACCESS_KEY_ID;
    else process.env.S3_ACCESS_KEY_ID = previous.accessKey;
    if (previous.secretKey === undefined)
      delete process.env.S3_SECRET_ACCESS_KEY;
    else process.env.S3_SECRET_ACCESS_KEY = previous.secretKey;
  }
});

test("uses Swarm secret files before direct environment credentials", async () => {
  const folder = mkdtempSync(join(tmpdir(), "family-s3-secret-"));
  const names = ["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_ACCESS_KEY_ID_FILE", "S3_SECRET_ACCESS_KEY_FILE"];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  try {
    process.env.S3_ENDPOINT = "http://rustfs.test:9000";
    process.env.S3_BUCKET = "family-tree";
    process.env.S3_ACCESS_KEY_ID = "legacy-access";
    process.env.S3_SECRET_ACCESS_KEY = "legacy-secret";
    const access = join(folder, "access");
    const secret = join(folder, "secret");
    writeFileSync(access, "dedicated-access\n", { mode: 0o600 });
    writeFileSync(secret, "dedicated-secret\n", { mode: 0o600 });
    process.env.S3_ACCESS_KEY_ID_FILE = access;
    process.env.S3_SECRET_ACCESS_KEY_FILE = secret;
    const result = await presignUpload("avatars", "photo.png", "image/png", 128);
    expect(new URL(result.uploadUrl).searchParams.get("X-Amz-Credential")).toStartWith("dedicated-access/");

    for (const invalid of ["", join(folder, "missing"), folder]) {
      process.env.S3_SECRET_ACCESS_KEY_FILE = invalid;
      await expect(presignUpload("avatars", "photo.png", "image/png", 128)).rejects.toThrow("Không đọc được secret S3_SECRET_ACCESS_KEY.");
    }
    process.env.S3_SECRET_ACCESS_KEY_FILE = secret;
    writeFileSync(secret, " \n");
    await expect(presignUpload("avatars", "photo.png", "image/png", 128)).rejects.toThrow("Không đọc được secret S3_SECRET_ACCESS_KEY.");
    writeFileSync(secret, "x".repeat(65537));
    await expect(presignUpload("avatars", "photo.png", "image/png", 128)).rejects.toThrow("Không đọc được secret S3_SECRET_ACCESS_KEY.");
    const link = join(folder, "link");
    symlinkSync(access, link);
    process.env.S3_SECRET_ACCESS_KEY_FILE = link;
    await expect(presignUpload("avatars", "photo.png", "image/png", 128)).rejects.toThrow("Không đọc được secret S3_SECRET_ACCESS_KEY.");
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
    rmSync(folder, { recursive: true, force: true });
  }
});
