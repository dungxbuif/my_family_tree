import FamilyTreeSelector from "@/components/FamilyTreeSelector";
import { getUser } from "@/utils/auth/session";
import { getBrowserTreeSelection } from "@/utils/auth/browser-tree-selection";
import { redirect } from "next/navigation";

export default async function FamilyTreesPage() {
  const user = await getUser();
  if (!user) redirect("/login");
  const selection = await getBrowserTreeSelection(user.id);
  if (selection.code) return <p role="alert">Bạn cần tài khoản đang hoạt động để quản lý cây gia phả.</p>;
  return <FamilyTreeSelector trees={selection.trees} currentId={selection.current?.id} />;
}
