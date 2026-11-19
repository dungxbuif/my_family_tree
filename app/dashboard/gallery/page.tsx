import { currentFamilyPage } from "@/utils/family/browser";
import GalleryClient from "@/components/GalleryClient";

export const metadata = {
  title: "Phòng trưng bày | Family Tree",
  description: "Lưu giữ và chia sẻ hình ảnh, kỷ niệm dòng họ",
};

export default async function GalleryPage() {
  const { tree, people } = await currentFamilyPage();
  const items = await people.gallery();
  return (
    <main className="flex-1 flex flex-col p-4 sm:p-8 max-w-7xl mx-auto w-full min-w-0">
      <GalleryClient
        key={tree.id}
        treeId={tree.id}
        initialItems={items}
        canEdit={tree.role !== "viewer"}
      />
    </main>
  );
}
