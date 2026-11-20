import { getUser } from "@/utils/auth/session";
import { getBrowserTreeSelection } from "@/utils/auth/browser-tree-selection";
import { familyPeople } from "@/utils/family/people";

const privateHeaders = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie",
  "Content-Security-Policy": "default-src 'none'; sandbox",
  "X-Content-Type-Options": "nosniff",
};
export async function GET(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const missing = () =>
    new Response("Not Found", { status: 404, headers: privateHeaders });
  const user = await getUser();
  if (!user) return missing();
  const { current } = await getBrowserTreeSelection(user.id);
  if (!current) return missing();
  const { path } = await params;
  const range = request.headers.get("range") ?? undefined;
  try {
    const object = await familyPeople(user.id, current.id).readMedia(
      "/api/storage/" + path.join("/"),
      range,
    );
    const headers = new Headers(privateHeaders);
    if (object.unsatisfied) {
      headers.set("Content-Range", "bytes */" + object.size);
      return new Response(null, { status: 416, headers });
    }
    headers.set("Content-Type", object.contentType);
    headers.set("Content-Length", String(object.body.length));
    headers.set("Accept-Ranges", "bytes");
    if (object.contentRange) headers.set("Content-Range", object.contentRange);
    return new Response(Buffer.from(object.body), {
      status: object.contentRange ? 206 : 200,
      headers,
    });
  } catch {
    return missing();
  }
}
