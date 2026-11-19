import { randomUUID } from "node:crypto";
import { AgentError } from "./contract";
import {
  agentError,
  runFamilyCommand,
  type FamilyAction,
} from "./family-service";

const headers = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
};
export function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers });
}
export function failure(error: unknown) {
  const { status, code, message } = agentError(error);
  const response = json({ code, message, requestId: randomUUID() }, status);
  if (status === 401) response.headers.set("WWW-Authenticate", "Bearer");
  return response;
}
export async function readObject(
  request: Request,
): Promise<Record<string, unknown>> {
  const limit = 64 * 1024;
  if (
    request.headers.get("content-type")?.split(";")[0].trim() !==
      "application/json" ||
    Number(request.headers.get("content-length")) > limit
  )
    throw new AgentError("INVALID_INPUT");
  const reader = request.body?.getReader();
  if (!reader) throw new AgentError("INVALID_INPUT");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        void reader.cancel().catch(() => {});
        throw new AgentError("INVALID_INPUT");
      }
      chunks.push(value);
    }
    const obj: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!obj || typeof obj !== "object" || Array.isArray(obj))
      throw new AgentError("INVALID_INPUT");
    return obj as Record<string, unknown>;
  } catch {
    throw new AgentError("INVALID_INPUT");
  } finally {
    reader.releaseLock();
  }
}
export function bearer(request: Request) {
  const forwarded = request.headers.get("x-forwarded-proto");
  // Next's request URL can itself derive from forwarded headers. Deploy the app
  // behind an ingress that overwrites this header before enabling proxy trust.
  if (
    process.env.NODE_ENV === "production" &&
    !(forwarded === null
      ? new URL(request.url).protocol === "https:"
      : process.env.AGENT_TRUST_TLS_PROXY === "1" && forwarded === "https")
  )
    throw new AgentError("UNAUTHORIZED");
  const match = /^Bearer (gptree_[a-f0-9]{24}_[A-Za-z0-9_-]{43})$/i.exec(
    request.headers.get("authorization") ?? "",
  );
  if (!match) throw new AgentError("UNAUTHORIZED");
  return match[1];
}
export async function rest(
  request: Request,
  action: FamilyAction,
  id?: string,
) {
  try {
    const token = bearer(request);
    const params = new URL(request.url).searchParams;
    // Decode outside the transaction so a slow client cannot hold database locks.
    // Input errors are handled inside the authenticated command.
    const body =
      action === "create_person" || action === "update_person"
        ? await readObject(request).catch(() => null)
        : undefined;
    const response = await runFamilyCommand(token, "rest", {
      action,
      id,
      familyTreeId: params.get("familyTreeId"),
      limit: params.get("limit"),
      offset: params.get("offset"),
      body,
    });
    return json(response, action === "create_person" ? 201 : 200);
  } catch (error) {
    return failure(error);
  }
}
