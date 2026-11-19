"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
} from "react";
import { flushSync } from "react-dom";
import { useUnsavedNavigation } from "@/hooks/useUnsavedNavigation";
import {
  scopes,
  type CredentialSummary,
  type CredentialPage,
  type Scope,
} from "@/utils/agent/contract";

const labels: Record<Scope, string> = {
  read: "Đọc dữ liệu",
  write: "Thêm và sửa",
  private: "Dữ liệu riêng tư",
  delete: "Xóa dữ liệu",
};
const date = (value: string) =>
  new Date(value).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
const section =
  "space-y-4 rounded-[20px] border border-border bg-surface p-4 shadow-soft sm:p-6";
const subscribe = () => () => {};
const inputClass =
  "mt-1 min-h-11 w-full min-w-0 rounded-xl border border-border bg-surface px-3 py-2 text-foreground";
export default function AgentCredentials({
  initial,
}: {
  initial: CredentialPage;
}) {
  const ready = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  const [page, setPage] = useState(initial);
  const keys = page.credentials;
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const [secret, setSecret] = useState("");
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const requestPending = useRef(false);
  const reveal = useRef<HTMLElement>(null);
  useUnsavedNavigation(
    Boolean(secret) || dirty || pending,
    secret
      ? "Khóa chỉ hiển thị một lần. Bạn đã lưu khóa và muốn rời trang?"
      : "Rời trang khi chưa hoàn tất?",
  );
  useEffect(() => {
    if (!secret) return;
    reveal.current?.focus();
    // Discard the secret before a document enters the browser back/forward cache.
    const hide = () => flushSync(() => setSecret(""));
    window.addEventListener("pagehide", hide);
    return () => window.removeEventListener("pagehide", hide);
  }, [secret]);
  async function mutate(method: "POST" | "DELETE", input: object) {
    const response = await fetch("/dashboard/api-keys/manage", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      cache: "no-store",
      redirect: "error",
    });
    const data = await response.json();
    if (!response.ok)
      throw Error(data.message || "Không thể hoàn tất yêu cầu.");
    return data as { credential: CredentialSummary; secret?: string };
  }
  async function loadPage(history: (string | null)[]) {
    const cursor = history[history.length - 1];
    const url =
      "/dashboard/api-keys/manage" +
      (cursor ? "?cursor=" + encodeURIComponent(cursor) : "");
    const response = await fetch(url, { cache: "no-store", redirect: "error" });
    const data = await response.json();
    if (!response.ok)
      throw Error(data.message || "Không thể tải danh sách khóa.");
    setPage(data as CredentialPage);
    setCursors(history);
    setConfirm("");
  }
  async function run(action: () => Promise<void>) {
    if (requestPending.current) return;
    requestPending.current = true;
    setPending(true);
    setError("");
    setMessage("");
    try {
      await action();
    } catch (error) {
      setError(
        error instanceof TypeError
          ? "Mất kết nối. Tải lại để kiểm tra danh sách khóa."
          : error instanceof Error
            ? error.message
            : "Không thể hoàn tất yêu cầu.",
      );
    } finally {
      requestPending.current = false;
      setPending(false);
    }
  }
  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const selected = fields.getAll("scope");
    if (!selected.length) {
      setError("Vui lòng chọn ít nhất một quyền.");
      return;
    }
    const expires = String(fields.get("expires") || "");
    void run(async () => {
      const data = await mutate("POST", {
        name: fields.get("name"),
        scopes: selected,
        expiresAt: expires ? new Date(expires).toISOString() : null,
      });
      setSecret(data.secret!);
      setDirty(false);
      form.reset();
      await loadPage([null]);
    });
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(secret);
      setMessage("Đã sao chép khóa.");
      setError("");
    } catch {
      setError("Hãy chọn toàn bộ khóa rồi sao chép thủ công.");
    }
  }
  return (
    <>
      {secret ? (
        <section
          ref={reveal}
          tabIndex={-1}
          className={section}
          aria-labelledby="new-key-heading"
        >
          <h2 id="new-key-heading" className="text-lg font-semibold">
            Lưu khóa mới
          </h2>
          <p>
            Khóa đầy đủ chỉ hiển thị lần này. Hãy lưu vào trình quản lý mật
            khẩu.
          </p>
          <code
            data-secret
            className="block select-all break-all rounded-xl bg-stone-100 p-3"
          >
            {secret}
          </code>
          <div className="flex flex-wrap gap-3">
            <button className="btn min-h-11" onClick={copy}>
              Sao chép
            </button>
            <button
              className="btn-primary min-h-[52px]"
              onClick={() => {
                setSecret("");
                setMessage("Đã ẩn khóa.");
                setError("");
              }}
            >
              Đã lưu khóa
            </button>
          </div>
        </section>
      ) : (
        <form
          onSubmit={create}
          onChange={() => setDirty(true)}
          className={section}
        >
          <h2 className="text-lg font-semibold">Tạo khóa mới</h2>
          <noscript>Bật JavaScript để tạo hoặc thu hồi khóa API.</noscript>
          <fieldset disabled={!ready || pending} className="min-w-0 space-y-4">
            <label className="block">
              Tên khóa
              <input
                className={inputClass}
                name="name"
                required
                maxLength={100}
                autoComplete="off"
              />
            </label>
            <fieldset>
              <legend>Quyền của khóa</legend>
              {scopes.map((s) => (
                <label key={s} className="flex min-h-11 items-center gap-3">
                  <input
                    type="checkbox"
                    name="scope"
                    value={s}
                    defaultChecked={s === "read"}
                  />
                  {labels[s]}
                </label>
              ))}
            </fieldset>
            <label className="block">
              Hết hạn lúc (tùy chọn)
              <input
                type="datetime-local"
                name="expires"
                className={inputClass}
              />
            </label>
            <button disabled={pending} className="btn-primary min-h-[52px]">
              {pending ? "Đang xử lý…" : "Tạo khóa"}
            </button>
          </fieldset>
        </form>
      )}
      {error && (
        <p role="alert" className="text-error">
          {error}
        </p>
      )}
      <p role="status" className="empty:hidden">
        {message}
      </p>
      <section className={section} aria-labelledby="my-keys">
        <h2 id="my-keys" className="text-lg font-semibold">
          Khóa của tôi
        </h2>
        {!keys.length && <p>Chưa có khóa API.</p>}
        {keys.map((key) => (
          <article
            key={key.id}
            className="min-w-0 space-y-2 border-t border-border pt-4"
          >
            <h3 className="break-all font-semibold">{key.name}</h3>
            <code className="block break-all">gptree_{key.public_prefix}</code>
            <p>{key.scopes.map((s) => labels[s]).join(" · ")}</p>
            <p className="text-secondary">
              {key.expires_at
                ? "Hết hạn " + date(key.expires_at)
                : "Không hết hạn"}{" "}
              ·{" "}
              {key.last_used_at
                ? "Dùng lần cuối " + date(key.last_used_at)
                : "Chưa sử dụng"}
            </p>
            {key.revoked_at ? (
              <p>Đã thu hồi</p>
            ) : confirm === key.id ? (
              <div
                className="space-y-2"
                role="group"
                aria-label="Xác nhận thu hồi"
              >
                <p>
                  Thu hồi khóa này? Tác nhân dùng khóa sẽ mất quyền truy cập
                  ngay.
                </p>
                <div className="flex flex-wrap gap-3">
                  <button
                    disabled={pending}
                    className="btn min-h-11"
                    onClick={() => setConfirm("")}
                  >
                    Hủy
                  </button>
                  <button
                    disabled={pending}
                    className="btn min-h-11 text-error"
                    onClick={() =>
                      void run(async () => {
                        const { credential } = await mutate("DELETE", {
                          id: key.id,
                        });
                        setPage((old) => ({
                          ...old,
                          credentials: old.credentials.map((k) =>
                            k.id === key.id ? credential : k,
                          ),
                        }));
                        setConfirm("");
                        setMessage("Đã thu hồi khóa.");
                      })
                    }
                  >
                    Xác nhận thu hồi
                  </button>
                </div>
              </div>
            ) : (
              <button
                disabled={pending || !!secret}
                className="btn min-h-11 text-error"
                onClick={() => setConfirm(key.id)}
              >
                Thu hồi
              </button>
            )}
          </article>
        ))}
        {(cursors.length > 1 || page.nextCursor) && (
          <nav
            aria-label="Trang danh sách khóa"
            className="flex flex-wrap items-center gap-3"
          >
            <button
              className="btn min-h-11"
              disabled={pending || cursors.length < 2}
              onClick={() => void run(() => loadPage(cursors.slice(0, -1)))}
            >
              Trang trước
            </button>
            <span aria-live="polite">Trang {cursors.length}</span>
            <button
              className="btn min-h-11"
              disabled={pending || !page.nextCursor}
              onClick={() =>
                void run(() => loadPage([...cursors, page.nextCursor!]))
              }
            >
              Trang sau
            </button>
          </nav>
        )}
      </section>
    </>
  );
}
