import JSZip from "jszip";
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
  zip.file("manifest.json", JSON.stringify({ version: 4 }));
  for (const table of tables)
    zip.file(table + ".csv", "\uFEFF" + Papa.unparse<object>(data[table]));
  return zip.generateAsync({ type: "blob" });
}
export async function parseCsvZip(file: Blob) {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const manifest = zip.file("manifest.json");
  const version = manifest
    ? JSON.parse(await manifest.async("text")).version
    : 3;
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
    const raw = (await entry.async("text")).replace(/^\uFEFF/, "");
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
      transform: (value) => (value === "" ? null : value),
    });
    if (rows.errors.length)
      throw Error("Dữ liệu CSV không hợp lệ trong " + table + ".csv.");
    result[table] = rows.data;
  }
  return result;
}
