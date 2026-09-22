import { expect, test } from "bun:test";
import { buildObjectKey, validateUpload } from "./s3";

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
