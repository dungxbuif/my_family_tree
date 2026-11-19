import { rest } from "@/utils/agent/http";
export const GET = (request: Request) => rest(request, "list_relationships");
export const POST = (request: Request) => rest(request, "create_relationship");
