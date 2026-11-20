"use client";

import { Home, Trees, UserRound, Users } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const items = [
  { label: "Trang chủ", href: "/dashboard", icon: Home, id: "home" },
  { label: "Cây gia phả", href: "/dashboard/members?view=tree", icon: Trees, id: "tree" },
  { label: "Thành viên", href: "/dashboard/members?view=list", icon: Users, id: "members" },
  { label: "Tài khoản", href: "/dashboard/account", icon: UserRound, id: "account" },
] as const;

export default function HeritageBottomNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const view = searchParams.get("view");

  if (pathname === "/dashboard/users" || pathname === "/dashboard/account/trees" || pathname.startsWith("/dashboard/account/trees/")) return null;

  const active = pathname === "/dashboard"
    ? "home"
    : pathname === "/dashboard/account"
      ? "account"
      : pathname.startsWith("/dashboard/members")
        ? view === "list" ? "members" : "tree"
        : "";

  return (
    <nav aria-label="Điều hướng chính" className="dashboard-bottom-nav fixed inset-x-0 bottom-0 z-50 border-t border-border bg-surface/95 px-3 pb-[max(8px,env(safe-area-inset-bottom))] pt-2 shadow-[0_-8px_28px_rgba(25,43,25,.08)] md:hidden">
      <div className="mx-auto grid max-w-md grid-cols-4 gap-1">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.id;
          return (
            <Link key={item.id} href={item.href} aria-current={isActive ? "page" : undefined} className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl px-1 text-[11px] font-semibold transition-colors ${isActive ? "bg-primary-soft text-primary" : "text-secondary"}`}>
              <Icon className="size-6" strokeWidth={isActive ? 2.2 : 1.8} />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
