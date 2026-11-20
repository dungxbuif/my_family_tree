export const backupLimitMiB = 32;
export const backupFileLimit = backupLimitMiB * 1024 * 1024;
export const backupSizeMessage = `Tệp sao lưu vượt quá giới hạn ${backupLimitMiB} MiB. Yêu cầu quản trị viên sao lưu PostgreSQL và kho ảnh theo quy trình vận hành.`;
export class BackupTooLarge extends Error {
  constructor() {
    super(backupSizeMessage);
  }
}

export function checkBackupSize(bytes: number) {
  if (bytes > backupFileLimit) throw new BackupTooLarge();
}
