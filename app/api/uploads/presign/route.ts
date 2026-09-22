import { NextRequest, NextResponse } from "next/server";
import { getProfile } from "@/utils/data/queries";
import { presignUpload } from "@/utils/storage/s3";

export async function POST(request: NextRequest) {
  const profile = await getProfile();
  if (!profile || (profile.role !== "admin" && profile.role !== "editor")) return NextResponse.json({ error: "Từ chối truy cập." }, { status: 403 });
  try { const { folder, fileName, contentType, size } = await request.json(); return NextResponse.json(await presignUpload(folder, fileName, contentType, size)); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Không thể chuẩn bị upload." }, { status: 400 }); }
}
