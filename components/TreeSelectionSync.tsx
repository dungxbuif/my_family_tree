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

function notifyPeers(selection?: Selection) {
  try {
    localStorage.setItem(
      signal,
      JSON.stringify({
        currentId: selection?.currentId,
        revision: selection?.revision,
        nonce: crypto.randomUUID(),
      }),
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
  const restoreRevision = useRef<string | null>(null);
  const frozenModal = useRef<{ href: string; state: unknown } | null>(null);
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
          // Native in-tree dialogs own their own history entry. The detail modal
          // uses replaceState, so retain its current URL for a same-document Back.
          if (host.closest('[role="dialog"]') && !host.closest("dialog")) {
            frozenModal.current = { href: location.href, state: history.state };
          }
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
      if (frozenModal.current) {
        event.stopImmediatePropagation();
        history.pushState(
          frozenModal.current.state,
          "",
          frozenModal.current.href,
        );
        return;
      }
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
  useEffect(() => {
    if (!draft || !frozenModal.current) return;
    function protectFrozenDocument(event: BeforeUnloadEvent) {
      if (document.documentElement.dataset.discardTreeDraft) return;
      event.preventDefault();
      event.returnValue = " ";
    }
    function protectFrozenLink(event: MouseEvent) {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)
        return;
      const link =
        event.target instanceof Element &&
        event.target.closest<HTMLAnchorElement>("a[href]");
      if (link && (!link.target || link.target === "_self")) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }
    window.addEventListener("beforeunload", protectFrozenDocument);
    document.addEventListener("click", protectFrozenLink, true);
    return () => {
      window.removeEventListener("beforeunload", protectFrozenDocument);
      document.removeEventListener("click", protectFrozenLink, true);
    };
  }, [draft]);

  async function restore() {
    if (!draft?.treeId || restoring) return;
    setRestoring(true);
    setError("");
    try {
      if (restoreRevision.current !== revision()) {
        const fields = new FormData();
        fields.set("operation", "select");
        fields.set("treeId", draft.treeId);
        const previous = revision();
        const acknowledgement = await fetch(selectionUrl, {
          method: "POST",
          headers: { "X-Requested-With": "FamilyTreeSelector" },
          body: fields,
        }).catch(() => undefined);
        const committed = revision();
        // Cookie changes reach peers before this tab needs a verification read.
        // A failed read can retry against that revision without another write.
        if (committed !== previous) restoreRevision.current = committed;
        if (acknowledgement?.ok || committed !== previous) notifyPeers();
      }
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
        restoreRevision.current = null;
        if (snapshot.revision === revision()) notifyPeers(snapshot);
        throw new Error();
      }
      restoreRevision.current = null;
      frozenModal.current = null;
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
                if (frozenModal.current) {
                  const url = new URL(location.href);
                  url.searchParams.delete("memberModalId");
                  location.replace(url.href);
                } else {
                  location.reload();
                }
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
