"use client";

import { exportData, importData } from "@/app/actions/data";
import type { PersonOption } from "@/types";
import { useState, useRef } from "react";
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
      const name = file.name.toLowerCase();
      const data = name.endsWith(".zip")
        ? await (await import("@/utils/csv")).parseCsvZip(file)
        : name.endsWith(".ged")
          ? {
              version: 1,
              ...(await import("@/utils/gedcom")).parseGedcom(
                await file.text(),
              ),
            }
          : JSON.parse(await file.text());
      const result = await importData(treeId, data);
      if (!result.success) throw Error(result.error);
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
    <div className="grid min-w-0 gap-4 md:grid-cols-2">
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
          Chọn tệp JSON, CSV (Zip) hoặc GEDCOM. JSON và CSV phiên bản 4 chứa cả
          thông tin riêng tư và thư viện ảnh.
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 p-4">
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
                  className="btn-primary"
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
