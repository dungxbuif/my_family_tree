import { mcpPost } from "@/utils/agent/mcp";
export const POST = mcpPost;
export const GET = () =>
  new Response(null, { status: 405, headers: { Allow: "POST" } });
export const DELETE = GET;
export const HEAD = GET;
export const OPTIONS = GET;
export const PUT = GET;
export const PATCH = GET;
