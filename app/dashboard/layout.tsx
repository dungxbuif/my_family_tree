import config from "@/app/config";
import { HeritageBottomNav, HeritageHeader } from "@/components/heritage";
import TreeSelectionSync from "@/components/TreeSelectionSync";
import Footer from "@/components/Footer";
import LogoutButton from "@/components/LogoutButton";
import { UserProvider } from "@/components/UserProvider";
import { getProfile, getUser } from "@/utils/data/queries";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import React from "react";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, profile] = await Promise.all([getUser(), getProfile()]);

  if (!user) {
    redirect("/login");
  }

  if (!profile?.is_active) {
    return (
      <div className="min-h-screen bg-neutral text-primary flex flex-col font-sans">
        <header className="sticky top-0 z-30 bg-surface border-b border-stone-200 shadow-sm transition-all duration-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/" className="group flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-serif font-bold text-stone-800 group-hover:text-amber-700 transition-colors">
                  {config.siteName}
                </h1>
              </Link>
            </div>
            <div className="w-32">
              <LogoutButton />
            </div>
          </div>
        </header>
        <main className="flex-1 flex flex-col items-center justify-center p-4">
          <div className="max-w-md w-full text-center card-feature">
            <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="size-8"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-serif font-bold text-stone-800 mb-2">
              Tài khoản đã bị khóa
            </h2>
            <p className="text-stone-600">
              Tài khoản của bạn cần được Quản trị viên hệ thống kích hoạt.
            </p>
            <p className="text-stone-500 text-sm mt-4 italic">
              Vui lòng liên hệ Quản trị viên hệ thống để được hỗ trợ.
            </p>
          </div>
        </main>
        <Footer className="mt-auto bg-white border-t border-stone-200" />
      </div>
    );
  }

  return (
    <UserProvider user={user} profile={profile}>
      <TreeSelectionSync initialRevision={(await cookies()).get("family_tree_revision")?.value ?? ""} />
      <div className="dashboard-shell bg-neutral text-primary flex flex-col font-sans">
        <HeritageHeader />
        {children}
        <Footer
          className="mt-auto hidden bg-white border-t border-stone-200 md:block"
          showDisclaimer={true}
        />
        <HeritageBottomNav />
      </div>
    </UserProvider>
  );
}
