import { getBrowserTreeSelection } from "./browser-tree-selection";
import { isTreeRole, manageTreeAccess, readTreeAccess, type AccessCommand, type AccessResult } from "./tree-membership";

export async function currentOwnerAccess(userId: string, expected?: string) {
  const { current } = await getBrowserTreeSelection(userId);
  if (!current || current.role !== "owner" || (expected !== undefined && current.id !== expected)) return null;
  const snapshot = await readTreeAccess(userId, current.id);
  return snapshot && { tree: current, ...snapshot };
}

export type AccessNotice = AccessResult | { code: "UNCERTAIN" | "CONFIRM" };
export type AccessDraft = { email: string; role: string; personId: string };
export function readAccessDraft(fields: FormData): AccessDraft {
  const field = (name: string) => {
    const value = fields.get(name);
    return typeof value === "string" ? value.slice(0, 512) : "";
  };
  return { email: field("email"), role: field("role"), personId: field("personId") };
}

export async function changeBrowserAccess(userId: string, fields: FormData): Promise<AccessNotice> {
  const treeId = fields.get("treeId");
  const { current } = await getBrowserTreeSelection(userId);
  if (!current || current.role !== "owner" || current.id !== treeId) return { code: "FORBIDDEN" };
  const operation = fields.get("operation"), email = fields.get("email"), personId = fields.get("personId");
  const target = fields.get("userId"), role = fields.get("role") ?? "viewer";
  let command: AccessCommand;
  if (operation === "add" && typeof email === "string" && isTreeRole(role)) command = { operation, email, role };
  else if (operation === "link" && typeof email === "string" && typeof personId === "string") command = { operation, email, personId };
  else if (operation === "role" && isTreeRole(role) && typeof target === "string" && fields.has("role")) command = { operation, userId: target, role };
  else if (operation === "remove" && typeof target === "string") command = { operation, userId: target };
  else if (operation === "unlink" && typeof target === "string" && typeof personId === "string") command = { operation, userId: target, personId };
  else return { code: "UNAVAILABLE" };
  if ((operation === "remove" || operation === "unlink") && fields.get("confirm") !== "yes") return { code: "CONFIRM" };
  return manageTreeAccess(userId, treeId, command);
}
