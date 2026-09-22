import { randomBytes } from "crypto";
import { promises as fs } from "fs";
import path from "path";

const uploadRoot = process.env.UPLOAD_DIR || "uploads";
const resolvedUploadRoot = path.resolve(uploadRoot);

function safeExt(fileName: string) {
  const ext = path.extname(fileName).toLowerCase().replace(/[^a-z0-9.]/g, "");
  return ext || ".bin";
}

export async function saveUpload(
  file: File,
  folder: "avatars" | "gallery",
  preferredName?: string,
) {
  const buffer = Buffer.from(await file.arrayBuffer());
  const dir = path.join(resolvedUploadRoot, folder);
  await fs.mkdir(dir, { recursive: true });

  const baseName =
    preferredName?.replace(/[^a-zA-Z0-9._-]/g, "-") ||
    `${Date.now()}-${randomBytes(8).toString("hex")}${safeExt(file.name)}`;
  const filePath = path.join(dir, baseName);
  await fs.writeFile(filePath, buffer);

  return `/api/storage/${folder}/${baseName}`;
}

export async function deleteUpload(publicUrl: string | null | undefined) {
  if (!publicUrl?.startsWith("/api/storage/")) return;
  const relative = publicUrl.replace(/^\/api\/storage\//, "");
  const filePath = path.resolve(resolvedUploadRoot, relative);
  if (!filePath.startsWith(resolvedUploadRoot + path.sep)) return;
  await fs.rm(filePath, { force: true });
}
