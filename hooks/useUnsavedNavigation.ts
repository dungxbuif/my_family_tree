import { useEffect, useSyncExternalStore } from "react";

function subscribeDraft(notify: () => void) {
  window.addEventListener("familytreedraftstate", notify);
  return () => window.removeEventListener("familytreedraftstate", notify);
}
export function useStaleTreeDraft() {
  return useSyncExternalStore(subscribeDraft, () => Boolean(document.documentElement.dataset.staleTreeDraft), () => false);
}

export function useUnsavedNavigation(shouldGuard: boolean, message: string, active?: () => boolean) {
  useEffect(() => {
    if (!shouldGuard) return;

    function warnBeforeUnload(event: BeforeUnloadEvent) {
      if ((active && !active()) || document.documentElement.dataset.discardTreeDraft) return;
      event.preventDefault();
      event.returnValue = " ";
    }

    function confirmNavigation(event: MouseEvent) {
      if (active && !active()) return;
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      if (!(event.target instanceof Element)) return;
      const link = event.target.closest<HTMLAnchorElement>("a[href]");
      const logout = event.target.closest("button[data-logout]");
      if (!link && !logout) return;
      if (link && (link.target || link.origin !== location.origin || link.pathname === location.pathname)) return;

      if (!window.confirm(message)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }

    function hasDraft(event: Event) { if (!active || active()) event.preventDefault(); }
    window.addEventListener("familytreecheckdraft", hasDraft);
    window.addEventListener("beforeunload", warnBeforeUnload);
    document.addEventListener("click", confirmNavigation, true);
    return () => {
      window.removeEventListener("familytreecheckdraft", hasDraft);
      window.removeEventListener("beforeunload", warnBeforeUnload);
      document.removeEventListener("click", confirmNavigation, true);
    };
  }, [shouldGuard, message, active]);
}
