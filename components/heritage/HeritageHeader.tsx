import config from "@/app/config";
import HeaderMenu from "@/components/HeaderMenu";
import Image from "next/image";
import Link from "next/link";

export default function HeritageHeader() {
  const productName = config.siteName === "Family Tree" ? "Gia Phả" : config.siteName;

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-neutral/95">
      <div className="mx-auto flex h-20 w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/dashboard" className="flex min-w-0 items-center gap-3" aria-label="Trang chủ gia phả">
          <Image src="/heritage/brand-tree.svg" alt="" width={48} height={48} className="size-11 shrink-0" priority />
          <span className="truncate font-serif text-[28px] font-bold leading-none text-primary">{productName}</span>
        </Link>
        <HeaderMenu />
      </div>
    </header>
  );
}
