import { Crosshair, ZoomIn, ZoomOut } from "lucide-react";
import BaseToolbar, { type BaseToolbarProps } from "./BaseToolbar";

interface TreeToolbarProps extends BaseToolbarProps {
  scale: number;
  handleZoomIn: () => void;
  handleZoomOut: () => void;
  handleResetZoom: () => void;
  handleCenter: () => void;
}

export default function TreeToolbar({
  scale,
  handleZoomIn,
  handleZoomOut,
  handleResetZoom,
  handleCenter,
  ...baseProps
}: TreeToolbarProps) {
  return (
    <BaseToolbar {...baseProps}>
      {/* Zoom Controls */}
      <div className="flex min-h-11 items-center overflow-hidden rounded-full border border-stone-200/60 bg-surface shadow-sm transition-opacity">
        <button
          onClick={handleZoomOut}
          aria-label="Thu nhỏ sơ đồ"
          className="min-h-11 min-w-11 px-3 text-stone-600 transition-colors hover:bg-stone-100/50 disabled:opacity-50"
          title="Thu nhỏ"
          disabled={scale <= 0.3}
        >
          <ZoomOut className="size-4" />
        </button>
        <button
          onClick={handleResetZoom}
          aria-label="Đặt lại mức thu phóng"
          className="min-h-11 min-w-[56px] border-x border-stone-200/50 px-2 text-center text-xs font-medium text-stone-600 transition-colors hover:bg-stone-100/50"
          title="Đặt lại"
        >
          {Math.round(scale * 100)}%
        </button>
        <button
          onClick={handleZoomIn}
          aria-label="Phóng to sơ đồ"
          className="min-h-11 min-w-11 px-3 text-stone-600 transition-colors hover:bg-stone-100/50 disabled:opacity-50"
          title="Phóng to"
          disabled={scale >= 2}
        >
          <ZoomIn className="size-4" />
        </button>
      </div>

      {/* Center Button */}
      <button
        onClick={handleCenter}
        aria-label="Căn giữa sơ đồ"
        className="flex min-h-11 min-w-11 items-center justify-center rounded-full border border-stone-200/60 bg-surface text-stone-600 shadow-sm transition-all hover:bg-white hover:text-stone-900 hover:shadow-md"
        title="Căn giữa"
      >
        <Crosshair className="size-4" />
      </button>
    </BaseToolbar>
  );
}
