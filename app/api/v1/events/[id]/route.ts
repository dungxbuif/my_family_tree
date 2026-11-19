import { rest } from "@/utils/agent/http";
type Context = { params: Promise<{ id: string }> };
export const PATCH = async (request: Request, { params }: Context) =>
  rest(request, "update_event", (await params).id);
export const DELETE = async (request: Request, { params }: Context) =>
  rest(request, "delete_event", (await params).id);
