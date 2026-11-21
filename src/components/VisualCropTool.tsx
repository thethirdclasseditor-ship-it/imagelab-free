import React, { useState, useRef, useEffect } from 'react';
import {
  Upload,
  Download,
  RotateCw,
  RotateCcw,
  FlipHorizontal2,
  FlipVertical2,
  Crop,
  Trash2,
  ShieldCheck,
  Loader2,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import {
  processImage,
  formatFileSize,
  validateImageFile,
  type SupportedFormat,
  type ProcessedImageResult,
} from '../engine/imageEngine';
import { downloadSingleImage } from '../engine/zipHelper';

interface CropBox {
  x: number; // 0-100%
  y: number; // 0-100%
  w: number; // 0-100%
  h: number; // 0-100%
}

interface AspectOption {
  id: string;
  label: string;
  ratio: number | null; // width / height, null = freeform
  outW?: number;
  outH?: number;
  targetKB?: number;
}

const ASPECT_OPTIONS: AspectOption[] = [
  { id: 'free', label: 'Freeform', ratio: null },
  { id: '1:1', label: '1:1 Square', ratio: 1 },
  { id: 'job', label: '300×300 Job (<100KB)', ratio: 1, outW: 300, outH: 300, targetKB: 100 },
  { id: 'sig', label: '300×80 Sign (<60KB)', ratio: 300 / 80, outW: 300, outH: 80, targetKB: 60 },
  { id: '16:9', label: '16:9 YouTube', ratio: 16 / 9 },
  { id: '4:5', label: '4:5 Instagram', ratio: 4 / 5 },
  { id: '4:3', label: '4:3 Classic', ratio: 4 / 3 },
];

type DragAction = 'move' | 'nw' | 'ne' | 'sw' | 'se';

export default function VisualCropTool() {
  const [workingFile, setWorkingFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [naturalDims, setNaturalDims] = useState<{ w: number; h: number }>({ w: 1, h: 1 });

  const [crop, setCrop] = useState<CropBox>({ x: 10, y: 10, w: 80, h: 80 });
  const [selectedAspect, setSelectedAspect] = useState<AspectOption>(ASPECT_OPTIONS[0]);
  const [format, setFormat] = useState<SupportedFormat>('image/jpeg');
  const [quality, setQuality] = useState<number>(88);

  const [isTransforming, setIsTransforming] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportResult, setExportResult] = useState<ProcessedImageResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<{
    action: DragAction;
    startX: number;
    startY: number;
    startCrop: CropBox;
  } | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      if (exportResult) {
        URL.revokeObjectURL(exportResult.url);
        URL.revokeObjectURL(exportResult.originalUrl);
      }
    };
  }, [previewUrl, exportResult]);

  const computeCenteredAspectBox = (ratio: number | null, natW: number, natH: number): CropBox => {
    if (!ratio || natW <= 0 || natH <= 0) {
      return { x: 8, y: 8, w: 84, h: 84 };
    }
    const imgRatio = natW / natH;
    let wPct = 80;
    let hPct = (wPct / ratio) * imgRatio;

    if (hPct > 84) {
      hPct = 84;
      wPct = (hPct * ratio) / imgRatio;
    }
    if (wPct > 90) {
      wPct = 90;
      hPct = (wPct / ratio) * imgRatio;
    }

    return {
      x: (100 - wPct) / 2,
      y: (100 - hPct) / 2,
      w: wPct,
      h: hPct,
    };
  };

  const handleFileSelect = (incoming: FileList | null) => {
    if (!incoming || incoming.length === 0) return;
    const picked = incoming[0];
    const err = validateImageFile(picked);
    if (err) {
      setErrorMsg(err);
      return;
    }

    setErrorMsg(null);
    setExportResult(null);
    setWorkingFile(picked);
    setPreviewUrl(URL.createObjectURL(picked));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleImageLoaded = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const w = img.naturalWidth || 1;
    const h = img.naturalHeight || 1;
    setNaturalDims({ w, h });
    setCrop(computeCenteredAspectBox(selectedAspect.ratio, w, h));
  };

  const handleAspectSelect = (opt: AspectOption) => {
    setSelectedAspect(opt);
    setExportResult(null);
    if (opt.targetKB) setFormat('image/jpeg');
    setCrop(computeCenteredAspectBox(opt.ratio, naturalDims.w, naturalDims.h));
  };

  // Bake rotate/flip directly into working image so crop coordinates stay 100% WYSIWYG
  const applyTransform = async (mode: 'rotL' | 'rotR' | 'flipH' | 'flipV') => {
    if (!previewUrl || !workingFile || isTransforming) return;
    setIsTransforming(true);
    setExportResult(null);

    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('Failed to transform image.'));
        el.src = previewUrl;
      });

      const isRot = mode === 'rotL' || mode === 'rotR';
      const canvas = document.createElement('canvas');
      canvas.width = isRot ? img.naturalHeight : img.naturalWidth;
      canvas.height = isRot ? img.naturalWidth : img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas unavailable.');

      ctx.translate(canvas.width / 2, canvas.height / 2);
      if (mode === 'rotR') ctx.rotate(Math.PI / 2);
      if (mode === 'rotL') ctx.rotate(-Math.PI / 2);
      if (mode === 'flipH') ctx.scale(-1, 1);
      if (mode === 'flipV') ctx.scale(1, -1);
      ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Transform encode failed.'))), 'image/png');
      });
      canvas.width = 0;
      canvas.height = 0;

      const updatedFile = new File([blob], workingFile.name, { type: 'image/png' });
      setWorkingFile(updatedFile);
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Transform failed.');
    } finally {
      setIsTransforming(false);
    }
  };

  // Pointer drag/resize math
  const startDrag = (action: DragAction, e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragStateRef.current = {
      action,
      startX: e.clientX,
      startY: e.clientY,
      startCrop: { ...crop },
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const st = dragStateRef.current;
    const boxEl = containerRef.current;
    if (!st || !boxEl) return;

    const rect = boxEl.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const dxPct = ((e.clientX - st.startX) / rect.width) * 100;
    const dyPct = ((e.clientY - st.startY) / rect.height) * 100;
    const s = st.startCrop;
    const minSize = 8;

    if (st.action === 'move') {
      const nx = Math.max(0, Math.min(100 - s.w, s.x + dxPct));
      const ny = Math.max(0, Math.min(100 - s.h, s.y + dyPct));
      setCrop({ ...s, x: nx, y: ny });
      return;
    }

    let nx = s.x;
    let ny = s.y;
    let nw = s.w;
    let nh = s.h;

    if (st.action.includes('e')) {
      nw = Math.max(minSize, Math.min(100 - s.x, s.w + dxPct));
    }
    if (st.action.includes('w')) {
      const clampedDx = Math.max(-s.x, Math.min(s.w - minSize, dxPct));
      nx = s.x + clampedDx;
      nw = s.w - clampedDx;
    }
    if (st.action.includes('s')) {
      nh = Math.max(minSize, Math.min(100 - s.y, s.h + dyPct));
    }
    if (st.action.includes('n')) {
      const clampedDy = Math.max(-s.y, Math.min(s.h - minSize, dyPct));
      ny = s.y + clampedDy;
      nh = s.h - clampedDy;
    }

    // Enforce locked aspect ratio cleanly
    if (selectedAspect.ratio) {
      const imgRatio = naturalDims.w / naturalDims.h;
      const targetH = (nw / selectedAspect.ratio) * imgRatio;
      if (st.action.includes('n')) {
        const bottom = s.y + s.h;
        if (bottom - targetH >= 0 && targetH >= minSize) {
          nh = targetH;
          ny = bottom - nh;
        } else {
          nh = Math.min(bottom, Math.max(minSize, targetH));
          nw = (nh * selectedAspect.ratio) / imgRatio;
          ny = bottom - nh;
          if (st.action.includes('w')) nx = s.x + s.w - nw;
        }
      } else {
        if (ny + targetH <= 100 && targetH >= minSize) {
          nh = targetH;
        } else {
          nh = Math.max(minSize, 100 - ny);
          nw = (nh * selectedAspect.ratio) / imgRatio;
          if (st.action.includes('w')) nx = s.x + s.w - nw;
        }
      }
    }

    setCrop({
      x: Math.max(0, Math.min(100 - minSize, nx)),
      y: Math.max(0, Math.min(100 - minSize, ny)),
      w: Math.max(minSize, Math.min(100 - nx, nw)),
      h: Math.max(minSize, Math.min(100 - ny, nh)),
    });
  };

  const endDrag = (e: React.PointerEvent) => {
    dragStateRef.current = null;
    if ((e.currentTarget as HTMLElement).hasPointerCapture?.(e.pointerId)) {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    }
  };

  const pixelW = Math.max(1, Math.round((crop.w / 100) * naturalDims.w));
  const pixelH = Math.max(1, Math.round((crop.h / 100) * naturalDims.h));

  const handleCropAndExport = async () => {
    if (!workingFile) return;
    setIsExporting(true);
    setErrorMsg(null);

    try {
      const res = await processImage(workingFile, {
        format,
        quality: quality / 100,
        cropRect: {
          x: Math.round((crop.x / 100) * naturalDims.w),
          y: Math.round((crop.y / 100) * naturalDims.h),
          width: pixelW,
          height: pixelH,
        },
        width: selectedAspect.outW,
        height: selectedAspect.outH,
        targetSizeKB: selectedAspect.targetKB,
      });

      setExportResult(res);
      downloadSingleImage(res);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Crop export failed.');
    } finally {
      setIsExporting(false);
    }
  };

  const resetAll = () => {
    setWorkingFile(null);
    setPreviewUrl(null);
    setExportResult(null);
    setErrorMsg(null);
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.heic,.heif,.avif"
        className="hidden"
        onChange={(e) => handleFileSelect(e.target.files)}
      />

      {!previewUrl ? (
        <div className="p-6 sm:p-10">
          <div
            role="button"
            tabIndex={0}
            aria-label="Upload image to crop"
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDraggingFile(true);
            }}
            onDragLeave={() => setIsDraggingFile(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDraggingFile(false);
              handleFileSelect(e.dataTransfer.files);
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl py-12 px-4 text-center cursor-pointer transition-all ${
              isDraggingFile
                ? 'border-blue-500 bg-blue-50/60'
                : 'border-slate-300 hover:border-blue-500 hover:bg-slate-50'
            }`}
          >
            <div className="w-14 h-14 rounded-2xl bg-blue-600 text-white flex items-center justify-center mx-auto mb-4 shadow-md">
              <Crop className="w-7 h-7" />
            </div>
            <p className="font-bold text-slate-900 text-lg">Select Photo to Crop & Rotate</p>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Drag corners visually · Exact Job/Signature & Social ratios · 100% Local
            </p>
          </div>
        </div>
      ) : (
        <div className="divide-y divide-slate-200">
          {/* Top Toolbar: Aspect Ratios + Rotate/Flip */}
          <div className="p-3 sm:p-4 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1.5">
              {ASPECT_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleAspectSelect(opt)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                    selectedAspect.id === opt.id
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-slate-700 border-slate-200 hover:border-blue-400'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={isTransforming}
                onClick={() => applyTransform('rotL')}
                title="Rotate Left 90°"
                className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              <button
                type="button"
                disabled={isTransforming}
                onClick={() => applyTransform('rotR')}
                title="Rotate Right 90°"
                className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 cursor-pointer"
              >
                <RotateCw className="w-4 h-4" />
              </button>
              <button
                type="button"
                disabled={isTransforming}
                onClick={() => applyTransform('flipH')}
                title="Flip Horizontal"
                className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 cursor-pointer"
              >
                <FlipHorizontal2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                disabled={isTransforming}
                onClick={() => applyTransform('flipV')}
                title="Flip Vertical"
                className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 cursor-pointer"
              >
                <FlipVertical2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={resetAll}
                title="Remove Image"
                className="p-2 rounded-lg border border-red-200 bg-white hover:bg-red-50 text-red-600 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Visual Interactive Crop Canvas */}
          <div className="bg-slate-900 p-4 sm:p-6 flex items-center justify-center select-none overflow-hidden">
            <div ref={containerRef} className="relative inline-block max-w-full leading-none">
              <img
                src={previewUrl}
                alt="Crop target"
                draggable={false}
                onLoad={handleImageLoaded}
                className="block max-h-[54vh] max-w-full w-auto h-auto object-contain pointer-events-none"
              />

              {/* Darkened Outside Mask + Draggable Crop Box */}
              <div
                onPointerDown={(e) => startDrag('move', e)}
                onPointerMove={onPointerMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
                style={{
                  left: `${crop.x}%`,
                  top: `${crop.y}%`,
                  width: `${crop.w}%`,
                  height: `${crop.h}%`,
                  boxShadow: '0 0 0 9999px rgba(2, 6, 23, 0.62)',
                }}
                className="absolute border-2 border-white cursor-move touch-none"
              >
                {/* Rule-of-thirds visual guides */}
                <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
                  <div className="border-r border-b border-white/30" />
                  <div className="border-r border-b border-white/30" />
                  <div className="border-b border-white/30" />
                  <div className="border-r border-b border-white/30" />
                  <div className="border-r border-b border-white/30" />
                  <div className="border-b border-white/30" />
                  <div className="border-r border-white/30" />
                  <div className="border-r border-white/30" />
                  <div />
                </div>

                {/* Live Pixel Dimension Pill */}
                <div className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded bg-slate-950/90 text-white text-[11px] font-bold whitespace-nowrap">
                  {selectedAspect.outW && selectedAspect.outH
                    ? `${selectedAspect.outW}×${selectedAspect.outH} px`
                    : `${pixelW}×${pixelH} px`}
                </div>

                {/* 4 Touch-Friendly Corner Resize Handles */}
                {(['nw', 'ne', 'sw', 'se'] as const).map((corner) => {
                  const posClass =
                    corner === 'nw'
                      ? '-top-2.5 -left-2.5 cursor-nwse-resize'
                      : corner === 'ne'
                        ? '-top-2.5 -right-2.5 cursor-nesw-resize'
                        : corner === 'sw'
                          ? '-bottom-2.5 -left-2.5 cursor-nesw-resize'
                          : '-bottom-2.5 -right-2.5 cursor-nwse-resize';
                  return (
                    <div
                      key={corner}
                      onPointerDown={(e) => startDrag(corner, e)}
                      onPointerMove={onPointerMove}
                      onPointerUp={endDrag}
                      onPointerCancel={endDrag}
                      className={`absolute w-5 h-5 rounded-full bg-blue-600 border-2 border-white shadow-md touch-none ${posClass}`}
                    />
                  );
                })}
              </div>
            </div>
          </div>

          {/* Export Controls Bar */}
          <div className="p-4 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3 text-xs sm:text-sm">
              <select
                aria-label="Export format"
                value={format}
                onChange={(e) => setFormat(e.target.value as SupportedFormat)}
                className="bg-white border border-slate-300 rounded-lg px-2.5 py-2 font-semibold text-xs sm:text-sm"
              >
                <option value="image/jpeg">JPG (MozJPEG)</option>
                <option value="image/webp">WEBP (Smallest)</option>
                <option value="image/png">PNG (UPNG)</option>
              </select>

              {!selectedAspect.targetKB && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-600">Quality {quality}%</span>
                  <input
                    type="range"
                    min={20}
                    max={100}
                    value={quality}
                    onChange={(e) => setQuality(Number(e.target.value))}
                    className="w-24 accent-blue-600"
                  />
                </div>
              )}

              {exportResult && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
                  <CheckCircle2 className="w-4 h-4" />
                  Saved ({formatFileSize(exportResult.newSize)})
                </span>
              )}
            </div>

            <button
              type="button"
              disabled={isExporting || isTransforming}
              onClick={handleCropAndExport}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 text-white text-sm font-semibold shadow-sm cursor-pointer"
            >
              {isExporting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Cropping...</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>Crop & Download</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="m-4 flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs sm:text-sm">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <div className="px-4 py-3 border-t border-slate-200 text-center">
        <p className="inline-flex items-center gap-1.5 text-xs text-slate-500">
          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>100% Private Visual Cropper · Exported with MozJPEG & LibWebP locally.</span>
        </p>
      </div>
    </div>
  );
}
