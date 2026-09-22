import { DeleteObjectCommand, GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PutObjectCommand } from "@aws-sdk/client-s3";

export type UploadFolder = "avatars" | "gallery";
const maxBytes = 10 * 1024 * 1024;
const types: Record<string, string> = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif" };

function config() {
  const { S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY } = process.env;
  if (!S3_ENDPOINT || !S3_BUCKET || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) throw new Error("S3 chưa được cấu hình.");
  return { bucket: S3_BUCKET, prefix: process.env.S3_PREFIX || "", client: new S3Client({ endpoint: S3_ENDPOINT, region: process.env.S3_REGION || "us-east-1", forcePathStyle: true, credentials: { accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY } }) };
}

export function validateUpload(folder: string, _name: string, type: string, size: number): asserts folder is UploadFolder {
  if ((folder !== "avatars" && folder !== "gallery") || !types[type]) throw new Error("Loại tệp không được hỗ trợ.");
  if (!Number.isFinite(size) || size < 1 || size > maxBytes) throw new Error("Ảnh phải nhỏ hơn hoặc bằng 10 MiB.");
}

export function buildObjectKey(folder: UploadFolder, _name: string, type: string, id: string) { return `${folder}/${id}${types[type]}`; }
export async function presignUpload(folder: UploadFolder, name: string, type: string, size: number) {
  validateUpload(folder, name, type, size); const { bucket, prefix, client } = config(); const key = [prefix.replace(/^\/+|\/+$/g, ""), buildObjectKey(folder, name, type, crypto.randomUUID())].filter(Boolean).join("/");
  return { key, publicUrl: `/api/storage/${key}`, uploadUrl: await getSignedUrl(client, new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: type, ContentLength: size }), { expiresIn: 300 }) };
}
export async function readObject(key: string) { const { bucket, client } = config(); const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key })); return { body: Buffer.from(await result.Body!.transformToByteArray()), contentType: result.ContentType || "application/octet-stream" }; }
export async function deleteObject(publicUrl: string | null | undefined) { if (!publicUrl?.startsWith("/api/storage/")) return; const key = publicUrl.slice("/api/storage/".length); if (!/^(family-tree\/)?((avatars)|(gallery))\/[0-9a-f-]+\.(jpg|png|webp|gif)$/.test(key)) return; const { bucket, client } = config(); await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })); }
