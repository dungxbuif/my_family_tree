import { expect, test } from "bun:test";
import { presignUpload as signUpload, validateUpload, type UploadFolder, type UploadIdentity } from "./s3";
import { mkdtempSync, rmSync, writeFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Low-level signer tests use the supplied URL as their registered generation.
function presignUpload(folder: UploadFolder, name: string, type: string, size: number, identity: UploadIdentity) {
  return signUpload(folder, name, type, size, identity, async url => url);
}

const upload = { actorId: crypto.randomUUID(), treeId: crypto.randomUUID(),
  submissionId: crypto.randomUUID(), sha256: "5a".repeat(32) };

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
      128, upload,
    );

    expect(result.publicUrl).toMatch(
      new RegExp("^/api/storage/family-tree/trees/" + upload.treeId + "/gallery/[a-f0-9]{64}[.]png$"),
    );
    expect(result.uploadUrl).toContain("X-Amz-Algorithm");


    const avatar = () => presignUpload("avatars", "a.png", "image/png", 128, upload);
    const first = await avatar();
    expect((await avatar()).publicUrl).toBe(first.publicUrl);
    expect(new URL(first.uploadUrl).searchParams.get("X-Amz-SignedHeaders")).toContain("content-type");
    expect(new URL(first.uploadUrl).searchParams.get("x-amz-checksum-sha256")).toBe(Buffer.from(upload.sha256,"hex").toString("base64"));
    for (const changed of [{ treeId:crypto.randomUUID() }, { actorId:crypto.randomUUID() }, { submissionId:crypto.randomUUID() }, { sha256:"b0".repeat(32) }]) {
      expect((await presignUpload("avatars","a.png","image/png",128,{...upload,...changed})).key).not.toBe(first.key);
    }
    await expect(presignUpload("avatars","a.png","image/png",128,{...upload,sha256:"bad"})).rejects.toThrow();
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
    const result = await presignUpload("avatars", "photo.png", "image/png", 128, upload);
    expect(new URL(result.uploadUrl).searchParams.get("X-Amz-Credential")).toStartWith("dedicated-access/");

    for (const invalid of ["", join(folder, "missing"), folder]) {
      process.env.S3_SECRET_ACCESS_KEY_FILE = invalid;
      await expect(presignUpload("avatars", "photo.png", "image/png", 128, upload)).rejects.toThrow("Không đọc được secret S3_SECRET_ACCESS_KEY.");
    }
    process.env.S3_SECRET_ACCESS_KEY_FILE = secret;
    writeFileSync(secret, " \n");
    await expect(presignUpload("avatars", "photo.png", "image/png", 128, upload)).rejects.toThrow("Không đọc được secret S3_SECRET_ACCESS_KEY.");
    writeFileSync(secret, "x".repeat(65537));
    await expect(presignUpload("avatars", "photo.png", "image/png", 128, upload)).rejects.toThrow("Không đọc được secret S3_SECRET_ACCESS_KEY.");
    const link = join(folder, "link");
    symlinkSync(access, link);
    process.env.S3_SECRET_ACCESS_KEY_FILE = link;
    await expect(presignUpload("avatars", "photo.png", "image/png", 128, upload)).rejects.toThrow("Không đọc được secret S3_SECRET_ACCESS_KEY.");
  } finally {
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
    rmSync(folder, { recursive: true, force: true });
  }
});
