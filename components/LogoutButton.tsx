"use client";

import { logout } from "@/app/actions/auth";
import { LogOut } from "lucide-react";
import { useState } from "react";

export default function LogoutButton() {
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    try {
      await logout();
    } catch (error) {
      console.error("Lỗi đăng xuất:", error);
      setIsLoggingOut(false);
    }
  };

  return (
    <button
      onClick={handleLogout}
      disabled={isLoggingOut}
      className="flex items-center gap-2 w-full px-4 py-2.5 text-sm font-medium text-stone-700 hover:text-rose-700 hover:bg-rose-50 transition-colors"
    >
      <LogOut className="size-4" />
      {isLoggingOut ? "Đang xử lý..." : "Đăng xuất"}
    </button>
  );
}
