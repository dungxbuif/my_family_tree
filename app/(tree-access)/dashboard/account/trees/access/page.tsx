import { redirect } from "next/navigation";
import { getUser } from "@/utils/auth/session";
import { currentOwnerAccess } from "@/utils/auth/browser-tree-membership";
import { accessOperations, accessPath, deniedAccess, treeRoles, type AccessOperation } from "@/utils/tree-access-labels";

export default async function AccessPage({ searchParams }: { searchParams: Promise<{ saved?: string; treeId?: string }> }) {
  const user = await getUser();
  if (!user) redirect("/login");
  const params = await searchParams;
  const data = await currentOwnerAccess(user.id, params.treeId);
  const saved = params.saved === "1" && <p role="status" className="body-md text-success">Đã cập nhật quyền truy cập.</p>;
  if (!data) return <>{saved}<p role="alert">{deniedAccess}</p><a href="/dashboard/account/trees" className="btn min-h-11">Chọn cây gia phả</a></>;

  const treeId = data.tree.id;
  function edit(operation: AccessOperation, userId?: string, personId?: string | null) {
    const search = new URLSearchParams({ operation, treeId });
    if (userId) search.set("userId", userId);
    if (personId) search.set("personId", personId);
    return <a href={accessPath + "/edit?" + search} className="btn min-h-11 whitespace-normal">{accessOperations[operation]}</a>;
  }
  return <section className="grid min-w-0 gap-4">
    <h2 className="font-sans text-[22px] font-semibold leading-[30px] text-primary">Quản lý quyền truy cập</h2>
    <p className="body-md break-words text-secondary [overflow-wrap:anywhere]">{data.tree.name}</p>
    {saved}
    <div className="grid gap-2 sm:grid-cols-2">{edit("add")}{data.people.length > 0 && edit("link")}</div>
    {!data.people.length && <p className="body-sm text-secondary">Chưa có hồ sơ gia phả để liên kết.</p>}
    {data.members.length === 1 && <p className="body-sm text-secondary">Chỉ bạn có quyền truy cập cây gia phả này.</p>}
    <ul className="grid gap-3">
      {data.members.map(member => <li key={member.userId} className="grid min-w-0 gap-2 rounded-[20px] border border-border bg-surface p-4 shadow-soft">
        <h3 className="font-semibold [overflow-wrap:anywhere]">{member.email}</h3>
        <p className="body-sm text-secondary">{treeRoles[member.role]}</p>
        {member.personId && <p className="body-md [overflow-wrap:anywhere]">Hồ sơ liên kết · {member.personName}</p>}
        <div className="grid gap-2 sm:grid-cols-2">
          {edit("role", member.userId)}
          {member.personId ? edit("unlink", member.userId, member.personId) : edit("remove", member.userId)}
        </div>
      </li>)}
    </ul>
    <a href="/dashboard/account/trees" className="btn min-h-11">Chọn cây gia phả</a>
  </section>;
}
