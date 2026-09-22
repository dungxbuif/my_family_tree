import { NextResponse } from "next/server";
import { readObject } from "@/utils/storage/s3";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  const key = path.join("/");
  if (!/^(family-tree\/)?((avatars)|(gallery))\/[0-9a-f-]+\.(jpg|png|webp|gif)$/.test(key)) return new NextResponse("Not Found", { status: 404 });
  try { const object = await readObject(key); return new NextResponse(object.body, { headers: { "Content-Type": object.contentType, "Cache-Control": "public, max-age=31536000, immutable" } }); }
  catch { return new NextResponse("Not Found", { status: 404 }); }
}
