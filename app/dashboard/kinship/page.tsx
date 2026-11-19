import KinshipFinder from "@/components/KinshipFinder";
import { currentFamilyPage } from "@/utils/family/browser";

export const metadata = {
  title: "Tra cứu danh xưng",
};

export default async function KinshipPage() {
  const { people } = await currentFamilyPage();
  const { persons, relationships } = await people.graph();

  return (
    <div className="flex-1 w-full relative flex flex-col pb-12">
      <div className="w-full relative z-20 py-6 px-4 sm:px-6 lg:px-8 max-w-3xl mx-auto">
        <h1 className="title">Tra cứu danh xưng</h1>
        <p className="text-stone-500 mt-1 text-sm">
          Chọn hai thành viên để tự động tính cách gọi theo quan hệ gia phả
        </p>
      </div>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 w-full flex-1">
        <KinshipFinder
          persons={persons ?? []}
          relationships={relationships ?? []}
        />
      </main>
    </div>
  );
}
