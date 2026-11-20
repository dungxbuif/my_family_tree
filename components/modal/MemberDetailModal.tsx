"use client";

import { fetchMemberDetail } from "@/app/actions/member";
import MemberDetailContent from "@/context/MemberDetailContent";
import MemberForm from "@/components/MemberForm";
import { Person, TreeRole } from "@/types";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { AlertCircle, ArrowLeft, Edit2, ExternalLink, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useMemberListView } from "@/context/MemberListContext";
import { useStaleTreeDraft } from "@/hooks/useUnsavedNavigation";
import TreeAddMember from "../TreeAddMember";

export default function MemberDetailModal({treeId,role,graph = false}: {treeId:string;role:TreeRole;graph?:boolean}) {
  const {
    view, memberModalId: memberId,
    setMemberModalId,
    showCreateMember,
    setShowCreateMember,
  } = useMemberListView();
  const isOwner = role === "owner", canEdit = role !== "viewer";
  const router = useRouter();
  const frozen = useStaleTreeDraft();
  const [isOpen, setIsOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [person, setPerson] = useState<Person | null>(null);
  const [privateData, setPrivateData] = useState<Record<
    string,
    unknown
  > | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  const returnToDetails = () => {
    if (!document.documentElement.dataset.staleTreeDraft) setIsEditing(false);
  };
  const closeModal = useCallback(() => {
    if (document.documentElement.dataset.staleTreeDraft) return;
    setMemberModalId(null);
    setShowCreateMember(false);
    setIsEditing(false);
  }, [setMemberModalId, setShowCreateMember]);

  const fetchData = useCallback(
    async (id: string) => {
      setLoading(true);
      setError(null);
      try {
        const { person, privateData } = await fetchMemberDetail(id, treeId);
        setPerson(person);
        setPrivateData(privateData || {});
      } catch (err) {
        console.error("Error fetching member details:", err);
        // @ts-expect-error - err is caught as unknown, but we check for message
        setError(err?.message || "Đã xảy ra lỗi hệ thống.");
      } finally {
        setLoading(false);
      }
    },
    [treeId],
  );

  // Sync state with URL parameter or create mode
  useEffect(() => {
    let timeoutId: NodeJS.Timeout | null = null;

    /* eslint-disable react-hooks/set-state-in-effect -- URL state is the external source of truth for this modal. */
    if (memberId) {
      setIsOpen(true);
      setIsEditing(false); // always start on detail view when opening
      fetchData(memberId);
    } else if (showCreateMember) {
      setIsOpen(true);
      setIsEditing(false);
      setPerson(null);
      setPrivateData(null);
      setError(null);
    } else {
      setIsOpen(false);
      timeoutId = setTimeout(() => {
        setPerson(null);
        setPrivateData(null);
        setError(null);
        setIsEditing(false);
      }, 300);
    }
    /* eslint-enable react-hooks/set-state-in-effect */

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [memberId, showCreateMember, fetchData]);

  // Prevent background scrolling when modal is open
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = previousOverflow;
    }
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const timer = window.setTimeout(() => closeButtonRef.current?.focus(), 0);
    const handleEscape = (event: KeyboardEvent) => {
      if (document.querySelector("dialog[open]")) return;
      if (event.key === "Escape" && !isEditing && !showCreateMember) {
        closeModal();
      }
      if (event.key === "Tab" && modalRef.current) {
        const focusable = modalRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [closeModal, isOpen, isEditing, showCreateMember]);

  // Called by MemberForm after a successful save
  const handleEditSuccess = (savedPersonId: string) => {
    // Clear stale data first so the loading state is shown while refetching
    setIsEditing(false);
    setPerson(null);
    setPrivateData(null);
    fetchData(savedPersonId);
    // Revalidate Next.js server component cache so the dashboard list/members updates
    router.refresh();
  };

  // Called by MemberForm after a successful CREATE
  const handleCreateSuccess = (savedPersonId: string) => {
    setShowCreateMember(false);
    // Open the detail modal for the new member
    setMemberModalId(savedPersonId);
    // Delay refresh so React commits state changes first,
    // ensuring the server component re-fetches the updated member list.
    setTimeout(() => {
      router.refresh();
    }, 100);
  };

  // initialData for MemberForm — merge public + private
  const formInitialData = person
    ? { ...person, ...(privateData ?? {}) }
    : undefined;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.2 }}
          className="fixed inset-0 z-100 flex items-end justify-center bg-stone-900/40 sm:items-center sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label="Chi tiết thành viên"
        >
          {/* Click-away backdrop (disabled while editing/creating to avoid accidental close) */}
          {!isEditing && !showCreateMember && (
            <div
              className="absolute inset-0 cursor-pointer"
              onClick={closeModal}
            />
          )}

          {/* Modal Content */}
          <motion.div
            layout
            initial={{ scale: 0.96, opacity: 0, y: 15 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 15 }}
            transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.25, ease: "easeOut" }}
            layoutDependency={false}
            className="relative flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-3xl border border-stone-200 bg-surface pb-[var(--safe-bottom)] shadow-soft sm:max-h-[90vh] sm:max-w-4xl sm:rounded-3xl sm:pb-0"
            ref={modalRef}
          >
            {/* Sticky Header Actions */}
            <div className="absolute right-3 top-3 z-20 flex items-center gap-2 sm:right-5 sm:top-5">
              {isEditing ? (
                /* In edit mode — show back button */
                <button
                  aria-label="Quay lại"
                  disabled={frozen}
                  onClick={returnToDetails}
                  className="inline-flex items-center justify-center shrink-0 gap-1.5 px-3 py-2.5 bg-stone-100/80 text-stone-700 rounded-full hover:bg-stone-200 font-medium text-sm border border-stone-200/50 hover:-translate-y-1 hover:shadow-soft-hover transition-all duration-300"
                >
                  <ArrowLeft className="size-4" />
                  <span className="hidden sm:inline">Quay lại</span>
                </button>
              ) : (
                canEdit &&
                person && (
                  <>
                    <Link
                      href={`/dashboard/members/${person.id}`}
                      aria-label={`Mở trang ${person.full_name}`}
                      className="btn-amber text-sm"
                    >
                      <ExternalLink className="size-4" />
                      <span className="hidden sm:inline">Xem</span>
                    </Link>
                    <button
                      onClick={() => setIsEditing(true)}
                      aria-label={`Chỉnh sửa ${person.full_name}`}
                      className="btn-amber text-sm"
                    >
                      <Edit2 className="size-4" />
                      <span className="hidden sm:inline">Chỉnh sửa</span>
                    </button>
                  </>
                )
              )}
              <button
                onClick={closeModal}
                disabled={frozen}
                ref={closeButtonRef}
                  className="flex min-h-11 min-w-11 items-center justify-center rounded-full border border-stone-200/50 bg-stone-100/80 text-stone-600 shadow-sm transition-colors hover:bg-stone-200 hover:text-stone-900"
                aria-label="Đóng"
              >
                <X className="size-5" />
              </button>
            </div>

            <AnimatePresence mode="wait">
              {loading ? (
                <motion.div
                  key="loading"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                  className="flex-1 min-h-[500px] flex items-center justify-center flex-col gap-4"
                >
                  <div className="size-10 border-4 border-amber-600 border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-stone-500 font-medium">Đang tải...</p>
                </motion.div>
              ) : error ? (
                <motion.div
                  key="error"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2 }}
                  className="flex-1 min-h-[400px] flex items-center justify-center flex-col gap-4 p-8 text-center"
                >
                  <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-2 shadow-inner">
                    <AlertCircle className="size-8" />
                  </div>
                  <p className="text-red-600 font-medium text-lg">{error}</p>
                  <button
                    onClick={closeModal}
                    className="btn mt-2 rounded-full"
                  >
                    Đóng
                  </button>
                </motion.div>
              ) : isEditing && formInitialData ? (
                /* ── EDIT MODE ── */
                <motion.div
                  key="editing"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.2 }}
                  className="flex-1 overflow-y-auto custom-scrollbar px-4 sm:px-8 pt-16 pb-8"
                >
                  <h2 className="text-xl font-serif font-bold text-stone-800 mb-6">
                    Chỉnh sửa thành viên
                  </h2>
                  <MemberForm
                    treeId={treeId}
                    initialData={
                      formInitialData as Parameters<
                        typeof MemberForm
                      >[0]["initialData"]
                    }
                    isEditing={true}
                    isOwner={isOwner}
                    onSuccess={handleEditSuccess}
                    onCancel={returnToDetails}
                  />
                </motion.div>
              ) : showCreateMember && canEdit ? (
                /* ── CREATE MODE ── */
                <motion.div
                  key="creating"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.2 }}
                  className="flex-1 overflow-y-auto custom-scrollbar px-4 sm:px-8 pt-16 pb-8"
                >
                  <h2 className="text-xl font-serif font-bold text-stone-800 mb-6">
                    Thêm thành viên mới
                  </h2>
                  <MemberForm
                    treeId={treeId}
                    isOwner={isOwner}
                    onSuccess={handleCreateSuccess}
                    onCancel={closeModal}
                  />
                </motion.div>
              ) : person ? (
                /* ── DETAIL MODE ── */
                <motion.div
                  key="details"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.3 }}
                  className="flex-1 overflow-y-auto custom-scrollbar"
                >
                  {graph && view !== "list" && canEdit && <div className="relative z-10 px-4 pt-16"><TreeAddMember treeId={treeId} selected={person} /></div>}
                  <MemberDetailContent
                    person={person}
                    privateData={privateData}
                    isOwner={isOwner}
                    canEdit={canEdit}
                  />
                </motion.div>
              ) : null}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
