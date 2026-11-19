import { getUser } from "@/utils/auth/session";
import { changeBrowserTree, getBrowserTreeSelection } from "@/utils/auth/browser-tree-selection";

export async function POST(request: Request) {
  // This browser-only header requires a CORS preflight from any other origin.
  if (request.headers.get("X-Requested-With") !== "FamilyTreeSelector") {
    return new Response(null, { status: 403 });
  }
  const user = await getUser();
  if (!user) return Response.json({ notice: { error: "Vui lòng đăng nhập lại." }, trees: [] }, { status: 401 });

  const notice = await changeBrowserTree(user.id, await request.formData());
  const selection = await getBrowserTreeSelection(user.id);
  return Response.json({ notice, trees: selection.trees ?? [], currentId: selection.current?.id });
}
