import { createHash } from "node:crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import {
  closeSync,
  constants,
  fstatSync,
  openSync,
  readFileSync,
} from "node:fs";

export type UploadFolder = "avatars" | "gallery";
const maxBytes = 10 * 1024 * 1024;
const types: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

function credential(name: "S3_ACCESS_KEY_ID" | "S3_SECRET_ACCESS_KEY") {
  const file = process.env[`${name}_FILE`];
  if (file === undefined) return process.env[name];
  let descriptor: number | undefined;
  try {
    descriptor = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    const info = fstatSync(descriptor);
    if (!info.isFile() || info.size < 1 || info.size > 65536) throw new Error();
    const value = readFileSync(descriptor, "utf8").trim();
    if (!value) throw new Error();
    return value;
  } catch {
    throw new Error(`Không đọc được secret ${name}.`);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function config() {
  const { S3_ENDPOINT, S3_BUCKET } = process.env;
  const S3_ACCESS_KEY_ID = credential("S3_ACCESS_KEY_ID");
  const S3_SECRET_ACCESS_KEY = credential("S3_SECRET_ACCESS_KEY");
  if (!S3_ENDPOINT || !S3_BUCKET || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY)
    throw new Error("S3 chưa được cấu hình.");
  return {
    bucket: S3_BUCKET,
    prefix: process.env.S3_PREFIX || "",
    client: new S3Client({
      endpoint: S3_ENDPOINT,
      region: process.env.S3_REGION || "us-east-1",
      forcePathStyle: true,
      credentials: {
        accessKeyId: S3_ACCESS_KEY_ID,
        secretAccessKey: S3_SECRET_ACCESS_KEY,
      },
    }),
  };
}

export function validateUpload(
  folder: string,
  _name: string,
  type: string,
  size: number,
): asserts folder is UploadFolder {
  if (
    (folder !== "avatars" && folder !== "gallery") ||
    typeof type !== "string" ||
    !Object.hasOwn(types, type)
  )
    throw new Error("Loại tệp không được hỗ trợ.");
  if (!Number.isSafeInteger(size) || size < 1 || size > maxBytes)
    throw new Error("Ảnh phải nhỏ hơn hoặc bằng 10 MiB.");
}

export type UploadIdentity = {
  actorId: string;
  treeId: string;
  submissionId: string;
  sha256: string;
};

export async function presignUpload(
  folder: UploadFolder,
  name: string,
  type: string,
  size: number,
  upload: UploadIdentity,
) {
  validateUpload(folder, name, type, size);
  const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
  if (
    ![upload.actorId, upload.treeId, upload.submissionId].every(
      (id) => typeof id === "string" && uuid.test(id),
    ) ||
    typeof upload.sha256 !== "string" ||
    !/^[0-9a-f]{64}$/.test(upload.sha256)
  )
    throw new Error("Định danh ảnh không hợp lệ.");
  const scope = [
    upload.actorId,
    upload.treeId,
    upload.submissionId,
    upload.sha256,
    type,
  ];
  const identity = createHash("sha256")
    .update(JSON.stringify(scope))
    .digest("hex");
  const { bucket, prefix, client } = config();
  const key = [
    prefix.replace(/^\/+|\/+$/g, ""),
    "trees",
    upload.treeId,
    folder,
    identity + types[type],
  ]
    .filter(Boolean)
    .join("/");
  const put = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: type,
    ContentLength: size,
    ChecksumSHA256: Buffer.from(upload.sha256, "hex").toString("base64"),
  });
  const uploadUrl = await getSignedUrl(client, put, {
    expiresIn: 300,
    signableHeaders: new Set(["content-type", "content-length"]),
  });
  return { key, publicUrl: `/api/storage/${key}`, uploadUrl };
}

// Callers pass only object URLs obtained from the tree_media ownership table.
function objectKey(url: string) {
  if (!url.startsWith("/api/storage/")) throw new Error("Ảnh không hợp lệ.");
  return url.slice("/api/storage/".length);
}
export async function requireUploadedImage(url: string) {
  const { bucket, client } = config();
  const result = await client.send(
    new HeadObjectCommand({ Bucket: bucket, Key: objectKey(url) }),
  );
  if (
    !result.ContentLength ||
    result.ContentLength > maxBytes ||
    !result.ContentType ||
    !Object.hasOwn(types, result.ContentType) ||
    !url.endsWith(types[result.ContentType])
  )
    throw new Error("Ảnh không hợp lệ.");
}
export async function readObject(url: string, range?: string) {
  const { bucket, client } = config();
  const result = await client.send(
    new GetObjectCommand({ Bucket: bucket, Key: objectKey(url), Range: range }),
  );
  const contentType =
    Object.keys(types).find((type) => url.endsWith(types[type])) ??
    (url.endsWith(".jpeg") ? "image/jpeg" : undefined);
  if (
    !contentType ||
    result.ContentLength === undefined ||
    result.ContentLength > maxBytes ||
    !result.Body
  ) {
    result.Body?.transformToWebStream()
      .cancel()
      .catch(() => {});
    throw new Error("Ảnh không hợp lệ.");
  }
  return {
    body: await result.Body.transformToByteArray(),
    contentType,
    contentRange: result.ContentRange,
  };
}
export async function deleteObject(url: string) {
  const { bucket, client } = config();
  await client.send(
    new DeleteObjectCommand({ Bucket: bucket, Key: objectKey(url) }),
  );
}
