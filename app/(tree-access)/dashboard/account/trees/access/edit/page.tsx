import { redirect } from "next/navigation";
import { getSessionToken, getUser } from "@/utils/auth/session";
import { readNativeAccessOutcome, submissionIdPattern } from "@/utils/auth/native-access-submission";
import { currentOwnerAccess } from "@/utils/auth/browser-tree-membership";
import { accessOperations, accessPath, deniedAccess, type AccessOperation } from "@/utils/tree-access-labels";
import TreeAccessForm from "@/components/TreeAccessForm";
import NativeAccessResult from "@/components/NativeAccessResult";
import type { AccessSnapshot } from "@/utils/auth/tree-membership";

function personOptions(people: AccessSnapshot["people"]) {
  const counts = new Map<string, number>();
  for (const { id } of people) {
    const prefix = id.slice(0, 8);
    counts.set(prefix, (counts.get(prefix) ?? 0) + 1);
  }
  return people.map(({ id, name }) => {
    const prefix = id.slice(0, 8);
    const identifier = counts.get(prefix) === 1 ? prefix : id;
    return { id, label: identifier + " · " + name };
  });
}

export default async function EditAccessPage({ searchParams }: {
  searchParams: Promise<{ operation?: string; treeId?: string; userId?: string; personId?: string; submission?: string; retryOf?: string }>;
}) {
  const user = await getUser();
  if (!user) redirect("/login");
  const { treeId, operation, userId, personId, submission, retryOf } = await searchParams;
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries({ treeId, operation, userId, personId })) {
    if (typeof value === "string") params.set(name, value);
  }
  if (typeof submission !== "string" || !submissionIdPattern.test(submission)) {
    return <a className="btn min-h-11" href={accessPath + "/edit?" + params}>Mở biểu mẫu</a>;
  }
  params.set("submission", submission);
  const token = await getSessionToken();
  const outcome = token && await readNativeAccessOutcome(token, submission);
  if (outcome) return <NativeAccessResult outcome={outcome} />;
  const data = treeId && await currentOwnerAccess(user.id, treeId);
  if (!data) return <p role="alert">{deniedAccess}</p>;
  const member = data.members.find(item => item.userId === userId);
  if (!operation || !Object.hasOwn(accessOperations, operation)) {
    return <><p role="alert">Thao tác này không còn khả dụng.</p><a className="btn min-h-11" href={accessPath}>Xem quyền truy cập</a></>;
  }
  const unavailable = (["remove", "role", "unlink"].includes(operation) && !member)
    || (operation === "unlink" && (!personId || member?.personId !== personId))
    || (operation === "remove" && Boolean(member?.personId))
    || (operation === "link" && !data.people.length);
  const previous = token && typeof retryOf === "string" && await readNativeAccessOutcome(token, retryOf);
  const correction = previous && previous.rejection && previous.draft.treeId === treeId
    && previous.draft.operation === operation && previous.draft.userId === userId ? previous : undefined;
  if (correction && retryOf) params.set("retryOf", retryOf);
  return <TreeAccessForm tree={data.tree} operation={operation as AccessOperation} member={member} correction={correction}
    submission={submission} permalink={accessPath + "/edit?" + params}
    unavailable={unavailable} people={operation === "link" ? personOptions(data.people) : []} />;
}
