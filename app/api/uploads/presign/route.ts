import { pruneTreeMedia } from "@/utils/storage/prune";
import { after, NextResponse } from "next/server";
import { currentPeople } from "@/utils/family/browser";
import { MediaUploadConflict } from "@/utils/family/media";
import { FamilyDataError } from "@/utils/family/records";

export async function POST(request: Request) {
  try {
    const draft = await request.json();
    const family = await currentPeople(draft.treeId);
    const allowed = [
      "folder",
      "fileName",
      "contentType",
      "size",
      "treeId",
      "submissionId",
      "sha256",
    ];
    if (Object.keys(draft).some((k) => !allowed.includes(k))) throw new Error();
    const upload = await family.issueUpload(
      draft.folder,
      draft.fileName,
      draft.contentType,
      draft.size,
      { submissionId: draft.submissionId, sha256: draft.sha256 },
    );
    after(() =>
      pruneTreeMedia(draft.treeId).catch(() => {
        console.error("Không thể dọn ảnh cũ.");
      }),
    );
    return NextResponse.json(upload, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof MediaUploadConflict)
      return NextResponse.json(
        { error: error.message },
        { status: 409, headers: { "Cache-Control": "private, no-store" } },
      );
    const denied = error instanceof FamilyDataError;
    return NextResponse.json(
      {
        error: denied
          ? "Từ chối truy cập."
          : "Không thể chuẩn bị tải ảnh. Kiểm tra loại và kích thước ảnh.",
      },
      {
        status: denied ? 403 : 400,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }
}
