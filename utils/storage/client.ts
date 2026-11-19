export async function uploadImage(
  file: File,
  folder: "avatars" | "gallery",
  avatar?: { treeId: string; submissionId: string },
) {
  if (file.size < 1 || file.size > 10 * 1024 * 1024)
    throw new Error("Ảnh phải nhỏ hơn hoặc bằng 10 MiB.");
  let sha256: string | undefined;
  if (avatar) {
    const digest = await crypto.subtle.digest(
      "SHA-256",
      await file.arrayBuffer(),
    );
    sha256 = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
  }
  const response = await fetch("/api/uploads/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      folder,
      fileName: file.name,
      contentType: file.type,
      size: file.size,
      ...avatar,
      sha256,
    }),
  });
  const payload = await response.json();
  if (!response.ok)
    throw new Error(payload.error || "Không thể chuẩn bị upload.");
  const put = await fetch(payload.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!put.ok) throw new Error("Không thể tải ảnh lên S3.");
  return payload.publicUrl as string;
}
