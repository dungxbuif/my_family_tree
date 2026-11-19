"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

// A non-secret change signal. Authorization always uses the session and Tree Membership.
const signal = "family-tree-selection-revision";
const sameDocumentEvent = "familytreeselected";
export function notifyTreeSelection() {
  try {
    localStorage.setItem(signal, crypto.randomUUID());
  } catch {
    /* Cookies also cover recovery on focus. */
  }
  window.dispatchEvent(new Event(sameDocumentEvent));
}

function revision() {
  return (
    document.cookie
      .split("; ")
      .find((part) => part.startsWith("family_tree_revision="))
      ?.split("=")[1] ?? ""
  );
}

export default function TreeSelectionSync({
  initialRevision,
}: {
  initialRevision: string;
}) {
  const router = useRouter();
  const current = useRef(initialRevision);
  const notice = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();
  const search = useSearchParams();
  useLayoutEffect(() => {
    // Keep the tree associated with each Next history entry, including query-only navigation.
    history.replaceState(
      { ...history.state, familyTreeRevision: current.current },
      "",
    );
  }, [pathname, search]);
  useEffect(() => {
    let recovering = false;
    function changedHere() {
      current.current = revision();
      history.replaceState(
        { ...history.state, familyTreeRevision: current.current },
        "",
      );
      router.refresh();
    }
    function reloadCurrentTree() {
      if (recovering) return;
      recovering = true;
      // An old document or tab can contain both tree rows and cached Next routes.
      // Keep an exit available if a dirty form or a slow connection delays reloading.
      const shell = document.querySelector<HTMLElement>(".dashboard-shell");
      if (shell) shell.style.display = "none";
      document.documentElement.style.visibility = "";
      notice.current?.showModal();
      location.reload();
    }
    function recover() {
      if (current.current !== revision()) reloadCurrentTree();
    }
    function restoreEntry(event: PopStateEvent) {
      const saved = event.state?.familyTreeRevision;
      if (
        (saved !== undefined && saved !== revision()) ||
        current.current !== revision()
      ) {
        event.stopImmediatePropagation();
        reloadCurrentTree();
      }
    }
    function visible() {
      if (document.visibilityState === "visible") recover();
    }
    function storage(event: StorageEvent) {
      if (event.key === signal) recover();
    }
    function show(event: PageTransitionEvent) {
      if (event.persisted) {
        recover();
        if (current.current === revision())
          document.documentElement.style.visibility = "";
      }
    }
    function hide(event: PageTransitionEvent) {
      if (event.persisted) document.documentElement.style.visibility = "hidden";
    }
    recover();
    window.addEventListener("popstate", restoreEntry, true);
    window.addEventListener(sameDocumentEvent, changedHere);
    window.addEventListener("storage", storage);
    window.addEventListener("focus", recover);
    window.addEventListener("pageshow", show);
    window.addEventListener("pagehide", hide);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.removeEventListener("popstate", restoreEntry, true);
      window.removeEventListener(sameDocumentEvent, changedHere);
      window.removeEventListener("storage", storage);
      window.removeEventListener("focus", recover);
      window.removeEventListener("pageshow", show);
      window.removeEventListener("pagehide", hide);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [router]);
  return (
    <dialog
      ref={notice}
      aria-label="Cây gia phả đang chọn đã thay đổi"
      onCancel={(event) => event.preventDefault()}
      className="m-auto max-w-xl space-y-4 rounded-[20px] bg-surface p-4 text-primary"
    >
      <p>Cây gia phả đang chọn đã thay đổi.</p>
      <button
        type="button"
        className="btn-primary h-[52px] py-0"
        onClick={() => location.reload()}
      >
        Tải lại cây gia phả
      </button>
    </dialog>
  );
}
