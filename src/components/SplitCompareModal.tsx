import React, { useState, useRef, useEffect } from 'react';
import { X, Download, ChevronsLeftRight, ZoomIn, ZoomOut } from 'lucide-react';
import { formatFileSize, type ProcessedImageResult } from '../engine/imageEngine';
import { downloadSingleImage } from '../engine/zipHelper';

interface SplitCompareModalProps {
  item: ProcessedImageResult;
  onClose: () => void;
}

export default function SplitCompareModal({ item, onClose }: SplitCompareModalProps) {
  const [splitPos, setSplitPos] = useState(50);
  const [zoomed, setZoomed] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') setSplitPos((p) => Math.max(0, p - 5));
      if (e.key === 'ArrowRight') setSplitPos((p) => Math.min(100, p + 5));
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const updatePosition = (clientX: number) => {
    const el = stageRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setSplitPos(Math.max(0, Math.min(100, pct)));
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    updatePosition(e.clientX);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    updatePosition(e.clientX);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Before and after image comparison"
      className="fixed inset-0 z-50 bg-zinc-950/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 animate-scale-in"
      onClick={onClose}
    >
      <div
        className="studio-card rounded-3xl max-w-4xl w-full overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-zinc-200/80 bg-zinc-50/80">
          <div className="min-w-0">
            <h3 className="font-bold text-zinc-950 text-sm sm:text-base truncate">
              {item.fileName}
            </h3>
            <p className="text-xs text-zinc-500 tabular-nums">
              Drag slider or use arrow keys · {item.width}×{item.height}px · {item.encoderUsed}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setZoomed((z) => !z)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-100 text-xs font-semibold text-zinc-700 transition cursor-pointer"
              title="Toggle 2× Zoom"
            >
              {zoomed ? <ZoomOut className="w-3.5 h-3.5" /> : <ZoomIn className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{zoomed ? '100%' : 'Zoom 2×'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close comparison"
              className="p-2 rounded-xl text-zinc-500 hover:text-zinc-950 hover:bg-zinc-100 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Interactive Split Stage */}
        <div className="relative flex-1 bg-zinc-950 overflow-hidden select-none flex items-center justify-center p-3 sm:p-5">
          <div
            ref={stageRef}
            role="slider"
            tabIndex={0}
            aria-label="Before and after split slider"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(splitPos)}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className="relative w-full h-[52vh] sm:h-[60vh] rounded-2xl overflow-hidden cursor-ew-resize touch-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            style={{
              backgroundImage:
                'linear-gradient(45deg, #27272a 25%, #18181b 25%), linear-gradient(-45deg, #27272a 25%, #18181b 25%), linear-gradient(45deg, #18181b 75%, #27272a 75%), linear-gradient(-45deg, #18181b 75%, #27272a 75%)',
              backgroundSize: '20px 20px',
              backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
            }}
          >
            {/* Right Layer: Processed Result */}
            <img
              src={item.url}
              alt="Processed result"
              draggable={false}
              className={`absolute inset-0 w-full h-full object-contain transition-transform duration-200 ${
                zoomed ? 'scale-175' : 'scale-100'
              }`}
            />

            {/* Left Layer: Original Image */}
            <img
              src={item.originalUrl}
              alt="Original image"
              draggable={false}
              style={{ clipPath: `inset(0 ${100 - splitPos}% 0 0)` }}
              className={`absolute inset-0 w-full h-full object-contain transition-transform duration-200 ${
                zoomed ? 'scale-175' : 'scale-100'
              }`}
            />

            {/* Labels */}
            <div className="pointer-events-none absolute top-3 left-3 px-2.5 py-1 rounded-lg bg-zinc-950/80 text-white text-[11px] font-semibold backdrop-blur-xs tabular-nums">
              Original · {item.sourceFormat} ({formatFileSize(item.originalSize)})
            </div>
            <div className="pointer-events-none absolute top-3 right-3 px-2.5 py-1 rounded-lg bg-blue-600/90 text-white text-[11px] font-semibold backdrop-blur-xs tabular-nums">
              Result · {item.outputFormat} ({formatFileSize(item.newSize)})
            </div>

            {/* Draggable Vertical Divider & Handle */}
            <div
              className="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_12px_rgba(0,0,0,0.85)]"
              style={{ left: `${splitPos}%` }}
            >
              <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white text-zinc-950 shadow-xl border-2 border-blue-600 flex items-center justify-center">
                <ChevronsLeftRight className="w-5 h-5" />
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Summary & Download */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-t border-zinc-200/80 bg-zinc-50/80">
          <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm tabular-nums">
            <span className="text-zinc-600">
              {formatFileSize(item.originalSize)} →{' '}
              <strong className="text-zinc-950">{formatFileSize(item.newSize)}</strong>
            </span>
            {item.savedPercent > 0 && (
              <span className="px-2 py-0.5 rounded-md bg-emerald-500/12 text-emerald-700 dark:text-emerald-400 text-xs font-semibold">
                -{item.savedPercent}% smaller
              </span>
            )}
            {item.savedPercent < 0 && (
              <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-800 dark:text-amber-300 text-xs font-semibold">
                +{Math.abs(item.savedPercent)}% larger
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() => downloadSingleImage(item)}
            className="btn-studio-accent inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Download {item.outputFormat}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
