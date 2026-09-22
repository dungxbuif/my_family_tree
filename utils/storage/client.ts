export async function uploadImage(file: File, folder: "avatars" | "gallery") {
  const response = await fetch("/api/uploads/presign", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ folder, fileName: file.name, contentType: file.type, size: file.size }) });
  const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "Không thể chuẩn bị upload.");
  const put = await fetch(payload.uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file }); if (!put.ok) throw new Error("Không thể tải ảnh lên S3."); return payload.publicUrl as string;
}
