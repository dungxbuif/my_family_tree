import { getSessionToken, getUser } from "@/utils/auth/session";
import { submitAccessOnce } from "@/utils/auth/native-access-submission";

export async function POST(request: Request) {
  if (request.headers.get("X-Requested-With") !== "TreeAccessManager") return new Response(null, { status: 403 });
  const user = await getUser(), token = await getSessionToken();
  if (!user || !token) return Response.json({ code: "FORBIDDEN" }, { status: 401 });
  const { notice, retryUrl, duplicate, outcomeUrl } = await submitAccessOnce(user.id, token, await request.formData());
  return Response.json({ ...notice, retryUrl, outcomeUrl: duplicate ? outcomeUrl : undefined });
}
