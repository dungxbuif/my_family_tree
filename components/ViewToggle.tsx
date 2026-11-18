"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Circle, List, ListTree, Network } from "lucide-react";
import { useMemberListView } from "@/context/MemberListContext";

export type ViewMode = "list" | "tree" | "mindmap" | "bubble";

export default function ViewToggle() {
  const { view: currentView, setView } = useMemberListView();
  const prefersReducedMotion = useReducedMotion();

  const tabs = [
    {
      id: "list",
      label: "Danh sách",
      icon: <List className="size-6 sm:size-4" />,
    },
    {
      id: "tree",
      label: "Sơ đồ cây",
      icon: <Network className="size-6 sm:size-4" />,
    },
    {
      id: "mindmap",
      label: "Mindmap",
      icon: <ListTree className="size-6 sm:size-4" />,
    },
    {
      id: "bubble",
      label: "Bong bóng",
      icon: <Circle className="size-6 sm:size-4" />,
    },
  ] as const;

  return (
    <nav
      aria-label="Chế độ xem thành viên"
      className="mx-auto my-4 hidden w-fit items-center justify-center gap-1 rounded-full border border-border bg-surface p-1.5 shadow-soft md:flex"
    >
      {tabs.map((tab) => {
        const isActive = currentView === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => setView(tab.id as ViewMode)}
            aria-current={isActive ? "page" : undefined}
            className={`relative z-10 flex min-h-11 items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-colors duration-300 ease-in-out ${isActive
              ? "text-stone-900"
              : "text-stone-500 hover:text-stone-800"
              }`}
          >
            {isActive && (
              <motion.div
                layoutId="activeTab"
                className="absolute inset-0 z-[-1] rounded-full border border-amber-200 bg-primary-soft shadow-sm"
                transition={
                  prefersReducedMotion
                    ? { duration: 0 }
                    : { type: "spring", stiffness: 450, damping: 30 }
                }
              />
            )}
            <span
              className={`transition-colors duration-300 ${isActive ? "text-amber-700" : "text-stone-400"}`}
            >
              {tab.icon}
            </span>
            <span className="block max-w-full truncate tracking-wide">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
