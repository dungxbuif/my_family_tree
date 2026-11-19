import { revalidatePath } from "next/cache";
import { currentBackupOwner } from "@/utils/family/browser";
import { FamilyDataError } from "@/utils/family/records";
import { backupFileLimit, BackupTooLarge } from "@/utils/family/backup-limit";
import { parseCsvZip } from "@/utils/csv";
import { parseGedcom } from "@/utils/gedcom";

async function readForm(request: Request) {
  const limit = backupFileLimit + 64 * 1024;
  if (Number(request.headers.get("content-length")) > limit)
    throw new BackupTooLarge();
  const reader = request.body?.getReader();
  if (!reader) throw Error();
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) {
        void reader.cancel().catch(() => {});
        throw new BackupTooLarge();
      }
      chunks.push(new Uint8Array(value));
    }
  } finally {
    reader.releaseLock();
  }
  return new Response(new Blob(chunks), {
    headers: { "Content-Type": request.headers.get("content-type") ?? "" },
  }).formData();
}

export async function POST(request: Request) {
  const wantsJson = request.headers.get("accept")?.includes("application/json");
  const headers = { "Cache-Control": "private, no-store" };
  function fail(status: number, code: string, error: string) {
    if (wantsJson) return Response.json({ code, error }, { status, headers });
    const escaped = error
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
    return new Response(
      `<!doctype html><html lang="vi"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Phục hồi dữ liệu</title><main><h1>Phục hồi dữ liệu</h1><p role="alert">${escaped}</p><a href="/dashboard/data">Chọn lại tệp phục hồi</a></main></html>`,
      {
        status,
        headers: { ...headers, "Content-Type": "text/html; charset=utf-8" },
      },
    );
  }
  const origin = request.headers.get("origin");
  const url = new URL(request.url);
  const directOrigin = url.protocol + "//" + request.headers.get("host");
  if (
    !origin ||
    origin === "null" ||
    (origin !== directOrigin &&
      request.headers.get("sec-fetch-site") !== "same-origin")
  )
    return fail(403, "FORBIDDEN", "Từ chối truy cập.");
  const treeId = url.searchParams.get("tree");
  let family;
  try {
    family = await currentBackupOwner(treeId);
  } catch {
    return fail(403, "FORBIDDEN", "Từ chối truy cập.");
  }
  try {
    const form = await readForm(request);
    const file = form.get("backup");
    if (form.get("confirmed") !== "replace" || !(file instanceof File))
      return fail(
        400,
        "INVALID_BACKUP",
        "Vui lòng chọn tệp và xác nhận thay thế.",
      );
    if (file.size > backupFileLimit) throw new BackupTooLarge();
    const name = file.name.toLowerCase();
    let data: unknown;
    if (name.endsWith(".zip")) data = await parseCsvZip(file);
    else if (name.endsWith(".ged"))
      data = { version: 1, ...parseGedcom(await file.text()) };
    else if (name.endsWith(".json")) data = JSON.parse(await file.text());
    else
      return fail(
        400,
        "INVALID_BACKUP",
        "Vui lòng chọn tệp JSON, GEDCOM hoặc ZIP.",
      );
    const imported = await family.importBackup(data);
    revalidatePath("/dashboard", "layout");
    if (wantsJson)
      return Response.json({ success: true, imported }, { headers });
    return new Response(null, {
      status: 303,
      headers: {
        ...headers,
        Location:
          "/dashboard/data?restored=" +
          imported.persons +
          "&relationships=" +
          imported.relationships,
      },
    });
  } catch (error) {
    if (error instanceof BackupTooLarge)
      return fail(413, "BACKUP_TOO_LARGE", error.message);
    if (
      error instanceof FamilyDataError &&
      error.message === "Từ chối truy cập."
    )
      return fail(403, "FORBIDDEN", error.message);
    return fail(
      400,
      "INVALID_BACKUP",
      error instanceof FamilyDataError
        ? error.message
        : "Không thể đọc tệp phục hồi. Vui lòng kiểm tra định dạng.",
    );
  }
}
