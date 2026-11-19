import { getSessionToken, getUser } from "@/utils/auth/session";
import { changeBrowserAccess } from "@/utils/auth/browser-tree-membership";
import { readNativeAccessOutcome } from "@/utils/auth/native-access-submission";

export async function POST(request: Request) {
  if (request.headers.get("X-Requested-With") !== "TreeAccessManager") return new Response(null, { status: 403 });
  const user = await getUser();
  if (!user) return Response.json({ code: "FORBIDDEN" }, { status: 401 });
  const fields = await request.formData();
  const id = fields.get("submission"), token = await getSessionToken();
  // A document restored from browser history can hydrate after its native POST.
  if (token && typeof id === "string") {
    const previous = await readNativeAccessOutcome(token, id);
    if (previous) return Response.json(previous.confirmed ? { ok: true } : { code: "UNCERTAIN" });
  }
  return Response.json(await changeBrowserAccess(user.id, fields));
}
