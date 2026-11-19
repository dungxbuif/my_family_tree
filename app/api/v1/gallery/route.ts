import { rest } from "@/utils/agent/http";
export const GET = (request: Request) => rest(request, "list_gallery");
export const POST = (request: Request) => rest(request, "create_gallery_item");
