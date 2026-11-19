import { rest } from "@/utils/agent/http";
export const GET = (request: Request) => rest(request, "get_family_stats");
