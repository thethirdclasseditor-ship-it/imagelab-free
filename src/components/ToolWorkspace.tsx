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
  const [isDragging, setIsDragging] = useState(false);
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
  const trackedUrlsRef = useRef<Set<string>>(new Set());

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
    targetSizeKB?: string;
    width?: string;
    height?: string;
    fitMode?: FitMode;
  }): ProcessOptions => {
    const activeMode = overrides?.mode ?? mode;
    const activeFormat = overrides?.format ?? format;
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
      quality: quality / 100,
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
        prev.map((it) => (it.id === target.id ? { ...it, status: 'processing', error: undefined } : it))
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
    .filter((it): it is WorkspaceItem & { result: ProcessedImageResult } => it.status === 'done' && Boolean(it.result))
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
    <div className="space-y-4">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.heic,.heif,.avif"
        multiple
        className="hidden"
        onChange={(e) => handleAddFiles(e.target.files)}
      />

      {showModeTabs && (
        <div className="grid grid-cols-4 sm:inline-flex w-full sm:w-auto mx-auto bg-slate-200/70 p-1 rounded-2xl gap-1">
          {MODE_TABS.map((tab) => {
            const active = mode === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleModeSwitch(tab.id)}
                className={`flex items-center justify-center gap-1.5 py-2 px-3 sm:px-5 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                  active
                    ? 'bg-white text-blue-600 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-5 py-3 border-b border-slate-200 bg-slate-50/80">
          <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm">
            {mode !== 'enhancer' ? (
              <>
                <span className="font-semibold text-slate-600">Output:</span>
                <select
                  aria-label="Output image format"
                  value={format}
                  onChange={(e) => handleQuickFormatChange(e.target.value as SupportedFormat)}
                  className="bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-bold text-slate-900 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                >
                  <option value="image/jpeg">JPG (MozJPEG)</option>
                  <option value="image/webp">WEBP (Smallest)</option>
                  <option value="image/png">PNG (UPNG)</option>
                </select>

                {hasActiveTargetKB && (
                  <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 text-xs font-semibold">
                    Max {targetSizeKB} KB
                  </span>
                )}
                {mode === 'resizer' && (width || height) && (
                  <span className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-semibold">
                    {width || 'Auto'}×{height || 'Auto'} px
                  </span>
                )}
                {!hasActiveTargetKB && (mode === 'converter' || mode === 'compressor') && (
                  <span className="hidden sm:inline-block px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 text-xs font-medium">
                    Quality {quality}%
                  </span>
                )}
              </>
            ) : (
              <span className="font-semibold text-slate-700 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-blue-600" />
                Live Studio Enhancer
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowSettings((s) => !s)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition cursor-pointer ${
              showSettings
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-700 border-slate-300 hover:border-blue-500'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>{showSettings ? 'Hide Options' : 'Options'}</span>
          </button>
        </div>

        {showSettings && (
          <div className="px-4 sm:px-5 py-4 bg-slate-50 border-b border-slate-200 space-y-4">
            {(mode === 'converter' || mode === 'compressor') && !hasActiveTargetKB && (
              <div>
                <div className="flex justify-between text-xs font-semibold text-slate-700 mb-1.5">
                  <label htmlFor="pro-quality-slider">
                    Compression Quality {format === 'image/png' ? '(100% = Lossless, <95% = Smart TinyPNG)' : '(82–88% Recommended)'}
                  </label>
                  <span className="text-blue-600 font-bold">{quality}%</span>
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
                  className="block text-xs font-semibold text-slate-700 mb-2"
                >
                  Target Max File Size (KB) — Auto-optimizes quality & resolution
                </label>
                <div className="flex flex-wrap items-center gap-1.5 mb-2">
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
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold border cursor-pointer ${
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
                      className="px-2 py-1 text-xs font-medium text-slate-500 hover:text-red-600 cursor-pointer"
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
                  className="w-full sm:w-64 bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            )}

            {mode === 'resizer' && (
              <div className="space-y-3">
                <div>
                  <span className="block text-xs font-semibold text-slate-700 mb-1.5">
                    One-Click Presets
                  </span>
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
                        className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-200 text-slate-700 hover:border-blue-500 hover:text-blue-600 cursor-pointer"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div>
                    <label htmlFor="pro-w" className="block text-xs font-medium text-slate-600 mb-1">
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
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor="pro-h" className="block text-xs font-medium text-slate-600 mb-1">
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
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-sm"
                    />
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <label htmlFor="pro-fit" className="block text-xs font-medium text-slate-600 mb-1">
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
                      className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm"
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
                  <span className="text-xs font-semibold text-slate-700">Studio Adjustments</span>
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
                      className="px-2.5 py-1 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 cursor-pointer"
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
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-300 text-slate-700 text-xs font-medium hover:bg-slate-100 cursor-pointer"
                    >
                      <RefreshCw className="w-3 h-3" /> Reset
                    </button>
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
                  <div>
                    <div className="flex justify-between text-xs text-slate-600 mb-1">
                      <label htmlFor="enh-b">Brightness</label>
                      <span className="font-semibold">{brightness}%</span>
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
                      <span className="font-semibold">{contrast}%</span>
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
                      <span className="font-semibold">{saturate}%</span>
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
                      <span className="font-semibold">{sharpness}%</span>
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
                      <span className="font-semibold">{warmth > 0 ? `+${warmth}` : warmth}</span>
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
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-semibold shadow-xs cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Apply New Settings to {items.length} {items.length === 1 ? 'Image' : 'Images'}
                </button>
              </div>
            )}
          </div>
        )}

        {items.length === 0 ? (
          <div className="p-5 sm:p-8">
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
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                handleAddFiles(e.dataTransfer.files);
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl py-10 sm:py-14 px-4 text-center cursor-pointer transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                isDragging
                  ? 'border-blue-500 bg-blue-50/70 scale-[0.995]'
                  : 'border-slate-300 hover:border-blue-500 hover:bg-blue-50/20'
              }`}
            >
              <div className="w-14 h-14 rounded-2xl bg-blue-600 text-white shadow-md shadow-blue-600/20 flex items-center justify-center mx-auto mb-4">
                <Upload className="w-7 h-7" />
              </div>
              <p className="font-bold text-slate-900 text-lg">
                Select Images or Drop Here
              </p>
              <p className="text-xs sm:text-sm text-slate-500 mt-1.5">
                Instant local processing · Up to {MAX_BATCH_FILES} files at once (Max 25MB each)
              </p>
              <div className="flex flex-wrap items-center justify-center gap-1.5 mt-4">
                {['JPG', 'PNG', 'WEBP', 'AVIF', 'HEIC'].map((fmt) => (
                  <span
                    key={fmt}
                    className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[11px] font-semibold"
                  >
                    {fmt}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              handleAddFiles(e.dataTransfer.files);
            }}
            className={`transition-colors ${isDragging ? 'bg-blue-50/40' : 'bg-white'}`}
          >
            <div className="divide-y divide-slate-100 max-h-[520px] overflow-y-auto">
              {items.map((item) => {
                const res = item.result;
                return (
                  <div
                    key={item.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 sm:px-5 py-3.5 hover:bg-slate-50/70 transition"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-12 h-12 rounded-xl overflow-hidden border border-slate-200 bg-slate-100 shrink-0 flex items-center justify-center">
                        <img
                          src={res ? res.url : item.previewUrl}
                          alt={item.file.name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-900 truncate">
                          {item.file.name}
                        </p>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 mt-0.5">
                          <span>
                            {item.sourceFormat} · {formatFileSize(item.file.size)}
                          </span>

                          {item.status === 'done' && res && (
                            <>
                              <ArrowRight className="w-3 h-3 text-slate-400" />
                              <span className="font-bold text-slate-900">
                                {res.outputFormat} · {formatFileSize(res.newSize)}
                              </span>
                              <span className="hidden md:inline text-slate-400">
                                ({res.width}×{res.height})
                              </span>
                            </>
                          )}
                        </div>

                        {item.status === 'done' && res && (
                          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-semibold">
                              {res.encoderUsed}
                            </span>
                            {res.savedPercent > 0 && (
                              <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 text-[10px] font-bold">
                                -{res.savedPercent}% smaller
                              </span>
                            )}
                            {res.targetMissed && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-semibold">
                                <AlertTriangle className="w-3 h-3" />
                                Closest to {res.targetSizeKB}KB
                              </span>
                            )}
                            {res.warning && (
                              <span className="text-[10px] text-amber-700">{res.warning}</span>
                            )}
                          </div>
                        )}

                        {item.status === 'error' && (
                          <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                            <span>{item.error}</span>
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 shrink-0">
                      {(item.status === 'queued' || item.status === 'processing') && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 text-xs font-semibold">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          {item.status === 'processing' ? 'Optimizing...' : 'Queued'}
                        </span>
                      )}

                      {item.status === 'done' && res && (
                        <>
                          <CheckCircle2 className="w-5 h-5 text-emerald-500 hidden sm:block shrink-0" />
                          <button
                            type="button"
                            onClick={() => setCompareItem(res)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 cursor-pointer"
                            title="Split-Screen Compare"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Compare</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => downloadSingleImage(res)}
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-2xs cursor-pointer"
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
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-5 py-3.5 border-t border-slate-200 bg-slate-50/90">
              <button
                type="button"
                disabled={items.length >= MAX_BATCH_FILES}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:border-blue-500 hover:text-blue-600 disabled:opacity-50 text-xs sm:text-sm font-semibold text-slate-700 cursor-pointer transition"
              >
                <Plus className="w-4 h-4" />
                <span>Add More Files ({items.length}/{MAX_BATCH_FILES})</span>
              </button>

              <div className="flex items-center gap-2">
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
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-xs sm:text-sm font-semibold shadow-xs transition cursor-pointer"
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

        {errorMsg && (
          <div className="mx-4 sm:mx-5 mb-4 flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs sm:text-sm">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
      </div>

      <p className="flex items-center justify-center gap-1.5 text-xs text-slate-500">
        <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
        <span>
          100% Private · MozJPEG, LibWebP & UPNG run locally inside your browser with zero uploads.
        </span>
      </p>

      {compareItem && (
        <SplitCompareModal item={compareItem} onClose={() => setCompareItem(null)} />
      )}
    </div>
  );
}
