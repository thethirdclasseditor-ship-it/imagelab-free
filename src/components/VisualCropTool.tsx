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
  Lock,
  Loader2,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import {
  processImage,
  formatFileSize,
  validateImageFile,
  validateMagicBytes,
  normalizeImageBlob,
  MAX_SAFE_CANVAS_PIXELS,
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
  ratio: number | null;
  outW?: number;
  outH?: number;
  targetKB?: number;
}

const ASPECT_OPTIONS: AspectOption[] = [
  { id: 'free', label: 'Freeform', ratio: null },
  { id: '1:1', label: '1:1 Square', ratio: 1 },
  { id: 'square300', label: '300×300 (<100KB)', ratio: 1, outW: 300, outH: 300, targetKB: 100 },
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

  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [isTransforming, setIsTransforming] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportResult, setExportResult] = useState<ProcessedImageResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isGlobalDragging, setIsGlobalDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragDepthRef = useRef(0);
  const trackedUrlsRef = useRef<Set<string>>(new Set());
  const selectHandlerRef = useRef<(files: FileList | null) => void>(() => {});
  const dragStateRef = useRef<{
    action: DragAction;
    startX: number;
    startY: number;
    startCrop: CropBox;
  } | null>(null);

  const trackUrl = (url: string) => {
    trackedUrlsRef.current.add(url);
    return url;
  };

  const releaseUrl = (url?: string | null) => {
    if (!url) return;
    URL.revokeObjectURL(url);
    trackedUrlsRef.current.delete(url);
  };

  // Unmount-only cleanup so saving an export NEVER revokes the live previewUrl
  useEffect(() => {
    return () => {
      trackedUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
      trackedUrlsRef.current.clear();
    };
  }, []);

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

  const loadSelectedFile = async (picked: File) => {
    const err = validateImageFile(picked);
    if (err) {
      setErrorMsg(err);
      return;
    }
    const sigErr = await validateMagicBytes(picked);
    if (sigErr) {
      setErrorMsg(sigErr);
      return;
    }

    setErrorMsg(null);
    setIsLoadingFile(true);
    if (exportResult) {
      releaseUrl(exportResult.url);
      releaseUrl(exportResult.originalUrl);
      setExportResult(null);
    }

    try {
      const normalized = await normalizeImageBlob(picked);
      const safeFile =
        normalized === picked
          ? picked
          : new File([normalized], picked.name.replace(/\.[^/.]+$/, '.jpg'), {
              type: normalized.type || 'image/jpeg',
            });

      releaseUrl(previewUrl);
      setWorkingFile(safeFile);
      setPreviewUrl(trackUrl(URL.createObjectURL(normalized)));
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Could not open this image.');
    } finally {
      setIsLoadingFile(false);
    }
  };

  const handleFileSelect = (incoming: FileList | null) => {
    if (!incoming || incoming.length === 0) return;
    const picked = incoming[0];
    if (fileInputRef.current) fileInputRef.current.value = '';
    void loadSelectedFile(picked);
  };

  selectHandlerRef.current = handleFileSelect;

  useEffect(() => {
    const hasFiles = (e: DragEvent) =>
      Boolean(e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files'));

    const onDragEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepthRef.current += 1;
      setIsGlobalDragging(true);
    };
    const onDragOver = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
    };
    const onDragLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) setIsGlobalDragging(false);
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepthRef.current = 0;
      setIsGlobalDragging(false);
      if (e.dataTransfer?.files?.length) selectHandlerRef.current(e.dataTransfer.files);
    };
    const onPaste = (e: ClipboardEvent) => {
      const files = e.clipboardData?.files;
      if (files?.length && Array.from(files).some((f) => f.type.startsWith('image/'))) {
        e.preventDefault();
        selectHandlerRef.current(files);
      }
    };

    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
      window.removeEventListener('paste', onPaste);
    };
  }, []);

  const handleImageLoaded = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const w = img.naturalWidth || 1;
    const h = img.naturalHeight || 1;
    setNaturalDims({ w, h });
    setCrop(computeCenteredAspectBox(selectedAspect.ratio, w, h));
  };

  const handleAspectSelect = (opt: AspectOption) => {
    setSelectedAspect(opt);
    if (exportResult) {
      releaseUrl(exportResult.url);
      releaseUrl(exportResult.originalUrl);
      setExportResult(null);
    }
    if (opt.targetKB) setFormat('image/jpeg');
    setCrop(computeCenteredAspectBox(opt.ratio, naturalDims.w, naturalDims.h));
  };

  // Enforce 16MP canvas cap on Rotate/Flip so 48MP photos never blank out on iOS Safari
  const applyTransform = async (mode: 'rotL' | 'rotR' | 'flipH' | 'flipV') => {
    if (!previewUrl || !workingFile || isTransforming) return;
    setIsTransforming(true);
    setErrorMsg(null);
    if (exportResult) {
      releaseUrl(exportResult.url);
      releaseUrl(exportResult.originalUrl);
      setExportResult(null);
    }

    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('Failed to transform image.'));
        el.src = previewUrl;
      });

      const isRot = mode === 'rotL' || mode === 'rotR';
      let drawW = img.naturalWidth;
      let drawH = img.naturalHeight;

      if (drawW * drawH > MAX_SAFE_CANVAS_PIXELS) {
        const s = Math.sqrt(MAX_SAFE_CANVAS_PIXELS / (drawW * drawH));
        drawW = Math.max(1, Math.floor(drawW * s));
        drawH = Math.max(1, Math.floor(drawH * s));
      }

      const canvas = document.createElement('canvas');
      canvas.width = isRot ? drawH : drawW;
      canvas.height = isRot ? drawW : drawH;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas unavailable.');

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.translate(canvas.width / 2, canvas.height / 2);
      if (mode === 'rotR') ctx.rotate(Math.PI / 2);
      if (mode === 'rotL') ctx.rotate(-Math.PI / 2);
      if (mode === 'flipH') ctx.scale(-1, 1);
      if (mode === 'flipV') ctx.scale(1, -1);
      ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('Transform encode failed.'))),
          'image/png'
        );
      });
      canvas.width = 0;
      canvas.height = 0;

      const updatedFile = new File([blob], workingFile.name, { type: 'image/png' });
      const nextUrl = trackUrl(URL.createObjectURL(blob));
      releaseUrl(previewUrl);
      setWorkingFile(updatedFile);
      setPreviewUrl(nextUrl);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Transform failed.');
    } finally {
      setIsTransforming(false);
    }
  };

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

  // Supports both horizontal AND vertical drag smoothly when aspect ratio is locked
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

    const isWest = st.action.includes('w');
    const isNorth = st.action.includes('n');
    const anchorX = isWest ? s.x + s.w : s.x;
    const anchorY = isNorth ? s.y + s.h : s.y;
    const maxW = isWest ? anchorX : 100 - anchorX;
    const maxH = isNorth ? anchorY : 100 - anchorY;

    const rawW = isWest ? s.w - dxPct : s.w + dxPct;
    const rawH = isNorth ? s.h - dyPct : s.h + dyPct;

    let nw = Math.max(minSize, Math.min(maxW, rawW));
    let nh = Math.max(minSize, Math.min(maxH, rawH));

    if (selectedAspect.ratio) {
      const imgRatio = naturalDims.w / naturalDims.h;
      const ratio = selectedAspect.ratio;

      if (Math.abs(dyPct) > Math.abs(dxPct)) {
        nh = Math.max(minSize, Math.min(maxH, rawH));
        nw = (nh * ratio) / imgRatio;
        if (nw > maxW) {
          nw = maxW;
          nh = (nw * imgRatio) / ratio;
        }
        if (nw < minSize) {
          nw = Math.min(maxW, minSize);
          nh = (nw * imgRatio) / ratio;
        }
      } else {
        nw = Math.max(minSize, Math.min(maxW, rawW));
        nh = (nw * imgRatio) / ratio;
        if (nh > maxH) {
          nh = maxH;
          nw = (nh * ratio) / imgRatio;
        }
        if (nh < minSize) {
          nh = Math.min(maxH, minSize);
          nw = (nh * ratio) / imgRatio;
        }
      }
    }

    const nx = isWest ? anchorX - nw : anchorX;
    const ny = isNorth ? anchorY - nh : anchorY;

    setCrop({
      x: Math.max(0, Math.min(100 - minSize, nx)),
      y: Math.max(0, Math.min(100 - minSize, ny)),
      w: Math.max(minSize, Math.min(100 - Math.max(0, nx), nw)),
      h: Math.max(minSize, Math.min(100 - Math.max(0, ny), nh)),
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

      trackUrl(res.url);
      trackUrl(res.originalUrl);

      if (exportResult) {
        releaseUrl(exportResult.url);
        releaseUrl(exportResult.originalUrl);
      }

      setExportResult(res);
      downloadSingleImage(res);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Crop export failed.');
    } finally {
      setIsExporting(false);
    }
  };

  const resetAll = () => {
    releaseUrl(previewUrl);
    if (exportResult) {
      releaseUrl(exportResult.url);
      releaseUrl(exportResult.originalUrl);
    }
    setWorkingFile(null);
    setPreviewUrl(null);
    setExportResult(null);
    setErrorMsg(null);
  };

  return (
    <div className="space-y-4 animate-fade-up">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.heic,.heif,.avif"
        className="hidden"
        onChange={(e) => handleFileSelect(e.target.files)}
      />

      {isGlobalDragging && (
        <div className="fixed inset-0 z-50 bg-zinc-950/65 backdrop-blur-md flex items-center justify-center p-6 pointer-events-none animate-scale-in">
          <div className="max-w-md w-full rounded-3xl border border-blue-400/50 bg-white/95 dark:bg-zinc-900/95 p-10 text-center shadow-2xl">
            <div className="w-16 h-16 rounded-2xl bg-blue-600 text-white flex items-center justify-center mx-auto mb-5 shadow-lg">
              <Upload className="w-7 h-7" />
            </div>
            <p className="text-xl font-bold text-zinc-950 dark:text-white">
              Release to Open in Cropper
            </p>
          </div>
        </div>
      )}

      <div className="studio-card rounded-3xl overflow-hidden">
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
              onClick={() => fileInputRef.current?.click()}
              className="group min-h-[320px] sm:min-h-[360px] flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 hover:border-blue-500/70 bg-zinc-50/60 hover:bg-blue-50/20 dark:hover:bg-blue-950/15 p-8 text-center cursor-pointer transition-all"
            >
              {isLoadingFile ? (
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                  <p className="text-sm font-semibold text-zinc-700">Decoding image...</p>
                </div>
              ) : (
                <>
                  <div className="w-16 h-16 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 shadow-sm flex items-center justify-center mb-6 group-hover:-translate-y-1 transition-transform">
                    <Crop className="w-7 h-7 text-zinc-900 dark:text-white group-hover:text-blue-600 transition-colors" />
                  </div>
                  <span className="btn-studio-accent inline-flex items-center gap-2 px-7 py-3.5 rounded-2xl font-semibold text-sm sm:text-[15px]">
                    Select Photo to Crop
                  </span>
                  <p className="text-xs sm:text-sm text-zinc-500 mt-4">
                    Drop anywhere or press{' '}
                    <kbd className="px-1.5 py-0.5 text-[11px] font-semibold bg-white border border-zinc-200 rounded-md text-zinc-700">
                      Ctrl+V
                    </kbd>
                  </p>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="divide-y divide-zinc-200/80">
            {/* Top Toolbar */}
            <div className="p-4 sm:px-6 bg-zinc-50/80 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-1.5">
                {ASPECT_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handleAspectSelect(opt)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                      selectedAspect.id === opt.id
                        ? 'bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 border-transparent'
                        : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-100'
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
                  onClick={() => void applyTransform('rotL')}
                  title="Rotate Left 90°"
                  aria-label="Rotate Left 90 degrees"
                  className="p-2 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-100 text-zinc-700 cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  disabled={isTransforming}
                  onClick={() => void applyTransform('rotR')}
                  title="Rotate Right 90°"
                  aria-label="Rotate Right 90 degrees"
                  className="p-2 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-100 text-zinc-700 cursor-pointer"
                >
                  <RotateCw className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  disabled={isTransforming}
                  onClick={() => void applyTransform('flipH')}
                  title="Flip Horizontal"
                  aria-label="Flip Horizontal"
                  className="p-2 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-100 text-zinc-700 cursor-pointer"
                >
                  <FlipHorizontal2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  disabled={isTransforming}
                  onClick={() => void applyTransform('flipV')}
                  title="Flip Vertical"
                  aria-label="Flip Vertical"
                  className="p-2 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-100 text-zinc-700 cursor-pointer"
                >
                  <FlipVertical2 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={resetAll}
                  title="Remove Image"
                  aria-label="Remove Image"
                  className="p-2 rounded-xl border border-zinc-200 bg-white hover:text-red-600 text-zinc-500 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Visual Interactive Crop Stage */}
            <div className="bg-zinc-950 p-6 sm:p-8 flex items-center justify-center select-none overflow-hidden">
              <div ref={containerRef} className="relative inline-block max-w-full leading-none">
                <img
                  src={previewUrl}
                  alt="Crop target"
                  draggable={false}
                  onLoad={handleImageLoaded}
                  className="block max-h-[54vh] max-w-full w-auto h-auto object-contain pointer-events-none"
                />

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
                    boxShadow: '0 0 0 9999px rgba(9, 9, 11, 0.65)',
                  }}
                  className="absolute border-2 border-white cursor-move touch-none"
                >
                  {/* Rule of Thirds Grid */}
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

                  {/* Live Dimension Pill */}
                  <div className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-md bg-zinc-950/90 text-white text-[11px] font-semibold whitespace-nowrap tabular-nums">
                    {selectedAspect.outW && selectedAspect.outH
                      ? `${selectedAspect.outW}×${selectedAspect.outH} px`
                      : `${pixelW}×${pixelH} px`}
                  </div>

                  {/* 4 Touch-Friendly 44×44px Hit-Target Corner Handles */}
                  {(['nw', 'ne', 'sw', 'se'] as const).map((corner) => {
                    const posClass =
                      corner === 'nw'
                        ? '-top-5 -left-5 cursor-nwse-resize'
                        : corner === 'ne'
                          ? '-top-5 -right-5 cursor-nesw-resize'
                          : corner === 'sw'
                            ? '-bottom-5 -left-5 cursor-nesw-resize'
                            : '-bottom-5 -right-5 cursor-nwse-resize';
                    return (
                      <div
                        key={corner}
                        onPointerDown={(e) => startDrag(corner, e)}
                        onPointerMove={onPointerMove}
                        onPointerUp={endDrag}
                        onPointerCancel={endDrag}
                        className={`absolute w-11 h-11 flex items-center justify-center touch-none ${posClass}`}
                      >
                        <span className="w-5 h-5 rounded-full bg-blue-600 border-2 border-white shadow-md pointer-events-none" />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Export Controls Bar */}
            <div className="p-4 sm:px-6 bg-zinc-50/80 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3 text-xs sm:text-sm">
                <select
                  aria-label="Export format"
                  value={format}
                  onChange={(e) => setFormat(e.target.value as SupportedFormat)}
                  className="bg-white border border-zinc-300 rounded-xl px-3 py-2 font-semibold text-xs"
                >
                  <option value="image/jpeg">JPG · MozJPEG</option>
                  <option value="image/webp">WEBP · LibWebP</option>
                  <option value="image/png">PNG · UPNG</option>
                </select>

                {!selectedAspect.targetKB && (
                  <div className="flex items-center gap-2 tabular-nums">
                    <span className="text-xs font-semibold text-zinc-600">Q{quality}</span>
                    <input
                      type="range"
                      min={20}
                      max={100}
                      value={quality}
                      onChange={(e) => setQuality(Number(e.target.value))}
                      className="w-24"
                    />
                  </div>
                )}

                {exportResult && (
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>
                      Saved ({formatFileSize(exportResult.newSize)} · {exportResult.encoderUsed})
                    </span>
                    {exportResult.warning && (
                      <span className="text-amber-600 dark:text-amber-400">
                        · {exportResult.warning}
                      </span>
                    )}
                  </span>
                )}
              </div>

              <button
                type="button"
                disabled={isExporting || isTransforming}
                onClick={() => void handleCropAndExport()}
                className="btn-studio-accent w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl disabled:opacity-40 text-xs sm:text-sm font-semibold cursor-pointer"
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
          <div className="mx-5 sm:mx-7 mb-5 flex items-center gap-2 p-3.5 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-700 dark:text-red-400 text-xs font-medium">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
      </div>

      <p className="flex items-center justify-center gap-1.5 text-xs text-zinc-500">
        <Lock className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
        <span>Processed locally in your browser · Zero uploads</span>
      </p>
    </div>
  );
}
