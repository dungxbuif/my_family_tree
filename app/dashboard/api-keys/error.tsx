"use client";
export default function ApiKeysError({ reset }: { reset: () => void }) {
  return (
    <main className="content-gutter mx-auto w-full max-w-xl space-y-4 py-6">
      <h1 className="text-[26px] font-bold">Khóa API</h1>
      <p role="alert">Không thể tải khóa của bạn.</p>
      <button className="btn min-h-11" onClick={reset}>
        Thử lại
      </button>
      <a className="btn min-h-11" href="/dashboard/account">
        Tài khoản
      </a>
    </main>
  );
}
