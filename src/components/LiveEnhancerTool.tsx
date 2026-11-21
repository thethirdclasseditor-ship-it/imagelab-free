import React, { useState, useRef, useEffect } from 'react';
import {
  Upload,
  Download,
  Sparkles,
  RotateCcw,
  Trash2,
  Eye,
  Lock,
  Loader2,
  AlertCircle,
  Check,
  Sun,
  User,
  FileText,
  Contrast,
} from 'lucide-react';
import {
  processImage,
  formatFileSize,
  validateImageFile,
  type SupportedFormat,
  type ProcessedImageResult,
} from '../engine/imageEngine';
import { downloadSingleImage } from '../engine/zipHelper';

interface EnhanceState {
  brightness: number;
  contrast: number;
  saturate: number;
  sharpness: number;
  warmth: number;
  grayscale: number;
}

const DEFAULT_ENHANCE: EnhanceState = {
  brightness: 100,
  contrast: 100,
  saturate: 100,
  sharpness: 0,
  warmth: 0,
  grayscale: 0,
};

const STUDIO_PRESETS: {
  id: string;
  label: string;
  icon: React.ReactNode;
  values: EnhanceState;
}[] = [
  {
    id: 'auto',
    label: 'Auto Vivid',
    icon: <Sparkles className="w-3.5 h-3.5" />,
    values: { brightness: 106, contrast: 114, saturate: 116, sharpness: 25, warmth: 6, grayscale: 0 },
  },
  {
    id: 'bright',
    label: 'Lift Shadows',
    icon: <Sun className="w-3.5 h-3.5" />,
    values: { brightness: 122, contrast: 108, saturate: 108, sharpness: 15, warmth: 4, grayscale: 0 },
  },
  {
    id: 'portrait',
    label: 'Portrait',
    icon: <User className="w-3.5 h-3.5" />,
    values: { brightness: 105, contrast: 104, saturate: 106, sharpness: 10, warmth: 12, grayscale: 0 },
  },
  {
    id: 'doc',
    label: 'Document',
    icon: <FileText className="w-3.5 h-3.5" />,
    values: { brightness: 112, contrast: 132, saturate: 85, sharpness: 45, warmth: 0, grayscale: 0 },
  },
  {
    id: 'bw',
    label: 'Mono',
    icon: <Contrast className="w-3.5 h-3.5" />,
    values: { brightness: 104, contrast: 120, saturate: 100, sharpness: 20, warmth: 0, grayscale: 100 },
  },
];

export default function LiveEnhancerTool() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [adj, setAdj] = useState<EnhanceState>(DEFAULT_ENHANCE);
  const [activePreset, setActivePreset] = useState<string>('auto');
  const [holdingOriginal, setHoldingOriginal] = useState(false);

  const [format, setFormat] = useState<SupportedFormat>('image/jpeg');
  const [quality, setQuality] = useState<number>(88);
  const [isExporting, setIsExporting] = useState(false);
  const [exportRes, setExportRes] = useState<ProcessedImageResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isGlobalDragging, setIsGlobalDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);
  const selectHandlerRef = useRef<(files: FileList | null) => void>(() => {});

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      if (exportRes) {
        URL.revokeObjectURL(exportRes.url);
        URL.revokeObjectURL(exportRes.originalUrl);
      }
    };
  }, [previewUrl, exportRes]);

  const handleFileSelect = (incoming: FileList | null) => {
    if (!incoming || incoming.length === 0) return;
    const picked = incoming[0];
    const err = validateImageFile(picked);
    if (err) {
      setErrorMsg(err);
      return;
    }

    setErrorMsg(null);
    setExportRes(null);
    setFile(picked);
    setPreviewUrl(URL.createObjectURL(picked));
    setAdj(STUDIO_PRESETS[0].values);
    setActivePreset('auto');
    if (fileInputRef.current) fileInputRef.current.value = '';
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

  const resetAll = () => {
    setFile(null);
    setPreviewUrl(null);
    setExportRes(null);
    setErrorMsg(null);
    setAdj(DEFAULT_ENHANCE);
  };

  const liveCssFilter = holdingOriginal
    ? 'none'
    : `brightness(${adj.brightness}%) contrast(${adj.contrast}%) saturate(${adj.saturate}%) grayscale(${adj.grayscale}%) sepia(${adj.warmth > 0 ? Math.round(adj.warmth * 0.45) : 0}%) hue-rotate(${adj.warmth < 0 ? Math.round(adj.warmth * 0.25) : 0}deg)`;

  const handleExport = async () => {
    if (!file) return;
    setIsExporting(true);
    setErrorMsg(null);

    try {
      const res = await processImage(file, {
        format,
        quality: quality / 100,
        filters: adj,
      });
      setExportRes(res);
      downloadSingleImage(res);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Export failed.');
    } finally {
      setIsExporting(false);
    }
  };

  const updateSlider = (key: keyof EnhanceState, value: number) => {
    setExportRes(null);
    setActivePreset('custom');
    setAdj((prev) => ({ ...prev, [key]: value }));
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
            <div className="w-16 h-16 rounded-2xl bg-blue-600 text-white flex items-center justify-center mx-auto mb-5">
              <Upload className="w-7 h-7" />
            </div>
            <p className="text-xl font-bold text-zinc-950 dark:text-white">Release to open photo</p>
          </div>
        </div>
      )}

      <div className="studio-card rounded-3xl overflow-hidden">
        {!previewUrl ? (
          <div className="p-6 sm:p-10">
            <div
              role="button"
              tabIndex={0}
              aria-label="Select photo to enhance"
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              onClick={() => fileInputRef.current?.click()}
              className="group min-h-[320px] flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 hover:border-blue-500/70 bg-zinc-50/60 hover:bg-blue-50/20 p-8 text-center cursor-pointer transition-all"
            >
              <div className="w-16 h-16 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 shadow-sm flex items-center justify-center mb-6 group-hover:-translate-y-1 transition-transform">
                <Sparkles className="w-7 h-7 text-zinc-900 dark:text-white group-hover:text-blue-600 transition-colors" />
              </div>
              <span className="btn-studio-accent inline-flex items-center gap-2 px-7 py-3.5 rounded-2xl font-semibold text-sm sm:text-[15px]">
                Select Photo
              </span>
              <p className="text-xs sm:text-sm text-zinc-500 mt-4">
                Drop anywhere or press{' '}
                <kbd className="px-1.5 py-0.5 text-[11px] font-semibold bg-white border border-zinc-200 rounded-md text-zinc-700">
                  Ctrl+V
                </kbd>
              </p>
            </div>
          </div>
        ) : (
          <div className="grid lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-zinc-200/80">
            {/* Live Preview Canvas */}
            <div className="lg:col-span-7 bg-zinc-950 p-5 sm:p-6 flex flex-col justify-between gap-4">
              <div className="flex items-center justify-between text-xs text-zinc-400">
                <span className="truncate font-medium max-w-[220px]">{file?.name}</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onPointerDown={() => setHoldingOriginal(true)}
                    onPointerUp={() => setHoldingOriginal(false)}
                    onPointerLeave={() => setHoldingOriginal(false)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold select-none transition cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>{holdingOriginal ? 'Original' : 'Hold Original'}</span>
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

              <div className="flex-1 flex items-center justify-center min-h-[280px] max-h-[54vh] overflow-hidden rounded-2xl bg-black/40 p-2">
                <img
                  src={previewUrl}
                  alt="Live enhanced preview"
                  style={{ filter: liveCssFilter }}
                  className="max-h-[50vh] max-w-full object-contain rounded-lg transition-[filter] duration-75"
                />
              </div>
            </div>

            {/* Studio Controls */}
            <div className="lg:col-span-5 p-5 sm:p-6 flex flex-col justify-between gap-5 bg-white">
              <div className="space-y-5">
                <div>
                  <div className="flex items-center justify-between mb-2.5">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                      Presets
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setAdj(DEFAULT_ENHANCE);
                        setActivePreset('none');
                        setExportRes(null);
                      }}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-500 hover:text-zinc-900 cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" /> Reset
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {STUDIO_PRESETS.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setAdj(p.values);
                          setActivePreset(p.id);
                          setExportRes(null);
                        }}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                          activePreset === p.id
                            ? 'bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 border-transparent'
                            : 'bg-zinc-50 text-zinc-700 border-zinc-200 hover:bg-zinc-100'
                        }`}
                      >
                        {p.icon}
                        <span>{p.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  {(
                    [
                      { key: 'brightness', label: 'Brightness', min: 50, max: 150, suffix: '%' },
                      { key: 'contrast', label: 'Contrast', min: 50, max: 160, suffix: '%' },
                      { key: 'saturate', label: 'Saturation', min: 0, max: 200, suffix: '%' },
                      { key: 'sharpness', label: 'Sharpness', min: 0, max: 100, suffix: '%' },
                      { key: 'warmth', label: 'Warmth', min: -50, max: 50, suffix: '' },
                      { key: 'grayscale', label: 'Monochrome', min: 0, max: 100, suffix: '%' },
                    ] as const
                  ).map((s) => (
                    <div key={s.key}>
                      <div className="flex justify-between text-xs text-zinc-600 mb-1 tabular-nums">
                        <label htmlFor={`live-${s.key}`}>{s.label}</label>
                        <span className="font-semibold text-zinc-900">
                          {s.key === 'warmth' && adj[s.key] > 0 ? `+${adj[s.key]}` : adj[s.key]}
                          {s.suffix}
                        </span>
                      </div>
                      <input
                        id={`live-${s.key}`}
                        type="range"
                        min={s.min}
                        max={s.max}
                        value={adj[s.key]}
                        onChange={(e) => updateSlider(s.key, Number(e.target.value))}
                        className="w-full"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-3 border-t border-zinc-200/80 pt-4">
                <div className="flex items-center justify-between gap-2">
                  <select
                    aria-label="Output format"
                    value={format}
                    onChange={(e) => setFormat(e.target.value as SupportedFormat)}
                    className="bg-zinc-50 border border-zinc-300 rounded-xl px-3 py-1.5 text-xs font-semibold"
                  >
                    <option value="image/jpeg">JPG · MozJPEG</option>
                    <option value="image/webp">WEBP · LibWebP</option>
                    <option value="image/png">PNG · UPNG</option>
                  </select>
                  <div className="flex items-center gap-2 text-xs tabular-nums">
                    <span className="text-zinc-500 font-medium">Q{quality}</span>
                    <input
                      type="range"
                      min={40}
                      max={100}
                      value={quality}
                      onChange={(e) => setQuality(Number(e.target.value))}
                      className="w-20"
                    />
                  </div>
                </div>

                {exportRes && (
                  <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 tabular-nums">
                    <Check className="w-3.5 h-3.5 shrink-0" />
                    <span>
                      Saved · {formatFileSize(exportRes.newSize)} ({exportRes.encoderUsed})
                    </span>
                  </p>
                )}

                {errorMsg && (
                  <p className="text-xs text-red-600 flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{errorMsg}</span>
                  </p>
                )}

                <button
                  type="button"
                  disabled={isExporting}
                  onClick={handleExport}
                  className="btn-studio-accent w-full py-3 px-5 rounded-xl disabled:opacity-40 text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isExporting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Exporting...</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      <span>Download Photo</span>
                    </>
                  )}
                </button>
              </div>
            </div>
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
