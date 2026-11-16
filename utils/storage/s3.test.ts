import { expect, test } from "bun:test";
import { buildObjectKey, presignUpload, validateUpload } from "./s3";

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
