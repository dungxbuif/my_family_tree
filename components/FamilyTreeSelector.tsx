"use client";

import { useActionState, useState, useSyncExternalStore, type FormEvent } from "react";
import { FAMILY_TREE_NAME_LIMIT } from "@/types";
import { useUnsavedNavigation } from "@/hooks/useUnsavedNavigation";
import { Check, Trees } from "lucide-react";
import type { TreeNotice } from "@/utils/auth/browser-tree-selection";
import { changeFamilyTree } from "@/app/actions/family-tree";
import type { AccessibleTree } from "@/utils/auth/tree-access";

type Selection = { trees: AccessibleTree[]; currentId?: string };
const selectionUrl = "/dashboard/account/trees/selection";
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
  const [initialNotice, nativeAction] = useActionState(changeFamilyTree, null);
  const [notice, setNotice] = useState<TreeNotice | null>(initialNotice);
  const [draft, setDraft] = useState(initialNotice && "error" in initialNotice ? initialNotice.draft ?? "" : "");
  const [touchedTree, setTouchedTree] = useState<string | null>(null);
  const [operation, setOperation] = useState<"create" | "select" | "read" | null>(null);
  const [selection, setSelection] = useState<Selection | null>({ trees, currentId });
  const reading = operation === "read";
  const busy = operation !== null;
  const creating = operation === "create";
  const online = useSyncExternalStore(subscribeToConnection, () => navigator.onLine, () => true);
  useUnsavedNavigation(Boolean(draft) || creating, "Tên cây gia phả chưa được lưu. Bạn có muốn rời trang?");

  async function refreshSelection() {
    setOperation("read");
    try {
      const response = await fetch(selectionUrl, { cache: "no-store" });
      if (!response.ok || response.redirected) throw new Error("Selection unavailable");
      setSelection(await response.json() as Selection);
    } catch {
      setSelection(null);
    } finally {
      setOperation(null);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const fields = new FormData(event.currentTarget, submitter);
    const creatingTree = fields.get("operation") === "create";
    setOperation(creatingTree ? "create" : "select");
    setNotice(null);
    try {
      const response = await fetch(selectionUrl, {
        method: "POST", headers: { "X-Requested-With": "FamilyTreeSelector" }, body: fields,
      });
      if (response.status === 401 || (response.redirected && new URL(response.url).pathname === "/login")) {
        setSelection({ trees: [], currentId: undefined });
        setNotice({ error: "Vui lòng đăng nhập lại." });
        return;
      }
      if (!response.ok) throw new Error("Tree selection request failed");
      const result = await response.json() as { notice: TreeNotice };
      if (creatingTree && "treeId" in result.notice) setDraft("");
      setNotice(result.notice);
      await refreshSelection();
    } catch {
      setSelection(null);
      setNotice({ error: "Chưa thể xác nhận kết quả. Hãy tải lại danh sách để kiểm tra." });
    } finally {
      setOperation(null);
    }
  }
  if (!selection) {
    return (
      <div className="space-y-3" aria-busy={reading}>
        <Notice result={notice} />
        <p role="alert" className="body-sm text-error">Cần tải lại danh sách cây gia phả để tiếp tục.</p>
        <button type="button" className="btn min-h-[52px]" onClick={refreshSelection} disabled={reading || !online}>
          {reading ? "Đang tải danh sách…" : "Tải lại danh sách"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!online && <p role="status" className="body-sm text-warning">Đã mất kết nối. Hãy kết nối lại để chọn hoặc tạo cây gia phả.</p>}
      <Notice result={notice} />
      <section className="rounded-[20px] border border-border bg-surface p-4 shadow-soft" aria-labelledby="tree-list">
        <h2 id="tree-list" className="font-sans text-[22px] font-semibold leading-[30px] text-primary">Chọn cây gia phả</h2>
        {selection.trees.length === 0 ? (
          <p className="body-md mt-3 text-secondary">Bạn chưa có cây gia phả. Hãy tạo cây đầu tiên của bạn.</p>
        ) : (
          <form action={nativeAction} onSubmit={submit} className="mt-3 space-y-3" aria-busy={operation === "select"}>
            <input type="hidden" name="operation" value="select" />
            <ul className="space-y-2">
              {selection.trees.map(tree => {
                const active = tree.id === selection.currentId;
                return (
                  <li key={tree.id}>
                    <button type="submit" name="treeId" value={tree.id} aria-pressed={active} disabled={busy || !online}
                      data-touch-pressed={touchedTree === tree.id || undefined}
                      onPointerDown={event => { if (event.pointerType === "touch") setTouchedTree(tree.id); }}
                      onPointerUp={() => setTouchedTree(null)}
                      onPointerCancel={() => setTouchedTree(null)}
                      className={`flex min-h-[52px] w-full items-center gap-3 rounded-xl border p-3 touch-manipulation text-left hover:bg-primary-soft active:bg-border data-[touch-pressed=true]:bg-border ${active ? "border-primary bg-primary-soft" : "border-border"}`}>
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
      </section>
      <section className="space-y-3 rounded-[20px] border border-border bg-surface p-4 shadow-soft" aria-labelledby="create-tree">
        <h2 id="create-tree" className="font-sans text-[22px] font-semibold leading-[30px] text-primary">Tạo cây gia phả</h2>
        <form action={nativeAction} onSubmit={submit} className="grid gap-3" aria-busy={creating}>
          <input type="hidden" name="operation" value="create" />
          <label className="body-sm font-semibold text-foreground">
            Tên cây gia phả
            <input className="body-md mt-2 block min-h-[52px] w-full rounded-lg border border-border bg-surface px-3"
              name="name" required maxLength={FAMILY_TREE_NAME_LIMIT} disabled={busy}
              value={draft} onChange={event => setDraft(event.target.value)} />
          </label>
          <button className="btn-primary min-h-[52px]" type="submit" disabled={busy || !online}>
            {creating ? "Đang tạo…" : "Tạo cây gia phả"}
          </button>
        </form>
      </section>
      {operation === "select" && <p role="status">Đang chuyển cây gia phả…</p>}
      {reading && <p role="status">Đang tải danh sách…</p>}
    </div>
  );
}
