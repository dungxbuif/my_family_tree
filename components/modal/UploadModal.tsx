"use client";

import { useCollectionDialog } from "@/hooks/useCollectionDialog";

import { currentHistoryIndex, useUnsavedNavigation,useStaleTreeDraft } from "@/hooks/useUnsavedNavigation";
import { uploadGalleryItem } from "@/app/actions/gallery";
import { uploadImage } from "@/utils/storage/client";
import { X, UploadCloud, Loader2 } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";

import { GalleryItem } from "@/types";

interface UploadModalProps {
  treeId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialData?: GalleryItem | null;
}

export default function UploadModal({
  treeId,
  isOpen,
  onClose,
  onSuccess,
  initialData,
}: UploadModalProps) {
  const [saved, setSaved] = useState<{ id: string; imageUrl: string; file: File | null } | null>(null);
  const editId = saved?.id ?? initialData?.id;
  const currentUrl = saved?.imageUrl ?? initialData?.image_url;
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [submissionId] = useState(() => crypto.randomUUID());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const stale = useStaleTreeDraft();
  const dirty = Boolean(file || title !== (initialData?.title || "") || description !== (initialData?.description || "") || eventDate !== (initialData?.event_date || ""));
  useUnsavedNavigation(isOpen && dirty, "Hủy các thay đổi chưa lưu?");
  useEffect(() => {
    if (preview?.startsWith("blob:")) return () => URL.revokeObjectURL(preview);
  }, [preview]);

  // Sync initialData when modal opens
  useEffect(() => {
    if (isOpen && initialData) {
      /* eslint-disable react-hooks/set-state-in-effect -- Opening an edit modal intentionally hydrates its local draft. */
      setTitle(initialData.title);
      setDescription(initialData.description || "");
      setEventDate(initialData.event_date || "");
      setPreview(initialData.image_url);
      /* eslint-enable react-hooks/set-state-in-effect */
    }
  }, [isOpen, initialData]);

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

  const chooseFile = (selected?: File) => {
    if (!selected) return;
    if (!["image/jpeg","image/png","image/gif","image/webp"].includes(selected.type)) {
      setError("Vui lòng chọn ảnh JPG, PNG, GIF hoặc WebP.");
      return;
    }
    if (selected.size < 1 || selected.size > 10 * 1024 * 1024) {
      setError("Ảnh phải từ 1 byte đến 10 MiB.");
      return;
    }
    setFile(selected);
    setPreview(URL.createObjectURL(selected));
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUrl && !file) {
      setError("Vui lòng chọn ảnh.");
      return;
    }
    if (!title) {
      setError("Vui lòng nhập tiêu đề.");
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      const uploadedImageUrl = file && file !== saved?.file
        ? await uploadImage(file, "gallery", {treeId,submissionId})
        : currentUrl;
      if (!uploadedImageUrl) throw new Error("Vui lòng chọn ảnh.");
      const formData = new FormData();
      formData.append("title", title);
      formData.append("treeId", treeId);
      formData.append("description", description);
      formData.append("eventDate", eventDate);
      if (editId) formData.append("id", editId);
      formData.append("imageUrl", uploadedImageUrl);

      const result = await uploadGalleryItem(formData);

      if (!result.success) {
        throw new Error(result.error);
      }

      if (document.documentElement.dataset.staleTreeDraft) {
        setSaved({ id: result.id, imageUrl: uploadedImageUrl, file });
        return;
      }

      // Success
      resetForm();
      onSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Đã xảy ra lỗi.");
    } finally {
      setIsUploading(false);
    }
  };

  const resetForm = () => {
    setFile(null);
    setPreview(null);
    setTitle("");
    setDescription("");
    setEventDate("");
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleClose = () => {
    if (stale || isUploading || (dirty && !window.confirm("Hủy các thay đổi chưa lưu?"))) return;
    resetForm();
    onClose();
  };

  const dialog = useCollectionDialog(isOpen,handleClose);
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
          <div
            className="absolute inset-0 cursor-pointer"
            onClick={!isUploading ? handleClose : undefined}
          />

          <motion.div
            layout
            initial={{ scale: 0.96, opacity: 0, y: 15 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.96, opacity: 0, y: 15 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            ref={dialog} tabIndex={-1}
            role="dialog" aria-modal="true" aria-label="Hình ảnh"
            className="relative bg-surface rounded-3xl shadow-soft w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col border border-border"
          >
            {/* Sticky Header Actions */}
            <div className="absolute top-4 right-4 sm:top-5 sm:right-5 z-20 flex items-center gap-2">
              <button
                onClick={handleClose}
                disabled={isUploading || stale}
                className="size-11 flex items-center justify-center bg-[var(--gp-surface-muted)]/80 text-secondary rounded-full hover:bg-[var(--gp-surface-muted)] hover:text-foreground shadow-sm border border-border transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Đóng"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar px-4 sm:px-8 pt-16 pb-8">
              <h2 className="text-xl font-serif font-bold text-foreground mb-6">
                {editId
                  ? "Chỉnh sửa hình ảnh"
                  : "Thêm vào Phòng trưng bày"}
              </h2>

              <form
                id="upload-form"
                data-dirty-tree-draft={dirty}
                data-recovery-role="editor"
                onChangeCapture={({currentTarget}) => { currentTarget.dataset.treeDraftEntryIndex ??= String(currentHistoryIndex()); }}
                onSubmit={handleSubmit}
                className="space-y-6"
              >
                <div data-tree-recovery className="empty:hidden" />
                {/* Image Upload Area */}
                <div
                  className={`border-2 border-dashed rounded-2xl p-8 text-center transition-colors cursor-pointer
                    ${preview ? "border-border bg-neutral" : "border-border hover:border-primary hover:bg-[var(--gp-accent-gold-soft)]/50"}`}
                  role={preview ? undefined : "button"}
                  tabIndex={preview ? undefined : 0}
                  aria-label={preview ? undefined : "Chọn ảnh để tải lên"}
                  onKeyDown={e => { if (!preview && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); fileInputRef.current?.click(); } }}
                  onClick={() => !preview && fileInputRef.current?.click()}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => {e.preventDefault(); chooseFile(e.dataTransfer.files[0]);}}
                >
                  {preview ? (
                    <div className="relative inline-block w-full">
                      <Image
                        unoptimized
                        src={preview}
                        alt="Ảnh xem trước"
                        width={1200}
                        height={800}
                        className="max-h-64 object-contain mx-auto rounded-lg shadow-sm"
                        sizes="(min-width: 768px) 672px, calc(100vw - 32px)"
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFile(null);
                          setPreview(null);
                        }}
                        aria-label="Chọn ảnh khác"
                        className="min-w-11 min-h-11 absolute top-2 right-2 p-1.5 bg-surface text-foreground hover:text-tertiary rounded-full shadow-md"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center space-y-3">
                      <div className="p-4 bg-[var(--gp-surface-muted)] rounded-full text-secondary">
                        <UploadCloud className="size-8" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          Kéo thả ảnh vào đây, hoặc click để chọn
                        </p>
                        <p className="text-xs text-secondary mt-1">
                          JPG, PNG, GIF, WebP · Tối đa 10 MiB
                        </p>
                      </div>
                    </div>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    aria-label="Chọn tệp ảnh"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    className="hidden"
                    onChange={e => {chooseFile(e.target.files?.[0]); e.target.value = "";}}
                  />
                </div>

                {error && (
                  <div role="alert" className="p-3 bg-surface text-error text-sm rounded-xl border border-error">
                    {error}
                  </div>
                )}

                {/* Fields */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-1.5">
                      Tiêu đề ảnh / Sự kiện{" "}
                      <span className="text-error">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      aria-label="Tiêu đề ảnh" value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className={inputClasses}
                      placeholder="Ví dụ: Lễ mừng thọ ông nội"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-1.5">
                      Ngày diễn ra
                    </label>
                    <input
                      type="date"
                      aria-label="Ngày diễn ra" value={eventDate}
                      onChange={(e) => setEventDate(e.target.value)}
                      className={inputClasses}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-foreground mb-1.5">
                      Nội dung kỷ niệm
                    </label>
                    <textarea
                      aria-label="Nội dung kỷ niệm" value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={3}
                      className={`${inputClasses} resize-none`}
                      placeholder="Kể lại câu chuyện đằng sau bức ảnh..."
                    />
                  </div>
                </div>

                <div className="pt-4 flex flex-wrap justify-end gap-3 border-t border-border">
                  <button
                    type="button"
                    onClick={handleClose}
                    disabled={isUploading || stale}
                    className="btn"
                  >
                    Hủy bỏ
                  </button>
                  <button
                    type="submit"
                    form="upload-form"
                    disabled={stale || isUploading || (!currentUrl && !file) || !title}
                    className="btn-primary flex items-center gap-2"
                  >
                    {isUploading ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        Đang lưu...
                      </>
                    ) : editId ? (
                      "Lưu thay đổi"
                    ) : (
                      "Lưu hình ảnh"
                    )}
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
