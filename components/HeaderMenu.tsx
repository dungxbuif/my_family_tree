"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  BarChart2,
  Bell,
  ChevronDown,
  Database,
  GitMerge,
  Network,
  UserCircle,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import LogoutButton from "./LogoutButton";
import { useUser } from "./UserProvider";

export default function HeaderMenu() {
  const { user, profile, isAdmin } = useUser();
  const isSuperAdmin = profile?.is_active && profile.is_super_admin;
  const userEmail = user?.email;
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-label={isOpen ? "Đóng menu tài khoản" : "Mở menu tài khoản"}
        aria-expanded={isOpen}
        className="relative flex size-11 items-center justify-center rounded-full border border-[var(--color-border)] bg-white text-[var(--color-primary)] transition-colors hover:bg-[var(--color-primary-soft)]"
      >
        <Bell className="size-5" aria-hidden="true" />
        <span className="absolute right-2.5 top-2.5 size-2 rounded-full border border-white bg-red-500" />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute right-0 mt-2 w-56 bg-surface rounded-3xl shadow-soft border border-border py-2 z-50 overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-stone-100 bg-stone-50/50">
              <div className="flex items-center gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-soft)] font-bold text-[var(--color-primary)]">
                  {userEmail ? userEmail.charAt(0).toUpperCase() : <UserCircle className="size-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold uppercase tracking-wider text-stone-400">Tài khoản</p>
                  <p className="truncate text-sm font-medium text-stone-900">{userEmail}</p>
                </div>
                <ChevronDown className={`size-4 text-stone-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </div>
            </div>

            <div className="py-1">
              <Link
                href="/dashboard"
                onClick={() => setIsOpen(false)}
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-stone-700 hover:text-amber-700 hover:bg-amber-50 transition-colors"
              >
                <Network className="size-4" />
                Bảng điều khiển
              </Link>

              <Link
                href="/dashboard/members"
                onClick={() => setIsOpen(false)}
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-stone-700 hover:text-amber-700 hover:bg-amber-50 transition-colors"
              >
                <Network className="size-4" />
                Cây gia phả
              </Link>

              <Link
                href="/dashboard/kinship"
                onClick={() => setIsOpen(false)}
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-stone-700 hover:text-amber-700 hover:bg-amber-50 transition-colors"
              >
                <GitMerge className="size-4" />
                Tra cứu danh xưng
              </Link>

              <Link
                href="/dashboard/stats"
                onClick={() => setIsOpen(false)}
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-stone-700 hover:text-amber-700 hover:bg-amber-50 transition-colors"
              >
                <BarChart2 className="size-4" />
                Thống kê
              </Link>

              {isSuperAdmin && (
                // Open a document so browser Back also triggers the form's unload guard.
                <a
                  href="/dashboard/users"
                  className="flex min-h-11 items-center gap-2 px-4 py-2 text-sm font-medium text-primary hover:bg-primary-soft"
                >
                  <Users className="size-5" aria-hidden="true" />
                  Quản lý người dùng
                </a>
              )}

              {isAdmin && (
                <>
                  <Link
                    href="/dashboard/lineage"
                    onClick={() => setIsOpen(false)}
                    className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-stone-700 hover:text-amber-700 hover:bg-amber-50 transition-colors"
                  >
                    <Network className="size-4" />
                    Thứ tự gia phả
                  </Link>

                  <Link
                    href="/dashboard/data"
                    onClick={() => setIsOpen(false)}
                    className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-stone-700 hover:text-teal-700 hover:bg-teal-50 transition-colors"
                  >
                    <Database className="size-4" />
                    Sao lưu & Phục hồi
                  </Link>
                </>
              )}

              <div className="h-px bg-stone-100 my-1 mx-4" />

              <LogoutButton />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
