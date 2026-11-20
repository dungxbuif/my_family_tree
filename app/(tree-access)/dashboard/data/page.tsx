import { backupLimitMiB } from "@/utils/family/backup-limit";
import DataImportExport from "@/components/DataImportExport";
import { currentFamilyPage } from "@/utils/family/browser";

export default async function DataManagementPage({
  searchParams,
}: {
  searchParams: Promise<{ restored?: string; relationships?: string }>;
}) {
  const { restored, relationships } = await searchParams;
  const { tree, people } = await currentFamilyPage();
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <h1 className="title">Sao lưu &amp; Phục hồi</h1>
      <p className="my-4 break-words text-secondary">
        Cây gia phả · {tree.name}
      </p>
      {restored &&
        relationships &&
        /^\d{1,8}$/.test(restored) &&
        /^\d{1,8}$/.test(relationships) && (
          <p role="status" className="text-success">
            Đã phục hồi {restored} thành viên và {relationships} quan hệ.
          </p>
        )}
      {tree.role === "owner" ? (
        <>
          <noscript>
            <style>{".backup-interactive{display:none}"}</style>
            <form
              action={"/dashboard/data/restore?tree=" + tree.id}
              method="post"
              encType="multipart/form-data"
              className="grid min-w-0 gap-4 rounded-[20px] border border-border bg-surface p-4"
            >
              <label className="grid gap-2">
                Tệp phục hồi (JSON, CSV Zip hoặc GEDCOM, tối đa {backupLimitMiB}{" "}
                MiB)
                <input
                  className="min-h-11 w-full min-w-0"
                  type="file"
                  name="backup"
                  accept=".json,.ged,.zip"
                  required
                />
              </label>
              <label className="flex min-h-11 items-start gap-2 [overflow-wrap:anywhere]">
                <input
                  type="checkbox"
                  name="confirmed"
                  value="replace"
                  required
                />
                Tôi xác nhận thay thế dữ liệu của cây {tree.name}. Hành động này
                không thể hoàn tác.
              </label>
              <button className="min-h-13 rounded-xl bg-error px-4 text-white font-semibold">
                Phục hồi tệp
              </button>
            </form>
          </noscript>
          <DataImportExport
            key={tree.id}
            treeId={tree.id}
            treeName={tree.name}
            persons={await people.selector()}
          />
        </>
      ) : (
        <p role="status">
          Chỉ chủ sở hữu cây gia phả có quyền sao lưu và phục hồi.
        </p>
      )}
    </main>
  );
}
