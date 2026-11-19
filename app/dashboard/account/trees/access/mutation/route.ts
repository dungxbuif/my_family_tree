import { getUser } from "@/utils/auth/session";
import { changeBrowserAccess } from "@/utils/auth/browser-tree-membership";

export async function POST(request: Request) {
  if (request.headers.get("X-Requested-With") !== "TreeAccessManager") return new Response(null, { status: 403 });
  const user = await getUser();
  if (!user) return Response.json({ code: "FORBIDDEN" }, { status: 401 });
  return Response.json(await changeBrowserAccess(user.id, await request.formData()));
}
