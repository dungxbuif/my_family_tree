import type { Backup } from "./backup-format";
import { checkBackupSize } from "./backup-limit";

export async function createBackupFile(
  data: Backup,
  format: "json" | "csv" | "ged",
) {
  if (format === "csv") return (await import("../csv")).exportToCsvZip(data);
  const blob =
    format === "ged"
      ? new Blob([(await import("../gedcom")).exportToGedcom(data)], {
          type: "text/plain",
        })
      : new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  checkBackupSize(blob.size);
  return blob;
}
