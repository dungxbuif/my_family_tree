export const backupFileLimit = 8 * 1024 * 1024;
export const backupSizeMessage = "Tệp phục hồi vượt quá giới hạn 8 MiB.";
export class BackupTooLarge extends Error {
  constructor() {
    super(backupSizeMessage);
  }
}
