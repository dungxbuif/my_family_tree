import FamilyTreeSelector from "@/components/FamilyTreeSelector";
import { getUser } from "@/utils/auth/session";
import { getTreeSelection } from "@/utils/auth/tree-access";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function FamilyTreesPage() {
  const user = await getUser();
  if (!user) redirect("/login");
  const hint = (await cookies()).get("family_tree_selected")?.value;
  const selection = await getTreeSelection(user.id, hint);
  return (
    <main className="content-gutter mx-auto w-full max-w-xl flex-1 pb-[calc(2rem+var(--safe-bottom))] pt-4">
      <a href="/dashboard/account" className="inline-flex min-h-11 items-center font-semibold text-primary">← Tài khoản</a>
      <h1 className="headline-lg mb-4">Cây gia phả của tôi</h1>
      {selection.code ? <p role="alert">Bạn cần tài khoản đang hoạt động để quản lý cây gia phả.</p> : (
        <FamilyTreeSelector trees={selection.trees} currentId={selection.current?.id} />
      )}
    </main>
  );
}
