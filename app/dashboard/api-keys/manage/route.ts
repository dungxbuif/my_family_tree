import { getSessionUser } from "@/utils/auth/session";
import { ownCredentials } from "@/utils/agent/credentials";
import { AgentError } from "@/utils/agent/contract";
import { json, failure, readObject } from "@/utils/agent/http";

async function manage(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user?.is_active) throw new AgentError("UNAUTHORIZED");
    const keys = ownCredentials(user.id);
    if (request.method === "GET")
      return json({ credentials: await keys.list() });
    const origin = request.headers.get("origin");
    if (
      !origin ||
      origin === "null" ||
      (origin !==
        new URL(request.url).protocol + "//" + request.headers.get("host") &&
        request.headers.get("sec-fetch-site") !== "same-origin")
    )
      throw new AgentError("FORBIDDEN");
    const input = await readObject(request);
    if (request.method === "POST") return json(await keys.create(input), 201);
    return json(await keys.revoke(input.id));
  } catch (error) {
    return failure(error);
  }
}
export { manage as GET, manage as POST, manage as DELETE };
