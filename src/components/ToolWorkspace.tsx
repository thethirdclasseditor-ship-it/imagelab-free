import React, { useState, useRef, useEffect } from 'react';
import {
  Upload,
  Download,
  Archive,
  Trash2,
  Image as ImageIcon,
  Minimize2,
  Maximize2,
  Sparkles,
  ShieldCheck,
  AlertCircle,
  AlertTriangle,
  Loader2,
  SlidersHorizontal,
  CheckCircle2,
  Plus,
  X,
  RefreshCw,
  ArrowRight,
  Eye,
} from 'lucide-react';
import {
  processImage,
  formatFileSize,
  validateImageFile,
  detectSourceFormat,
  type SupportedFormat,
  type FitMode,
  type ProcessOptions,
  type ProcessedImageResult,
} from '../engine/imageEngine';
import { downloadSingleImage, downloadBatchAsZip } from '../engine/zipHelper';
import { RESIZE_PRESETS, TARGET_KB_PRESETS } from '../data/presets';
import SplitCompareModal from './SplitCompareModal';

export type ToolMode = 'converter' | 'compressor' | 'resizer' | 'enhancer';

export interface ToolDefaults {
  format?: SupportedFormat;
  quality?: number;
  targetSizeKB?: number;
  width?: number;
  height?: number;
  fitMode?: FitMode;
  brightness?: number;
  contrast?: number;
  saturate?: number;
  sharpness?: number;
  warmth?: number;
}

interface ToolWorkspaceProps {
  initialMode?: ToolMode;
  showModeTabs?: boolean;
  defaults?: ToolDefaults;
}

interface WorkspaceItem {
  id: string;
  file: File;
  previewUrl: string;
  sourceFormat: string;
  status: 'queued' | 'processing' | 'done' | 'error';
  result?: ProcessedImageResult;
  error?: string;
}

const MAX_BATCH_FILES = 20;

const MODE_TABS: { id: ToolMode; label: string; icon: React.ReactNode }[] = [
  { id: 'converter', label: 'Convert', icon: <ImageIcon className="w-4 h-4" /> },
  { id: 'compressor', label: 'Compress', icon: <Minimize2 className="w-4 h-4" /> },
  { id: 'resizer', label: 'Resize', icon: <Maximize2 className="w-4 h-4" /> },
  { id: 'enhancer', label: 'Enhance', icon: <Sparkles className="w-4 h-4" /> },
];

export default function ToolWorkspace({
  initialMode = 'converter',
  showModeTabs = true,
  defaults = {},
}: ToolWorkspaceProps) {
  const [mode, setMode] = useState<ToolMode>(initialMode);
  const [items, setItems] = useState<WorkspaceItem[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isGlobalDragging, setIsGlobalDragging] = useState(false);
  const [compareItem, setCompareItem] = useState<ProcessedImageResult | null>(null);
  const [isZipping, setIsZipping] = useState(false);

  const [showSettings, setShowSettings] = useState<boolean>(
    initialMode === 'enhancer' || (initialMode === 'resizer' && !defaults.width && !defaults.height)
  );
  const [settingsDirty, setSettingsDirty] = useState(false);

  const [format, setFormat] = useState<SupportedFormat>(defaults.format ?? 'image/jpeg');
  const [quality, setQuality] = useState<number>(Math.round((defaults.quality ?? 0.85) * 100));
  const [targetSizeKB, setTargetSizeKB] = useState<string>(
    defaults.targetSizeKB ? String(defaults.targetSizeKB) : ''
  );
  const [width, setWidth] = useState<string>(defaults.width ? String(defaults.width) : '');
  const [height, setHeight] = useState<string>(defaults.height ? String(defaults.height) : '');
  const [fitMode, setFitMode] = useState<FitMode>(defaults.fitMode ?? 'cover');
  const [brightness, setBrightness] = useState<number>(defaults.brightness ?? 100);
  const [contrast, setContrast] = useState<number>(defaults.contrast ?? 100);
  const [saturate, setSaturate] = useState<number>(defaults.saturate ?? 100);
  const [sharpness, setSharpness] = useState<number>(defaults.sharpness ?? 0);
  const [warmth, setWarmth] = useState<number>(defaults.warmth ?? 0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const runCounterRef = useRef(0);
  const dragDepthRef = useRef(0);
  const trackedUrlsRef = useRef<Set<string>>(new Set());
  const addFilesHandlerRef = useRef<(files: FileList | null) => void>(() => {});

  const trackUrl = (url: string) => {
    trackedUrlsRef.current.add(url);
    return url;
  };

  const releaseUrl = (url?: string) => {
    if (!url) return;
    URL.revokeObjectURL(url);
    trackedUrlsRef.current.delete(url);
  };

  useEffect(() => {
    return () => {
      trackedUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
      trackedUrlsRef.current.clear();
    };
  }, []);

  const buildProcessOptions = (overrides?: {
    mode?: ToolMode;
    format?: SupportedFormat;
    quality?: number;
    targetSizeKB?: string;
    width?: string;
    height?: string;
    fitMode?: FitMode;
  }): ProcessOptions => {
    const activeMode = overrides?.mode ?? mode;
    const activeFormat = overrides?.format ?? format;
    const activeQuality = overrides?.quality ?? quality;
    const activeTargetStr = overrides?.targetSizeKB ?? targetSizeKB;
    const activeWStr = overrides?.width ?? width;
    const activeHStr = overrides?.height ?? height;
    const activeFit = overrides?.fitMode ?? fitMode;

    const parsedTargetKB = Number(activeTargetStr) > 0 ? Number(activeTargetStr) : undefined;
    const parsedW = Number(activeWStr) > 0 ? Number(activeWStr) : undefined;
    const parsedH = Number(activeHStr) > 0 ? Number(activeHStr) : undefined;

    return {
      format:
        activeMode === 'converter' || activeMode === 'compressor' || activeMode === 'resizer'
          ? activeFormat
          : undefined,
      quality: activeQuality / 100,
      targetSizeKB:
        activeMode === 'compressor' || activeMode === 'resizer' ? parsedTargetKB : undefined,
      width: activeMode === 'resizer' ? parsedW : undefined,
      height: activeMode === 'resizer' ? parsedH : undefined,
      fitMode: activeMode === 'resizer' ? activeFit : undefined,
      filters:
        activeMode === 'enhancer'
          ? { brightness, contrast, saturate, sharpness, warmth }
          : undefined,
    };
  };

  const runBatchOnItems = async (
    targetList: WorkspaceItem[],
    options: ProcessOptions,
    runId: number
  ) => {
    for (const target of targetList) {
      if (runCounterRef.current !== runId) return;

      setItems((prev) =>
        prev.map((it) =>
          it.id === target.id ? { ...it, status: 'processing', error: undefined } : it
        )
      );

      try {
        const res = await processImage(target.file, options);
        trackUrl(res.url);
        trackUrl(res.originalUrl);

        if (runCounterRef.current !== runId) {
          releaseUrl(res.url);
          releaseUrl(res.originalUrl);
          return;
        }

        setItems((prev) =>
          prev.map((it) => {
            if (it.id !== target.id) return it;
            if (it.result) {
              releaseUrl(it.result.url);
              releaseUrl(it.result.originalUrl);
            }
            return { ...it, status: 'done', result: res, error: undefined };
          })
        );
      } catch (err) {
        if (runCounterRef.current !== runId) return;
        const msg = err instanceof Error ? err.message : 'Failed to process image.';
        setItems((prev) =>
          prev.map((it) => (it.id === target.id ? { ...it, status: 'error', error: msg } : it))
        );
      }
    }
  };

  const reprocessAll = (overrides?: Parameters<typeof buildProcessOptions>[0]) => {
    if (items.length === 0) return;
    const runId = ++runCounterRef.current;
    setSettingsDirty(false);
    const options = buildProcessOptions(overrides);

    setItems((prev) => prev.map((it) => ({ ...it, status: 'queued', error: undefined })));
    void runBatchOnItems(items, options, runId);
  };

  const handleAddFiles = (incoming: FileList | null) => {
    if (!incoming || incoming.length === 0) return;
    setErrorMsg(null);

    const validFiles: File[] = [];
    const errors: string[] = [];

    Array.from(incoming).forEach((file) => {
      const err = validateImageFile(file);
      if (err) errors.push(err);
      else validFiles.push(file);
    });

    if (fileInputRef.current) fileInputRef.current.value = '';

    if (validFiles.length === 0) {
      if (errors.length > 0) setErrorMsg(errors[0]);
      return;
    }

    const remainingSlots = MAX_BATCH_FILES - items.length;
    if (remainingSlots <= 0) {
      setErrorMsg(`Maximum ${MAX_BATCH_FILES} images allowed per batch. Clear some files first.`);
      return;
    }

    const accepted = validFiles.slice(0, remainingSlots);
    if (validFiles.length > remainingSlots) {
      errors.push(`Limit is ${MAX_BATCH_FILES} images per batch. Extra files were skipped.`);
    }
    if (errors.length > 0) setErrorMsg(errors[0]);

    const newEntries: WorkspaceItem[] = accepted.map((file) => ({
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      file,
      previewUrl: trackUrl(URL.createObjectURL(file)),
      sourceFormat: detectSourceFormat(file),
      status: 'queued',
    }));

    setItems((prev) => [...prev, ...newEntries]);
    setSettingsDirty(false);

    const runId = ++runCounterRef.current;
    const options = buildProcessOptions();
    void runBatchOnItems(newEntries, options, runId);
  };

  // Always point ref to latest handler so window listeners never go stale
  addFilesHandlerRef.current = handleAddFiles;

  // Full-Window Drag & Drop + Ctrl+V Clipboard Paste
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
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };

    const onDragLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) {
        setIsGlobalDragging(false);
      }
    };

    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepthRef.current = 0;
      setIsGlobalDragging(false);
      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        addFilesHandlerRef.current(e.dataTransfer.files);
      }
    };

    const onPaste = (e: ClipboardEvent) => {
      const files = e.clipboardData?.files;
      if (files && files.length > 0) {
        e.preventDefault();
        addFilesHandlerRef.current(files);
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

  const handleModeSwitch = (newMode: ToolMode) => {
    setMode(newMode);
    setErrorMsg(null);
    setShowSettings(newMode === 'enhancer' || newMode === 'resizer');
    if (items.length > 0) {
      reprocessAll({ mode: newMode });
    }
  };

  const handleQuickFormatChange = (newFormat: SupportedFormat) => {
    setFormat(newFormat);
    if (items.length > 0) {
      reprocessAll({ format: newFormat });
    }
  };

  const removeItem = (id: string) => {
    setItems((prev) => {
      const target = prev.find((i) => i.id === id);
      if (target) {
        releaseUrl(target.previewUrl);
        if (target.result) {
          releaseUrl(target.result.url);
          releaseUrl(target.result.originalUrl);
        }
      }
      return prev.filter((i) => i.id !== id);
    });
  };

  const clearAll = () => {
    runCounterRef.current++;
    items.forEach((it) => {
      releaseUrl(it.previewUrl);
      if (it.result) {
        releaseUrl(it.result.url);
        releaseUrl(it.result.originalUrl);
      }
    });
    setItems([]);
    setErrorMsg(null);
    setCompareItem(null);
    setSettingsDirty(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const completedResults = items
    .filter(
      (it): it is WorkspaceItem & { result: ProcessedImageResult } =>
        it.status === 'done' && Boolean(it.result)
    )
    .map((it) => it.result);

  const isAnyProcessing = items.some((it) => it.status === 'processing' || it.status === 'queued');

  const handleDownloadZip = async () => {
    if (completedResults.length === 0) return;
    if (completedResults.length === 1) {
      downloadSingleImage(completedResults[0]);
      return;
    }
    setIsZipping(true);
    try {
      await downloadBatchAsZip(completedResults);
    } finally {
      setIsZipping(false);
    }
  };

  const formatLabel = format === 'image/jpeg' ? 'JPG' : format === 'image/webp' ? 'WEBP' : 'PNG';
  const hasActiveTargetKB =
    (mode === 'compressor' || mode === 'resizer') && Number(targetSizeKB) > 0;

  return (
    <div className="space-y-5">
      {/* Hidden Shared File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.heic,.heif,.avif"
        multiple
        className="hidden"
        onChange={(e) => handleAddFiles(e.target.files)}
      />

      {/* FULL-SCREEN DROP ANYWHERE OVERLAY */}
      {isGlobalDragging && (
        <div className="fixed inset-0 z-50 bg-blue-950/70 backdrop-blur-md flex items-center justify-center p-6 pointer-events-none">
          <div className="max-w-lg w-full rounded-3xl border-3 border-dashed border-blue-400 bg-white/95 dark:bg-slate-900/95 p-10 text-center shadow-2xl">
            <div className="w-20 h-20 rounded-3xl bg-blue-600 text-white flex items-center justify-center mx-auto mb-5 shadow-xl shadow-blue-600/30">
              <Upload className="w-10 h-10" />
            </div>
            <p className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
              Drop Anywhere to Upload
            </p>
            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 mt-2">
              Release your images anywhere on the screen — instant local processing starts automatically.
            </p>
          </div>
        </div>
      )}

      {/* Mode Switcher Tabs (Homepage) */}
      {showModeTabs && (
        <div className="flex justify-center">
          <div className="grid grid-cols-4 sm:inline-flex w-full sm:w-auto bg-slate-200/80 p-1.5 rounded-2xl gap-1 shadow-inner">
            {MODE_TABS.map((tab) => {
              const active = mode === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => handleModeSwitch(tab.id)}
                  className={`flex items-center justify-center gap-2 py-2.5 px-4 sm:px-6 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                    active
                      ? 'bg-white text-blue-600 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.icon}
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* PREMIUM LARGE WORKSPACE CARD */}
      <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/70 dark:shadow-none border border-slate-200 overflow-hidden">
        {/* Subtle Premium Top Accent Bar */}
        <div className="h-1.5 w-full bg-gradient-to-r from-blue-600 via-indigo-500 to-purple-600" />

        {/* Spacious Pro Control Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 sm:px-7 py-4 border-b border-slate-200 bg-slate-50/90">
          <div className="flex flex-wrap items-center gap-2.5 text-sm">
            {mode !== 'enhancer' ? (
              <>
                <span className="font-bold text-slate-700">Convert to</span>
                <select
                  aria-label="Output image format"
                  value={format}
                  onChange={(e) => handleQuickFormatChange(e.target.value as SupportedFormat)}
                  className="bg-white border border-slate-300 hover:border-blue-500 rounded-xl px-3.5 py-2 font-bold text-slate-900 text-sm shadow-2xs focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                >
                  <option value="image/jpeg">JPG (MozJPEG)</option>
                  <option value="image/webp">WEBP (Smallest)</option>
                  <option value="image/png">PNG (UPNG)</option>
                </select>

                {hasActiveTargetKB && (
                  <span className="px-3 py-1.5 rounded-xl bg-blue-50 text-blue-700 border border-blue-200 text-xs font-bold">
                    Max {targetSizeKB} KB
                  </span>
                )}
                {mode === 'resizer' && (width || height) && (
                  <span className="px-3 py-1.5 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-bold">
                    {width || 'Auto'}×{height || 'Auto'} px
                  </span>
                )}
                {!hasActiveTargetKB && (mode === 'converter' || mode === 'compressor') && (
                  <span className="hidden sm:inline-flex items-center px-3 py-1.5 rounded-xl bg-slate-100 text-slate-600 text-xs font-semibold">
                    Quality {quality}%
                  </span>
                )}
              </>
            ) : (
              <span className="font-bold text-slate-800 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-blue-600" />
                Studio Batch Enhancer
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {items.length > 0 && (
              <span className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold">
                <CheckCircle2 className="w-3.5 h-3.5" />
                {completedResults.length}/{items.length} Ready
              </span>
            )}

            <button
              type="button"
              onClick={() => setShowSettings((s) => !s)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold border transition cursor-pointer ${
                showSettings
                  ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                  : 'bg-white text-slate-700 border-slate-300 hover:border-blue-500 hover:text-blue-600'
              }`}
            >
              <SlidersHorizontal className="w-4 h-4" />
              <span>{showSettings ? 'Hide Options' : 'Options'}</span>
            </button>
          </div>
        </div>

        {/* Collapsible Pro Settings Panel */}
        {showSettings && (
          <div className="px-5 sm:px-7 py-5 bg-slate-50 border-b border-slate-200 space-y-5">
            {(mode === 'converter' || mode === 'compressor') && !hasActiveTargetKB && (
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label htmlFor="pro-quality-slider" className="text-xs sm:text-sm font-bold text-slate-700">
                    Quality{' '}
                    <span className="text-blue-600">({quality}%)</span>
                  </label>
                  <div className="flex items-center gap-1.5">
                    {[
                      { label: 'Smallest (70%)', q: 70 },
                      { label: 'Balanced (85%)', q: 85 },
                      { label: 'High (92%)', q: 92 },
                    ].map((preset) => (
                      <button
                        key={preset.q}
                        type="button"
                        onClick={() => {
                          setQuality(preset.q);
                          setSettingsDirty(false);
                          if (items.length > 0) reprocessAll({ quality: preset.q });
                        }}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold border cursor-pointer transition ${
                          quality === preset.q
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-slate-600 border-slate-200 hover:border-blue-400'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
                <input
                  id="pro-quality-slider"
                  type="range"
                  min={15}
                  max={100}
                  value={quality}
                  onChange={(e) => {
                    setQuality(Number(e.target.value));
                    setSettingsDirty(true);
                  }}
                  className="w-full accent-blue-600"
                />
              </div>
            )}

            {(mode === 'compressor' || mode === 'resizer') && (
              <div>
                <label
                  htmlFor="pro-target-kb"
                  className="block text-xs sm:text-sm font-bold text-slate-700 mb-2"
                >
                  Target Max File Size (KB) — Auto-optimizes quality & resolution
                </label>
                <div className="flex flex-wrap items-center gap-2 mb-2.5">
                  {TARGET_KB_PRESETS.map((kb) => (
                    <button
                      key={kb}
                      type="button"
                      onClick={() => {
                        const next = String(kb);
                        setTargetSizeKB(next);
                        setSettingsDirty(false);
                        if (items.length > 0) reprocessAll({ targetSizeKB: next });
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border cursor-pointer transition ${
                        targetSizeKB === String(kb)
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-blue-400'
                      }`}
                    >
                      ≤ {kb} KB
                    </button>
                  ))}
                  {targetSizeKB && (
                    <button
                      type="button"
                      onClick={() => {
                        setTargetSizeKB('');
                        setSettingsDirty(false);
                        if (items.length > 0) reprocessAll({ targetSizeKB: '' });
                      }}
                      className="px-2.5 py-1 text-xs font-semibold text-slate-500 hover:text-red-600 cursor-pointer"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <input
                  id="pro-target-kb"
                  type="number"
                  min={5}
                  placeholder="Custom KB (e.g. 50)"
                  value={targetSizeKB}
                  onChange={(e) => {
                    setTargetSizeKB(e.target.value);
                    setSettingsDirty(true);
                  }}
                  className="w-full sm:w-64 bg-white border border-slate-300 rounded-xl px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}

            {mode === 'resizer' && (
              <div className="space-y-3">
                <div>
                  <span className="block text-xs sm:text-sm font-bold text-slate-700 mb-2">
                    One-Click Presets
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {RESIZE_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => {
                          const w = String(preset.width);
                          const h = String(preset.height);
                          const kb = preset.targetSizeKB ? String(preset.targetSizeKB) : '';
                          setWidth(w);
                          setHeight(h);
                          setFitMode(preset.fitMode);
                          if (kb) {
                            setTargetSizeKB(kb);
                            setFormat('image/jpeg');
                          }
                          setSettingsDirty(false);
                          if (items.length > 0) {
                            reprocessAll({
                              width: w,
                              height: h,
                              fitMode: preset.fitMode,
                              targetSizeKB: kb,
                              format: kb ? 'image/jpeg' : format,
                            });
                          }
                        }}
                        className="px-3 py-1.5 rounded-xl text-xs font-bold bg-white border border-slate-200 text-slate-700 hover:border-blue-500 hover:text-blue-600 cursor-pointer"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div>
                    <label htmlFor="pro-w" className="block text-xs font-semibold text-slate-600 mb-1">
                      Width (px)
                    </label>
                    <input
                      id="pro-w"
                      type="number"
                      min={10}
                      placeholder="Auto"
                      value={width}
                      onChange={(e) => {
                        setWidth(e.target.value);
                        setSettingsDirty(true);
                      }}
                      className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor="pro-h" className="block text-xs font-semibold text-slate-600 mb-1">
                      Height (px)
                    </label>
                    <input
                      id="pro-h"
                      type="number"
                      min={10}
                      placeholder="Auto"
                      value={height}
                      onChange={(e) => {
                        setHeight(e.target.value);
                        setSettingsDirty(true);
                      }}
                      className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <label htmlFor="pro-fit" className="block text-xs font-semibold text-slate-600 mb-1">
                      Fit Mode
                    </label>
                    <select
                      id="pro-fit"
                      value={fitMode}
                      onChange={(e) => {
                        const next = e.target.value as FitMode;
                        setFitMode(next);
                        setSettingsDirty(false);
                        if (items.length > 0) reprocessAll({ fitMode: next });
                      }}
                      className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-sm"
                    >
                      <option value="cover">Smart Portrait Crop</option>
                      <option value="contain">Fit + White Padding (Signatures)</option>
                      <option value="stretch">Exact Stretch</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {mode === 'enhancer' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs sm:text-sm font-bold text-slate-700">Studio Adjustments</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setBrightness(106);
                        setContrast(114);
                        setSaturate(115);
                        setSharpness(25);
                        setWarmth(6);
                        setSettingsDirty(true);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 cursor-pointer"
                    >
                      Auto Enhance
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setBrightness(100);
                        setContrast(100);
                        setSaturate(100);
                        setSharpness(0);
                        setWarmth(0);
                        setSettingsDirty(true);
                      }}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-100 cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> Reset
                    </button>
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
                  <div>
                    <div className="flex justify-between text-xs text-slate-600 mb-1">
                      <label htmlFor="enh-b">Brightness</label>
                      <span className="font-bold">{brightness}%</span>
                    </div>
                    <input
                      id="enh-b"
                      type="range"
                      min={50}
                      max={150}
                      value={brightness}
                      onChange={(e) => {
                        setBrightness(Number(e.target.value));
                        setSettingsDirty(true);
                      }}
                      className="w-full accent-blue-600"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-xs text-slate-600 mb-1">
                      <label htmlFor="enh-c">Contrast</label>
                      <span className="font-bold">{contrast}%</span>
                    </div>
                    <input
                      id="enh-c"
                      type="range"
                      min={50}
                      max={150}
                      value={contrast}
                      onChange={(e) => {
                        setContrast(Number(e.target.value));
                        setSettingsDirty(true);
                      }}
                      className="w-full accent-blue-600"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-xs text-slate-600 mb-1">
                      <label htmlFor="enh-s">Saturation</label>
                      <span className="font-bold">{saturate}%</span>
                    </div>
                    <input
                      id="enh-s"
                      type="range"
                      min={0}
                      max={200}
                      value={saturate}
                      onChange={(e) => {
                        setSaturate(Number(e.target.value));
                        setSettingsDirty(true);
                      }}
                      className="w-full accent-blue-600"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-xs text-slate-600 mb-1">
                      <label htmlFor="enh-sh">Sharpness (Clarity)</label>
                      <span className="font-bold">{sharpness}%</span>
                    </div>
                    <input
                      id="enh-sh"
                      type="range"
                      min={0}
                      max={100}
                      value={sharpness}
                      onChange={(e) => {
                        setSharpness(Number(e.target.value));
                        setSettingsDirty(true);
                      }}
                      className="w-full accent-blue-600"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <div className="flex justify-between text-xs text-slate-600 mb-1">
                      <label htmlFor="enh-w">Warmth (Cool ↔ Warm)</label>
                      <span className="font-bold">{warmth > 0 ? `+${warmth}` : warmth}</span>
                    </div>
                    <input
                      id="enh-w"
                      type="range"
                      min={-50}
                      max={50}
                      value={warmth}
                      onChange={(e) => {
                        setWarmth(Number(e.target.value));
                        setSettingsDirty(true);
                      }}
                      className="w-full accent-blue-600"
                    />
                  </div>
                </div>
              </div>
            )}

            {items.length > 0 && settingsDirty && (
              <div className="pt-1 flex justify-end">
                <button
                  type="button"
                  onClick={() => reprocessAll()}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold shadow-sm cursor-pointer"
                >
                  <RefreshCw className="w-4 h-4" />
                  Apply New Settings ({items.length})
                </button>
              </div>
            )}
          </div>
        )}

        {/* EMPTY STATE: Big Premium Hero Dropzone */}
        {items.length === 0 ? (
          <div className="p-6 sm:p-10">
            <div
              role="button"
              tabIndex={0}
              aria-label="Select or drop images"
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              onClick={() => fileInputRef.current?.click()}
              className="group min-h-[300px] sm:min-h-[340px] flex flex-col items-center justify-center border-2 border-dashed border-slate-300 hover:border-blue-500 bg-slate-50/50 hover:bg-blue-50/30 rounded-3xl p-8 text-center cursor-pointer transition-all focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-xl shadow-blue-600/25 flex items-center justify-center mb-6 group-hover:scale-105 transition-transform">
                <Upload className="w-9 h-9" />
              </div>

              <span className="inline-flex items-center gap-2 px-7 py-3.5 rounded-2xl bg-blue-600 group-hover:bg-blue-700 text-white font-bold text-base sm:text-lg shadow-lg shadow-blue-600/20 transition">
                Select Images
              </span>

              <p className="text-sm sm:text-base font-medium text-slate-600 mt-4">
                or drag & drop files <strong className="text-slate-900">anywhere on this page</strong> · press{' '}
                <kbd className="px-1.5 py-0.5 text-xs font-bold bg-white border border-slate-300 rounded-md shadow-2xs">
                  Ctrl+V
                </kbd>{' '}
                to paste
              </p>

              <div className="flex flex-wrap items-center justify-center gap-2 mt-5">
                {['JPG', 'PNG', 'WEBP', 'AVIF', 'HEIC'].map((fmt) => (
                  <span
                    key={fmt}
                    className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-600 text-xs font-bold shadow-2xs"
                  >
                    {fmt}
                  </span>
                ))}
                <span className="text-xs text-slate-400 font-medium ml-1">
                  · Up to {MAX_BATCH_FILES} files (25MB each)
                </span>
              </div>
            </div>
          </div>
        ) : (
          /* ACTIVE STATE: Spacious Studio Workspace */
          <div className="flex flex-col">
            <div className="min-h-[290px] max-h-[560px] overflow-y-auto divide-y divide-slate-100">
              {items.map((item) => {
                const res = item.result;
                return (
                  <div
                    key={item.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-5 sm:px-7 py-4 sm:py-5 hover:bg-slate-50/80 transition"
                  >
                    {/* Left: Big Thumbnail + Clean Metadata */}
                    <div className="flex items-center gap-4 min-w-0 flex-1">
                      <div className="w-16 h-16 rounded-2xl overflow-hidden border border-slate-200 bg-slate-100 shrink-0 shadow-2xs flex items-center justify-center">
                        <img
                          src={res ? res.url : item.previewUrl}
                          alt={item.file.name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      </div>

                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="text-sm sm:text-base font-bold text-slate-900 truncate">
                          {item.file.name}
                        </p>

                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs sm:text-sm text-slate-500">
                          <span className="font-medium">
                            {item.sourceFormat} · {formatFileSize(item.file.size)}
                          </span>

                          {item.status === 'done' && res && (
                            <>
                              <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                              <span className="font-extrabold text-slate-900">
                                {res.outputFormat} · {formatFileSize(res.newSize)}
                              </span>
                              <span className="hidden md:inline text-xs text-slate-400">
                                ({res.width}×{res.height} px)
                              </span>
                            </>
                          )}
                        </div>

                        {item.status === 'done' && res && (
                          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[11px] font-bold">
                              {res.encoderUsed}
                            </span>
                            {res.savedPercent > 0 && (
                              <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-700 text-[11px] font-bold">
                                -{res.savedPercent}% smaller
                              </span>
                            )}
                            {res.targetMissed && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 text-[11px] font-bold">
                                <AlertTriangle className="w-3 h-3" />
                                Closest to {res.targetSizeKB}KB
                              </span>
                            )}
                            {res.warning && (
                              <span className="text-[11px] text-amber-700">{res.warning}</span>
                            )}
                          </div>
                        )}

                        {item.status === 'error' && (
                          <p className="text-xs text-red-600 flex items-center gap-1 pt-0.5">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                            <span>{item.error}</span>
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Right: Status + Big Clickable Action Buttons */}
                    <div className="flex items-center justify-end gap-2.5 shrink-0">
                      {(item.status === 'queued' || item.status === 'processing') && (
                        <span className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-blue-50 text-blue-700 text-xs sm:text-sm font-bold">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          {item.status === 'processing' ? 'Optimizing...' : 'Queued'}
                        </span>
                      )}

                      {item.status === 'done' && res && (
                        <>
                          <CheckCircle2 className="w-5 h-5 text-emerald-500 hidden sm:block shrink-0" />
                          <button
                            type="button"
                            onClick={() => setCompareItem(res)}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-xs sm:text-sm font-bold text-slate-700 cursor-pointer transition"
                            title="Split-Screen Compare"
                          >
                            <Eye className="w-4 h-4" />
                            <span>Compare</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => downloadSingleImage(res)}
                            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-bold shadow-sm shadow-blue-600/20 cursor-pointer transition"
                          >
                            <Download className="w-4 h-4" />
                            <span>Download</span>
                          </button>
                        </>
                      )}

                      <button
                        type="button"
                        aria-label={`Remove ${item.file.name}`}
                        onClick={() => removeItem(item.id)}
                        className="p-2 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 transition cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* Subtle Roomy Drop Hint inside Active Workspace */}
              {items.length < 4 && (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="px-6 py-8 text-center text-xs sm:text-sm text-slate-400 hover:text-blue-600 hover:bg-blue-50/20 cursor-pointer transition"
                >
                  + Drag & drop more images anywhere on the screen, click here, or press{' '}
                  <strong className="font-semibold">Ctrl+V</strong>
                </div>
              )}
            </div>

            {/* Premium Bottom Action Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 sm:px-7 py-4 border-t border-slate-200 bg-slate-50/95">
              <button
                type="button"
                disabled={items.length >= MAX_BATCH_FILES}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:border-blue-500 hover:text-blue-600 disabled:opacity-50 text-sm font-bold text-slate-700 shadow-2xs cursor-pointer transition"
              >
                <Plus className="w-4 h-4" />
                <span>Add More Files ({items.length}/{MAX_BATCH_FILES})</span>
              </button>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={clearAll}
                  title="Clear all files"
                  aria-label="Clear all files"
                  className="p-2.5 rounded-xl border border-slate-300 bg-white hover:bg-red-50 hover:border-red-300 hover:text-red-600 text-slate-600 transition cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  disabled={completedResults.length === 0 || isAnyProcessing || isZipping}
                  onClick={handleDownloadZip}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-sm font-bold shadow-md shadow-blue-600/20 transition cursor-pointer"
                >
                  {isZipping ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Creating ZIP...</span>
                    </>
                  ) : completedResults.length > 1 ? (
                    <>
                      <Archive className="w-4 h-4" />
                      <span>Download ZIP ({completedResults.length})</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      <span>Download {formatLabel}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Validation Error Banner */}
        {errorMsg && (
          <div className="mx-5 sm:mx-7 mb-5 flex items-start gap-2 p-3.5 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs sm:text-sm">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
      </div>

      {/* Trust Footnote */}
      <p className="flex items-center justify-center gap-1.5 text-xs sm:text-sm text-slate-500">
        <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
        <span>
          100% Private · MozJPEG, LibWebP & UPNG run locally inside your browser with zero uploads.
        </span>
      </p>

      {/* Split-Screen Comparator */}
      {compareItem && (
        <SplitCompareModal item={compareItem} onClose={() => setCompareItem(null)} />
      )}
    </div>
  );
}
