"use client";

import { useActionState, useState, useSyncExternalStore } from "react";
import { useUnsavedNavigation } from "@/hooks/useUnsavedNavigation";
import { Check, Trees } from "lucide-react";
import { changeFamilyTree, type TreeNotice } from "@/app/actions/family-tree";
import type { AccessibleTree } from "@/utils/auth/tree-access";

const roles = { owner: "Chủ sở hữu", editor: "Biên tập viên", viewer: "Người xem" };

function subscribeToConnection(notify: () => void) {
  window.addEventListener("online", notify);
  window.addEventListener("offline", notify);
  return () => {
    window.removeEventListener("online", notify);
    window.removeEventListener("offline", notify);
  };
}

function Notice({ result }: { result: TreeNotice | null }) {
  if (!result) return null;
  return "error" in result
    ? <p role="alert" className="body-sm text-error">{result.error}</p>
    : <p role="status" className="body-sm text-success">{result.message}</p>;
}

export default function FamilyTreeSelector({ trees, currentId }: { trees: AccessibleTree[]; currentId?: string }) {
  const [creation, create, creating] = useActionState(changeFamilyTree, null);
  const [selection, select, selecting] = useActionState(changeFamilyTree, null);
  const online = useSyncExternalStore(subscribeToConnection, () => navigator.onLine, () => true);
  const busy = creating || selecting;
  return (
    <div className="space-y-4">
      {!online && <p role="status" className="body-sm text-warning">Đã mất kết nối. Hãy kết nối lại để chọn hoặc tạo cây gia phả.</p>}
      <section className="rounded-[20px] border border-border bg-surface p-4 shadow-soft" aria-labelledby="tree-list">
        <h2 id="tree-list" className="headline-md">Chọn cây gia phả</h2>
        {trees.length === 0 ? (
          <p className="body-md mt-3 text-secondary">Bạn chưa có cây gia phả. Hãy tạo cây đầu tiên của bạn.</p>
        ) : (
          <form action={select} className="mt-3 space-y-3" aria-busy={selecting}>
            <input type="hidden" name="operation" value="select" />
            <ul className="space-y-2">
              {trees.map(tree => {
                const active = tree.id === currentId;
                return (
                  <li key={tree.id}>
                    <button type="submit" name="treeId" value={tree.id} aria-pressed={active} disabled={busy || !online}
                      className={`flex min-h-[52px] w-full items-center gap-3 rounded-xl border p-3 text-left hover:bg-primary-soft ${active ? "border-primary bg-primary-soft" : "border-border"}`}>
                      <Trees aria-hidden="true" className="size-5 shrink-0 text-primary" />
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold text-primary [overflow-wrap:anywhere]">{tree.name}</span>
                        <span className="body-sm block text-secondary">{roles[tree.role]}{active && " · Đang chọn"}</span>
                      </span>
                      {active && <Check aria-hidden="true" className="size-5 shrink-0 text-primary" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          </form>
        )}
        <Notice result={selection && "treeId" in selection && selection.treeId !== currentId ? null : selection} />
      </section>
      <section className="space-y-3 rounded-[20px] border border-border bg-surface p-4 shadow-soft" aria-labelledby="create-tree">
        <h2 id="create-tree" className="headline-md">Tạo cây gia phả</h2>
        <CreateTreeForm key={creation && "treeId" in creation ? creation.treeId : "draft"}
          action={create} creating={creating} busy={busy} online={online}
          initialDraft={creation && "error" in creation ? creation.draft : undefined} />
        <Notice result={creation && "treeId" in creation && creation.treeId !== currentId ? null : creation} />
      </section>
      {selecting && <p role="status">Đang chuyển cây gia phả…</p>}
    </div>
  );
}

function CreateTreeForm({ action, initialDraft, creating, busy, online }: {
  action: (fields: FormData) => void; initialDraft?: string; creating: boolean; busy: boolean; online: boolean;
}) {
  const [draft, setDraft] = useState(initialDraft ?? "");
  useUnsavedNavigation(Boolean(draft) || creating, "Tên cây gia phả chưa được lưu. Bạn có muốn rời trang?");
  return (
    <form action={action} className="grid gap-3" aria-busy={creating}>
      <input type="hidden" name="operation" value="create" />
      <label className="body-sm font-semibold text-foreground">
        Tên cây gia phả
        <input className="body-md mt-2 block min-h-[52px] w-full rounded-xl border border-border bg-surface px-3"
          name="name" required maxLength={120} disabled={busy}
          value={draft} onChange={event => setDraft(event.target.value)} />
      </label>
      <button className="btn-primary min-h-[52px]" type="submit" disabled={busy || !online}>
        {creating ? "Đang tạo…" : "Tạo cây gia phả"}
      </button>
    </form>
  );
}
