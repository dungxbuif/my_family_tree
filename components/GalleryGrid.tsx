"use client";

import { GalleryItem } from "@/types";
import { useState } from "react";
import { X, CalendarDays, Maximize2 } from "lucide-react";
import dayjs from "dayjs";
import Image from "next/image";

import { deleteGalleryItem } from "@/app/actions/gallery";

interface GalleryGridProps {
  treeId: string;
  items: GalleryItem[];
  canEdit?: boolean;
  onEdit?: (item: GalleryItem) => void;
  onDeleteSuccess?: (id: string) => void;
}

export default function GalleryGrid({
  treeId,
  items,
  canEdit,
  onEdit,
  onDeleteSuccess,
}: GalleryGridProps) {
  const [selectedItem, setSelectedItem] = useState<GalleryItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [error, setError] = useState("");

  const handleDelete = async (item: GalleryItem) => {
    if (!confirm("Bạn có chắc chắn muốn xóa hình ảnh này?")) return;
    setError("");
    setIsDeleting(true);
    try {
      const result = await deleteGalleryItem(item.id, treeId);
      if (result.error) throw new Error(result.error);

      setSelectedItem(null);
      if (onDeleteSuccess) onDeleteSuccess(item.id);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Không thể xóa hình ảnh. Vui lòng thử lại.",
      );
    } finally {
      setIsDeleting(false);
    }
  };

  if (!items || items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4 text-center bg-white rounded-3xl border border-stone-100 shadow-sm">
        <div className="size-20 bg-stone-50 rounded-full flex items-center justify-center mb-4 border border-stone-100">
          <Maximize2 className="size-8 text-stone-300" />
        </div>
        <h3 className="text-xl font-bold text-stone-700 mb-2">
          Chưa có hình ảnh nào
        </h3>
        <p className="text-stone-500 max-w-sm">
          Hình ảnh của cây gia phả sẽ xuất hiện tại đây.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-4 space-y-4">
        {items.map((item) => (
          <button
            key={item.id}
            className="w-full min-h-11 break-inside-avoid rounded-[20px] overflow-hidden border border-border bg-surface cursor-pointer shadow-sm hover:shadow-soft transition-all duration-500"
            onClick={() => {
              setError("");
              setSelectedItem(item);
            }}
          >
            {/* Image */}
            <Image
              unoptimized
              src={item.image_url}
              alt={item.title}
              width={1200}
              height={900}
              className="h-auto w-full object-cover"
              sizes="(min-width: 1280px) 25vw, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            />

            <span className="block space-y-1 bg-surface p-4 text-left">
              <span className="block font-semibold text-primary [overflow-wrap:anywhere]">
                {item.title}
              </span>
              {item.event_date && (
                <span className="flex items-center gap-2 text-sm text-secondary">
                  <CalendarDays className="size-4" />
                  {dayjs(item.event_date).format("DD/MM/YYYY")}
                </span>
              )}
            </span>
          </button>
        ))}
      </div>

      {/* Lightbox Modal */}
      {selectedItem && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={selectedItem.title}
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/90 animate-in fade-in duration-200"
        >
          <button
            disabled={isDeleting}
            aria-label="Đóng ảnh"
            onClick={() => setSelectedItem(null)}
            className="absolute top-4 right-4 sm:top-8 sm:right-8 p-3 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-colors z-10"
          >
            <X className="size-6" />
          </button>

          <div className="flex flex-col lg:flex-row w-full max-w-6xl overflow-y-auto max-h-[90dvh] bg-stone-950 rounded-2xl shadow-soft">
            {/* Image Section */}
            <div className="flex-1 relative flex items-center justify-center bg-black/50 p-4 min-h-0 lg:min-h-0">
              <Image
                unoptimized
                src={selectedItem.image_url}
                alt={selectedItem.title}
                width={1600}
                height={1200}
                className="max-w-full max-h-[42dvh] lg:max-h-[75vh] object-contain rounded-lg"
                sizes="(min-width: 1024px) 65vw, 100vw"
              />
            </div>

            {/* Content Section */}
            <div className="w-full min-w-0 break-words lg:w-96 bg-surface flex flex-col lg:max-h-[80vh] overflow-y-auto">
              <div className="p-6 sm:p-8 flex-1">
                <h2 className="text-2xl font-bold text-stone-800 mb-4 leading-tight">
                  {selectedItem.title}
                </h2>

                {selectedItem.event_date && (
                  <div className="flex items-center gap-2 text-stone-500 font-medium mb-6 pb-6 border-b border-stone-100">
                    <CalendarDays className="size-4" />
                    <span>
                      {dayjs(selectedItem.event_date).format("DD/MM/YYYY")}
                    </span>
                  </div>
                )}

                {selectedItem.description ? (
                  <div className="prose prose-stone text-stone-600">
                    <p className="whitespace-pre-wrap leading-relaxed">
                      {selectedItem.description}
                    </p>
                  </div>
                ) : (
                  <p className="text-stone-400 italic">
                    Không có nội dung mô tả.
                  </p>
                )}
              </div>

              <div className="p-6 bg-stone-50 border-t border-stone-100 text-xs text-stone-400 font-medium flex flex-wrap gap-2 justify-between items-center">
                <span>
                  Đã thêm vào{" "}
                  {dayjs(selectedItem.created_at).format("DD/MM/YYYY")}
                </span>

                {canEdit && (
                  <div className="flex flex-wrap gap-2">
                    {error && (
                      <p role="alert" className="w-full text-error">
                        {error}
                      </p>
                    )}
                    <button
                      disabled={isDeleting}
                      onClick={() => {
                        setSelectedItem(null);
                        if (onEdit) onEdit(selectedItem);
                      }}
                      className="min-h-11 min-w-11 px-4 py-2 bg-stone-100/80 text-stone-700 rounded-lg hover:bg-stone-200 hover:text-stone-900 font-medium text-sm transition-all shadow-sm"
                    >
                      Sửa
                    </button>
                    <button
                      onClick={() => handleDelete(selectedItem)}
                      disabled={isDeleting}
                      className="min-h-11 min-w-11 px-4 py-2 bg-red-100 text-red-800 rounded-md hover:bg-red-200 font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {isDeleting ? "Đang xóa..." : "Xóa"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
