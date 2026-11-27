import React, { useState, useRef, useEffect } from 'react';
import {
  Upload,
  Download,
  Archive,
  Trash2,
  Plus,
  X,
  Lock,
  Loader2,
  AlertCircle,
  FileCode2,
  Image as ImageIcon,
  Zap,
  Layers,
  Maximize2,
  ArrowRight,
  RotateCcw,
} from 'lucide-react';
import {
  encodeCanvasWithCodec,
  formatFileSize,
  MAX_SAFE_CANVAS_PIXELS,
  type SupportedFormat,
} from '../engine/imageEngine';
import ContinueToMenu from './ContinueToMenu';

type SizeMode = 'scale' | 'width';

interface SvgItemResult {
  blob: Blob;
  url: string;
  fileName: string;
  width: number;
  height: number;
  size: number;
  outputFormat: string;
}

interface SvgQueueItem {
  id: string;
  file: File;
  previewUrl: string;
  status: 'queued' | 'processing' | 'done' | 'error';
  result?: SvgItemResult;
  error?: string;
}

const FORMAT_OPTIONS: { id: SupportedFormat; label: string; icon: React.ReactNode }[] = [
  { id: 'image/png', label: 'PNG', icon: <Layers className="w-3.5 h-3.5" aria-hidden="true" /> },
  { id: 'image/webp', label: 'WEBP', icon: <Zap className="w-3.5 h-3.5" aria-hidden="true" /> },
  { id: 'image/jpeg', label: 'JPG', icon: <ImageIcon className="w-3.5 h-3.5" aria-hidden="true" /> },
];

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function getExt(mime: string): string {
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/webp') return 'webp';
  return 'png';
}

function parseSvgNumericAttr(val: string | null): number | null {
  if (!val) return null;
  const trimmed = val.trim();
  if (trimmed.endsWith('%')) return null;
  const num = parseFloat(trimmed);
  return Number.isFinite(num) && num > 0 ? num : null;
}

/** Sanitizes SVG markup, injects crisp pixel dimensions, and renders via native <img> + Canvas */
async function rasterizeSvgFile(
  file: File,
  opts: {
    format: SupportedFormat;
    sizeMode: SizeMode;
    scale: number;
    targetWidth: number;
    transparentBg: boolean;
    bgColor: string;
  }
): Promise<SvgItemResult> {
  const rawText = await file.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(rawText, 'image/svg+xml');

  if (doc.querySelector('parsererror')) {
    throw new Error(`"${file.name}" contains invalid SVG markup.`);
  }

  const svgEl = doc.documentElement;
  if (!svgEl || svgEl.tagName.toLowerCase() !== 'svg') {
    throw new Error(`"${file.name}" is not a valid SVG root element.`);
  }

  // Strip script elements as defense-in-depth
  svgEl.querySelectorAll('script').forEach((node) => node.remove());

  if (!svgEl.getAttribute('xmlns')) {
    svgEl.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  }

  // Resolve intrinsic dimensions from viewBox or width/height
  let baseW = parseSvgNumericAttr(svgEl.getAttribute('width'));
  let baseH = parseSvgNumericAttr(svgEl.getAttribute('height'));

  const vb = svgEl.getAttribute('viewBox');
  if (vb) {
    const parts = vb
      .trim()
      .split(/[\s,]+/)
      .map(Number);
    if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
      if (!baseW || !baseH) {
        baseW = parts[2];
        baseH = parts[3];
      }
    }
  }

  if (!baseW || !baseH) {
    baseW = 512;
    baseH = 512;
  }

  const aspect = baseW / baseH;
  let outW: number;
  let outH: number;

  if (opts.sizeMode === 'width') {
    outW = Math.max(16, Math.min(4096, Math.round(opts.targetWidth || 1024)));
    outH = Math.max(16, Math.round(outW / aspect));
  } else {
    outW = Math.max(16, Math.round(baseW * opts.scale));
    outH = Math.max(16, Math.round(baseH * opts.scale));
  }

  if (outW * outH > MAX_SAFE_CANVAS_PIXELS) {
    const capScale = Math.sqrt(MAX_SAFE_CANVAS_PIXELS / (outW * outH));
    outW = Math.max(16, Math.floor(outW * capScale));
    outH = Math.max(16, Math.floor(outH * capScale));
  }

  if (!vb) {
    svgEl.setAttribute('viewBox', `0 0 ${baseW} ${baseH}`);
  }
  svgEl.setAttribute('width', String(outW));
  svgEl.setAttribute('height', String(outH));

  const serialized = new XMLSerializer().serializeToString(svgEl);
  const svgBlob = new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' });
  const svgUrl = URL.createObjectURL(svgBlob);

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => {
      URL.revokeObjectURL(svgUrl);
      resolve(el);
    };
    el.onerror = () => {
      URL.revokeObjectURL(svgUrl);
      reject(new Error(`Could not render "${file.name}". External image refs inside SVG may be blocked.`));
    };
    el.src = svgUrl;
  });

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Browser rendering context unavailable.');

  if (opts.format === 'image/jpeg' || !opts.transparentBg) {
    ctx.fillStyle = opts.bgColor || '#ffffff';
    ctx.fillRect(0, 0, outW, outH);
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, outW, outH);

  const encoded = await encodeCanvasWithCodec(
    canvas,
    opts.format,
    opts.format === 'image/png' ? 1 : 0.92
  );
  canvas.width = 0;
  canvas.height = 0;

  const actualMime = encoded.blob.type || opts.format;
  const ext = getExt(actualMime);
  const baseName = file.name.replace(/\.svg$/i, '');

  return {
    blob: encoded.blob,
    url: URL.createObjectURL(encoded.blob),
    fileName: `${baseName}_${outW}x${outH}.${ext}`,
    width: outW,
    height: outH,
    size: encoded.blob.size,
    outputFormat: ext.toUpperCase(),
  };
}

export default function SvgToPngTool() {
  const [items, setItems] = useState<SvgQueueItem[]>([]);
  const [format, setFormat] = useState<SupportedFormat>('image/png');
  const [sizeMode, setSizeMode] = useState<SizeMode>('width');
  const [scale, setScale] = useState<number>(2);
  const [targetWidth, setTargetWidth] = useState<number>(1024);
  const [transparentBg, setTransparentBg] = useState<boolean>(true);
  const [bgColor, setBgColor] = useState<string>('#ffffff');

  const [isZipping, setIsZipping] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isGlobalDragging, setIsGlobalDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);
  const itemsRef = useRef<SvgQueueItem[]>([]);
  const sessionRef = useRef(0);
  const runningRef = useRef(false);
  const trackedUrlsRef = useRef<Set<string>>(new Set());
  const optionsRef = useRef({
    format,
    sizeMode,
    scale,
    targetWidth,
    transparentBg,
    bgColor,
  });
  const addFilesRef = useRef<(files: FileList | null) => void>(() => {});

  itemsRef.current = items;
  optionsRef.current = { format, sizeMode, scale, targetWidth, transparentBg, bgColor };

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
      sessionRef.current++;
      trackedUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
      trackedUrlsRef.current.clear();
    };
  }, []);

  const patchItem = (id: string, updater: (it: SvgQueueItem) => SvgQueueItem) => {
    const next = itemsRef.current.map((it) => (it.id === id ? updater(it) : it));
    itemsRef.current = next;
    setItems(next);
  };

  const pumpQueue = async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    const session = sessionRef.current;

    try {
      while (sessionRef.current === session) {
        const nextItem = itemsRef.current.find((it) => it.status === 'queued');
        if (!nextItem) break;

        patchItem(nextItem.id, (it) => ({ ...it, status: 'processing', error: undefined }));

        try {
          const res = await rasterizeSvgFile(nextItem.file, optionsRef.current);
          if (sessionRef.current !== session || !itemsRef.current.some((i) => i.id === nextItem.id)) {
            URL.revokeObjectURL(res.url);
            continue;
          }
          trackUrl(res.url);
          patchItem(nextItem.id, (it) => {
            if (it.result) releaseUrl(it.result.url);
            return { ...it, status: 'done', result: res, error: undefined };
          });
        } catch (err) {
          if (sessionRef.current !== session) break;
          patchItem(nextItem.id, (it) => ({
            ...it,
            status: 'error',
            error: err instanceof Error ? err.message : 'SVG conversion failed.',
          }));
        }
      }
    } finally {
      runningRef.current = false;
      if (sessionRef.current === session && itemsRef.current.some((it) => it.status === 'queued')) {
        void pumpQueue();
      }
    }
  };

  const reprocessAll = (override?: Partial<typeof optionsRef.current>) => {
    optionsRef.current = { ...optionsRef.current, ...override };
    if (itemsRef.current.length === 0) return;

    sessionRef.current++;
    runningRef.current = false;
    const reset = itemsRef.current.map((it) => ({
      ...it,
      status: 'queued' as const,
      error: undefined,
    }));
    itemsRef.current = reset;
    setItems(reset);
    void pumpQueue();
  };

  const handleAddFiles = (incoming: FileList | null) => {
    if (!incoming || incoming.length === 0) return;
    setErrorMsg(null);

    const valid: File[] = [];
    const errs: string[] = [];

    Array.from(incoming).forEach((f) => {
      const isSvg = f.type === 'image/svg+xml' || /\.svg$/i.test(f.name);
      if (!isSvg) {
        errs.push(`"${f.name}" is not an SVG file. Please upload .svg vectors.`);
      } else if (f.size === 0) {
        errs.push(`"${f.name}" is empty.`);
      } else {
        valid.push(f);
      }
    });

    if (fileInputRef.current) fileInputRef.current.value = '';
    if (valid.length === 0) {
      if (errs.length > 0) setErrorMsg(errs[0]);
      return;
    }

    if (errs.length > 0) setErrorMsg(errs[0]);

    const newEntries: SvgQueueItem[] = valid.map((file) => ({
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      file,
      previewUrl: trackUrl(URL.createObjectURL(file)),
      status: 'queued',
    }));

    const next = [...newEntries, ...itemsRef.current];
    itemsRef.current = next;
    setItems(next);
    void pumpQueue();
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

    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, []);

  const removeItem = (id: string) => {
    const target = itemsRef.current.find((i) => i.id === id);
    if (target) {
      releaseUrl(target.previewUrl);
      if (target.result) releaseUrl(target.result.url);
    }
    const next = itemsRef.current.filter((i) => i.id !== id);
    itemsRef.current = next;
    setItems(next);
  };

  const clearAll = () => {
    sessionRef.current++;
    runningRef.current = false;
    itemsRef.current.forEach((it) => {
      releaseUrl(it.previewUrl);
      if (it.result) releaseUrl(it.result.url);
    });
    itemsRef.current = [];
    setItems([]);
    setErrorMsg(null);
  };

  const doneItems = items.filter((it): it is SvgQueueItem & { result: SvgItemResult } =>
    Boolean(it.status === 'done' && it.result)
  );
  const isBusy = items.some((it) => it.status === 'queued' || it.status === 'processing');

  const handleDownloadAll = async () => {
    if (doneItems.length === 0) return;
    if (doneItems.length === 1) {
      triggerDownload(doneItems[0].result.blob, doneItems[0].result.fileName);
      return;
    }
    setIsZipping(true);
    try {
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      doneItems.forEach((it, idx) => {
        zip.file(`${idx + 1}_${it.result.fileName}`, it.result.blob);
      });
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      triggerDownload(zipBlob, 'imagelabkit-svg-converted.zip');
    } finally {
      setIsZipping(false);
    }
  };

  return (
    <div className="space-y-4 animate-fade-up">
      <input
        ref={fileInputRef}
        type="file"
        accept=".svg,image/svg+xml"
        multiple
        className="hidden"
        onChange={(e) => handleAddFiles(e.target.files)}
      />

      {isGlobalDragging && (
        <div className="fixed inset-0 z-50 bg-zinc-950/65 backdrop-blur-md flex items-center justify-center p-6 pointer-events-none animate-scale-in">
          <div className="max-w-md w-full rounded-3xl border border-blue-400/50 bg-white/95 dark:bg-zinc-900/95 p-10 text-center shadow-2xl">
            <div className="w-16 h-16 rounded-2xl bg-blue-600 text-white flex items-center justify-center mx-auto mb-5 shadow-lg">
              <Upload className="w-7 h-7" aria-hidden="true" />
            </div>
            <p className="text-xl font-bold text-zinc-950 dark:text-white">
              Release to Convert SVG
            </p>
          </div>
        </div>
      )}

      <div className="studio-card rounded-3xl overflow-hidden">
        {/* Top Export Settings Strip */}
        <div className="p-4 sm:px-7 bg-zinc-50/80 border-b border-zinc-200/80 flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <div
              role="radiogroup"
              aria-label="Output format"
              className="inline-flex bg-zinc-200/70 dark:bg-zinc-800 p-0.5 rounded-xl"
            >
              {FORMAT_OPTIONS.map((opt) => {
                const active = format === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => {
                      setFormat(opt.id);
                      reprocessAll({ format: opt.id });
                    }}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] font-semibold transition cursor-pointer ${
                      active
                        ? 'bg-white dark:bg-zinc-950 text-zinc-950 dark:text-white shadow-xs'
                        : 'text-zinc-600 hover:text-zinc-900'
                    }`}
                  >
                    <span className={active ? 'text-blue-600 dark:text-blue-400' : 'opacity-70'}>
                      {opt.icon}
                    </span>
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="inline-flex bg-zinc-200/70 dark:bg-zinc-800 p-0.5 rounded-xl">
              <button
                type="button"
                onClick={() => {
                  setSizeMode('width');
                  reprocessAll({ sizeMode: 'width' });
                }}
                className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-[10px] font-semibold cursor-pointer ${
                  sizeMode === 'width'
                    ? 'bg-white dark:bg-zinc-950 text-zinc-950 dark:text-white shadow-xs'
                    : 'text-zinc-600'
                }`}
              >
                <Maximize2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Exact Width</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setSizeMode('scale');
                  reprocessAll({ sizeMode: 'scale' });
                }}
                className={`px-2.5 py-1.5 rounded-[10px] font-semibold cursor-pointer ${
                  sizeMode === 'scale'
                    ? 'bg-white dark:bg-zinc-950 text-zinc-950 dark:text-white shadow-xs'
                    : 'text-zinc-600'
                }`}
              >
                Scale (×)
              </button>
            </div>

            {sizeMode === 'width' ? (
              <div className="flex flex-wrap items-center gap-1.5">
                {[512, 1024, 2048].map((w) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => {
                      setTargetWidth(w);
                      reprocessAll({ targetWidth: w, sizeMode: 'width' });
                    }}
                    className={`px-2.5 py-1.5 rounded-xl font-semibold border tabular-nums cursor-pointer ${
                      targetWidth === w
                        ? 'bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 border-transparent'
                        : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-100'
                    }`}
                  >
                    {w}px
                  </button>
                ))}
                <input
                  type="number"
                  aria-label="Custom output width in pixels"
                  min={16}
                  max={4096}
                  value={targetWidth}
                  onChange={(e) => {
                    const nextW = Math.max(16, Math.min(4096, Number(e.target.value) || 512));
                    setTargetWidth(nextW);
                    reprocessAll({ targetWidth: nextW, sizeMode: 'width' });
                  }}
                  className="w-20 bg-white border border-zinc-300 rounded-xl px-2.5 py-1.5 font-semibold tabular-nums"
                />
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                {[1, 2, 4].map((sc) => (
                  <button
                    key={sc}
                    type="button"
                    onClick={() => {
                      setScale(sc);
                      reprocessAll({ scale: sc, sizeMode: 'scale' });
                    }}
                    className={`px-2.5 py-1.5 rounded-xl font-semibold border tabular-nums cursor-pointer ${
                      scale === sc
                        ? 'bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 border-transparent'
                        : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-100'
                    }`}
                  >
                    {sc}×
                  </button>
                ))}
              </div>
            )}
          </div>

          {format !== 'image/jpeg' && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const next = !transparentBg;
                  setTransparentBg(next);
                  reprocessAll({ transparentBg: next });
                }}
                className={`px-2.5 py-1.5 rounded-xl font-semibold border cursor-pointer ${
                  transparentBg
                    ? 'bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 border-transparent'
                    : 'bg-white text-zinc-700 border-zinc-200'
                }`}
              >
                Transparent BG
              </button>
              {!transparentBg && (
                <input
                  type="color"
                  aria-label="Solid background color"
                  value={bgColor}
                  onChange={(e) => {
                    setBgColor(e.target.value);
                    reprocessAll({ bgColor: e.target.value, transparentBg: false });
                  }}
                  className="w-7 h-7 p-0.5 rounded-lg border border-zinc-300 bg-white cursor-pointer"
                />
              )}
            </div>
          )}
        </div>

        {items.length === 0 ? (
          <div className="p-6 sm:p-10">
            <div
              role="button"
              tabIndex={0}
              aria-label="Select SVG files to convert"
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              onClick={() => fileInputRef.current?.click()}
              className="group min-h-[300px] sm:min-h-[340px] flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 hover:border-blue-500/70 bg-zinc-50/60 hover:bg-blue-50/20 dark:hover:bg-blue-950/15 p-8 text-center cursor-pointer transition-all"
            >
              <div className="w-16 h-16 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 shadow-sm flex items-center justify-center mb-6 group-hover:-translate-y-1 transition-transform">
                <FileCode2 className="w-7 h-7 text-zinc-900 dark:text-white group-hover:text-blue-600 transition-colors" aria-hidden="true" />
              </div>
              <span className="btn-studio-accent inline-flex items-center gap-2 px-7 py-3.5 rounded-2xl font-semibold text-sm sm:text-[15px]">
                Select SVG Files
              </span>
              <p className="text-xs sm:text-sm text-zinc-500 mt-4">
                Drop unlimited vector .svg icons or logos anywhere on screen
              </p>
              <p className="text-[11px] font-medium text-zinc-400 mt-3 uppercase tracking-wide">
                Crisp HD PNG · WEBP · JPG · Transparent Background · Unlimited Batch ZIP
              </p>
            </div>
          </div>
        ) : (
          <div>
            <div className="divide-y divide-zinc-100 max-h-[460px] overflow-y-auto">
              {items.map((item) => {
                const res = item.result;
                return (
                  <div
                    key={item.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-5 sm:px-7 py-4 hover:bg-zinc-50 transition"
                  >
                    <div className="flex items-center gap-3.5 min-w-0 flex-1">
                      <div
                        className="w-14 h-14 rounded-2xl border border-zinc-200 shrink-0 flex items-center justify-center p-1.5 overflow-hidden"
                        style={{
                          backgroundImage:
                            'linear-gradient(45deg, #e4e4e7 25%, #fafafa 25%), linear-gradient(-45deg, #e4e4e7 25%, #fafafa 25%), linear-gradient(45deg, #fafafa 75%, #e4e4e7 75%), linear-gradient(-45deg, #fafafa 75%, #e4e4e7 75%)',
                          backgroundSize: '12px 12px',
                          backgroundPosition: '0 0, 0 6px, 6px -6px, -6px 0px',
                        }}
                      >
                        <img
                          src={res ? res.url : item.previewUrl}
                          alt={item.file.name}
                          className="max-w-full max-h-full object-contain"
                        />
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-zinc-900 truncate">
                          {item.file.name}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500 tabular-nums mt-0.5">
                          <span>SVG · {formatFileSize(item.file.size)}</span>
                          {res && (
                            <>
                              <ArrowRight className="w-3 h-3 text-zinc-400" aria-hidden="true" />
                              <span className="font-semibold text-zinc-900">
                                {res.outputFormat} · {formatFileSize(res.size)}
                              </span>
                              <span className="text-zinc-400">
                                {res.width}×{res.height} px
                              </span>
                            </>
                          )}
                        </div>

                        {item.status === 'error' && (
                          <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                            <span>{item.error}</span>
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 shrink-0 flex-wrap">
                      {(item.status === 'queued' || item.status === 'processing') && (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs font-semibold">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                          Converting
                        </span>
                      )}

                      {item.status === 'error' && (
                        <button
                          type="button"
                          onClick={() => {
                            patchItem(item.id, (it) => ({ ...it, status: 'queued', error: undefined }));
                            void pumpQueue();
                          }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-100 text-xs font-semibold text-zinc-700 cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" /> Retry
                        </button>
                      )}

                      {item.status === 'done' && res && (
                        <>
                          <ContinueToMenu
                            compact
                            currentPath="/svg-to-png"
                            onPrepareFile={() => ({ blob: res.blob, fileName: res.fileName })}
                          />
                          <button
                            type="button"
                            onClick={() => triggerDownload(res.blob, res.fileName)}
                            className="btn-studio-primary inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>Download</span>
                          </button>
                        </>
                      )}

                      <button
                        type="button"
                        aria-label={`Remove ${item.file.name}`}
                        onClick={() => removeItem(item.id)}
                        className="p-2 rounded-xl text-zinc-400 hover:text-red-600 hover:bg-red-500/10 cursor-pointer"
                      >
                        <X className="w-4 h-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 px-5 sm:px-7 py-4 border-t border-zinc-200/80 bg-zinc-50/80">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-100 text-xs sm:text-[13px] font-semibold text-zinc-700 cursor-pointer tabular-nums"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                <span>Add SVGs ({items.length})</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={clearAll}
                  aria-label="Clear all"
                  className="p-2.5 rounded-xl border border-zinc-200 bg-white hover:text-red-600 text-zinc-500 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  disabled={doneItems.length === 0 || isBusy || isZipping}
                  onClick={() => void handleDownloadAll()}
                  className="btn-studio-accent inline-flex items-center gap-2 px-6 py-2.5 rounded-xl disabled:opacity-40 text-xs sm:text-sm font-semibold cursor-pointer"
                >
                  {isZipping ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                      <span>Zipping...</span>
                    </>
                  ) : doneItems.length > 1 ? (
                    <>
                      <Archive className="w-4 h-4" aria-hidden="true" />
                      <span>Download ZIP ({doneItems.length})</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" aria-hidden="true" />
                      <span>Download {format === 'image/png' ? 'PNG' : format === 'image/webp' ? 'WEBP' : 'JPG'}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {errorMsg && (
          <div className="mx-5 sm:mx-7 mb-5 flex items-center gap-2 p-3.5 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-700 dark:text-red-400 text-xs font-medium">
            <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{errorMsg}</span>
          </div>
        )}
      </div>

      <p className="flex items-center justify-center gap-1.5 text-xs text-zinc-500">
        <Lock className="w-3.5 h-3.5 text-emerald-600 shrink-0" aria-hidden="true" />
        <span>Processed privately on your device · Zero uploads</span>
      </p>
    </div>
  );
}
