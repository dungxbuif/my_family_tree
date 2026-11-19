import DataImportExport from "@/components/DataImportExport";
import { currentFamilyPage } from "@/utils/family/browser";

export default async function DataManagementPage() {
  const { tree, people } = await currentFamilyPage();
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <h1 className="title">Sao lưu &amp; Phục hồi</h1>
      <p className="my-4 break-words text-secondary">
        Cây gia phả · {tree.name}
      </p>
      {tree.role === "owner" ? (
        <DataImportExport
          key={tree.id}
          treeId={tree.id}
          treeName={tree.name}
          persons={await people.selector()}
        />
      ) : (
        <p role="status">
          Chỉ chủ sở hữu cây gia phả có quyền sao lưu và phục hồi.
        </p>
      )}
    </main>
  );
}
