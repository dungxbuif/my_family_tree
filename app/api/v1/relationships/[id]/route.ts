import { rest } from "@/utils/agent/http";
type Context = { params: Promise<{ id: string }> };
export const DELETE = async (request: Request, { params }: Context) =>
  rest(request, "delete_relationship", (await params).id);
