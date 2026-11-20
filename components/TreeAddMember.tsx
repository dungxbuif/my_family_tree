"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  useStaleTreeDraft,
  useUnsavedNavigation,
} from "@/hooks/useUnsavedNavigation";
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
  const { requestCreatedFocus } = useMemberListView();
  const dialog = useRef<HTMLDialogElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const submission = useRef("");
  const stale = useStaleTreeDraft();
  const [dirty, setDirty] = useState(false);
  const [opened, setOpened] = useState(false);
  const [nameError, setNameError] = useState("");
  const nameErrorId = useId();
  const nameInput = useRef<HTMLInputElement>(null);
  const editing = useCallback(() => Boolean(dialog.current?.open), []);
  useUnsavedNavigation(dirty, "Hủy các thay đổi chưa lưu?", editing);
  useEffect(() => {
    const viewport = window.visualViewport,
      sheet = dialog.current;
    if (!opened || !sheet || !viewport) return;
    function resize() {
      sheet!.style.setProperty("--tree-form-height", viewport!.height + "px");
      sheet!.style.setProperty("--tree-form-top", viewport!.offsetTop + "px");
    }
    resize();
    viewport.addEventListener("resize", resize);
    viewport.addEventListener("scroll", resize);
    return () => {
      viewport.removeEventListener("resize", resize);
      viewport.removeEventListener("scroll", resize);
    };
  }, [opened]);
  const pending = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const field =
    "mt-1 block min-h-13 w-full min-w-0 rounded-[12px] border border-border bg-surface px-3 text-primary";
  function cancel() {
    if (
      pending.current ||
      stale ||
      (dirty && !window.confirm("Hủy các thay đổi chưa lưu?"))
    )
      return;
    setDirty(false);
    setOpened(false);
    dialog.current?.close();
    if (history.state?.personDraft === submission.current) history.back();
  }
  useEffect(() => {
    if (!opened) return;
    // The dialog occupies its own history entry. Back dismisses it without losing the graph.
    const graphUrl = location.href;
    function back(event: PopStateEvent) {
      if (
        !dialog.current?.open ||
        event.state?.personDraft === submission.current
      )
        return;
      if (
        pending.current ||
        stale ||
        (dirty && !window.confirm("Hủy các thay đổi chưa lưu?"))
      ) {
        event.stopImmediatePropagation();
        history.pushState(
          { ...history.state, personDraft: submission.current },
          "",
          graphUrl,
        );
        return;
      }
      dialog.current.close();
    }
    window.addEventListener("popstate", back, true);
    return () => window.removeEventListener("popstate", back, true);
  }, [opened, dirty, stale]);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || stale) return;
    if (!nameInput.current?.value.trim()) {
      setNameError("Vui lòng nhập họ tên.");
      nameInput.current?.focus();
      return;
    }
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
      // A peer may switch trees while the save is in flight. Its receipt can be recovered after restoring the draft.
      if (document.documentElement.dataset.staleTreeDraft) return;
      setDirty(false);
      dialog.current?.close();
      requestCreatedFocus(result.id);
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
          setDirty(false);
          setError("");
          setNameError("");
          history.pushState(
            { ...history.state, personDraft: submission.current },
            "",
            location.href,
          );
          setOpened(true);
          dialog.current?.showModal();
        }}
      >
        <Plus className="size-5" aria-hidden />
        Thêm thành viên
      </button>
      <dialog
        ref={dialog}
        aria-label="Thêm thành viên"
        onClose={() => {
          setOpened(false);
          setDirty(false);
        }}
        onCancel={(event) => {
          event.preventDefault();
          cancel();
        }}
        className="tree-add-dialog fixed inset-x-0 bottom-auto top-[var(--tree-form-top,0px)] m-0 h-[var(--tree-form-height,100dvh)] max-h-[var(--tree-form-height,100dvh)] md:inset-0 w-full max-w-none overflow-hidden bg-neutral text-primary backdrop:bg-black/40 md:m-auto md:h-fit md:max-h-[90dvh] md:max-w-lg md:rounded-3xl md:border md:border-border md:shadow-soft"
      >
        <form
          ref={form}
          data-dirty-tree-draft={dirty || undefined}
          data-recovery-role="editor"
          noValidate
          onSubmit={submit}
          onChange={() => {
            setDirty(true);
            setNameError("");
          }}
          className="flex h-full max-h-dvh flex-col md:max-h-[90dvh]"
        >
          <header className="shrink-0 border-b border-border bg-surface px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))]">
            <h2 className="text-[22px] font-semibold leading-[30px]">
              Thêm thành viên
            </h2>
          </header>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            <div data-tree-recovery className="empty:hidden" />
            <label className="block font-medium">
              Họ và tên
              <input
                ref={nameInput}
                aria-invalid={Boolean(nameError)}
                aria-describedby={nameError ? nameErrorId : undefined}
                name="full_name"
                autoComplete="off"
                required
                className={field}
              />
            </label>
            {nameError && (
              <p id={nameErrorId} role="alert" className="text-error">
                {nameError}
              </p>
            )}
            <label className="block font-medium">
              Tình trạng
              <select
                name="is_deceased"
                defaultValue="unknown"
                className={field}
              >
                <option value="unknown">Chưa rõ</option>
                <option value="false">Sống</option>
                <option value="true">Đã mất</option>
              </select>
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
              disabled={saving || stale}
              className="btn h-[52px] py-0"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={saving || stale}
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
