import { rest } from "@/utils/agent/http";
type Context = { params: Promise<{ id: string }> };
export const GET = async (request: Request, { params }: Context) =>
  rest(request, "get_person", (await params).id);
export const PATCH = async (request: Request, { params }: Context) =>
  rest(request, "update_person", (await params).id);
export const DELETE = async (request: Request, { params }: Context) =>
  rest(request, "delete_person", (await params).id);
