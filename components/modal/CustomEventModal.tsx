"use client";

import { useCollectionDialog } from "@/hooks/useCollectionDialog";

import { saveCustomEvent, deleteCustomEvent } from "@/app/actions/data";
import { CustomEventRecord } from "@/utils/eventHelpers";
import { AnimatePresence, motion, Variants } from "framer-motion";
import {
  AlertCircle,
  AlignLeft,
  Calendar as CalendarIcon,
  Loader2,
  MapPin,
  Moon,
  Sun,
  X,
} from "lucide-react";
import { Lunar } from "lunar-javascript";
import { currentHistoryIndex, useUnsavedNavigation, useStaleTreeDraft } from "@/hooks/useUnsavedNavigation";
import { useEffect, useState } from "react";

interface CustomEventModalProps {
  treeId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  eventToEdit?: CustomEventRecord | null;
}

export default function CustomEventModal({
  treeId,
  isOpen,
  onClose,
  onSuccess,
  eventToEdit,
}: CustomEventModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editId, setEditId] = useState(eventToEdit?.id);
  const [name, setName] = useState(eventToEdit?.name || "");
  const [eventDate, setEventDate] = useState(eventToEdit?.event_date || "");
  const [location, setLocation] = useState(eventToEdit?.location || "");
  const [content, setContent] = useState(eventToEdit?.content || "");

  const [dirty,setDirty] = useState(false);
  const stale = useStaleTreeDraft();
  useUnsavedNavigation(isOpen && dirty,"Hủy các thay đổi chưa lưu?");
  const close = () => { if (!stale && !loading && (!dirty || window.confirm("Hủy các thay đổi chưa lưu?"))) onClose(); };

  // Lunar date mode
  const [dateMode, setDateMode] = useState<"solar" | "lunar">("solar");
  const [lunarDay, setLunarDay] = useState<number | "">("");
  const [lunarMonth, setLunarMonth] = useState<number | "">("");
  const [lunarYear, setLunarYear] = useState<number | "">("");
  const [lunarConvertError, setLunarConvertError] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (isOpen) {
      /* eslint-disable react-hooks/set-state-in-effect -- Opening the modal intentionally hydrates its draft from the selected event. */
      if (eventToEdit) {
        setName(eventToEdit.name);
        setEventDate(eventToEdit.event_date);
        setLocation(eventToEdit.location || "");
        setContent(eventToEdit.content || "");
      } else {
        setName("");
        // Default to today
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, "0");
        const d = String(now.getDate()).padStart(2, "0");
        setEventDate(`${y}-${m}-${d}`);
        setLocation("");
        setContent("");
      }
      setDirty(false);
      setError(null);
      setDateMode("solar");
      setLunarDay("");
      setLunarMonth("");
      setLunarYear("");
      setLunarConvertError(null);
      /* eslint-enable react-hooks/set-state-in-effect */
    }
  }, [isOpen, eventToEdit]);

  // Auto-convert lunar → solar when all 3 fields are filled
  useEffect(() => {
    if (
      dateMode === "lunar" &&
      lunarDay !== "" &&
      lunarMonth !== "" &&
      lunarYear !== "" &&
      lunarYear > 100
    ) {
      try {
        const lunar = Lunar.fromYmd(
          lunarYear as number,
          lunarMonth as number,
          lunarDay as number,
        );
        const solar = lunar.getSolar();
        const y = solar.getYear();
        const m = String(solar.getMonth()).padStart(2, "0");
        const d = String(solar.getDay()).padStart(2, "0");
        // Keep the submitted solar value synchronized with lunar inputs.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setEventDate(`${y}-${m}-${d}`);
        setLunarConvertError(null);
      } catch {
        setLunarConvertError("Ngày âm lịch không hợp lệ.");
      }
    }
  }, [dateMode, lunarDay, lunarMonth, lunarYear]);

  // Prevent background scrolling when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const payload = {
        id: editId,
        name,
        event_date: eventDate,
        location: location || null,
        content: content || null,
      };

      const result = await saveCustomEvent(payload,treeId);
      if (!result.success) throw new Error(result.error);

      if (document.documentElement.dataset.staleTreeDraft) {
        setEditId(result.id);
        return;
      }
      onSuccess();
      onClose();
    } catch (err) {
      console.error(err);
      if (err instanceof Error) {
        setError(err.message || "Đã xảy ra lỗi khi lưu sự kiện.");
      } else {
        setError("Đã xảy ra lỗi khi lưu sự kiện.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!editId) return;
    if (!window.confirm("Bạn có chắc chắn muốn xoá sự kiện này?")) return;

    setLoading(true);
    setError(null);
    try {
      const result = await deleteCustomEvent(editId, treeId);
      if (result.error) throw new Error(result.error);

      if (document.documentElement.dataset.staleTreeDraft) return;
      onSuccess();
      onClose();
    } catch (err) {
      console.error(err);
      if (err instanceof Error) {
        setError(err.message || "Đã xảy ra lỗi khi xoá sự kiện.");
      } else {
        setError("Đã xảy ra lỗi khi xoá sự kiện.");
      }
    } finally {
      setLoading(false);
    }
  };

  const formSectionVariants: Variants = {
    hidden: { opacity: 0, y: 10 },
    show: {
      opacity: 1,
      y: 0,
      transition: { type: "spring", stiffness: 300, damping: 24 },
    },
  };

  const dialog = useCollectionDialog(isOpen,close);
  const inputClasses =
    "min-h-11 min-w-0 bg-surface text-foreground placeholder-secondary block w-full rounded-xl border border-border shadow-sm focus:border-primary focus:ring-2 focus:ring-primary/20 focus:bg-surface text-sm px-4 py-3 transition-all outline-none!";

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-100 flex items-center justify-center p-4 sm:p-6 bg-primary-dark/40"
        >
          {/* Click-away backdrop */}
          <div className="absolute inset-0 cursor-pointer" onClick={close} />

          {/* Modal Content */}
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            transition={{ type: "spring", stiffness: 350, damping: 25 }}
            ref={dialog} tabIndex={-1}
            role="dialog" aria-modal="true" aria-label="Sự kiện"
            className="relative bg-surface rounded-3xl shadow-soft w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col border border-border"
          >
            {/* Sticky Header Actions */}
            <div className="absolute top-4 right-4 sm:top-5 sm:right-5 z-20 flex items-center gap-2">
              <button
                type="button"
                onClick={close}
                disabled={loading || stale}
                className="size-11 flex items-center justify-center bg-[var(--gp-surface-muted)]/80 text-secondary rounded-full hover:bg-[var(--gp-surface-muted)] hover:text-foreground shadow-sm border border-border transition-colors"
                aria-label="Đóng"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar px-4 sm:px-8 pt-16 pb-8">
              <h2 className="text-xl font-serif font-bold text-foreground mb-6">
                {editId ? "Sửa Sự Kiện" : "Thêm Sự Kiện Tuỳ Chỉnh"}
              </h2>

              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    role="alert" className="mb-6 p-4 bg-surface text-error border border-error rounded-xl text-sm font-medium flex items-start gap-3 shadow-sm"
                  >
                    <AlertCircle className="size-5 shrink-0 mt-0.5" />
                    <p>{error}</p>
                  </motion.div>
                )}
              </AnimatePresence>

              <form data-dirty-tree-draft={dirty} data-recovery-role="editor" onChangeCapture={({currentTarget}) => { currentTarget.dataset.treeDraftEntryIndex ??= String(currentHistoryIndex()); }} onChange={() => setDirty(true)} onSubmit={handleSubmit} className="space-y-6">
                <div data-tree-recovery className="empty:hidden" />
                <motion.div
                  variants={formSectionVariants}
                  initial="hidden"
                  animate="show"
                  className="bg-surface p-5 sm:p-6 rounded-2xl shadow-sm border border-border space-y-5"
                >
                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-1.5">
                      Tên sự kiện <span className="text-error">*</span>
                    </label>
                    <input
                      aria-label="Tên sự kiện"
                      required
                      type="text"
                      className={inputClasses}
                      placeholder="VD: Lễ Tảo Mộ Kỷ Tỵ"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-sm font-semibold text-foreground">
                        Ngày diễn ra <span className="text-error">*</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setDateMode((m) =>
                            m === "solar" ? "lunar" : "solar",
                          );
                          setLunarConvertError(null);
                        }}
                        className="min-h-11 flex items-center gap-1.5 text-xs font-medium text-secondary hover:text-primary transition-colors px-2.5 py-1 rounded-lg bg-neutral hover:bg-[var(--gp-accent-gold-soft)] border border-border"
                      >
                        {dateMode === "solar" ? (
                          <>
                            <Moon className="size-3" />
                            Nhập Âm lịch
                          </>
                        ) : (
                          <>
                            <Sun className="size-3" />
                            Nhập Dương lịch
                          </>
                        )}
                      </button>
                    </div>

                    {dateMode === "solar" ? (
                      <div className="relative">
                        <CalendarIcon className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-secondary" />
                        <input
                          required
                          aria-label="Ngày diễn ra" type="date"
                          className={`${inputClasses} pl-11`}
                          value={eventDate}
                          onChange={(e) => setEventDate(e.target.value)}
                        />
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="grid grid-cols-3 gap-3">
                          <input
                            type="number"
                            placeholder="Ngày"
                            min="1"
                            max="30"
                            aria-label="Ngày âm" value={lunarDay}
                            onChange={(e) =>
                              setLunarDay(
                                e.target.value ? Number(e.target.value) : "",
                              )
                            }
                            className={inputClasses}
                          />
                          <input
                            type="number"
                            placeholder="Tháng"
                            min="1"
                            max="12"
                            aria-label="Tháng âm" value={lunarMonth}
                            onChange={(e) =>
                              setLunarMonth(
                                e.target.value ? Number(e.target.value) : "",
                              )
                            }
                            className={inputClasses}
                          />
                          <input
                            type="number"
                            placeholder="Năm"
                            aria-label="Năm âm" value={lunarYear}
                            onChange={(e) =>
                              setLunarYear(
                                e.target.value ? Number(e.target.value) : "",
                              )
                            }
                            className={inputClasses}
                          />
                        </div>
                        {lunarConvertError && (
                          <p className="text-xs text-error font-medium flex items-center gap-1">
                            <AlertCircle className="size-3" />
                            {lunarConvertError}
                          </p>
                        )}
                        {eventDate && !lunarConvertError && (
                          <p className="text-xs text-secondary flex items-center gap-1.5">
                            <Sun className="size-3 text-tertiary" />
                            Dương lịch:{" "}
                            <span className="font-semibold text-foreground">
                              {eventDate.split("-").reverse().join("/")}
                            </span>
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-1.5">
                      Địa điểm
                    </label>
                    <div className="relative">
                      <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-secondary" />
                      <input
                        type="text"
                        className={`${inputClasses} pl-11`}
                        placeholder="VD: Nhà từ đường"
                        aria-label="Địa điểm" value={location}
                        onChange={(e) => setLocation(e.target.value)}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-1.5">
                      Nội dung chi tiết
                    </label>
                    <div className="relative">
                      <AlignLeft className="absolute left-4 top-4 size-4 text-secondary" />
                      <textarea
                        rows={3}
                        className={`${inputClasses} pl-11 resize-none custom-scrollbar`}
                        placeholder="Ghi chú thêm về sự kiện..."
                        aria-label="Nội dung chi tiết" value={content}
                        onChange={(e) => setContent(e.target.value)}
                      />
                    </div>
                  </div>
                </motion.div>

                <motion.div
                  variants={formSectionVariants}
                  initial="hidden"
                  animate="show"
                  transition={{ delay: 0.1 }}
                  className="flex flex-col-reverse sm:flex-row justify-between items-stretch sm:items-center gap-4 pt-4 sm:pt-6"
                >
                  {editId ? (
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={loading || stale}
                      className="inline-flex items-center justify-center gap-1.5 px-4 py-4 text-sm font-medium text-error bg-surface hover:bg-[var(--gp-accent-gold-soft)] rounded-xl disabled:opacity-50 border border-primary w-full sm:w-auto hover:-translate-y-1 hover:shadow-soft-hover duration-300 transition-all"
                    >
                      Xoá sự kiện
                    </button>
                  ) : (
                    <div className="hidden sm:block" /> /* Empty div to push right buttons to end on desktop */
                  )}

                  <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                    <button
                      type="button"
                      onClick={close}
                      disabled={loading || stale}
                      className="btn w-full sm:w-auto"
                    >
                      Huỷ bỏ
                    </button>
                    <button
                      type="submit"
                      disabled={loading || stale}
                      className="btn-primary w-full sm:w-auto"
                    >
                      {loading && <Loader2 className="size-4 animate-spin" />}
                      {loading ? "Đang lưu..." : "Lưu sự kiện"}
                    </button>
                  </div>
                </motion.div>
              </form>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
