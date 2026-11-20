import { useEffectEvent, useLayoutEffect, useRef } from "react";

const focusable =
  'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]';

export function useCollectionDialog(open: boolean, dismiss: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useEffectEvent(dismiss);
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return;
    const previous =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const controls = () =>
      Array.from(dialog.querySelectorAll<HTMLElement>(focusable)).filter(
        (el) => el.getClientRects().length,
      );
    const first = () => controls()[0] ?? dialog;
    first().focus({ preventScroll: true });
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close();
        return;
      }
      if (event.key !== "Tab") return;
      const items = controls(),
        start = items[0] ?? dialog,
        end = items.at(-1) ?? dialog;
      const active = document.activeElement;
      if (
        !items.length ||
        (event.shiftKey && (active === start || active === dialog)) ||
        (!event.shiftKey && active === end)
      ) {
        event.preventDefault();
        (event.shiftKey ? end : start)?.focus();
      }
    }
    function keepFocus(event: FocusEvent) {
      if (event.target instanceof Node && !dialog!.contains(event.target))
        first().focus({ preventScroll: true });
    }
    document.addEventListener("keydown", keydown, true);
    document.addEventListener("focusin", keepFocus, true);
    return () => {
      document.removeEventListener("keydown", keydown, true);
      document.removeEventListener("focusin", keepFocus, true);
      const target =
        previous?.isConnected && previous !== document.body
          ? previous
          : document.querySelector<HTMLElement>("[data-collection-focus]");
      target?.focus({ preventScroll: true });
    };
  }, [open]);
  return ref;
}
