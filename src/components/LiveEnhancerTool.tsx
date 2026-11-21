import React, { useState, useRef, useEffect } from 'react';
import {
  Upload,
  Download,
  Sparkles,
  Trash2,
  Lock,
  Loader2,
  AlertCircle,
  ChevronsLeftRight,
  ZoomIn,
  ZoomOut,
  SlidersHorizontal,
  ArrowRight,
  RotateCcw,
} from 'lucide-react';
import {
  formatFileSize,
  validateImageFile,
  type SupportedFormat,
} from '../engine/imageEngine';
import {
  enhancePhoto,
  type UpscaleFactor,
  type EnhancedPhotoResult,
} from '../engine/enhanceEngine';

type EnhanceStrength = 'balanced' | 'deblur' | 'denoise';

const STRENGTH_MODES: {
  id: EnhanceStrength;
  label: string;
  deblur: number;
  denoise: number;
  clarity: number;
  autoTone: boolean;
}[] = [
  { id: 'balanced', label: 'Balanced Restore', deblur: 60, denoise: 25, clarity: 42, autoTone: true },
  { id: 'deblur', label: 'Strong Deblur', deblur: 88, denoise: 18, clarity: 55, autoTone: true },
  { id: 'denoise', label: 'Clean Noise', deblur: 45, denoise: 68, clarity: 32, autoTone: true },
];

export default function LiveEnhancerTool() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<EnhancedPhotoResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isGlobalDragging, setIsGlobalDragging] = useState(false);

  // Built-in Split-Screen Stage State
  const [splitPos, setSplitPos] = useState(50);
  const [zoomed, setZoomed] = useState(false);
  const [showFineTune, setShowFineTune] = useState(false);

  // True Restoration Settings
  const [upscale, setUpscale] = useState<UpscaleFactor>(2);
  const [strengthMode, setStrengthMode] = useState<EnhanceStrength>('balanced');
  const [deblur, setDeblur] = useState(60);
  const [denoise, setDenoise] = useState(25);
  const [clarity, setClarity] = useState(42);
  const [autoTone, setAutoTone] = useState(true);
  const [format, setFormat] = useState<SupportedFormat>('image/jpeg');
  const [dirty, setDirty] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const draggingSplitRef = useRef(false);
  const dragDepthRef = useRef(0);
  const runIdRef = useRef(0);
  const selectHandlerRef = useRef<(files: FileList | null) => void>(() => {});

  useEffect(() => {
    return () => {
      if (result) {
        URL.revokeObjectURL(result.url);
        URL.revokeObjectURL(result.originalUrl);
      }
    };
  }, [result]);

  const runEnhancement = async (
    targetFile: File,
    overrides?: {
      upscale?: UpscaleFactor;
      deblur?: number;
      denoise?: number;
      clarity?: number;
      autoTone?: boolean;
      format?: SupportedFormat;
    }
  ) => {
    const runId = ++runIdRef.current;
    setIsProcessing(true);
    setErrorMsg(null);
    setDirty(false);

    try {
      const res = await enhancePhoto(targetFile, {
        upscale: overrides?.upscale ?? upscale,
        deblur: overrides?.deblur ?? deblur,
        denoise: overrides?.denoise ?? denoise,
        clarity: overrides?.clarity ?? clarity,
        autoTone: overrides?.autoTone ?? autoTone,
        format: overrides?.format ?? format,
        quality: 0.92,
      });

      if (runIdRef.current !== runId) {
        URL.revokeObjectURL(res.url);
        URL.revokeObjectURL(res.originalUrl);
        return;
      }
      setResult(res);
    } catch (err) {
      if (runIdRef.current !== runId) return;
      setErrorMsg(err instanceof Error ? err.message : 'Enhancement failed.');
    } finally {
      if (runIdRef.current === runId) setIsProcessing(false);
    }
  };

  const handleFileSelect = (incoming: FileList | null) => {
    if (!incoming || incoming.length === 0) return;
    const picked = incoming[0];
    const err = validateImageFile(picked);
    if (err) {
      setErrorMsg(err);
      return;
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
    setFile(picked);
    setSplitPos(50);
    setZoomed(false);
    void runEnhancement(picked);
  };

  selectHandlerRef.current = handleFileSelect;

  // Full-Window Drag & Drop + Clipboard Paste
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

  // Split-Screen Drag Handlers
  const updateSplit = (clientX: number) => {
    const el = stageRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setSplitPos(Math.max(0, Math.min(100, pct)));
  };

  const handleSplitDown = (e: React.PointerEvent<HTMLDivElement>) => {
    draggingSplitRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    updateSplit(e.clientX);
  };

  const handleSplitMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingSplitRef.current) return;
    updateSplit(e.clientX);
  };

  const handleSplitUp = (e: React.PointerEvent<HTMLDivElement>) => {
    draggingSplitRef.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const handleUpscaleChange = (factor: UpscaleFactor) => {
    setUpscale(factor);
    if (file) void runEnhancement(file, { upscale: factor });
  };

  const handleStrengthSelect = (modeObj: (typeof STRENGTH_MODES)[number]) => {
    setStrengthMode(modeObj.id);
    setDeblur(modeObj.deblur);
    setDenoise(modeObj.denoise);
    setClarity(modeObj.clarity);
    setAutoTone(modeObj.autoTone);
    if (file) {
      void runEnhancement(file, {
        deblur: modeObj.deblur,
        denoise: modeObj.denoise,
        clarity: modeObj.clarity,
        autoTone: modeObj.autoTone,
      });
    }
  };

  const handleFormatChange = (nextFmt: SupportedFormat) => {
    setFormat(nextFmt);
    if (file) void runEnhancement(file, { format: nextFmt });
  };

  const handleDownload = () => {
    if (!result) return;
    const a = document.createElement('a');
    a.href = result.url;
    a.download = result.fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const resetAll = () => {
    runIdRef.current++;
    setFile(null);
    setResult(null);
    setIsProcessing(false);
    setErrorMsg(null);
    setDirty(false);
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

      {/* Full-Screen Drop Overlay */}
      {isGlobalDragging && (
        <div className="fixed inset-0 z-50 bg-zinc-950/65 backdrop-blur-md flex items-center justify-center p-6 pointer-events-none animate-scale-in">
          <div className="max-w-md w-full rounded-3xl border border-blue-400/50 bg-white/95 dark:bg-zinc-900/95 p-10 text-center shadow-2xl">
            <div className="w-16 h-16 rounded-2xl bg-blue-600 text-white flex items-center justify-center mx-auto mb-5 shadow-lg">
              <Upload className="w-7 h-7" />
            </div>
            <p className="text-xl font-bold text-zinc-950 dark:text-white">
              Release to enhance photo
            </p>
            <p className="text-sm text-zinc-500 mt-1.5">
              Auto-deblur, denoise & HD upscale starts immediately
            </p>
          </div>
        </div>
      )}

      <div className="studio-card rounded-3xl overflow-hidden">
        {/* Top Restoration Control Strip */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 sm:px-7 py-3.5 border-b border-zinc-200/80 bg-zinc-50/80">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-zinc-500">Upscale</span>
            <div className="inline-flex bg-zinc-200/70 dark:bg-zinc-800 p-0.5 rounded-xl">
              {([1, 2, 4] as const).map((factor) => (
                <button
                  key={factor}
                  type="button"
                  disabled={isProcessing}
                  onClick={() => handleUpscaleChange(factor)}
                  className={`px-3 py-1 rounded-[10px] text-xs font-semibold tabular-nums transition cursor-pointer ${
                    upscale === factor
                      ? 'bg-white dark:bg-zinc-950 text-zinc-950 dark:text-white shadow-xs'
                      : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  {factor === 1 ? '1× Original' : `${factor}× HD`}
                </button>
              ))}
            </div>

            <div className="hidden md:flex items-center gap-1 pl-2">
              {STRENGTH_MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  disabled={isProcessing}
                  onClick={() => handleStrengthSelect(m)}
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                    strengthMode === m.id
                      ? 'bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 border-transparent'
                      : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-100'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowFineTune((s) => !s)}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer ${
              showFineTune
                ? 'bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 border-transparent'
                : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-100'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Fine-Tune</span>
          </button>
        </div>

        {/* Optional Restoration Fine-Tune Drawer */}
        {showFineTune && (
          <div className="px-5 sm:px-7 py-5 bg-zinc-50/80 border-b border-zinc-200/80 space-y-4 animate-scale-in">
            {/* Mobile Strength Selector */}
            <div className="flex md:hidden flex-wrap gap-1.5">
              {STRENGTH_MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  disabled={isProcessing}
                  onClick={() => handleStrengthSelect(m)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border cursor-pointer ${
                    strengthMode === m.id
                      ? 'bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 border-transparent'
                      : 'bg-white text-zinc-700 border-zinc-200'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <div className="grid sm:grid-cols-3 gap-5">
              <div>
                <div className="flex justify-between text-xs text-zinc-600 mb-1 tabular-nums">
                  <label htmlFor="enh-deblur">Deblur & Sharpness</label>
                  <span className="font-semibold text-zinc-900">{deblur}%</span>
                </div>
                <input
                  id="enh-deblur"
                  type="range"
                  min={0}
                  max={100}
                  value={deblur}
                  onChange={(e) => {
                    setDeblur(Number(e.target.value));
                    setDirty(true);
                  }}
                  className="w-full"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs text-zinc-600 mb-1 tabular-nums">
                  <label htmlFor="enh-denoise">Noise Reduction</label>
                  <span className="font-semibold text-zinc-900">{denoise}%</span>
                </div>
                <input
                  id="enh-denoise"
                  type="range"
                  min={0}
                  max={100}
                  value={denoise}
                  onChange={(e) => {
                    setDenoise(Number(e.target.value));
                    setDirty(true);
                  }}
                  className="w-full"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs text-zinc-600 mb-1 tabular-nums">
                  <label htmlFor="enh-clarity">Detail Clarity</label>
                  <span className="font-semibold text-zinc-900">{clarity}%</span>
                </div>
                <input
                  id="enh-clarity"
                  type="range"
                  min={0}
                  max={100}
                  value={clarity}
                  onChange={(e) => {
                    setClarity(Number(e.target.value));
                    setDirty(true);
                  }}
                  className="w-full"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-zinc-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoTone}
                  onChange={(e) => {
                    setAutoTone(e.target.checked);
                    setDirty(true);
                  }}
                  className="rounded accent-blue-600 w-4 h-4"
                />
                <span>Auto haze & dynamic range recovery</span>
              </label>

              {file && dirty && (
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={() => void runEnhancement(file)}
                  className="btn-studio-accent inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Re-Enhance</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Empty Upload State vs Built-In Split-Screen Result Stage */}
        {!file ? (
          <div className="p-6 sm:p-10">
            <div
              role="button"
              tabIndex={0}
              aria-label="Select blurry or low-resolution photo to enhance"
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              onClick={() => fileInputRef.current?.click()}
              className="group min-h-[320px] sm:min-h-[360px] flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 hover:border-blue-500/70 bg-zinc-50/60 hover:bg-blue-50/20 dark:hover:bg-blue-950/15 p-8 text-center cursor-pointer transition-all"
            >
              <div className="w-16 h-16 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 shadow-sm flex items-center justify-center mb-6 group-hover:-translate-y-1 transition-transform">
                <Sparkles className="w-7 h-7 text-zinc-900 dark:text-white group-hover:text-blue-600 transition-colors" />
              </div>

              <span className="btn-studio-accent inline-flex items-center gap-2 px-7 py-3.5 rounded-2xl font-semibold text-sm sm:text-[15px]">
                Select Photo to Enhance
              </span>

              <p className="text-xs sm:text-sm text-zinc-500 mt-4">
                Drop anywhere or press{' '}
                <kbd className="px-1.5 py-0.5 text-[11px] font-semibold bg-white border border-zinc-200 rounded-md text-zinc-700">
                  Ctrl+V
                </kbd>
              </p>

              <p className="text-[11px] font-medium text-zinc-400 mt-3 tracking-wide uppercase">
                Auto Deblur · Edge Denoise · 2× & 4× HD Upscale
              </p>
            </div>
          </div>
        ) : (
          <div>
            {/* Interactive Built-In Before/After Split Stage */}
            <div className="relative bg-zinc-950 p-4 sm:p-6">
              <div className="flex items-center justify-between gap-3 mb-3 text-xs text-zinc-400">
                <span className="truncate font-medium max-w-[240px]">{file.name}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setZoomed((z) => !z)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold transition cursor-pointer"
                  >
                    {zoomed ? <ZoomOut className="w-3.5 h-3.5" /> : <ZoomIn className="w-3.5 h-3.5" />}
                    <span>{zoomed ? '100%' : 'Inspect 2×'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={resetAll}
                    aria-label="Remove photo"
                    className="p-2 rounded-xl bg-white/10 hover:bg-red-500/80 text-white transition cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div
                ref={stageRef}
                onPointerDown={result ? handleSplitDown : undefined}
                onPointerMove={result ? handleSplitMove : undefined}
                onPointerUp={result ? handleSplitUp : undefined}
                onPointerCancel={result ? handleSplitUp : undefined}
                className="relative w-full h-[50vh] sm:h-[58vh] min-h-[300px] rounded-2xl overflow-hidden bg-black/50 select-none touch-none cursor-ew-resize"
              >
                {result ? (
                  <>
                    {/* Right Side: Enhanced HD Result */}
                    <img
                      src={result.url}
                      alt="Enhanced HD result"
                      draggable={false}
                      className={`absolute inset-0 w-full h-full object-contain transition-transform duration-200 ${
                        zoomed ? 'scale-175' : 'scale-100'
                      }`}
                    />

                    {/* Left Side: Original */}
                    <img
                      src={result.originalUrl}
                      alt="Original photo"
                      draggable={false}
                      style={{ clipPath: `inset(0 ${100 - splitPos}% 0 0)` }}
                      className={`absolute inset-0 w-full h-full object-contain transition-transform duration-200 ${
                        zoomed ? 'scale-175' : 'scale-100'
                      }`}
                    />

                    {/* Corner Labels */}
                    <div className="pointer-events-none absolute top-3 left-3 px-2.5 py-1 rounded-lg bg-zinc-950/75 text-white text-[11px] font-semibold backdrop-blur-xs tabular-nums">
                      Before · {result.originalWidth}×{result.originalHeight}
                    </div>
                    <div className="pointer-events-none absolute top-3 right-3 px-2.5 py-1 rounded-lg bg-blue-600/90 text-white text-[11px] font-semibold backdrop-blur-xs tabular-nums">
                      Enhanced · {result.width}×{result.height}
                    </div>

                    {/* Draggable Divider Line */}
                    <div
                      className="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_12px_rgba(0,0,0,0.85)]"
                      style={{ left: `${splitPos}%` }}
                    >
                      <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white text-zinc-950 shadow-xl border-2 border-blue-600 flex items-center justify-center">
                        <ChevronsLeftRight className="w-5 h-5" />
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-zinc-300 gap-3">
                    <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                    <p className="text-sm font-semibold">Enhancing & upscaling photo...</p>
                  </div>
                )}

                {/* Re-processing subtle overlay when switching 2x <-> 4x */}
                {isProcessing && result && (
                  <div className="absolute inset-0 bg-zinc-950/55 backdrop-blur-xs flex flex-col items-center justify-center text-white gap-2.5">
                    <Loader2 className="w-7 h-7 animate-spin text-blue-400" />
                    <span className="text-xs font-semibold">Applying {upscale}× restoration...</span>
                  </div>
                )}
              </div>
            </div>

            {/* Clean Result Metadata & Export Footer */}
            <div className="flex flex-wrap items-center justify-between gap-4 px-5 sm:px-7 py-4 border-t border-zinc-200/80 bg-zinc-50/80">
              <div className="flex flex-wrap items-center gap-2.5 text-xs text-zinc-600 tabular-nums">
                {result && (
                  <>
                    <span className="font-semibold text-zinc-900 inline-flex items-center gap-1.5">
                      {result.originalWidth}×{result.originalHeight}
                      <ArrowRight className="w-3.5 h-3.5 text-zinc-400" />
                      {result.width}×{result.height} px
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-zinc-200/70 dark:bg-zinc-800 text-zinc-700 font-semibold">
                      {formatFileSize(result.newSize)} · {result.encoderUsed}
                    </span>
                    <span className="text-zinc-400">{(result.processingMs / 1000).toFixed(1)}s</span>
                    {result.cappedByMemory && (
                      <span className="text-amber-700 dark:text-amber-400 font-medium">
                        (Capped at 4K for device safety)
                      </span>
                    )}
                  </>
                )}
              </div>

              <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
                <select
                  aria-label="Output format"
                  value={format}
                  disabled={isProcessing}
                  onChange={(e) => handleFormatChange(e.target.value as SupportedFormat)}
                  className="bg-white border border-zinc-300 rounded-xl px-3 py-2 text-xs font-semibold cursor-pointer"
                >
                  <option value="image/jpeg">JPG · MozJPEG</option>
                  <option value="image/png">PNG · Lossless</option>
                  <option value="image/webp">WEBP</option>
                </select>

                <button
                  type="button"
                  disabled={!result || isProcessing}
                  onClick={handleDownload}
                  className="btn-studio-accent inline-flex items-center gap-2 px-6 py-2.5 rounded-xl disabled:opacity-40 text-xs sm:text-sm font-semibold cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Download HD</span>
                </button>
              </div>
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
