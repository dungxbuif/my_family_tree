import { useEffect } from "react";

export function useUnsavedNavigation(shouldGuard: boolean, message: string) {
  useEffect(() => {
    if (!shouldGuard) return;

    function warnBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = " ";
    }

    function confirmNavigation(event: MouseEvent) {
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

    window.addEventListener("beforeunload", warnBeforeUnload);
    document.addEventListener("click", confirmNavigation, true);
    return () => {
      window.removeEventListener("beforeunload", warnBeforeUnload);
      document.removeEventListener("click", confirmNavigation, true);
    };
  }, [shouldGuard, message]);
}
