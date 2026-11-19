import { redirect } from "next/navigation";
import { getUser } from "@/utils/auth/session";
import { currentOwnerAccess } from "@/utils/auth/browser-tree-membership";
import { accessOperations, accessPath, deniedAccess, type AccessOperation } from "@/utils/tree-access-labels";
import TreeAccessForm from "@/components/TreeAccessForm";

export default async function EditAccessPage({ searchParams }: {
  searchParams: Promise<{ operation?: string; treeId?: string; userId?: string; personId?: string }>;
}) {
  const user = await getUser();
  if (!user) redirect("/login");
  const { treeId, operation, userId, personId } = await searchParams;
  const data = treeId && await currentOwnerAccess(user.id, treeId);
  if (!data) return <p role="alert">{deniedAccess}</p>;
  const member = data.members.find(item => item.userId === userId);
  if (!operation || !Object.hasOwn(accessOperations, operation)
      || (["remove", "role", "unlink"].includes(operation) && !member)
      || (operation === "unlink" && (!personId || member?.personId !== personId))
      || (operation === "remove" && member?.personId)
      || (operation === "link" && !data.people.length)) {
    return <><p role="alert">Thao tác này không còn khả dụng.</p><a className="btn min-h-11" href={accessPath}>Xem quyền truy cập</a></>;
  }
  return <TreeAccessForm tree={data.tree} operation={operation as AccessOperation} member={member}
    people={operation === "link" ? data.people : []} />;
}
