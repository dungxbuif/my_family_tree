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
      className="flex min-h-11 w-full items-center gap-2 px-4 py-2 text-sm font-medium text-secondary transition-colors hover:bg-primary-soft hover:text-primary"
    >
      <LogOut className="size-4" />
      {isLoggingOut ? "Đang xử lý..." : "Đăng xuất"}
    </button>
  );
}
