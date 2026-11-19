import JSZip from "jszip";
import {
  backupFileLimit,
  BackupTooLarge,
  checkBackupSize,
} from "./family/backup-limit";
import Papa from "papaparse";
import type { Backup } from "./family/backup-format";

const tables = [
  "persons",
  "relationships",
  "person_details_private",
  "custom_events",
  "gallery_items",
] as const;
const typedFields = new Set([
  "birth_year",
  "birth_month",
  "birth_day",
  "death_year",
  "death_month",
  "death_day",
  "death_lunar_year",
  "death_lunar_month",
  "death_lunar_day",
  "generation",
  "birth_order",
  "is_deceased",
  "is_in_law",
]);
export async function exportToCsvZip(
  data: Pick<Backup, (typeof tables)[number]>,
) {
  const zip = new JSZip();
  const manifest = JSON.stringify({
    version: 4,
    textEscaping: "apostrophe-v1",
  });
  let expandedBytes = new Blob([manifest]).size;
  zip.file("manifest.json", manifest);
  for (const table of tables) {
    const rows = data[table].map((row) =>
      Object.fromEntries(
        Object.entries(row).map(([key, value]) => [
          key,
          typeof value === "string" &&
          /^(?:'|[\t\r\n]|\s*[=+@＝＋＠－-])/.test(value)
            ? "'" + value
            : value,
        ]),
      ),
    );
    const csv = "\uFEFF" + Papa.unparse(rows);
    expandedBytes += new Blob([csv]).size;
    checkBackupSize(expandedBytes);
    zip.file(table + ".csv", csv);
  }
  const file = await zip.generateAsync({ type: "blob" });
  checkBackupSize(file.size);
  return file;
}
export async function parseCsvZip(file: Blob) {
  checkBackupSize(file.size);
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  let remaining = backupFileLimit;
  // JSZip exposes a chunk stream on loaded entries. Bound the actual expanded
  // bytes across all five tables and the manifest before creating CSV strings.
  function read(entry: JSZip.JSZipObject) {
    const stream = (
      entry as JSZip.JSZipObject & {
        internalStream(type: "uint8array"): JSZip.JSZipStreamHelper<Uint8Array>;
      }
    ).internalStream("uint8array");
    return new Promise<string>((resolve, reject) => {
      const decoder = new TextDecoder(),
        pieces: string[] = [];
      stream
        .on("data", (bytes) => {
          remaining -= bytes.length;
          if (remaining < 0) {
            stream.pause();
            reject(new BackupTooLarge());
            return;
          }
          pieces.push(decoder.decode(bytes, { stream: true }));
        })
        .on("error", reject)
        .on("end", () => resolve(pieces.join("") + decoder.decode()))
        .resume();
    });
  }
  const manifest = zip.file("manifest.json");
  const metadata = manifest ? JSON.parse(await read(manifest)) : undefined;
  const version = manifest ? metadata.version : 3;
  if (manifest && version !== 4)
    throw Error("Phiên bản CSV không được hỗ trợ.");
  const result: Record<string, unknown> = { version };
  for (const table of tables) {
    const entry = zip.file(table + ".csv");
    if (!entry) {
      if (manifest || table === "persons" || table === "relationships")
        throw Error("Thiếu " + table + ".csv trong bản sao lưu.");
      continue;
    }
    const raw = (await read(entry)).replace(/^\uFEFF/, "");
    if (!raw.trim()) {
      result[table] = [];
      continue;
    }
    const rows = Papa.parse(raw, {
      header: true,
      delimiter: ",",
      skipEmptyLines: true,
      dynamicTyping: (field) =>
        typeof field === "string" &&
        table === "persons" &&
        typedFields.has(field),
      transform: (value) =>
        value === ""
          ? null
          : metadata?.textEscaping === "apostrophe-v1" && value.startsWith("'")
            ? value.slice(1)
            : value,
    });
    if (rows.errors.length)
      throw Error("Dữ liệu CSV không hợp lệ trong " + table + ".csv.");
    result[table] = rows.data;
  }
  return result;
}
