import config from "@/app/config";
import HeaderMenu from "@/components/HeaderMenu";
import Image from "next/image";
import Link from "next/link";

export default function DashboardHeader() {
  return (
    <header className="sticky top-0 z-40 bg-surface/90 backdrop-blur-xl border-b border-border shadow-soft transition-all duration-200">
      <div className="max-w-7xl mx-auto content-gutter h-16 flex items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard"
            className="group flex items-center gap-2 sm:gap-3"
          >
            <div className="relative size-8 rounded-xl overflow-hidden shrink-0 border border-border transition-all">
              <Image
                src="/icon.png"
                alt="Logo"
                fill
                className="object-contain"
                sizes="32px"
              />
            </div>
            <h1 className="text-base sm:text-2xl font-serif font-bold text-stone-800 group-hover:text-amber-700 transition-colors truncate">
              {config.siteName}
            </h1>
          </Link>
        </div>
        <div className="flex items-center gap-4">
          <HeaderMenu />
        </div>
      </div>
    </header>
  );
}
