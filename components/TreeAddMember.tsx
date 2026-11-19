"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import type { Person } from "@/types";
import { saveMember } from "@/app/actions/member";
import { useMemberListView } from "@/context/MemberListContext";

export default function TreeAddMember({
  treeId,
  selected,
}: {
  treeId: string;
  selected?: Person;
}) {
  const router = useRouter();
  const { focusCreated } = useMemberListView();
  const dialog = useRef<HTMLDialogElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const submission = useRef("");
  const dirty = useRef(false);
  const pending = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const field =
    "mt-1 block min-h-13 w-full min-w-0 rounded-xl border border-border bg-surface px-3 text-primary";
  function cancel() {
    if (
      pending.current ||
      (dirty.current && !window.confirm("Hủy các thay đổi chưa lưu?"))
    )
      return;
    dialog.current?.close();
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    const data = new FormData(event.currentTarget);
    data.set("treeId", treeId);
    data.set("submissionId", submission.current);
    if (selected) data.set("relatedTo", selected.id);
    pending.current = true;
    setSaving(true);
    setError("");
    try {
      const result = await saveMember(data);
      if (!result.success) {
        setError(result.error);
        return;
      }
      dirty.current = false;
      dialog.current?.close();
      focusCreated.current = result.id;
      const destination = new URL(window.location.href);
      destination.searchParams.delete("memberModalId");
      destination.searchParams.set("rootId", result.id);
      router.replace(destination.pathname + destination.search, {
        scroll: false,
      });
    } catch {
      setError("Chưa nhận được kết quả. Bạn có thể lưu lại cùng biểu mẫu.");
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }
  return (
    <>
      <button
        type="button"
        className="btn-primary h-[52px] py-0"
        onClick={() => {
          form.current?.reset();
          submission.current = crypto.randomUUID();
          dirty.current = false;
          setError("");
          dialog.current?.showModal();
        }}
      >
        <Plus className="size-5" aria-hidden />
        Thêm thành viên
      </button>
      <dialog
        ref={dialog}
        aria-label="Thêm thành viên"
        onCancel={(event) => {
          event.preventDefault();
          cancel();
        }}
        className="tree-add-dialog fixed inset-0 m-0 h-dvh max-h-dvh w-full max-w-none overflow-hidden bg-neutral text-primary backdrop:bg-black/40 md:m-auto md:h-fit md:max-h-[90dvh] md:max-w-lg md:rounded-3xl md:border md:border-border md:shadow-soft"
      >
        <form
          ref={form}
          onSubmit={submit}
          onChange={() => {
            dirty.current = true;
          }}
          className="flex h-full max-h-dvh flex-col md:max-h-[90dvh]"
        >
          <header className="shrink-0 border-b border-border bg-surface px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))]">
            <h2 className="text-[22px] font-semibold leading-[30px]">
              Thêm thành viên
            </h2>
          </header>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            <label className="block font-medium">
              Họ và tên
              <input
                name="full_name"
                autoComplete="off"
                required
                className={field}
              />
            </label>
            <label className="block font-medium">
              Giới tính
              <select name="gender" defaultValue="other" className={field}>
                <option value="other">Chưa rõ / khác</option>
                <option value="female">Nữ</option>
                <option value="male">Nam</option>
              </select>
            </label>
            {selected && (
              <label className="block break-words font-medium">
                Quan hệ với {selected.full_name}
                <select name="relation" defaultValue="child" className={field}>
                  <option value="child">Con</option>
                  <option value="parent">Cha / mẹ</option>
                  <option value="spouse">Vợ / chồng</option>
                  <option value="adopted_child">Con nuôi</option>
                  <option value="adoptive_parent">Cha / mẹ nuôi</option>
                </select>
              </label>
            )}
            {error && (
              <p role="alert" className="text-error">
                {error}
              </p>
            )}
          </div>
          <footer className="grid shrink-0 grid-cols-2 gap-3 border-t border-border bg-surface px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
            <button
              type="button"
              onClick={cancel}
              disabled={saving}
              className="btn h-[52px] py-0"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={saving}
              className="btn-primary h-[52px] py-0"
            >
              {saving ? "Đang lưu…" : "Lưu"}
            </button>
          </footer>
        </form>
      </dialog>
    </>
  );
}
