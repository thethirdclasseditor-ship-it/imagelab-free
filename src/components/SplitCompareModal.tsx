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
      className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 bg-slate-50">
          <div className="min-w-0">
            <h3 className="font-bold text-slate-900 text-sm sm:text-base truncate">
              {item.fileName}
            </h3>
            <p className="text-xs text-slate-500">
              Drag the center slider left or right · {item.width}×{item.height}px · {item.encoderUsed}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setZoomed((z) => !z)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 cursor-pointer"
              title="Toggle 2x Zoom"
            >
              {zoomed ? <ZoomOut className="w-3.5 h-3.5" /> : <ZoomIn className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{zoomed ? '100%' : 'Zoom 2×'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close comparison"
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Interactive Split Stage */}
        <div className="relative flex-1 bg-slate-900 overflow-hidden select-none flex items-center justify-center p-3 sm:p-5">
          <div
            ref={stageRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className="relative w-full h-[52vh] sm:h-[60vh] rounded-xl overflow-hidden cursor-ew-resize touch-none"
            style={{
              backgroundImage:
                'linear-gradient(45deg, #1e293b 25%, #0f172a 25%), linear-gradient(-45deg, #1e293b 25%, #0f172a 25%), linear-gradient(45deg, #0f172a 75%, #1e293b 75%), linear-gradient(-45deg, #0f172a 75%, #1e293b 75%)',
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

            {/* Left Layer: Original Image (clipped accurately with clipPath) */}
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
            <div className="pointer-events-none absolute top-3 left-3 px-2.5 py-1 rounded-lg bg-slate-950/75 text-white text-xs font-semibold backdrop-blur-xs">
              Original · {item.sourceFormat} ({formatFileSize(item.originalSize)})
            </div>
            <div className="pointer-events-none absolute top-3 right-3 px-2.5 py-1 rounded-lg bg-blue-600/90 text-white text-xs font-semibold backdrop-blur-xs">
              Result · {item.outputFormat} ({formatFileSize(item.newSize)})
            </div>

            {/* Draggable Vertical Divider & Handle */}
            <div
              className="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_10px_rgba(0,0,0,0.8)]"
              style={{ left: `${splitPos}%` }}
            >
              <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white text-slate-900 shadow-lg border-2 border-blue-600 flex items-center justify-center">
                <ChevronsLeftRight className="w-5 h-5" />
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Summary & Direct Download */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-slate-200 bg-white">
          <div className="flex items-center gap-2 text-xs sm:text-sm">
            <span className="text-slate-600">
              {formatFileSize(item.originalSize)} →{' '}
              <strong className="text-slate-900">{formatFileSize(item.newSize)}</strong>
            </span>
            {item.savedPercent > 0 && (
              <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-700 text-xs font-bold">
                -{item.savedPercent}% smaller
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() => downloadSingleImage(item)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-semibold shadow-xs cursor-pointer"
          >
            <Download className="w-4 h-4" />
            Download {item.outputFormat}
          </button>
        </div>
      </div>
    </div>
  );
}
