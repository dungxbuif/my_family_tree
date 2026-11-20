import { rest } from "@/utils/agent/http";
export const GET = (request: Request) => rest(request, "export_family_data");
