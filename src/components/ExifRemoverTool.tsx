import React, { useState, useRef, useEffect } from 'react';
import {
  Upload,
  Download,
  Archive,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Lock,
  Loader2,
  AlertCircle,
  Plus,
  X,
  MapPin,
  Camera,
  FileSearch,
} from 'lucide-react';
import {
  processImage,
  formatFileSize,
  validateImageFile,
  validateMagicBytes,
  detectSourceFormat,
  type SupportedFormat,
  type ProcessedImageResult,
} from '../engine/imageEngine';
import { downloadSingleImage, downloadBatchAsZip } from '../engine/zipHelper';

interface ExifEntry {
  key: string;
  value: string;
}

interface ExifFileItem {
  id: string;
  file: File;
  previewUrl: string;
  sourceFormat: string;
  scanning: boolean;
  tags: ExifEntry[];
  hasGps: boolean;
  gpsText?: string;
  cameraText?: string;
  stripping: boolean;
  cleanResult?: ProcessedImageResult;
  error?: string;
}

const PRIORITY_KEYS = [
  'Make',
  'Model',
  'LensModel',
  'DateTimeOriginal',
  'CreateDate',
  'Software',
  'ExposureTime',
  'FNumber',
  'ISO',
  'FocalLength',
  'latitude',
  'longitude',
  'GPSAltitude',
  'Orientation',
  'ColorSpace',
];

function formatTagValue(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  if (val instanceof Date) return val.toLocaleString();
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) return null;
    return Number.isInteger(val) ? String(val) : val.toFixed(5).replace(/0+$/, '').replace(/\.$/, '');
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    return trimmed.length > 0 ? trimmed.slice(0, 120) : null;
  }
  if (Array.isArray(val)) {
    const joined = val.slice(0, 6).join(', ');
    return joined.length > 0 ? joined.slice(0, 100) : null;
  }
  return null;
}

function getDefaultCleanFormat(file: File): SupportedFormat {
  if (file.type === 'image/png' || /\.png$/i.test(file.name)) return 'image/png';
  if (file.type === 'image/webp' || /\.webp$/i.test(file.name)) return 'image/webp';
  return 'image/jpeg';
}

export default function ExifRemoverTool() {
  const [items, setItems] = useState<ExifFileItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isStrippingAll, setIsStrippingAll] = useState(false);
  const [isZipping, setIsZipping] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isGlobalDragging, setIsGlobalDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);
  const trackedUrlsRef = useRef<Set<string>>(new Set());
  const addFilesRef = useRef<(files: FileList | null) => void>(() => {});

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

  const inspectFileMetadata = async (entryId: string, file: File) => {
    try {
      const sigErr = await validateMagicBytes(file);
      if (sigErr) {
        setItems((prev) =>
          prev.map((it) => (it.id === entryId ? { ...it, scanning: false, error: sigErr } : it))
        );
        return;
      }

      const exifrMod = (await import('exifr')) as unknown as {
        parse?: (input: File, opts?: Record<string, unknown>) => Promise<Record<string, unknown> | undefined>;
        default?: {
          parse?: (input: File, opts?: Record<string, unknown>) => Promise<Record<string, unknown> | undefined>;
        };
      };
      const parseFn = exifrMod.parse ?? exifrMod.default?.parse;
      const raw = parseFn
        ? await parseFn(file, {
            tiff: true,
            exif: true,
            gps: true,
            iptc: true,
            xmp: true,
            translateValues: true,
          })
        : undefined;

      const entries: ExifEntry[] = [];
      let hasGps = false;
      let gpsText: string | undefined;
      let cameraText: string | undefined;

      if (raw && typeof raw === 'object') {
        const lat = typeof raw.latitude === 'number' ? raw.latitude : undefined;
        const lon = typeof raw.longitude === 'number' ? raw.longitude : undefined;
        if (lat !== undefined && lon !== undefined && Number.isFinite(lat) && Number.isFinite(lon)) {
          hasGps = true;
          gpsText = `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
        }

        const make = typeof raw.Make === 'string' ? raw.Make.trim() : '';
        const model = typeof raw.Model === 'string' ? raw.Model.trim() : '';
        if (make || model) {
          cameraText = model.toLowerCase().startsWith(make.toLowerCase())
            ? model
            : `${make} ${model}`.trim();
        }

        const seen = new Set<string>();
        for (const k of PRIORITY_KEYS) {
          if (k in raw) {
            const v = formatTagValue(raw[k]);
            if (v) {
              entries.push({ key: k, value: v });
              seen.add(k);
            }
          }
        }
        for (const [k, rawVal] of Object.entries(raw)) {
          if (seen.has(k) || entries.length >= 45) continue;
          if (rawVal instanceof Uint8Array || rawVal instanceof ArrayBuffer) continue;
          const v = formatTagValue(rawVal);
          if (v) entries.push({ key: k, value: v });
        }
      }

      setItems((prev) =>
        prev.map((it) =>
          it.id === entryId
            ? { ...it, scanning: false, tags: entries, hasGps, gpsText, cameraText }
            : it
        )
      );
    } catch {
      setItems((prev) =>
        prev.map((it) => (it.id === entryId ? { ...it, scanning: false, tags: [] } : it))
      );
    }
  };

  const handleAddFiles = (incoming: FileList | null) => {
    if (!incoming || incoming.length === 0) return;
    setErrorMsg(null);

    const valid: File[] = [];
    const errors: string[] = [];

    Array.from(incoming).forEach((f) => {
      const err = validateImageFile(f);
      if (err) errors.push(err);
      else valid.push(f);
    });

    if (fileInputRef.current) fileInputRef.current.value = '';
    if (valid.length === 0) {
      if (errors.length > 0) setErrorMsg(errors[0]);
      return;
    }

    if (errors.length > 0) setErrorMsg(errors[0]);

    const newEntries: ExifFileItem[] = valid.map((file) => ({
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      file,
      previewUrl: trackUrl(URL.createObjectURL(file)),
      sourceFormat: detectSourceFormat(file),
      scanning: true,
      tags: [],
      hasGps: false,
      stripping: false,
    }));

    setItems((prev) => [...newEntries, ...prev]);
    setSelectedId(newEntries[0].id);

    newEntries.forEach((entry) => {
      void inspectFileMetadata(entry.id, entry.file);
    });
  };

  addFilesRef.current = handleAddFiles;

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
      if (e.dataTransfer?.files?.length) addFilesRef.current(e.dataTransfer.files);
    };
    const onPaste = (e: ClipboardEvent) => {
      const files = e.clipboardData?.files;
      if (files?.length && Array.from(files).some((f) => f.type.startsWith('image/'))) {
        e.preventDefault();
        addFilesRef.current(files);
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

  const stripOne = async (item: ExifFileItem): Promise<ProcessedImageResult | null> => {
    if (item.cleanResult) return item.cleanResult;
    setItems((prev) =>
      prev.map((it) => (it.id === item.id ? { ...it, stripping: true, error: undefined } : it))
    );

    try {
      const targetFmt = getDefaultCleanFormat(item.file);
      const res = await processImage(item.file, {
        format: targetFmt,
        quality: targetFmt === 'image/png' ? 1 : 0.92,
      });
      const baseName = item.file.name.replace(/\.[^/.]+$/, '');
      const ext = res.outputFormat.toLowerCase();
      const renamed: ProcessedImageResult = {
        ...res,
        fileName: `${baseName}_clean.${ext}`,
      };
      trackUrl(renamed.url);
      trackUrl(renamed.originalUrl);

      setItems((prev) =>
        prev.map((it) =>
          it.id === item.id ? { ...it, stripping: false, cleanResult: renamed } : it
        )
      );
      return renamed;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to strip metadata.';
      setItems((prev) =>
        prev.map((it) => (it.id === item.id ? { ...it, stripping: false, error: msg } : it))
      );
      return null;
    }
  };

  const handleStripAndDownloadSingle = async (item: ExifFileItem) => {
    const clean = await stripOne(item);
    if (clean) downloadSingleImage(clean);
  };

  const handleStripAllAndDownload = async () => {
    if (items.length === 0) return;
    setIsStrippingAll(true);
    setErrorMsg(null);

    try {
      const cleanedList: ProcessedImageResult[] = [];
      for (const item of items) {
        if (item.error) continue;
        const clean = await stripOne(item);
        if (clean) cleanedList.push(clean);
      }

      if (cleanedList.length === 1) {
        downloadSingleImage(cleanedList[0]);
      } else if (cleanedList.length > 1) {
        setIsZipping(true);
        await downloadBatchAsZip(cleanedList, 'imagelab-exif-cleaned.zip');
      }
    } finally {
      setIsZipping(false);
      setIsStrippingAll(false);
    }
  };

  const removeItem = (id: string) => {
    setItems((prev) => {
      const target = prev.find((i) => i.id === id);
      if (target) {
        releaseUrl(target.previewUrl);
        if (target.cleanResult) {
          releaseUrl(target.cleanResult.url);
          releaseUrl(target.cleanResult.originalUrl);
        }
      }
      const next = prev.filter((i) => i.id !== id);
      if (selectedId === id) setSelectedId(next[0]?.id ?? null);
      return next;
    });
  };

  const clearAll = () => {
    items.forEach((it) => {
      releaseUrl(it.previewUrl);
      if (it.cleanResult) {
        releaseUrl(it.cleanResult.url);
        releaseUrl(it.cleanResult.originalUrl);
      }
    });
    setItems([]);
    setSelectedId(null);
    setErrorMsg(null);
  };

  const selectedItem = items.find((it) => it.id === selectedId) ?? items[0] ?? null;

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
            <div className="w-16 h-16 rounded-2xl bg-blue-600 text-white flex items-center justify-center mx-auto mb-5 shadow-lg">
              <Upload className="w-7 h-7" />
            </div>
            <p className="text-xl font-bold text-zinc-950 dark:text-white">
              Drop Photos to Inspect EXIF
            </p>
          </div>
        </div>
      )}

      <div className="studio-card rounded-3xl overflow-hidden">
        {items.length === 0 ? (
          <div className="p-6 sm:p-10">
            <div
              role="button"
              tabIndex={0}
              aria-label="Select photos to inspect and remove EXIF metadata"
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
                <FileSearch className="w-7 h-7 text-zinc-900 dark:text-white group-hover:text-blue-600 transition-colors" />
              </div>

              <span className="btn-studio-accent inline-flex items-center gap-2 px-7 py-3.5 rounded-2xl font-semibold text-sm sm:text-[15px]">
                Inspect &amp; Clean Photos
              </span>

              <p className="text-xs sm:text-sm text-zinc-500 mt-4">
                Drop unlimited photos anywhere or press{' '}
                <kbd className="px-1.5 py-0.5 text-[11px] font-semibold bg-white border border-zinc-200 rounded-md text-zinc-700">
                  Ctrl+V
                </kbd>
              </p>

              <p className="text-[11px] font-medium text-zinc-400 mt-3 uppercase tracking-wide">
                Detects GPS Coordinates · Camera Model · Date · Software · 1-Click Wipe
              </p>
            </div>
          </div>
        ) : (
          <div className="grid lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-zinc-200/80">
            {/* Left: File List */}
            <div className="lg:col-span-6 flex flex-col justify-between">
              <div className="divide-y divide-zinc-100 max-h-[460px] overflow-y-auto">
                {items.map((item) => {
                  const isSelected = selectedItem?.id === item.id;
                  return (
                    <div
                      key={item.id}
                      onClick={() => setSelectedId(item.id)}
                      className={`flex items-center justify-between gap-3 px-5 py-3.5 cursor-pointer transition ${
                        isSelected ? 'bg-blue-50/50 dark:bg-blue-950/20' : 'hover:bg-zinc-50'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <img
                          src={item.cleanResult ? item.cleanResult.url : item.previewUrl}
                          alt={item.file.name}
                          className="w-12 h-12 rounded-xl object-cover border border-zinc-200 shrink-0"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display = 'none';
                          }}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs sm:text-sm font-semibold text-zinc-900 truncate">
                            {item.file.name}
                          </p>
                          <div className="flex flex-wrap items-center gap-1.5 mt-1">
                            {item.scanning ? (
                              <span className="text-[11px] text-zinc-500">Scanning EXIF...</span>
                            ) : item.cleanResult ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/12 text-emerald-700 dark:text-emerald-400 text-[10.5px] font-semibold">
                                <ShieldCheck className="w-3 h-3" /> Metadata Wiped
                              </span>
                            ) : item.hasGps ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-500/12 text-red-700 dark:text-red-400 text-[10.5px] font-semibold">
                                <MapPin className="w-3 h-3" /> GPS Found
                              </span>
                            ) : item.tags.length > 0 ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-800 dark:text-amber-300 text-[10.5px] font-semibold tabular-nums">
                                <ShieldAlert className="w-3 h-3" /> {item.tags.length} Tags
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-600 text-[10.5px] font-semibold">
                                No EXIF Found
                              </span>
                            )}
                            {item.cameraText && !item.cleanResult && (
                              <span className="text-[11px] text-zinc-500 truncate max-w-[140px]">
                                {item.cameraText}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div
                        className="flex items-center gap-1.5 shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          disabled={item.stripping || item.scanning}
                          onClick={() => void handleStripAndDownloadSingle(item)}
                          className="btn-studio-primary inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer disabled:opacity-40"
                        >
                          {item.stripping ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Download className="w-3.5 h-3.5" />
                          )}
                          <span className="hidden sm:inline">Clean</span>
                        </button>
                        <button
                          type="button"
                          aria-label={`Remove ${item.file.name}`}
                          onClick={() => removeItem(item.id)}
                          className="p-1.5 rounded-lg text-zinc-400 hover:text-red-600 hover:bg-red-500/10 cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Left Footer */}
              <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 border-t border-zinc-200/80 bg-zinc-50/80">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-100 text-xs font-semibold text-zinc-700 cursor-pointer tabular-nums"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add ({items.length})</span>
                  </button>
                  <button
                    type="button"
                    onClick={clearAll}
                    aria-label="Clear all"
                    className="p-2 rounded-xl border border-zinc-200 bg-white hover:text-red-600 text-zinc-500 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <button
                  type="button"
                  disabled={isStrippingAll || isZipping}
                  onClick={() => void handleStripAllAndDownload()}
                  className="btn-studio-accent inline-flex items-center gap-2 px-5 py-2.5 rounded-xl disabled:opacity-40 text-xs font-semibold cursor-pointer"
                >
                  {isStrippingAll || isZipping ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{isZipping ? 'Zipping...' : 'Cleaning...'}</span>
                    </>
                  ) : items.length > 1 ? (
                    <>
                      <Archive className="w-4 h-4" />
                      <span>Clean All &amp; ZIP ({items.length})</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      <span>Strip Metadata &amp; Save</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Right: Metadata Inspector Panel */}
            <div className="lg:col-span-6 p-5 sm:p-6 bg-zinc-50/60 flex flex-col gap-4">
              {selectedItem && (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                        Metadata Inspector
                      </p>
                      <h2 className="text-sm font-bold text-zinc-950 truncate mt-0.5">
                        {selectedItem.file.name}
                      </h2>
                      <p className="text-xs text-zinc-500 tabular-nums mt-0.5">
                        {selectedItem.sourceFormat} · {formatFileSize(selectedItem.file.size)}
                        {selectedItem.cleanResult && (
                          <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                            {' '}
                            → Clean {formatFileSize(selectedItem.cleanResult.newSize)}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Highlight Privacy Cards */}
                  {!selectedItem.scanning && (
                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="p-3 rounded-2xl bg-white border border-zinc-200/80">
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-500">
                          <MapPin className="w-3.5 h-3.5" /> GPS Location
                        </div>
                        <p
                          className={`text-xs font-bold mt-1 tabular-nums ${
                            selectedItem.hasGps && !selectedItem.cleanResult
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-emerald-600 dark:text-emerald-400'
                          }`}
                        >
                          {selectedItem.cleanResult
                            ? 'Removed'
                            : selectedItem.hasGps
                              ? selectedItem.gpsText
                              : 'None Detected'}
                        </p>
                      </div>

                      <div className="p-3 rounded-2xl bg-white border border-zinc-200/80">
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-500">
                          <Camera className="w-3.5 h-3.5" /> Device / Camera
                        </div>
                        <p className="text-xs font-bold text-zinc-900 mt-1 truncate">
                          {selectedItem.cleanResult
                            ? 'Removed'
                            : selectedItem.cameraText || 'Not Embedded'}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Full Tag Table */}
                  <div className="flex-1 bg-white rounded-2xl border border-zinc-200/80 overflow-hidden flex flex-col max-h-[300px]">
                    {selectedItem.scanning ? (
                      <div className="p-8 text-center text-xs text-zinc-500 flex items-center justify-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                        Reading embedded EXIF, GPS, IPTC &amp; XMP headers...
                      </div>
                    ) : selectedItem.cleanResult ? (
                      <div className="p-8 text-center space-y-2">
                        <ShieldCheck className="w-8 h-8 text-emerald-500 mx-auto" />
                        <p className="text-sm font-bold text-zinc-900">100% Metadata Stripped</p>
                        <p className="text-xs text-zinc-500">
                          Re-encoded cleanly with {selectedItem.cleanResult.encoderUsed}. All GPS,
                          EXIF, XMP, and embedded thumbnails have been permanently removed.
                        </p>
                      </div>
                    ) : selectedItem.tags.length === 0 ? (
                      <div className="p-8 text-center space-y-1.5">
                        <ShieldCheck className="w-7 h-7 text-emerald-500 mx-auto" />
                        <p className="text-xs font-bold text-zinc-900">No EXIF tags detected</p>
                        <p className="text-xs text-zinc-500">
                          You can still click Clean to guarantee fresh, metadata-free file bytes.
                        </p>
                      </div>
                    ) : (
                      <div className="overflow-y-auto divide-y divide-zinc-100 text-xs">
                        {selectedItem.tags.map((tag) => (
                          <div
                            key={tag.key}
                            className="grid grid-cols-12 gap-2 px-4 py-2 hover:bg-zinc-50"
                          >
                            <span className="col-span-5 font-semibold text-zinc-500 truncate">
                              {tag.key}
                            </span>
                            <span className="col-span-7 font-medium text-zinc-900 break-all tabular-nums">
                              {tag.value}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
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
        <span>100% Private · EXIF inspection and removal happen locally in your browser</span>
      </p>
    </div>
  );
}
