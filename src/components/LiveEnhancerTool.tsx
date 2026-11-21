import React, { useState, useRef, useEffect } from 'react';
import {
  Upload,
  Download,
  Sparkles,
  RefreshCw,
  Trash2,
  Eye,
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

const STUDIO_PRESETS: { id: string; label: string; values: EnhanceState }[] = [
  {
    id: 'auto',
    label: '✨ Auto Vivid',
    values: { brightness: 106, contrast: 114, saturate: 116, sharpness: 25, warmth: 6, grayscale: 0 },
  },
  {
    id: 'bright',
    label: '☀️ Fix Dark Photo',
    values: { brightness: 122, contrast: 108, saturate: 108, sharpness: 15, warmth: 4, grayscale: 0 },
  },
  {
    id: 'portrait',
    label: '😊 Portrait Soft',
    values: { brightness: 105, contrast: 104, saturate: 106, sharpness: 10, warmth: 12, grayscale: 0 },
  },
  {
    id: 'doc',
    label: '📄 Document Crisp',
    values: { brightness: 112, contrast: 132, saturate: 85, sharpness: 45, warmth: 0, grayscale: 0 },
  },
  {
    id: 'bw',
    label: '🎞️ Classic B&W',
    values: { brightness: 104, contrast: 120, saturate: 100, sharpness: 20, warmth: 0, grayscale: 100 },
  },
];

export default function LiveEnhancerTool() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [adj, setAdj] = useState<EnhanceState>(DEFAULT_ENHANCE);
  const [holdingOriginal, setHoldingOriginal] = useState(false);

  const [format, setFormat] = useState<SupportedFormat>('image/jpeg');
  const [quality, setQuality] = useState<number>(88);
  const [isExporting, setIsExporting] = useState(false);
  const [exportRes, setExportRes] = useState<ProcessedImageResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

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
    setAdj(STUDIO_PRESETS[0].values); // Start with subtle Auto Vivid preview
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const resetAll = () => {
    setFile(null);
    setPreviewUrl(null);
    setExportRes(null);
    setErrorMsg(null);
    setAdj(DEFAULT_ENHANCE);
  };

  // Real-time 60fps CSS preview approximation (pixel-exact math runs on final export)
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
    setAdj((prev) => ({ ...prev, [key]: value }));
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
            aria-label="Upload photo to enhance"
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
              handleFileSelect(e.dataTransfer.files);
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl py-12 px-4 text-center cursor-pointer transition-all ${
              isDragging
                ? 'border-blue-500 bg-blue-50/60'
                : 'border-slate-300 hover:border-blue-500 hover:bg-slate-50'
            }`}
          >
            <div className="w-14 h-14 rounded-2xl bg-blue-600 text-white flex items-center justify-center mx-auto mb-4 shadow-md">
              <Sparkles className="w-7 h-7" />
            </div>
            <p className="font-bold text-slate-900 text-lg">Select Photo for Live Studio Enhancer</p>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Real-time lighting, color, warmth & clarity preview · Zero uploads
            </p>
          </div>
        </div>
      ) : (
        <div className="grid lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
          {/* Left: Live Image Stage */}
          <div className="lg:col-span-7 bg-slate-900 p-4 sm:p-6 flex flex-col justify-between gap-4">
            <div className="flex items-center justify-between text-xs text-slate-300">
              <span className="truncate font-semibold max-w-[220px]">{file?.name}</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onPointerDown={() => setHoldingOriginal(true)}
                  onPointerUp={() => setHoldingOriginal(false)}
                  onPointerLeave={() => setHoldingOriginal(false)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white font-semibold select-none cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>{holdingOriginal ? 'Showing Original' : 'Hold for Original'}</span>
                </button>
                <button
                  type="button"
                  onClick={resetAll}
                  title="Change photo"
                  className="p-1.5 rounded-lg bg-white/10 hover:bg-red-500/80 text-white cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 flex items-center justify-center min-h-[260px] max-h-[52vh] overflow-hidden rounded-xl bg-slate-950/60 p-2">
              <img
                src={previewUrl}
                alt="Live enhanced preview"
                style={{ filter: liveCssFilter }}
                className="max-h-[48vh] max-w-full object-contain rounded-lg transition-[filter] duration-75"
              />
            </div>

            <p className="text-[11px] text-slate-400 text-center">
              Live Preview · Sharpness & pixel-exact color math apply at full resolution on download
            </p>
          </div>

          {/* Right: Studio Controls */}
          <div className="lg:col-span-5 p-4 sm:p-5 flex flex-col justify-between gap-5 bg-white">
            <div className="space-y-4">
              {/* 1-Click Presets */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
                    One-Click Presets
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setAdj(DEFAULT_ENHANCE);
                      setExportRes(null);
                    }}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-blue-600 cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" /> Reset
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {STUDIO_PRESETS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setAdj(p.values);
                        setExportRes(null);
                      }}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 bg-slate-50 hover:border-blue-500 hover:text-blue-600 text-slate-700 cursor-pointer transition"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sliders */}
              <div className="space-y-3 pt-1">
                {(
                  [
                    { key: 'brightness', label: 'Brightness', min: 50, max: 150, suffix: '%' },
                    { key: 'contrast', label: 'Contrast', min: 50, max: 160, suffix: '%' },
                    { key: 'saturate', label: 'Saturation', min: 0, max: 200, suffix: '%' },
                    { key: 'sharpness', label: 'Sharpness (Clarity)', min: 0, max: 100, suffix: '%' },
                    { key: 'warmth', label: 'Warmth', min: -50, max: 50, suffix: '' },
                    { key: 'grayscale', label: 'Black & White', min: 0, max: 100, suffix: '%' },
                  ] as const
                ).map((s) => (
                  <div key={s.key}>
                    <div className="flex justify-between text-xs font-medium text-slate-700 mb-1">
                      <label htmlFor={`live-${s.key}`}>{s.label}</label>
                      <span className="font-bold text-blue-600">
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
                      className="w-full accent-blue-600"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Export Footer */}
            <div className="space-y-3 border-t border-slate-200 pt-4">
              <div className="flex items-center justify-between gap-2">
                <select
                  aria-label="Output format"
                  value={format}
                  onChange={(e) => setFormat(e.target.value as SupportedFormat)}
                  className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-2 text-xs font-semibold"
                >
                  <option value="image/jpeg">JPG (MozJPEG)</option>
                  <option value="image/webp">WEBP (Smallest)</option>
                  <option value="image/png">PNG (UPNG)</option>
                </select>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-600 font-medium">Quality {quality}%</span>
                  <input
                    type="range"
                    min={40}
                    max={100}
                    value={quality}
                    onChange={(e) => setQuality(Number(e.target.value))}
                    className="w-20 accent-blue-600"
                  />
                </div>
              </div>

              {exportRes && (
                <p className="text-xs font-semibold text-emerald-600 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>
                    Downloaded ({formatFileSize(exportRes.newSize)} · {exportRes.encoderUsed})
                  </span>
                </p>
              )}

              {errorMsg && (
                <p className="text-xs text-red-600 flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </p>
              )}

              <button
                type="button"
                disabled={isExporting}
                onClick={handleExport}
                className="w-full py-3 px-5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 text-white text-sm font-semibold shadow-sm flex items-center justify-center gap-2 cursor-pointer"
              >
                {isExporting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Rendering Full-Resolution Photo...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    <span>Download Enhanced Photo</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="px-4 py-3 border-t border-slate-200 text-center">
        <p className="inline-flex items-center gap-1.5 text-xs text-slate-500">
          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>100% Private Live Studio · Zero uploads, full-resolution export.</span>
        </p>
      </div>
    </div>
  );
}
