"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { TreeRole } from "@/types";
import {
  readSelection,
  selectionUrl,
  type SelectionSnapshot,
} from "@/utils/auth/selection-snapshot";

const signal = "family-tree-selection-revision";
const sameDocumentEvent = "familytreeselected";
type Selection = Pick<SelectionSnapshot, "currentId" | "revision">;

function notifyPeers({ currentId, revision }: Selection) {
  try {
    localStorage.setItem(
      signal,
      JSON.stringify({ currentId, revision, nonce: crypto.randomUUID() }),
    );
  } catch {
    /* Check the revision on focus as well. */
  }
}
export function notifyTreeSelection(selection: Selection) {
  notifyPeers(selection);
  window.dispatchEvent(
    new CustomEvent(sameDocumentEvent, { detail: selection }),
  );
}

function revision() {
  return (
    document.cookie
      .split("; ")
      .find((part) => part.startsWith("family_tree_revision="))
      ?.split("=")[1] ?? ""
  );
}

type DraftRecovery = { host: HTMLElement; treeId?: string; role?: TreeRole };

export default function TreeSelectionSync({
  initialRevision,
  treeId,
  role,
}: {
  initialRevision: string;
  treeId?: string;
  role?: TreeRole;
}) {
  const router = useRouter();
  const current = useRef<Selection>({
    revision: initialRevision,
    currentId: treeId,
  });
  const [draft, setDraft] = useState<DraftRecovery | null>(null);
  const [staying, setStaying] = useState(false);
  const [error, setError] = useState("");
  const [restoring, setRestoring] = useState(false);
  const stale = useRef(false);
  const fallback = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const search = useSearchParams();
  useLayoutEffect(() => {
    history.replaceState(
      { ...history.state, familyTreeRevision: current.current.revision },
      "",
    );
  }, [pathname, search]);

  useEffect(() => {
    function changedHere(event: Event) {
      current.current = (event as CustomEvent<Selection>).detail;
      history.replaceState(
        { ...history.state, familyTreeRevision: current.current.revision },
        "",
      );
      router.refresh();
    }
    function recover() {
      if (stale.current) return;
      stale.current = true;
      // A guarded form can remain open for reading and copying. Submit events are
      // blocked until a fresh membership check restores its original tree and role.
      const dirtyHost = document.querySelector<HTMLElement>(
        'form[data-dirty-tree-draft="true"] [data-tree-recovery]',
      );
      if (
        dirtyHost ||
        !window.dispatchEvent(
          new Event("familytreecheckdraft", { cancelable: true }),
        )
      ) {
        const host = dirtyHost ?? fallback.current;
        if (host) {
          document.documentElement.style.visibility = "";
          document.documentElement.dataset.staleTreeDraft = "true";
          window.dispatchEvent(new Event("familytreedraftstate"));
          const required = host.closest("form")?.dataset.recoveryRole;
          setDraft({
            host,
            treeId: current.current.currentId,
            role:
              required === "editor" || required === "owner" ? required : role,
          });
          return;
        }
      }
      document.documentElement.style.visibility = "hidden";
      location.reload();
    }
    function check() {
      if (current.current.revision !== revision()) recover();
    }
    function restoreEntry(event: PopStateEvent) {
      const saved = event.state?.familyTreeRevision;
      if (
        (saved !== undefined && saved !== revision()) ||
        current.current.revision !== revision()
      ) {
        if (!stale.current) event.stopImmediatePropagation();
        recover();
      }
    }
    function storage(event: StorageEvent) {
      if (event.key !== signal) return;
      let snapshot: Selection | undefined;
      try {
        snapshot = JSON.parse(event.newValue ?? "null");
      } catch {
        /* Prefer the cookie if the signal is unavailable. */
      }
      if (
        snapshot &&
        snapshot.revision === revision() &&
        (snapshot.currentId !== current.current.currentId ||
          snapshot.revision !== current.current.revision)
      )
        recover();
      else check();
    }
    function visible() {
      if (document.visibilityState === "visible") check();
    }
    function show(event: PageTransitionEvent) {
      if (event.persisted) {
        check();
        if (!stale.current || document.documentElement.dataset.staleTreeDraft)
          document.documentElement.style.visibility = "";
      }
    }
    function hide(event: PageTransitionEvent) {
      if (event.persisted) document.documentElement.style.visibility = "hidden";
    }
    function blockMutation(event: Event) {
      if (!stale.current) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    }
    check();
    document.addEventListener("submit", blockMutation, true);
    window.addEventListener("popstate", restoreEntry, true);
    window.addEventListener(sameDocumentEvent, changedHere);
    window.addEventListener("storage", storage);
    window.addEventListener("focus", check);
    window.addEventListener("pageshow", show);
    window.addEventListener("pagehide", hide);
    document.addEventListener("visibilitychange", visible);
    return () => {
      document.removeEventListener("submit", blockMutation, true);
      window.removeEventListener("popstate", restoreEntry, true);
      window.removeEventListener(sameDocumentEvent, changedHere);
      window.removeEventListener("storage", storage);
      window.removeEventListener("focus", check);
      window.removeEventListener("pageshow", show);
      window.removeEventListener("pagehide", hide);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [router, role]);
  async function restore() {
    if (!draft?.treeId || restoring) return;
    setRestoring(true);
    setError("");
    try {
      const fields = new FormData();
      fields.set("operation", "select");
      fields.set("treeId", draft.treeId);
      // Even a lost write acknowledgement can be resolved by the read-only snapshot.
      await fetch(selectionUrl, {
        method: "POST",
        headers: { "X-Requested-With": "FamilyTreeSelector" },
        body: fields,
      }).catch(() => undefined);
      const snapshot = await readSelection();
      const membership = snapshot.trees.find(
        (tree) => tree.id === draft.treeId,
      );
      if (
        snapshot.currentId !== draft.treeId ||
        snapshot.revision !== revision() ||
        !membership ||
        (membership.role !== "owner" &&
          draft.role !== "viewer" &&
          membership.role !== draft.role)
      ) {
        if (snapshot.revision === revision()) notifyPeers(snapshot);
        throw new Error();
      }
      stale.current = false;
      delete document.documentElement.dataset.staleTreeDraft;
      setDraft(null);
      setStaying(false);
      window.dispatchEvent(new Event("familytreedraftstate"));
      notifyTreeSelection(snapshot);
    } catch {
      setError(
        "Chưa thể khôi phục quyền trên cây của bản nháp. Bạn vẫn có thể sao chép nội dung.",
      );
    } finally {
      setRestoring(false);
    }
  }
  return (
    <>
      <div ref={fallback} />
      {draft &&
        createPortal(
          <aside
            className="space-y-2 rounded-[20px] border border-border bg-surface p-3 text-primary"
            aria-label="Khôi phục bản nháp"
          >
            <p role="status">
              Cây đang chọn đã thay đổi. Bạn có thể sao chép bản nháp hoặc chọn
              lại cây để tiếp tục.
            </p>
            {error && (
              <p role="alert" className="text-error">
                {error}
              </p>
            )}
            {staying ? (
              <button
                type="button"
                className="btn-primary min-h-[52px]"
                disabled={restoring || !draft.treeId}
                onClick={restore}
              >
                Chọn lại cây của bản nháp
              </button>
            ) : (
              <button
                type="button"
                className="btn min-h-[52px]"
                onClick={() => setStaying(true)}
              >
                Ở lại với bản nháp
              </button>
            )}
            <button
              type="button"
              className="btn min-h-[52px]"
              disabled={restoring}
              onClick={() => {
                document.documentElement.dataset.discardTreeDraft = "true";
                location.reload();
              }}
            >
              Bỏ bản nháp và tải lại
            </button>
          </aside>,
          draft.host,
        )}
    </>
  );
}
