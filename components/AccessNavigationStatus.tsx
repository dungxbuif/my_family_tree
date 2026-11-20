"use client";

import { useEffect, useState } from "react";
import { accessPath } from "@/utils/tree-access-labels";
import AccessLoading from "./AccessLoading";

export default function AccessNavigationStatus() {
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    function click(event: MouseEvent) {
      if (event.defaultPrevented || event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element && event.target.closest<HTMLAnchorElement>("a[href]");
      if (link && !link.target && link.origin === location.origin && link.pathname.startsWith(accessPath)) setLoading(true);
    }
    const restored = () => setLoading(false);
    document.addEventListener("click", click);
    window.addEventListener("pageshow", restored);
    return () => {
      document.removeEventListener("click", click);
      window.removeEventListener("pageshow", restored);
    };
  }, []);
  return loading ? <AccessLoading /> : null;
}
