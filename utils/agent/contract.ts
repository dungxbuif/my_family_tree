export const scopes = ["read", "write", "private", "delete"] as const;
export type Scope = (typeof scopes)[number];
export type CredentialSummary = {
  id: string;
  name: string;
  public_prefix: string;
  scopes: Scope[];
  expires_at: string | null;
  revoked_at: string | null;
  last_used_at: string | null;
  created_at: string;
};
export const credentialPageSize = 20;
export type CredentialPage = {
  credentials: CredentialSummary[];
  nextCursor: string | null;
};
const errors = {
  INVALID_INPUT: [400, "Dữ liệu không hợp lệ."],
  UNAUTHORIZED: [401, "Thông tin xác thực không hợp lệ hoặc đã hết hiệu lực."],
  FORBIDDEN: [403, "Từ chối truy cập."],
  NOT_FOUND: [404, "Không tìm thấy tài nguyên."],
  CONFLICT: [409, "Dữ liệu xung đột với hồ sơ hiện tại."],
  INTERNAL_ERROR: [500, "Không thể hoàn tất yêu cầu."],
} as const;
export class AgentError extends Error {
  constructor(
    readonly code: keyof typeof errors,
    message: string = errors[code][1],
  ) {
    super(message);
  }
  get status() {
    return errors[this.code][0];
  }
}
