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
  Loader2,
  Eye,
  RefreshCw,
} from 'lucide-react';
import {
  processImage,
  formatFileSize,
  validateImageFile,
  type SupportedFormat,
  type ProcessedImageResult,
} from '../engine/imageEngine';
import { downloadSingleImage, downloadBatchAsZip } from '../engine/zipHelper';
import { RESIZE_PRESETS, TARGET_KB_PRESETS } from '../data/presets';

export type ToolMode = 'converter' | 'compressor' | 'resizer' | 'enhancer';

export interface ToolDefaults {
  format?: SupportedFormat;
  quality?: number;
  targetSizeKB?: number;
  width?: number;
  height?: number;
  fitMode?: 'contain' | 'cover' | 'stretch';
  brightness?: number;
  contrast?: number;
  saturate?: number;
}

interface ToolWorkspaceProps {
  initialMode?: ToolMode;
  showModeTabs?: boolean;
  defaults?: ToolDefaults;
}

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
  const [files, setFiles] = useState<File[]>([]);
  const [results, setResults] = useState<ProcessedImageResult[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [compareItem, setCompareItem] = useState<ProcessedImageResult | null>(null);
  const [showOriginalInModal, setShowOriginalInModal] = useState(false);

  // Tool Settings State
  const [format, setFormat] = useState<SupportedFormat>(defaults.format ?? 'image/webp');
  const [quality, setQuality] = useState<number>(Math.round((defaults.quality ?? 0.85) * 100));
  const [targetSizeKB, setTargetSizeKB] = useState<string>(
    defaults.targetSizeKB ? String(defaults.targetSizeKB) : ''
  );
  const [width, setWidth] = useState<string>(defaults.width ? String(defaults.width) : '');
  const [height, setHeight] = useState<string>(defaults.height ? String(defaults.height) : '');
  const [fitMode, setFitMode] = useState<'contain' | 'cover' | 'stretch'>(
    defaults.fitMode ?? 'cover'
  );
  const [brightness, setBrightness] = useState<number>(defaults.brightness ?? 100);
  const [contrast, setContrast] = useState<number>(defaults.contrast ?? 100);
  const [saturate, setSaturate] = useState<number>(defaults.saturate ?? 100);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cleanup Object URLs on unmount to protect phone RAM
  useEffect(() => {
    return () => {
      results.forEach((r) => {
        URL.revokeObjectURL(r.url);
        URL.revokeObjectURL(r.originalUrl);
      });
    };
  }, [results]);

  const handleModeSwitch = (newMode: ToolMode) => {
    setMode(newMode);
    setErrorMsg(null);
    if (newMode === 'compressor' && format === 'image/png') {
      setFormat('image/jpeg');
    }
  };

  const addFiles = (incoming: FileList | null) => {
    if (!incoming || incoming.length === 0) return;
    setErrorMsg(null);

    const validFiles: File[] = [];
    const errors: string[] = [];

    Array.from(incoming).forEach((file) => {
      const err = validateImageFile(file);
      if (err) errors.push(err);
      else validFiles.push(file);
    });

    if (errors.length > 0) setErrorMsg(errors[0]);
    if (validFiles.length > 0) {
      setFiles((prev) => [...prev, ...validFiles].slice(0, 20)); // Max 20 files batch for mobile safety
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    addFiles(e.dataTransfer.files);
  };

  const clearAll = () => {
    results.forEach((r) => {
      URL.revokeObjectURL(r.url);
      URL.revokeObjectURL(r.originalUrl);
    });
    setFiles([]);
    setResults([]);
    setErrorMsg(null);
    setCompareItem(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleProcess = async () => {
    if (files.length === 0) return;
    setIsProcessing(true);
    setErrorMsg(null);

    // Clear previous URLs
    results.forEach((r) => {
      URL.revokeObjectURL(r.url);
      URL.revokeObjectURL(r.originalUrl);
    });
    setResults([]);

    const parsedTargetKB = Number(targetSizeKB) > 0 ? Number(targetSizeKB) : undefined;
    const parsedW = Number(width) > 0 ? Number(width) : undefined;
    const parsedH = Number(height) > 0 ? Number(height) : undefined;

    const processedList: ProcessedImageResult[] = [];

    try {
      for (let i = 0; i < files.length; i++) {
        setProgressText(`Processing ${i + 1} of ${files.length}...`);
        const file = files[i];

        const res = await processImage(file, {
          format:
            mode === 'converter' || mode === 'compressor' || mode === 'resizer'
              ? format
              : undefined,
          quality: quality / 100,
          targetSizeKB: mode === 'compressor' || mode === 'resizer' ? parsedTargetKB : undefined,
          width: mode === 'resizer' ? parsedW : undefined,
          height: mode === 'resizer' ? parsedH : undefined,
          fitMode: mode === 'resizer' ? fitMode : undefined,
          filters:
            mode === 'enhancer'
              ? { brightness, contrast, saturate }
              : undefined,
        });

        processedList.push(res);
      }
      setResults(processedList);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'প্রসেসিং করতে সমস্যা হয়েছে।');
    } finally {
      setIsProcessing(false);
      setProgressText('');
    }
  };

  const applyAutoEnhance = () => {
    setBrightness(106);
    setContrast(114);
    setSaturate(116);
  };

  const resetEnhance = () => {
    setBrightness(100);
    setContrast(100);
    setSaturate(100);
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      {/* Mode Switcher Tabs (Visible on Homepage) */}
      {showModeTabs && (
        <div className="grid grid-cols-4 border-b border-slate-200 bg-slate-50/70 p-1.5 gap-1">
          {MODE_TABS.map((tab) => {
            const active = mode === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleModeSwitch(tab.id)}
                className={`flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                  active
                    ? 'bg-white text-blue-600 shadow-sm border border-slate-200'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="p-4 sm:p-6 space-y-6">
        {/* Upload Dropzone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-6 sm:p-10 text-center cursor-pointer transition-all ${
            isDragging
              ? 'border-blue-500 bg-blue-50/60'
              : 'border-slate-300 hover:border-blue-400 hover:bg-slate-50'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => addFiles(e.target.files)}
          />
          <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-3">
            <Upload className="w-6 h-6" />
          </div>
          <p className="font-semibold text-slate-800 text-base">
            Tap to Select Images or Drop Here
          </p>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            JPG, PNG, WEBP · Up to 20 images at once (Max 25MB each)
          </p>
        </div>

        {/* Selected Files Bar */}
        {files.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm">
            <span className="font-medium text-slate-700">
              {files.length} {files.length === 1 ? 'image' : 'images'} ready
            </span>
            <button
              type="button"
              onClick={clearAll}
              className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-700 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear All
            </button>
          </div>
        )}

        {/* Tool-Specific Controls */}
        <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-4 space-y-4">
          {/* Format Selector (Convert / Compress / Resize) */}
          {mode !== 'enhancer' && (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                Output Format
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { value: 'image/jpeg', label: 'JPG' },
                    { value: 'image/webp', label: 'WEBP (Smallest)' },
                    { value: 'image/png', label: 'PNG' },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setFormat(item.value)}
                    className={`py-2 px-3 rounded-lg text-xs sm:text-sm font-semibold border transition cursor-pointer ${
                      format === item.value
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-blue-400'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Quality Slider (Converter & Compressor) */}
          {(mode === 'converter' || mode === 'compressor') && format !== 'image/png' && (
            <div>
              <div className="flex justify-between text-xs font-semibold text-slate-600 mb-1">
                <span>Quality</span>
                <span>{quality}%</span>
              </div>
              <input
                type="range"
                min={10}
                max={100}
                value={quality}
                onChange={(e) => setQuality(Number(e.target.value))}
                className="w-full accent-blue-600"
              />
            </div>
          )}

          {/* Target File Size KB (Compressor & Resizer) */}
          {(mode === 'compressor' || mode === 'resizer') && (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                Target Max Size in KB (Optional — Works with JPG/WEBP)
              </label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {TARGET_KB_PRESETS.map((kb) => (
                  <button
                    key={kb}
                    type="button"
                    onClick={() => {
                      setTargetSizeKB(String(kb));
                      if (format === 'image/png') setFormat('image/jpeg');
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border cursor-pointer ${
                      targetSizeKB === String(kb)
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-blue-400'
                    }`}
                  >
                    {kb} KB
                  </button>
                ))}
                {targetSizeKB && (
                  <button
                    type="button"
                    onClick={() => setTargetSizeKB('')}
                    className="px-2.5 py-1 rounded-lg text-xs font-medium text-slate-500 hover:text-slate-800 cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>
              <input
                type="number"
                min={5}
                placeholder="e.g. 50 (leave empty for normal quality)"
                value={targetSizeKB}
                onChange={(e) => setTargetSizeKB(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          {/* Resizer Controls */}
          {mode === 'resizer' && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                  Quick Presets
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {RESIZE_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        setWidth(String(preset.width));
                        setHeight(String(preset.height));
                        setFitMode('cover');
                        if (preset.targetSizeKB) {
                          setTargetSizeKB(String(preset.targetSizeKB));
                          setFormat('image/jpeg');
                        }
                      }}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-white border border-slate-200 text-slate-700 hover:border-blue-500 hover:text-blue-600 cursor-pointer"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Width (px)
                  </label>
                  <input
                    type="number"
                    min={10}
                    placeholder="Auto"
                    value={width}
                    onChange={(e) => setWidth(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Height (px)
                  </label>
                  <input
                    type="number"
                    min={10}
                    placeholder="Auto"
                    value={height}
                    onChange={(e) => setHeight(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Fit Mode (When both Width & Height are set)
                </label>
                <select
                  value={fitMode}
                  onChange={(e) => setFitMode(e.target.value as 'contain' | 'cover' | 'stretch')}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="cover">Smart Center-Crop (No Stretching — Best for Photos)</option>
                  <option value="stretch">Exact Fit (Stretch to dimensions)</option>
                </select>
              </div>
            </div>
          )}

          {/* Enhancer Sliders */}
          {mode === 'enhancer' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Manual Adjustments
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={applyAutoEnhance}
                    className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 text-xs font-semibold hover:bg-blue-100 cursor-pointer"
                  >
                    ✨ Auto Enhance
                  </button>
                  <button
                    type="button"
                    onClick={resetEnhance}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-600 text-xs font-medium hover:bg-slate-100 cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" /> Reset
                  </button>
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs font-medium text-slate-600 mb-1">
                  <span>Brightness</span>
                  <span>{brightness}%</span>
                </div>
                <input
                  type="range"
                  min={50}
                  max={150}
                  value={brightness}
                  onChange={(e) => setBrightness(Number(e.target.value))}
                  className="w-full accent-blue-600"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs font-medium text-slate-600 mb-1">
                  <span>Contrast</span>
                  <span>{contrast}%</span>
                </div>
                <input
                  type="range"
                  min={50}
                  max={150}
                  value={contrast}
                  onChange={(e) => setContrast(Number(e.target.value))}
                  className="w-full accent-blue-600"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs font-medium text-slate-600 mb-1">
                  <span>Saturation (Color)</span>
                  <span>{saturate}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={200}
                  value={saturate}
                  onChange={(e) => setSaturate(Number(e.target.value))}
                  className="w-full accent-blue-600"
                />
              </div>
            </div>
          )}
        </div>

        {/* Error Box */}
        {errorMsg && (
          <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Primary Action Button */}
        <button
          type="button"
          disabled={files.length === 0 || isProcessing}
          onClick={handleProcess}
          className="w-full py-3.5 px-6 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-semibold text-base shadow-sm transition flex items-center justify-center gap-2 cursor-pointer"
        >
          {isProcessing ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>{progressText || 'Processing...'}</span>
            </>
          ) : (
            <span>
              {mode === 'converter' && 'Convert Images Now'}
              {mode === 'compressor' && 'Compress Images Now'}
              {mode === 'resizer' && 'Resize Images Now'}
              {mode === 'enhancer' && 'Apply Enhancement'}
            </span>
          )}
        </button>

        {/* Privacy Trust Note */}
        <p className="flex items-center justify-center gap-1.5 text-xs text-slate-500">
          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>100% Private: Processed locally inside your device. Zero server uploads.</span>
        </p>

        {/* Results Section */}
        {results.length > 0 && (
          <div className="border-t border-slate-200 pt-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-bold text-slate-900">
                Completed ({results.length})
              </h3>
              {results.length > 1 && (
                <button
                  type="button"
                  onClick={() => downloadBatchAsZip(results)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold cursor-pointer"
                >
                  <Archive className="w-4 h-4" />
                  Download All as ZIP
                </button>
              )}
            </div>

            <div className="space-y-3">
              {results.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50/60"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <img
                      src={item.url}
                      alt={item.fileName}
                      className="w-14 h-14 rounded-lg object-cover border border-slate-200 bg-white shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">
                        {item.fileName}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {formatFileSize(item.originalSize)} →{' '}
                        <span className="font-semibold text-slate-800">
                          {formatFileSize(item.newSize)}
                        </span>{' '}
                        · {item.width}×{item.height}px
                      </p>
                      {item.savedPercent > 0 && (
                        <span className="inline-block mt-1 px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-700 text-[11px] font-semibold">
                          Saved {item.savedPercent}%
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setCompareItem(item);
                        setShowOriginalInModal(false);
                      }}
                      className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold text-slate-700 cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Compare
                    </button>
                    <button
                      type="button"
                      onClick={() => downloadSingleImage(item)}
                      className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-xs font-semibold text-white cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Before / After Compare Modal */}
      {compareItem && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={() => setCompareItem(null)}
        >
          <div
            className="bg-white rounded-2xl max-w-2xl w-full p-4 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-900 text-sm">
                {showOriginalInModal ? 'Original Image' : 'Processed Result'}
              </span>
              <button
                type="button"
                onClick={() => setCompareItem(null)}
                className="text-xs font-semibold text-slate-500 hover:text-slate-900 px-2 py-1 cursor-pointer"
              >
                Close ✕
              </button>
            </div>

            <div className="bg-slate-100 rounded-xl overflow-hidden flex items-center justify-center max-h-[60vh]">
              <img
                src={showOriginalInModal ? compareItem.originalUrl : compareItem.url}
                alt="Comparison Preview"
                className="max-h-[60vh] object-contain"
              />
            </div>

            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setShowOriginalInModal((prev) => !prev)}
                className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs sm:text-sm font-semibold cursor-pointer"
              >
                Switch to {showOriginalInModal ? 'Processed' : 'Original'}
              </button>
              <span className="text-xs text-slate-500">
                {showOriginalInModal
                  ? formatFileSize(compareItem.originalSize)
                  : formatFileSize(compareItem.newSize)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
