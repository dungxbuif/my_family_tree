"use client";

import { login } from "@/app/actions/auth";
import Footer from "@/components/Footer";
import { Shield } from "lucide-react";
import { useActionState } from "react";

export default function LoginPage() {
  const [result, submit, loading] = useActionState(login, null);

  return (
    <div className="flex min-h-dvh flex-col bg-neutral">
      <main className="flex flex-1 items-center justify-center px-4 py-8">
        <div className="w-full max-w-md rounded-[20px] border border-border bg-surface p-6 shadow-soft sm:p-8">
          <div className="mb-6 text-center">
            <span className="mb-3 inline-flex size-12 items-center justify-center rounded-full bg-[var(--gp-accent-gold-soft)] text-primary">
              <Shield className="size-6" aria-hidden="true" />
            </span>
            <h1 className="font-serif text-[26px] font-bold leading-[34px] text-primary">Đăng nhập</h1>
          </div>
          <form action={submit} className="space-y-4">
            <div>
              <label htmlFor="email-address" className="mb-2 block body-sm font-semibold">Email</label>
              <input
                id="email-address"
                name="email"
                type="email"
                autoComplete="email"
                defaultValue={result?.email}
                required
                className="min-h-12 w-full rounded-lg border border-border bg-surface px-3 text-foreground"
              />
            </div>
            <div>
              <label htmlFor="password" className="mb-2 block body-sm font-semibold">Mật khẩu</label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="min-h-12 w-full rounded-lg border border-border bg-surface px-3 text-foreground"
              />
            </div>
            {result?.error && <p role="alert" className="body-sm text-error">{result.error}</p>}
            <button type="submit" disabled={loading} className="btn-primary min-h-13 w-full py-2! disabled:opacity-70">
              {loading ? "Đang đăng nhập…" : "Đăng nhập"}
            </button>
          </form>
        </div>
      </main>
      <Footer />
    </div>
  );
}
