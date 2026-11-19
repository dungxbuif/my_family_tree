import FamilyStats from "@/components/FamilyStats";
import { currentFamilyPage } from "@/utils/family/browser";

export const metadata = {
  title: "Thống kê gia phả",
};

export default async function StatsPage() {
  const { tree, people } = await currentFamilyPage();
  const { persons, relationships } = await people.graph();

  return (
    <div className="flex-1 w-full relative flex flex-col pb-12">
      <div className="w-full relative z-20 py-6 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto">
        <h1 className="title">Thống kê gia phả</h1>
        <p className="text-secondary mt-1 text-sm [overflow-wrap:anywhere]">
          Toàn bộ cây gia phả · {tree.name}
        </p>
      </div>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 w-full flex-1">
        {persons.length === 0 && <p>Chưa có thành viên trong cây gia phả.</p>}
        <FamilyStats
          persons={persons ?? []}
          relationships={relationships ?? []}
        />
      </main>
    </div>
  );
}
