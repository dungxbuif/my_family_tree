"use client";

import { exportData } from "@/app/actions/data";
import type { PersonOption } from "@/types";
import {
  backupFileLimit,
  backupSizeMessage,
} from "@/utils/family/backup-limit";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  currentHistoryIndex,
  useStaleTreeDraft,
  useUnsavedNavigation,
} from "@/hooks/useUnsavedNavigation";
import { useCollectionDialog } from "@/hooks/useCollectionDialog";
import PersonSelector from "./PersonSelector";

export default function DataImportExport({
  treeId,
  treeName,
  persons,
}: {
  treeId: string;
  treeName: string;
  persons: PersonOption[];
}) {
  const [root, setRoot] = useState<string | null>(null);
  const [busy, setBusy] = useState<"export" | "import" | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [entry, setEntry] = useState(0);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const picker = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const stale = useStaleTreeDraft();
  useUnsavedNavigation(!!file, "Hủy tệp phục hồi đã chọn và rời trang?");
  useEffect(() => {
    if (!file) return;
    let returning = false,
      allowed = false;
    const message = "Hủy tệp phục hồi đã chọn và rời trang?";
    const navigation = (window as Window & { navigation?: EventTarget })
      .navigation;
    function navigate(input: Event) {
      const event = input as Event & {
        navigationType: string;
        destination: { sameDocument: boolean; index: number };
      };
      if (
        event.navigationType !== "traverse" ||
        !event.destination.sameDocument ||
        !event.cancelable ||
        event.destination.index === entry ||
        document.documentElement.dataset.staleTreeDraft
      )
        return;
      if (busy || !window.confirm(message)) {
        event.preventDefault();
        return;
      }
      allowed = true;
    }
    navigation?.addEventListener("navigate", navigate);
    function traverse(event: PopStateEvent) {
      if (allowed || document.documentElement.dataset.staleTreeDraft) return;
      const delta = entry - currentHistoryIndex();
      if (!delta) {
        if (returning) {
          event.stopImmediatePropagation();
          returning = false;
        }
        return;
      }
      if (busy || !window.confirm(message)) {
        event.stopImmediatePropagation();
        returning = true;
        history.go(delta);
      } else {
        setFile(null);
      }
    }
    window.addEventListener("popstate", traverse, true);
    return () => {
      navigation?.removeEventListener("navigate", navigate);
      window.removeEventListener("popstate", traverse, true);
    };
  }, [file, busy, entry]);
  const dismiss = () => {
    if (!busy && !stale) {
      setFile(null);
      setError("");
    }
  };
  const dialog = useCollectionDialog(!!file, dismiss);
  async function download(format: "json" | "csv" | "ged") {
    setBusy("export");
    setError("");
    setStatus("");
    try {
      const data = await exportData(treeId, root ?? undefined);
      if ("error" in data) throw Error(data.error);
      let blob: Blob;
      if (format === "csv")
        blob = await (await import("@/utils/csv")).exportToCsvZip(data);
      else if (format === "ged")
        blob = new Blob(
          [(await import("@/utils/gedcom")).exportToGedcom(data)],
          { type: "text/plain" },
        );
      else
        blob = new Blob([JSON.stringify(data, null, 2)], {
          type: "application/json",
        });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download =
        "giapha-" + treeId + "." + (format === "csv" ? "zip" : format);
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      setStatus("Đã xuất bản sao lưu.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể xuất dữ liệu.");
    } finally {
      setBusy(null);
    }
  }
  async function restore() {
    if (!file || busy || stale) return;
    setBusy("import");
    setError("");
    try {
      const body = new FormData();
      body.set("backup", file);
      body.set("confirmed", "replace");
      const response = await fetch(
        "/dashboard/data/restore?tree=" + encodeURIComponent(treeId),
        { method: "POST", headers: { accept: "application/json" }, body },
      );
      const result = await response.json();
      if (!response.ok || !result.success)
        throw Error(result.error || "Không thể phục hồi dữ liệu.");
      setStatus(
        `Đã phục hồi ${result.imported.persons} thành viên và ${result.imported.relationships} quan hệ.`,
      );
      if (!document.documentElement.dataset.staleTreeDraft) {
        setFile(null);
        setRoot(null);
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không thể phục hồi dữ liệu.");
    } finally {
      setBusy(null);
    }
  }
  return (
    <div className="backup-interactive grid min-w-0 gap-4 md:grid-cols-2">
      <section className="min-w-0 rounded-[20px] border border-border bg-surface p-4 shadow-soft [&_[role=listbox]]:min-w-0">
        <h2 className="mb-3 text-lg font-semibold">Sao lưu dữ liệu</h2>
        {persons.length === 0 && (
          <p className="mb-3 text-secondary">
            Chưa có thành viên trong cây gia phả.
          </p>
        )}
        <PersonSelector
          persons={persons}
          selectedId={root}
          onSelect={setRoot}
          label="Điểm gốc để xuất dữ liệu"
          showAllOption
          allOptionLabel="Toàn bộ dữ liệu"
        />
        <div className="mt-4 grid gap-2">
          {(["json", "csv", "ged"] as const).map((format) => (
            <button
              key={format}
              className={format === "json" ? "btn-primary" : "btn-secondary"}
              disabled={!!busy || stale}
              onClick={() => download(format)}
            >
              {busy === "export"
                ? "Đang xuất…"
                : format === "json"
                  ? "Xuất JSON"
                  : format === "csv"
                    ? "Xuất CSV (Zip)"
                    : "Xuất GEDCOM"}
            </button>
          ))}
        </div>
      </section>
      <section className="min-w-0 rounded-[20px] border border-border bg-surface p-4 shadow-soft [&_[role=listbox]]:min-w-0">
        <h2 className="mb-3 text-lg font-semibold">Phục hồi dữ liệu</h2>
        <p className="mb-4 text-secondary">
          Chọn tệp JSON, CSV (Zip) hoặc GEDCOM tối đa 8 MiB. JSON và CSV phiên
          bản 4 chứa cả thông tin riêng tư và thư viện ảnh.
        </p>
        <input
          type="file"
          ref={picker}
          accept=".json,.ged,.zip"
          className="hidden"
          onChange={(e) => {
            const selected = e.currentTarget.files?.[0];
            e.currentTarget.value = "";
            if (!selected) return;
            if (selected.size > backupFileLimit) {
              setStatus("");
              setError(backupSizeMessage);
              return;
            }
            setError("");
            setStatus("");
            if (!/\.(json|ged|zip)$/i.test(selected.name)) {
              setError("Vui lòng chọn tệp JSON, GEDCOM hoặc ZIP.");
              return;
            }
            setEntry(currentHistoryIndex());
            setFile(selected);
          }}
        />
        <button
          className="btn-secondary w-full"
          data-collection-focus
          disabled={!!busy || stale}
          onClick={() => picker.current?.click()}
        >
          Chọn file phục hồi
        </button>
      </section>
      {status && (
        <p role="status" className="text-success">
          {status}
        </p>
      )}
      {error && !file && (
        <p role="alert" className="text-error">
          {error}
        </p>
      )}
      {file && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary-dark/40 p-4">
          <div
            ref={dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="restore-title"
            tabIndex={-1}
            className="max-h-[90dvh] w-full max-w-md overflow-auto rounded-[20px] bg-surface p-5 shadow-soft"
          >
            <form
              data-dirty-tree-draft="true"
              data-recovery-role="owner"
              data-tree-draft-entry-index={entry}
              onSubmit={(e) => {
                e.preventDefault();
                void restore();
              }}
            >
              <h2 id="restore-title" className="text-lg font-semibold">
                Xác nhận phục hồi
              </h2>
              <p className="my-3 break-words">
                Thay thế thành viên, quan hệ, thông tin riêng tư và sự kiện của
                cây <strong>{treeName}</strong> bằng tệp{" "}
                <strong>{file.name}</strong>. Bản sao lưu phiên bản 4 cũng thay
                thế thư viện ảnh.
              </p>
              <p className="text-error">Hành động này không thể hoàn tác.</p>
              <div data-tree-recovery />
              {error && (
                <p role="alert" className="mt-2 break-words text-error">
                  {error}
                </p>
              )}
              {status && <p role="status">{status}</p>}
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={!!busy || stale}
                  onClick={dismiss}
                >
                  Hủy bỏ
                </button>
                <button
                  className="min-h-13 rounded-xl bg-error px-4 font-semibold text-white disabled:opacity-50"
                  disabled={!!busy || stale || !!status}
                >
                  {busy === "import" ? "Đang phục hồi…" : "Xác nhận thay thế"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
