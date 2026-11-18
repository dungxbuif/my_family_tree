import DefaultAvatar from "@/components/DefaultAvatar";
import type { Gender } from "@/types";
import type { LucideIcon } from "lucide-react";
import { ArrowLeft, ChevronRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

export function HeritageSurface({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-[20px] border border-border bg-surface shadow-soft ${className}`}>{children}</section>;
}

export function HeritageBanner({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <section className="relative min-h-44 overflow-hidden rounded-[24px] bg-primary-dark px-6 py-7 text-white shadow-soft sm:px-8">
      <Image src="/heritage/leaf.svg" alt="" width={240} height={160} className="pointer-events-none absolute -right-10 -top-10 h-44 w-64 rotate-12 object-contain opacity-25" />
      <Image src="/heritage/brand-tree.svg" alt="" width={160} height={160} className="pointer-events-none absolute -bottom-14 right-6 size-40 opacity-10 brightness-0 invert" />
      <div className="relative z-10 max-w-[72%]">
        <h1 className="font-serif text-[30px] font-bold leading-tight text-white">{title}</h1>
        <p className="mt-2 text-[16px] leading-6 text-white/90">{subtitle}</p>
        <span className="mt-5 block h-1 w-12 rounded-full bg-amber-300" />
      </div>
    </section>
  );
}

export function HeritagePageHero({ title, subtitle, backHref }: { title: string; subtitle?: string; backHref?: string }) {
  return (
    <section className="relative overflow-hidden rounded-[24px] bg-primary-dark px-5 py-5 text-white shadow-soft">
      <Image src="/heritage/leaf.svg" alt="" width={200} height={120} className="pointer-events-none absolute -right-8 -top-8 h-32 w-52 opacity-25" />
      <div className="relative z-10 flex items-center gap-4">
        {backHref && <Link href={backHref} aria-label="Quay lại" className="flex size-11 shrink-0 items-center justify-center rounded-full text-white hover:bg-white/10"><ArrowLeft className="size-7" /></Link>}
        <div>
          <h1 className="font-serif text-[26px] font-bold leading-tight text-white">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-white/85">{subtitle}</p>}
        </div>
      </div>
    </section>
  );
}

export function HeritageMetricCard({ label, value, icon: Icon, href }: { label: string; value: string | number; icon: LucideIcon; href: string }) {
  return (
    <Link href={href} className="flex min-h-[92px] items-center gap-3 rounded-[18px] border border-border bg-surface p-3.5 shadow-soft transition-transform hover:-translate-y-0.5">
      <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-700"><Icon className="size-6" /></span>
      <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-primary">{label}</span><span className="mt-0.5 block font-serif text-[26px] font-bold leading-none text-primary">{value}</span></span>
      <ChevronRight className="size-5 shrink-0 text-amber-700" />
    </Link>
  );
}

export function HeritagePersonCard({ name, label, avatarUrl, gender, href, featured = false }: { name: string; label: string; avatarUrl?: string | null; gender: Gender; href: string; featured?: boolean }) {
  return (
    <Link href={href} className={`relative flex min-w-[132px] flex-col items-center rounded-[18px] border bg-surface px-3 py-4 text-center shadow-soft ${featured ? "border-amber-400" : "border-border"}`}>
      {featured && <span className="absolute right-2 top-2 text-amber-500">★</span>}
      <span className="flex size-16 items-center justify-center overflow-hidden rounded-full bg-primary-soft ring-2 ring-surface">
        {avatarUrl ? <Image unoptimized src={avatarUrl} alt={name} width={64} height={64} className="size-full object-cover" /> : <DefaultAvatar gender={gender} size={44} />}
      </span>
      <span className="mt-2 line-clamp-2 min-h-10 text-sm font-bold leading-5 text-primary">{name}</span>
      <span className="mt-1 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800">{label}</span>
    </Link>
  );
}

export function HeritageEventRow({ icon: Icon, day, month, title, subtitle, countdown }: { icon: LucideIcon; day: string; month: string; title: string; subtitle: string; countdown?: string }) {
  return (
    <div className="flex min-h-[78px] items-center gap-3 rounded-[18px] border border-border bg-surface p-3 shadow-soft">
      <div className="flex w-14 shrink-0 flex-col items-center rounded-xl bg-primary-soft py-1.5 text-primary"><strong className="font-serif text-xl leading-none">{day}</strong><span className="mt-1 text-[11px] font-semibold">{month}</span></div>
      <Icon className="size-6 shrink-0 text-amber-700" />
      <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-primary">{title}</p><p className="mt-0.5 truncate text-xs text-secondary">{subtitle}</p></div>
      {countdown && <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-800">{countdown}</span>}
    </div>
  );
}
