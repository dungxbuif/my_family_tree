import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIE = "family_tree_session";

export function proxy(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const isDashboard = request.nextUrl.pathname.startsWith("/dashboard");

  if (isDashboard && !token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (request.method === "GET" && request.nextUrl.pathname === "/dashboard/account/trees/access/edit"
      && !request.nextUrl.searchParams.has("submission")) {
    const location = request.nextUrl.clone();
    location.searchParams.set("submission", crypto.randomUUID());
    return NextResponse.redirect(location, { headers: { "Cache-Control": "private, no-store" } });
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/storage|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
