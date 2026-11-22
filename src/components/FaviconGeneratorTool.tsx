import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Upload,
  Download,
  Archive,
  Trash2,
  Lock,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Copy,
  Check,
  Globe,
  Smartphone,
  Code2,
  Palette,
} from 'lucide-react';
import {
  validateImageFile,
  validateMagicBytes,
  normalizeImageBlob,
} from '../engine/imageEngine';
import { consumeHandoffFile } from '../engine/handoff';

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

/** Pure-JS multi-resolution ICO binary builder (embeds crisp 32-bit PNG frames for 16, 32 & 48px) */
function buildMultiSizeIco(frames: { size: number; pngBytes: Uint8Array }[]): Blob {
  const count = frames.length;
  const headerLen = 6 + count * 16;
  const totalBytes = headerLen + frames.reduce((sum, f) => sum + f.pngBytes.length, 0);

  const buf = new ArrayBuffer(totalBytes);
  const view = new DataView(buf);
  const out = new Uint8Array(buf);

  // ICONDIR header
  view.setUint16(0, 0, true); // Reserved
  view.setUint16(2, 1, true); // Type 1 = ICO
  view.setUint16(4, count, true); // Image count

  let offset = headerLen;
  frames.forEach((frame, idx) => {
    const entryOffset = 6 + idx * 16;
    const dimByte = frame.size >= 256 ? 0 : frame.size;
    view.setUint8(entryOffset + 0, dimByte);
    view.setUint8(entryOffset + 1, dimByte);
    view.setUint8(entryOffset + 2, 0); // Color count
    view.setUint8(entryOffset + 3, 0); // Reserved
    view.setUint16(entryOffset + 4, 1, true); // Color planes
    view.setUint16(entryOffset + 6, 32, true); // Bits per pixel
    view.setUint32(entryOffset + 8, frame.pngBytes.length, true); // Data size
    view.setUint32(entryOffset + 12, offset, true); // Data offset

    out.set(frame.pngBytes, offset);
    offset += frame.pngBytes.length;
  });

  return new Blob([buf], { type: 'image/x-icon' });
}

function drawRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  radius: number
) {
  const r = Math.min(radius, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(w - r, 0);
  ctx.quadraticCurveTo(w, 0, w, r);
  ctx.lineTo(w, h - r);
  ctx.quadraticCurveTo(w, h, w - r, h);
  ctx.lineTo(r, h);
  ctx.quadraticCurveTo(0, h, 0, h - r);
  ctx.lineTo(0, r);
  ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.closePath();
}

function renderIconToCanvas(
  img: HTMLImageElement,
  size: number,
  opts: {
    transparentBg: boolean;
    bgColor: string;
    radiusPct: number;
    paddingPct: number;
  }
): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.save();
  if (opts.radiusPct > 0) {
    drawRoundedRectPath(ctx, size, size, (size * opts.radiusPct) / 100);
    ctx.clip();
  }

  if (!opts.transparentBg) {
    ctx.fillStyle = opts.bgColor || '#ffffff';
    ctx.fillRect(0, 0, size, size);
  }

  const pad = Math.round((size * opts.paddingPct) / 100);
  const avail = Math.max(2, size - pad * 2);
  const natW = img.naturalWidth || 512;
  const natH = img.naturalHeight || 512;
  const scale = Math.min(avail / natW, avail / natH);
  const drawW = natW * scale;
  const drawH = natH * scale;
  const dx = (size - drawW) / 2;
  const dy = (size - drawH) / 2;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, dx, dy, drawW, drawH);
  ctx.restore();

  return canvas;
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Failed to render PNG icon.'))),
      'image/png'
    );
  });
}

async function loadAnyIconImage(file: File): Promise<HTMLImageElement> {
  const isSvg = file.type === 'image/svg+xml' || /\.svg$/i.test(file.name);
  if (isSvg) {
    const text = await file.text();
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    if (doc.querySelector('parsererror')) throw new Error('Invalid SVG file.');
    const svgEl = doc.documentElement;
    svgEl.querySelectorAll('script').forEach((n) => n.remove());
    if (!svgEl.getAttribute('xmlns')) svgEl.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    svgEl.setAttribute('width', '512');
    svgEl.setAttribute('height', '512');
    const serialized = new XMLSerializer().serializeToString(svgEl);
    const svgBlob = new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Could not render SVG icon.'));
      };
      img.src = url;
    });
  }

  const valErr = validateImageFile(file);
  if (valErr) throw new Error(valErr);
  const sigErr = await validateMagicBytes(file);
  if (sigErr) throw new Error(sigErr);

  const normalized = await normalizeImageBlob(file);
  const url = URL.createObjectURL(normalized);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not decode image file.'));
    };
    img.src = url;
  });
}

const HTML_SNIPPET = `<link rel="icon" href="/favicon.ico" sizes="any" />
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
<link rel="manifest" href="/site.webmanifest" />`;

export default function FaviconGeneratorTool() {
  const [file, setFile] = useState<File | null>(null);
  const [loadedImg, setLoadedImg] = useState<HTMLImageElement | null>(null);
  const [previewDataUrl, setPreviewDataUrl] = useState<string>('');

  const [appName, setAppName] = useState('My Website');
  const [transparentBg, setTransparentBg] = useState(true);
  const [bgColor, setBgColor] = useState('#ffffff');
  const [themeColor, setThemeColor] = useState('#2563eb');
  const [radiusPct, setRadiusPct] = useState(18);
  const [paddingPct, setPaddingPct] = useState(8);

  const [isExporting, setIsExporting] = useState(false);
  const [copiedHtml, setCopiedHtml] = useState(false);
  const [doneMsg, setDoneMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isGlobalDragging, setIsGlobalDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);
  const selectHandlerRef = useRef<(files: FileList | File[] | null) => void>(() => {});

  const handleFile = async (picked: File) => {
    setErrorMsg(null);
    setDoneMsg(null);
    try {
      const img = await loadAnyIconImage(picked);
      setFile(picked);
      setLoadedImg(img);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not open icon image.');
    }
  };

  const handleFileSelect = (incoming: FileList | File[] | null) => {
    if (!incoming || incoming.length === 0) return;
    const picked = incoming[0];
    if (fileInputRef.current) fileInputRef.current.value = '';
    void handleFile(picked);
  };

  selectHandlerRef.current = handleFileSelect;

  useEffect(() => {
    void consumeHandoffFile().then((handoffFile) => {
      if (handoffFile) selectHandlerRef.current([handoffFile]);
    });
  }, []);

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

  const refreshPreview = useCallback(() => {
    if (!loadedImg) {
      setPreviewDataUrl('');
      return;
    }
    const c = renderIconToCanvas(loadedImg, 192, {
      transparentBg,
      bgColor,
      radiusPct,
      paddingPct,
    });
    setPreviewDataUrl(c.toDataURL('image/png'));
    c.width = 0;
    c.height = 0;
  }, [loadedImg, transparentBg, bgColor, radiusPct, paddingPct]);

  useEffect(() => {
    refreshPreview();
  }, [refreshPreview]);

  const handleDownloadIcoOnly = async () => {
    if (!loadedImg) return;
    setIsExporting(true);
    setErrorMsg(null);
    setDoneMsg(null);
    try {
      const frames: { size: number; pngBytes: Uint8Array }[] = [];
      for (const sz of [16, 32, 48]) {
        const c = renderIconToCanvas(loadedImg, sz, {
          transparentBg,
          bgColor,
          radiusPct,
          paddingPct,
        });
        const blob = await canvasToPngBlob(c);
        c.width = 0;
        c.height = 0;
        frames.push({ size: sz, pngBytes: new Uint8Array(await blob.arrayBuffer()) });
      }
      const icoBlob = buildMultiSizeIco(frames);
      triggerDownload(icoBlob, 'favicon.ico');
      setDoneMsg('Downloaded multi-size favicon.ico (16, 32 & 48px)');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'ICO export failed.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownloadFullPack = async () => {
    if (!loadedImg) return;
    setIsExporting(true);
    setErrorMsg(null);
    setDoneMsg(null);

    try {
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();

      const icoFrames: { size: number; pngBytes: Uint8Array }[] = [];
      const packSizes: { size: number; fileName: string; inIco?: boolean }[] = [
        { size: 16, fileName: 'favicon-16x16.png', inIco: true },
        { size: 32, fileName: 'favicon-32x32.png', inIco: true },
        { size: 48, fileName: 'favicon-48x48.png', inIco: true },
        { size: 180, fileName: 'apple-touch-icon.png' },
        { size: 192, fileName: 'android-chrome-192x192.png' },
        { size: 512, fileName: 'android-chrome-512x512.png' },
      ];

      for (const spec of packSizes) {
        const c = renderIconToCanvas(loadedImg, spec.size, {
          transparentBg,
          bgColor,
          radiusPct,
          paddingPct,
        });
        const blob = await canvasToPngBlob(c);
        c.width = 0;
        c.height = 0;
        const bytes = new Uint8Array(await blob.arrayBuffer());

        if (spec.fileName !== 'favicon-48x48.png') {
          zip.file(spec.fileName, bytes);
        }
        if (spec.inIco) {
          icoFrames.push({ size: spec.size, pngBytes: bytes });
        }
      }

      const icoBlob = buildMultiSizeIco(icoFrames);
      zip.file('favicon.ico', icoBlob);

      const cleanName = appName.trim() || 'My Website';
      const manifest = {
        name: cleanName,
        short_name: cleanName.slice(0, 14),
        icons: [
          { src: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' },
        ],
        theme_color: themeColor,
        background_color: transparentBg ? '#ffffff' : bgColor,
        display: 'standalone',
      };
      zip.file('site.webmanifest', JSON.stringify(manifest, null, 2));

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      triggerDownload(zipBlob, 'imagelab-favicon-pack.zip');
      setDoneMsg('Downloaded complete Favicon Pack ZIP (ICO + PNGs + Manifest)');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to build favicon pack.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleCopyHtml = async () => {
    try {
      await navigator.clipboard.writeText(HTML_SNIPPET);
      setCopiedHtml(true);
      setTimeout(() => setCopiedHtml(false), 1800);
    } catch {
      setErrorMsg('Clipboard access blocked. Copy the HTML snippet manually.');
    }
  };

  return (
    <div className="space-y-4 animate-fade-up">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.svg,.heic,.heif,.avif"
        className="hidden"
        onChange={(e) => handleFileSelect(e.target.files)}
      />

      {isGlobalDragging && (
        <div className="fixed inset-0 z-50 bg-zinc-950/65 backdrop-blur-md flex items-center justify-center p-6 pointer-events-none animate-scale-in">
          <div className="max-w-md w-full rounded-3xl border border-blue-400/50 bg-white/95 dark:bg-zinc-900/95 p-10 text-center shadow-2xl">
            <div className="w-16 h-16 rounded-2xl bg-blue-600 text-white flex items-center justify-center mx-auto mb-5 shadow-lg">
              <Upload className="w-7 h-7" aria-hidden="true" />
            </div>
            <p className="text-xl font-bold text-zinc-950 dark:text-white">
              Release to Generate Favicons
            </p>
          </div>
        </div>
      )}

      <div className="studio-card rounded-3xl overflow-hidden">
        {!loadedImg ? (
          <div className="p-6 sm:p-10">
            <div
              role="button"
              tabIndex={0}
              aria-label="Upload logo to generate favicons"
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
                <Globe className="w-7 h-7 text-zinc-900 dark:text-white group-hover:text-blue-600 transition-colors" aria-hidden="true" />
              </div>
              <span className="btn-studio-accent inline-flex items-center gap-2 px-7 py-3.5 rounded-2xl font-semibold text-sm sm:text-[15px]">
                Select Logo or Icon
              </span>
              <p className="text-xs sm:text-sm text-zinc-500 mt-4">
                Drop PNG, SVG, JPG, or WEBP anywhere or press{' '}
                <kbd className="px-1.5 py-0.5 text-[11px] font-semibold bg-white border border-zinc-200 rounded-md text-zinc-700">
                  Ctrl+V
                </kbd>
              </p>
              <p className="text-[11px] font-medium text-zinc-400 mt-3 uppercase tracking-wide">
                favicon.ico (16/32/48px) · Apple Touch 180px · Android 192 &amp; 512px · Manifest
              </p>
            </div>
          </div>
        ) : (
          <div className="grid lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-zinc-200/80">
            {/* Left: Style Controls */}
            <div className="lg:col-span-6 p-5 sm:p-7 space-y-5 bg-white">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-zinc-600 truncate">
                  Source: <strong className="text-zinc-900">{file?.name}</strong>
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-1.5 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-100 text-xs font-semibold text-zinc-700 cursor-pointer"
                  >
                    Change
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFile(null);
                      setLoadedImg(null);
                      setDoneMsg(null);
                    }}
                    aria-label="Remove logo"
                    className="p-2 rounded-xl border border-zinc-200 bg-white hover:text-red-600 text-zinc-500 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="fav-name" className="block text-xs font-semibold text-zinc-700 mb-1">
                    Site / App Name
                  </label>
                  <input
                    id="fav-name"
                    type="text"
                    value={appName}
                    onChange={(e) => setAppName(e.target.value)}
                    placeholder="My Website"
                    className="w-full bg-zinc-50 border border-zinc-300 rounded-xl px-3 py-2 text-sm"
                  />
                </div>

                <div>
                  <label htmlFor="fav-theme" className="block text-xs font-semibold text-zinc-700 mb-1">
                    Manifest Theme Color
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      id="fav-theme"
                      type="color"
                      value={themeColor}
                      onChange={(e) => setThemeColor(e.target.value)}
                      className="w-9 h-9 p-0.5 rounded-xl border border-zinc-300 bg-white cursor-pointer shrink-0"
                    />
                    <input
                      type="text"
                      aria-label="Manifest theme hex code"
                      value={themeColor}
                      onChange={(e) => setThemeColor(e.target.value)}
                      className="flex-1 bg-zinc-50 border border-zinc-300 rounded-xl px-3 py-2 text-xs font-mono uppercase"
                    />
                  </div>
                </div>
              </div>

              {/* Background & Shape */}
              <div className="space-y-4 pt-2 border-t border-zinc-200/80">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-700">
                    <Palette className="w-3.5 h-3.5 text-zinc-400" aria-hidden="true" />
                    Icon Background
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setTransparentBg((v) => !v)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold border cursor-pointer ${
                        transparentBg
                          ? 'bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 border-transparent'
                          : 'bg-zinc-50 text-zinc-700 border-zinc-200'
                      }`}
                    >
                      Transparent
                    </button>
                    {!transparentBg && (
                      <input
                        type="color"
                        aria-label="Icon background color"
                        value={bgColor}
                        onChange={(e) => setBgColor(e.target.value)}
                        className="w-8 h-8 p-0.5 rounded-xl border border-zinc-300 bg-white cursor-pointer"
                      />
                    )}
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs text-zinc-600 mb-1 tabular-nums">
                    <label htmlFor="fav-rad">Corner Rounding</label>
                    <span className="font-semibold text-zinc-900">{radiusPct}%</span>
                  </div>
                  <input
                    id="fav-rad"
                    type="range"
                    min={0}
                    max={50}
                    value={radiusPct}
                    onChange={(e) => setRadiusPct(Number(e.target.value))}
                    className="w-full"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs text-zinc-600 mb-1 tabular-nums">
                    <label htmlFor="fav-pad">Inner Padding</label>
                    <span className="font-semibold text-zinc-900">{paddingPct}%</span>
                  </div>
                  <input
                    id="fav-pad"
                    type="range"
                    min={0}
                    max={30}
                    value={paddingPct}
                    onChange={(e) => setPaddingPct(Number(e.target.value))}
                    className="w-full"
                  />
                </div>
              </div>

              {/* Ready-to-copy HTML head snippet */}
              <div className="space-y-2 pt-2 border-t border-zinc-200/80">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-700">
                    <Code2 className="w-3.5 h-3.5 text-blue-600" aria-hidden="true" />
                    HTML &lt;head&gt; Tags
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleCopyHtml()}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-100 text-[11px] font-semibold text-zinc-700 cursor-pointer"
                  >
                    {copiedHtml ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-600" aria-hidden="true" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" aria-hidden="true" />
                        Copy HTML
                      </>
                    )}
                  </button>
                </div>
                <pre className="p-3 rounded-xl bg-zinc-950 text-zinc-200 text-[11px] leading-relaxed overflow-x-auto font-mono">
                  {HTML_SNIPPET}
                </pre>
              </div>
            </div>

            {/* Right: Live Mockups & Download */}
            <div className="lg:col-span-6 p-5 sm:p-7 bg-zinc-50/70 flex flex-col justify-between gap-6">
              <div className="space-y-5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                  Live Browser &amp; Mobile Preview
                </p>

                {/* Browser Tab Mockup */}
                <div className="rounded-2xl border border-zinc-200/90 bg-white overflow-hidden shadow-xs">
                  <div className="px-3 pt-2.5 bg-zinc-100 border-b border-zinc-200/80 flex items-end gap-2">
                    <div className="flex items-center gap-1.5 pb-2.5 pr-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-zinc-300" />
                      <span className="w-2.5 h-2.5 rounded-full bg-zinc-300" />
                      <span className="w-2.5 h-2.5 rounded-full bg-zinc-300" />
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-t-xl bg-white border-x border-t border-zinc-200/80 max-w-[200px]">
                      {previewDataUrl && (
                        <img
                          src={previewDataUrl}
                          alt="Browser tab favicon preview"
                          className="w-4 h-4 object-contain shrink-0"
                        />
                      )}
                      <span className="text-xs font-semibold text-zinc-800 truncate">
                        {appName.trim() || 'My Website'}
                      </span>
                    </div>
                  </div>
                  <div className="px-4 py-3 text-[11px] text-zinc-400 flex items-center gap-2">
                    <Globe className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Browser tab preview (16×16)</span>
                  </div>
                </div>

                {/* Size Grid + Mobile Icon Mockup */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Desktop ICO', sizeText: '32×32', px: 'w-8 h-8' },
                    { label: 'Apple Touch', sizeText: '180×180', px: 'w-12 h-12' },
                    { label: 'PWA Icon', sizeText: '512×512', px: 'w-14 h-14' },
                  ].map((box) => (
                    <div
                      key={box.label}
                      className="rounded-2xl border border-zinc-200/80 bg-white p-3.5 flex flex-col items-center justify-center gap-2 text-center"
                    >
                      <div className="h-14 flex items-center justify-center">
                        {previewDataUrl && (
                          <img
                            src={previewDataUrl}
                            alt={box.label}
                            className={`${box.px} object-contain shadow-xs`}
                          />
                        )}
                      </div>
                      <div>
                        <p className="text-[11px] font-bold text-zinc-900">{box.label}</p>
                        <p className="text-[10px] text-zinc-400 tabular-nums">{box.sizeText}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="rounded-2xl bg-white border border-zinc-200/80 p-3.5 text-xs text-zinc-500 flex items-start gap-2.5">
                  <Smartphone className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>
                    ZIP includes <strong>favicon.ico</strong> (16/32/48px),{' '}
                    <strong>favicon-16x16.png</strong>, <strong>favicon-32x32.png</strong>,{' '}
                    <strong>apple-touch-icon.png</strong>, <strong>android-chrome 192 &amp; 512px</strong>,
                    and <strong>site.webmanifest</strong>.
                  </span>
                </div>
              </div>

              <div className="space-y-2.5">
                {doneMsg && (
                  <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>{doneMsg}</span>
                  </p>
                )}

                <div className="grid sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={isExporting}
                    onClick={() => void handleDownloadIcoOnly()}
                    className="inline-flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-100 disabled:opacity-40 text-xs sm:text-sm font-semibold text-zinc-800 transition cursor-pointer"
                  >
                    <Download className="w-4 h-4 text-blue-600" aria-hidden="true" />
                    <span>favicon.ico Only</span>
                  </button>

                  <button
                    type="button"
                    disabled={isExporting}
                    onClick={() => void handleDownloadFullPack()}
                    className="btn-studio-accent inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl disabled:opacity-40 text-xs sm:text-sm font-semibold cursor-pointer"
                  >
                    {isExporting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                        <span>Packaging...</span>
                      </>
                    ) : (
                      <>
                        <Archive className="w-4 h-4" aria-hidden="true" />
                        <span>Download Pack (ZIP)</span>
                      </>
                    )}
                  </button>
                </div>
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
