import type { ReactNode } from "react";

export default function FamilyTreesLayout({ children }: { children: ReactNode }) {
  return (
    <main className="content-gutter mx-auto w-full max-w-xl flex-1 pb-[calc(2rem+var(--safe-bottom))] pt-4">
      <a href="/dashboard/account" className="inline-flex min-h-11 items-center font-semibold text-primary">← Tài khoản</a>
      <h1 className="mb-4 font-sans text-[26px] font-bold leading-[34px] text-primary">Cây gia phả của tôi</h1>
      {children}
    </main>
  );
}
