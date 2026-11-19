import { NextRequest, NextResponse } from "next/server";
import { getProfile } from "@/utils/data/queries";
import { getBrowserTreeSelection } from "@/utils/auth/browser-tree-selection";
import { presignUpload } from "@/utils/storage/s3";

export async function POST(request: NextRequest) {
  const denied = () =>
    NextResponse.json({ error: "Từ chối truy cập." }, { status: 403 });
  const profile = await getProfile();
  if (!profile?.is_active) return denied();
  try {
    const {
      folder,
      fileName,
      contentType,
      size,
      treeId,
      submissionId,
      sha256,
    } = await request.json();
    if (folder === "avatars") {
      const { current } = await getBrowserTreeSelection(profile.id);
      if (!current || current.id !== treeId || current.role === "viewer")
        return denied();
      return NextResponse.json(
        await presignUpload(folder, fileName, contentType, size, {
          actorId: profile.id,
          treeId: current.id,
          submissionId,
          sha256,
        }),
      );
    }
    if (profile.role !== "admin" && profile.role !== "editor") return denied();
    return NextResponse.json(
      await presignUpload(folder, fileName, contentType, size),
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Không thể chuẩn bị upload.",
      },
      { status: 400 },
    );
  }
}
