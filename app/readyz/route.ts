import { NextResponse } from "next/server";

/**
 * Lightweight process readiness probe for the homelab deploy contract.
 * Storage and database credentials are intentionally not exposed here; the
 * authenticated application paths perform those dependency checks themselves.
 */
export function GET() {
  return NextResponse.json({ status: "ready" }, { status: 200 });
}
