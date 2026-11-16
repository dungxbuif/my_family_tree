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
      className="fixed inset-x-3 bottom-3 z-50 mx-auto flex max-w-md items-center justify-between gap-1 rounded-3xl border border-stone-200/80 bg-white/95 p-2 shadow-[0_16px_40px_rgb(28_25_23_/_0.14)] backdrop-blur-xl mobile-safe-bottom md:static md:mx-auto md:mb-2 md:mt-4 md:w-fit md:max-w-none md:justify-center md:rounded-full md:bg-stone-200/50 md:p-1.5 md:shadow-inner"
    >
      {tabs.map((tab) => {
        const isActive = currentView === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => setView(tab.id as ViewMode)}
            aria-current={isActive ? "page" : undefined}
            className={`relative min-h-11 min-w-11 flex-1 rounded-2xl px-2 py-2 text-[11px] font-semibold transition-colors duration-300 ease-in-out z-10 flex flex-col items-center justify-center gap-1 ${isActive
              ? "text-stone-900"
              : "text-stone-500 hover:text-stone-800"
              } md:min-h-0 md:min-w-0 md:flex-none md:flex-row md:gap-2 md:rounded-full md:px-6 md:py-2.5 md:text-sm`}
          >
            {isActive && (
              <motion.div
                layoutId="activeTab"
                className="absolute inset-0 rounded-2xl border border-stone-200/60 bg-white shadow-sm z-[-1] md:rounded-full"
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
