import { rest } from "@/utils/agent/http";
export const GET = (request: Request) => rest(request, "list_family_trees");
