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
  Lock,
  AlertCircle,
  AlertTriangle,
  Loader2,
  SlidersHorizontal,
  Check,
  Plus,
  X,
  RotateCcw,
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
  { id: 'converter', label: 'Convert', icon: <ImageIcon className="w-3.5 h-3.5" /> },
  { id: 'compressor', label: 'Compress', icon: <Minimize2 className="w-3.5 h-3.5" /> },
  { id: 'resizer', label: 'Resize', icon: <Maximize2 className="w-3.5 h-3.5" /> },
  { id: 'enhancer', label: 'Enhance', icon: <Sparkles className="w-3.5 h-3.5" /> },
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
  const listScrollRef = useRef<HTMLDivElement>(null);
  const dragDepthRef = useRef(0);

  const itemsRef = useRef<WorkspaceItem[]>([]);
  const sessionIdRef = useRef(0);
  const activeRunnerRef = useRef<number | null>(null);
  const runnerSeqRef = useRef(0);
  const trackedUrlsRef = useRef<Set<string>>(new Set());
  const addFilesHandlerRef = useRef<(files: FileList | null) => void>(() => {});

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
      format: activeFormat,
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

  // Snapshot committed options (NEVER mutated mid-batch just by dragging sliders before clicking Apply)
  const activeOptionsRef = useRef<ProcessOptions>(buildProcessOptions());

  itemsRef.current = items;

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
      sessionIdRef.current++;
      trackedUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
      trackedUrlsRef.current.clear();
    };
  }, []);

  const updateItemState = (id: string, updater: (item: WorkspaceItem) => WorkspaceItem) => {
    const next = itemsRef.current.map((it) => (it.id === id ? updater(it) : it));
    itemsRef.current = next;
    setItems(next);
  };

  const pumpQueue = async () => {
    if (activeRunnerRef.current !== null) return;

    const runnerToken = ++runnerSeqRef.current;
    const session = sessionIdRef.current;
    activeRunnerRef.current = runnerToken;

    try {
      while (sessionIdRef.current === session && activeRunnerRef.current === runnerToken) {
        const nextItem = itemsRef.current.find((it) => it.status === 'queued');
        if (!nextItem) break;

        updateItemState(nextItem.id, (it) => ({
          ...it,
          status: 'processing',
          error: undefined,
        }));

        try {
          const res = await processImage(nextItem.file, activeOptionsRef.current);

          const stillExists = itemsRef.current.some((it) => it.id === nextItem.id);
          if (sessionIdRef.current !== session || !stillExists) {
            URL.revokeObjectURL(res.url);
            URL.revokeObjectURL(res.originalUrl);
            continue;
          }

          trackUrl(res.url);
          trackUrl(res.originalUrl);

          updateItemState(nextItem.id, (it) => {
            if (it.result) {
              releaseUrl(it.result.url);
              releaseUrl(it.result.originalUrl);
            }
            return { ...it, status: 'done', result: res, error: undefined };
          });
        } catch (err) {
          if (sessionIdRef.current !== session) break;
          const msg = err instanceof Error ? err.message : 'Failed to process image.';
          updateItemState(nextItem.id, (it) => ({
            ...it,
            status: 'error',
            error: msg,
          }));
        }
      }
    } finally {
      if (activeRunnerRef.current === runnerToken) {
        activeRunnerRef.current = null;
        if (
          sessionIdRef.current === session &&
          itemsRef.current.some((it) => it.status === 'queued')
        ) {
          void pumpQueue();
        }
      }
    }
  };

  const reprocessAll = (overrides?: Parameters<typeof buildProcessOptions>[0]) => {
    activeOptionsRef.current = buildProcessOptions(overrides);
    setSettingsDirty(false);
    if (itemsRef.current.length === 0) return;

    sessionIdRef.current++;
    activeRunnerRef.current = null;

    const resetList = itemsRef.current.map((it) => ({
      ...it,
      status: 'queued' as const,
      error: undefined,
    }));
    itemsRef.current = resetList;
    setItems(resetList);

    void pumpQueue();
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

    const remainingSlots = MAX_BATCH_FILES - itemsRef.current.length;
    if (remainingSlots <= 0) {
      setErrorMsg(`Batch limit is ${MAX_BATCH_FILES} images. Clear some files first.`);
      return;
    }

    const accepted = validFiles.slice(0, remainingSlots);
    if (validFiles.length > remainingSlots) {
      errors.push(`Only ${MAX_BATCH_FILES} images allowed per batch. Extra files skipped.`);
    }
    if (errors.length > 0) setErrorMsg(errors[0]);

    // If queue was idle, snapshot the current UI settings cleanly before starting
    if (activeRunnerRef.current === null) {
      activeOptionsRef.current = buildProcessOptions();
      setSettingsDirty(false);
    }

    const newEntries: WorkspaceItem[] = accepted.map((file) => ({
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      file,
      previewUrl: trackUrl(URL.createObjectURL(file)),
      sourceFormat: detectSourceFormat(file),
      status: 'queued',
    }));

    const nextList = [...newEntries, ...itemsRef.current];
    itemsRef.current = nextList;
    setItems(nextList);

    requestAnimationFrame(() => {
      listScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    });

    void pumpQueue();
  };

  addFilesHandlerRef.current = handleAddFiles;

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
      if (dragDepthRef.current === 0) setIsGlobalDragging(false);
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
      if (!files || files.length === 0) return;
      const hasImg = Array.from(files).some((f) => f.type.startsWith('image/'));
      if (hasImg) {
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
    reprocessAll({ mode: newMode });
  };

  const handleQuickFormatChange = (newFormat: SupportedFormat) => {
    setFormat(newFormat);
    reprocessAll({ format: newFormat });
  };

  const retryItem = (id: string) => {
    updateItemState(id, (it) => ({ ...it, status: 'queued', error: undefined }));
    void pumpQueue();
  };

  const removeItem = (id: string) => {
    const target = itemsRef.current.find((i) => i.id === id);
    if (target) {
      releaseUrl(target.previewUrl);
      if (target.result) {
        releaseUrl(target.result.url);
        releaseUrl(target.result.originalUrl);
      }
    }
    const next = itemsRef.current.filter((i) => i.id !== id);
    itemsRef.current = next;
    setItems(next);
  };

  const clearAll = () => {
    sessionIdRef.current++;
    activeRunnerRef.current = null;
    itemsRef.current.forEach((it) => {
      releaseUrl(it.previewUrl);
      if (it.result) {
        releaseUrl(it.result.url);
        releaseUrl(it.result.originalUrl);
      }
    });
    itemsRef.current = [];
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
    <div className="space-y-4 animate-fade-up">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.heic,.heif,.avif"
        multiple
        className="hidden"
        onChange={(e) => handleAddFiles(e.target.files)}
      />

      {isGlobalDragging && (
        <div className="fixed inset-0 z-50 bg-zinc-950/65 backdrop-blur-md flex items-center justify-center p-6 pointer-events-none animate-scale-in">
          <div className="max-w-md w-full rounded-3xl border border-blue-400/50 bg-white/95 dark:bg-zinc-900/95 p-10 text-center shadow-2xl">
            <div className="w-16 h-16 rounded-2xl bg-blue-600 text-white flex items-center justify-center mx-auto mb-5 shadow-lg shadow-blue-600/30">
              <Upload className="w-7 h-7" />
            </div>
            <p className="text-xl font-bold text-zinc-950 dark:text-white tracking-tight">
              Release to upload
            </p>
            <p className="text-sm text-zinc-500 mt-1.5">
              New images appear at the top and process automatically
            </p>
          </div>
        </div>
      )}

      {showModeTabs && (
        <div className="flex justify-center">
          <div className="grid grid-cols-4 sm:inline-flex w-full sm:w-auto bg-zinc-100 border border-zinc-200/80 p-1 rounded-2xl gap-1">
            {MODE_TABS.map((tab) => {
              const active = mode === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => handleModeSwitch(tab.id)}
                  className={`flex items-center justify-center gap-1.5 py-2 px-3.5 sm:px-5 rounded-xl text-xs sm:text-[13.5px] font-semibold transition-all cursor-pointer ${
                    active
                      ? 'bg-white text-zinc-950 shadow-xs'
                      : 'text-zinc-500 hover:text-zinc-900'
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

      <div className="studio-card rounded-3xl overflow-hidden">
        {/* Control Header (Output format selector now available in all modes including Enhancer) */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 sm:px-7 py-3.5 border-b border-zinc-200/80 bg-zinc-50/80">
          <div className="flex flex-wrap items-center gap-2.5 text-sm">
            <span className="text-xs font-semibold text-zinc-500">Format</span>
            <select
              aria-label="Output format"
              value={format}
              onChange={(e) => handleQuickFormatChange(e.target.value as SupportedFormat)}
              className="bg-white border border-zinc-300 hover:border-zinc-400 rounded-xl px-3 py-1.5 font-semibold text-zinc-900 text-xs sm:text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500/30 cursor-pointer transition"
            >
              <option value="image/jpeg">JPG · MozJPEG</option>
              <option value="image/webp">WEBP · LibWebP</option>
              <option value="image/png">PNG · UPNG</option>
            </select>

            {hasActiveTargetKB && (
              <span className="px-2.5 py-1 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs font-semibold tabular-nums">
                ≤ {targetSizeKB} KB
              </span>
            )}
            {mode === 'resizer' && (width || height) && (
              <span className="px-2.5 py-1 rounded-lg bg-zinc-200/70 dark:bg-zinc-800 text-zinc-700 text-xs font-semibold tabular-nums">
                {width || 'Auto'}×{height || 'Auto'}
              </span>
            )}
            {!hasActiveTargetKB && (mode === 'converter' || mode === 'compressor') && (
              <span className="hidden sm:inline-flex px-2.5 py-1 rounded-lg bg-zinc-100 text-zinc-500 text-xs font-medium tabular-nums">
                Q{quality}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {items.length > 0 && (
              <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-xs font-semibold tabular-nums">
                <Check className="w-3.5 h-3.5" />
                {completedResults.length}/{items.length}
              </span>
            )}

            <button
              type="button"
              onClick={() => setShowSettings((s) => !s)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition active:scale-[0.98] cursor-pointer ${
                showSettings
                  ? 'bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 border-transparent'
                  : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-100'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Options</span>
            </button>
          </div>
        </div>

        {showSettings && (
          <div className="px-5 sm:px-7 py-5 bg-zinc-50/80 border-b border-zinc-200/80 space-y-5 animate-scale-in">
            {(mode === 'converter' || mode === 'compressor') && !hasActiveTargetKB && (
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label htmlFor="pro-quality-slider" className="text-xs font-semibold text-zinc-700 tabular-nums">
                    Quality · {quality}%
                  </label>
                  <div className="flex items-center gap-1.5">
                    {[
                      { label: 'Compact', q: 72 },
                      { label: 'Balanced', q: 85 },
                      { label: 'Crisp', q: 92 },
                    ].map((preset) => (
                      <button
                        key={preset.q}
                        type="button"
                        onClick={() => {
                          setQuality(preset.q);
                          reprocessAll({ quality: preset.q });
                        }}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition cursor-pointer ${
                          quality === preset.q
                            ? 'bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 border-transparent'
                            : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-100'
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
                  className="w-full"
                />
              </div>
            )}

            {(mode === 'compressor' || mode === 'resizer') && (
              <div className="space-y-2.5">
                <label htmlFor="pro-target-kb" className="block text-xs font-semibold text-zinc-700">
                  Max File Size (KB)
                </label>
                <div className="flex flex-wrap items-center gap-1.5">
                  {TARGET_KB_PRESETS.map((kb) => (
                    <button
                      key={kb}
                      type="button"
                      onClick={() => {
                        const next = String(kb);
                        setTargetSizeKB(next);
                        reprocessAll({ targetSizeKB: next });
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold border tabular-nums transition cursor-pointer ${
                        targetSizeKB === String(kb)
                          ? 'bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 border-transparent'
                          : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-100'
                      }`}
                    >
                      {kb} KB
                    </button>
                  ))}
                  <input
                    id="pro-target-kb"
                    type="number"
                    min={5}
                    placeholder="Custom KB"
                    value={targetSizeKB}
                    onChange={(e) => {
                      setTargetSizeKB(e.target.value);
                      setSettingsDirty(true);
                    }}
                    className="w-28 bg-white border border-zinc-300 rounded-xl px-3 py-1.5 text-xs font-semibold tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  />
                  {targetSizeKB && (
                    <button
                      type="button"
                      onClick={() => {
                        setTargetSizeKB('');
                        reprocessAll({ targetSizeKB: '' });
                      }}
                      className="px-2 py-1 text-xs font-medium text-zinc-500 hover:text-red-600 cursor-pointer"
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>
            )}

            {mode === 'resizer' && (
              <div className="space-y-3.5">
                <div className="flex flex-wrap gap-1.5">
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
                        reprocessAll({
                          width: w,
                          height: h,
                          fitMode: preset.fitMode,
                          targetSizeKB: kb,
                          format: kb ? 'image/jpeg' : format,
                        });
                      }}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-white border border-zinc-200 text-zinc-700 hover:border-blue-500 hover:text-blue-600 transition cursor-pointer"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div>
                    <label htmlFor="pro-w" className="block text-[11px] font-semibold text-zinc-500 mb-1">
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
                      className="w-full bg-white border border-zinc-300 rounded-xl px-3 py-2 text-xs font-semibold tabular-nums"
                    />
                  </div>
                  <div>
                    <label htmlFor="pro-h" className="block text-[11px] font-semibold text-zinc-500 mb-1">
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
                      className="w-full bg-white border border-zinc-300 rounded-xl px-3 py-2 text-xs font-semibold tabular-nums"
                    />
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <label htmlFor="pro-fit" className="block text-[11px] font-semibold text-zinc-500 mb-1">
                      Fit Mode
                    </label>
                    <select
                      id="pro-fit"
                      value={fitMode}
                      onChange={(e) => {
                        const next = e.target.value as FitMode;
                        setFitMode(next);
                        reprocessAll({ fitMode: next });
                      }}
                      className="w-full bg-white border border-zinc-300 rounded-xl px-3 py-2 text-xs font-semibold"
                    >
                      <option value="cover">Smart Portrait Crop</option>
                      <option value="contain">Fit + Padding (Signatures)</option>
                      <option value="stretch">Exact Stretch</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {mode === 'enhancer' && (
              <div className="space-y-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-700">Adjustments</span>
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
                      className="btn-studio-accent px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer"
                    >
                      Auto
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
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-zinc-200 text-zinc-600 text-xs font-semibold hover:bg-zinc-100 cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" /> Reset
                    </button>
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
                  {[
                    { id: 'enh-b', label: 'Brightness', val: brightness, set: setBrightness, min: 50, max: 150, suffix: '%' },
                    { id: 'enh-c', label: 'Contrast', val: contrast, set: setContrast, min: 50, max: 150, suffix: '%' },
                    { id: 'enh-s', label: 'Saturation', val: saturate, set: setSaturate, min: 0, max: 200, suffix: '%' },
                    { id: 'enh-sh', label: 'Sharpness', val: sharpness, set: setSharpness, min: 0, max: 100, suffix: '%' },
                    { id: 'enh-w', label: 'Warmth', val: warmth, set: setWarmth, min: -50, max: 50, suffix: '' },
                  ].map((s) => (
                    <div key={s.id}>
                      <div className="flex justify-between text-xs text-zinc-600 mb-1 tabular-nums">
                        <label htmlFor={s.id}>{s.label}</label>
                        <span className="font-semibold text-zinc-900">
                          {s.id === 'enh-w' && s.val > 0 ? `+${s.val}` : s.val}
                          {s.suffix}
                        </span>
                      </div>
                      <input
                        id={s.id}
                        type="range"
                        min={s.min}
                        max={s.max}
                        value={s.val}
                        onChange={(e) => {
                          s.set(Number(e.target.value));
                          setSettingsDirty(true);
                        }}
                        className="w-full"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {items.length > 0 && settingsDirty && (
              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={() => reprocessAll()}
                  className="btn-studio-accent inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer"
                >
                  Apply to {items.length} {items.length === 1 ? 'file' : 'files'}
                </button>
              </div>
            )}
          </div>
        )}

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
              className="group min-h-[300px] sm:min-h-[350px] flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 hover:border-blue-500/70 bg-zinc-50/60 hover:bg-blue-50/20 dark:hover:bg-blue-950/15 p-8 text-center cursor-pointer transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            >
              <div className="w-16 h-16 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 shadow-sm flex items-center justify-center mb-6 group-hover:-translate-y-1 group-hover:shadow-md transition-all duration-200">
                <Upload className="w-7 h-7 text-zinc-900 dark:text-white group-hover:text-blue-600 transition-colors" />
              </div>

              <span className="btn-studio-accent inline-flex items-center gap-2 px-7 py-3.5 rounded-2xl font-semibold text-sm sm:text-[15px]">
                Select Images
              </span>

              <p className="text-xs sm:text-sm text-zinc-500 mt-4">
                Drop anywhere on screen or press{' '}
                <kbd className="px-1.5 py-0.5 text-[11px] font-semibold bg-white border border-zinc-200 rounded-md text-zinc-700">
                  Ctrl+V
                </kbd>
              </p>

              <p className="text-[11px] font-medium text-zinc-400 mt-3 tracking-wide uppercase">
                JPG · PNG · WEBP · AVIF · HEIC · Up to {MAX_BATCH_FILES} files
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col">
            <div
              ref={listScrollRef}
              className="min-h-[300px] max-h-[560px] overflow-y-auto divide-y divide-zinc-100"
            >
              {items.map((item) => {
                const res = item.result;
                return (
                  <div
                    key={item.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-5 sm:px-7 py-4 hover:bg-zinc-50 transition animate-fade-up"
                  >
                    <div className="flex items-center gap-4 min-w-0 flex-1">
                      <div className="w-14 h-14 rounded-2xl overflow-hidden border border-zinc-200 bg-zinc-100 shrink-0 flex items-center justify-center">
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
                        <p className="text-sm font-semibold text-zinc-900 truncate">
                          {item.file.name}
                        </p>

                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500 tabular-nums">
                          <span>
                            {item.sourceFormat} · {formatFileSize(item.file.size)}
                          </span>

                          {item.status === 'done' && res && (
                            <>
                              <ArrowRight className="w-3 h-3 text-zinc-400" />
                              <span className="font-semibold text-zinc-900">
                                {res.outputFormat} · {formatFileSize(res.newSize)}
                              </span>
                              <span className="hidden md:inline text-zinc-400">
                                {res.width}×{res.height}
                              </span>
                            </>
                          )}
                        </div>

                        {item.status === 'done' && res && (
                          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                            <span className="px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-600 text-[10.5px] font-semibold">
                              {res.encoderUsed}
                            </span>
                            {res.savedPercent > 0 && (
                              <span className="px-2 py-0.5 rounded-md bg-emerald-500/12 text-emerald-700 dark:text-emerald-400 text-[10.5px] font-semibold tabular-nums">
                                -{res.savedPercent}%
                              </span>
                            )}
                            {res.savedPercent < 0 && (
                              <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-800 dark:text-amber-300 text-[10.5px] font-semibold tabular-nums">
                                +{Math.abs(res.savedPercent)}% larger
                              </span>
                            )}
                            {res.targetMissed && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-800 dark:text-amber-300 text-[10.5px] font-semibold">
                                <AlertTriangle className="w-3 h-3" />
                                Closest to {res.targetSizeKB}KB
                              </span>
                            )}
                            {res.warning && (
                              <span className="text-[11px] text-amber-700 dark:text-amber-400">
                                {res.warning}
                              </span>
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

                    <div className="flex items-center justify-end gap-2 shrink-0">
                      {(item.status === 'queued' || item.status === 'processing') && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs font-semibold">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          {item.status === 'processing' ? 'Optimizing' : 'Queued'}
                        </span>
                      )}

                      {item.status === 'error' && (
                        <button
                          type="button"
                          onClick={() => retryItem(item.id)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-100 text-xs font-semibold text-zinc-700 cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Retry</span>
                        </button>
                      )}

                      {item.status === 'done' && res && (
                        <>
                          <button
                            type="button"
                            onClick={() => setCompareItem(res)}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-100 text-xs font-semibold text-zinc-700 transition active:scale-[0.98] cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Compare</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => downloadSingleImage(res)}
                            className="btn-studio-primary inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>Download</span>
                          </button>
                        </>
                      )}

                      <button
                        type="button"
                        aria-label={`Remove ${item.file.name}`}
                        onClick={() => removeItem(item.id)}
                        className="p-2 rounded-xl text-zinc-400 hover:text-red-600 hover:bg-red-500/10 transition cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}

              {items.length < 4 && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-7 text-center text-xs font-medium text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-50 transition cursor-pointer"
                >
                  Drop more files anywhere, paste, or click to add
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 px-5 sm:px-7 py-4 border-t border-zinc-200/80 bg-zinc-50/80">
              <button
                type="button"
                disabled={items.length >= MAX_BATCH_FILES}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-100 disabled:opacity-40 text-xs sm:text-[13px] font-semibold text-zinc-700 transition active:scale-[0.98] cursor-pointer tabular-nums"
              >
                <Plus className="w-4 h-4" />
                <span>Add Files ({items.length}/{MAX_BATCH_FILES})</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={clearAll}
                  title="Clear all"
                  aria-label="Clear all"
                  className="p-2.5 rounded-xl border border-zinc-200 bg-white hover:text-red-600 hover:border-red-300 text-zinc-500 transition active:scale-95 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  disabled={completedResults.length === 0 || isAnyProcessing || isZipping}
                  onClick={handleDownloadZip}
                  className="btn-studio-accent inline-flex items-center gap-2 px-6 py-2.5 rounded-xl disabled:opacity-40 disabled:cursor-not-allowed text-xs sm:text-sm font-semibold cursor-pointer"
                >
                  {isZipping ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Zipping...</span>
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

      {compareItem && (
        <SplitCompareModal item={compareItem} onClose={() => setCompareItem(null)} />
      )}
    </div>
  );
}
