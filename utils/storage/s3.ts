import { createHash } from "node:crypto";
import { DeleteObjectCommand, GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { closeSync, constants, fstatSync, openSync, readFileSync } from "node:fs";

export type UploadFolder = "avatars" | "gallery";
const maxBytes = 10 * 1024 * 1024;
const types: Record<string, string> = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif" };

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
  if (!S3_ENDPOINT || !S3_BUCKET || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) throw new Error("S3 chưa được cấu hình.");
  return { bucket: S3_BUCKET, prefix: process.env.S3_PREFIX || "", client: new S3Client({ endpoint: S3_ENDPOINT, region: process.env.S3_REGION || "us-east-1", forcePathStyle: true, credentials: { accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY } }) };
}

export function validateUpload(folder: string, _name: string, type: string, size: number): asserts folder is UploadFolder {
  if ((folder !== "avatars" && folder !== "gallery") || typeof type !== "string" || !Object.hasOwn(types, type)) throw new Error("Loại tệp không được hỗ trợ.");
  if (!Number.isSafeInteger(size) || size < 1 || size > maxBytes) throw new Error("Ảnh phải nhỏ hơn hoặc bằng 10 MiB.");
}

export function buildObjectKey(folder: UploadFolder, _name: string, type: string, id: string) { return `${folder}/${id}${types[type]}`; }
type AvatarUpload = { actorId: string; treeId: string; submissionId: string; sha256: string };
export async function presignUpload(folder: UploadFolder, name: string, type: string, size: number, avatar?: AvatarUpload) {
  validateUpload(folder, name, type, size);
  let identity: string;
  let checksum: string | undefined;
  if (avatar) {
    const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
    if (folder !== "avatars" || !uuid.test(avatar.submissionId) || !/^[0-9a-f]{64}$/.test(avatar.sha256))
      throw new Error("Định danh ảnh không hợp lệ.");
    const scope = [avatar.actorId, avatar.treeId, avatar.submissionId, avatar.sha256, type];
    identity = createHash("sha256").update(JSON.stringify(scope)).digest("hex");
    checksum = Buffer.from(avatar.sha256, "hex").toString("base64");
  } else {
    identity = crypto.randomUUID();
  }
  const { bucket, prefix, client } = config();
  const key = [prefix.replace(/^\/+|\/+$/g, ""), buildObjectKey(folder, name, type, identity)].filter(Boolean).join("/");
  const put = new PutObjectCommand({
    Bucket: bucket, Key: key, ContentType: type, ContentLength: size, ChecksumSHA256: checksum,
  });
  const uploadUrl = await getSignedUrl(client, put, { expiresIn: 300, signableHeaders: new Set(["content-type"]) });
  return { key, publicUrl: `/api/storage/${key}`, uploadUrl };
}
export async function readObject(key: string) { const { bucket, client } = config(); const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key })); return { body: Buffer.from(await result.Body!.transformToByteArray()), contentType: result.ContentType || "application/octet-stream" }; }
export async function deleteObject(publicUrl: string | null | undefined) { if (!publicUrl?.startsWith("/api/storage/")) return; const key = publicUrl.slice("/api/storage/".length); if (!/^(family-tree\/)?((avatars)|(gallery))\/[0-9a-f-]+\.(jpg|png|webp|gif)$/.test(key)) return; const { bucket, client } = config(); await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })); }
