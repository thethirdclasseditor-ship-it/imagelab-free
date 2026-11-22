import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Upload,
  Palette,
  Pipette,
  Copy,
  Check,
  Download,
  Trash2,
  Lock,
  AlertCircle,
  Code2,
} from 'lucide-react';
import {
  validateImageFile,
  validateMagicBytes,
  normalizeImageBlob,
  formatFileSize,
} from '../engine/imageEngine';
import { consumeHandoffFile } from '../engine/handoff';

interface ColorSwatch {
  r: number;
  g: number;
  b: number;
  hex: string;
  rgb: string;
  hsl: string;
  textColor: '#ffffff' | '#09090b';
  sharePct?: number;
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

function rgbToHsl(r: number, g: number, b: number): string {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h /= 6;
  }

  return `hsl(${Math.round(h * 360)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;
}

function makeSwatch(r: number, g: number, b: number, sharePct?: number): ColorSwatch {
  const rr = Math.max(0, Math.min(255, Math.round(r)));
  const gg = Math.max(0, Math.min(255, Math.round(g)));
  const bb = Math.max(0, Math.min(255, Math.round(b)));
  const lum = (0.299 * rr + 0.587 * gg + 0.114 * bb) / 255;
  return {
    r: rr,
    g: gg,
    b: bb,
    hex: rgbToHex(rr, gg, bb),
    rgb: `rgb(${rr}, ${gg}, ${bb})`,
    hsl: rgbToHsl(rr, gg, bb),
    textColor: lum > 0.58 ? '#09090b' : '#ffffff',
    sharePct,
  };
}

/** Deterministic farthest-point seeded K-Means color quantization (preserves vivid brand accents) */
function extractDominantPalette(img: HTMLImageElement, count: number): ColorSwatch[] {
  const sampleMax = 140;
  const scale = Math.min(1, sampleMax / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
  const sw = Math.max(1, Math.round((img.naturalWidth || 100) * scale));
  const sh = Math.max(1, Math.round((img.naturalHeight || 100) * scale));

  const c = document.createElement('canvas');
  c.width = sw;
  c.height = sh;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) return [];

  ctx.drawImage(img, 0, 0, sw, sh);
  const data = ctx.getImageData(0, 0, sw, sh).data;
  c.width = 0;
  c.height = 0;

  const pixels: [number, number, number][] = [];
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 180) continue;
    pixels.push([data[i], data[i + 1], data[i + 2]]);
  }
  if (pixels.length === 0) return [];

  // Seed centroids using deterministic farthest-point spread so vibrant accent colors stand out
  const centroids: [number, number, number][] = [pixels[Math.floor(pixels.length / 2)]];
  while (centroids.length < count) {
    let bestIdx = 0;
    let bestDist = -1;
    const step = Math.max(1, Math.floor(pixels.length / 600));
    for (let i = 0; i < pixels.length; i += step) {
      const p = pixels[i];
      let minD = Infinity;
      for (const ct of centroids) {
        const dr = p[0] - ct[0];
        const dg = p[1] - ct[1];
        const db = p[2] - ct[2];
        const d = dr * dr + dg * dg + db * db;
        if (d < minD) minD = d;
      }
      if (minD > bestDist) {
        bestDist = minD;
        bestIdx = i;
      }
    }
    if (bestDist <= 16) break;
    centroids.push([...pixels[bestIdx]]);
  }

  const k = centroids.length;
  const counts = new Uint32Array(k);

  for (let iter = 0; iter < 8; iter++) {
    const sumR = new Float64Array(k);
    const sumG = new Float64Array(k);
    const sumB = new Float64Array(k);
    counts.fill(0);

    for (let i = 0; i < pixels.length; i++) {
      const p = pixels[i];
      let nearest = 0;
      let minD = Infinity;
      for (let j = 0; j < k; j++) {
        const ct = centroids[j];
        const dr = p[0] - ct[0];
        const dg = p[1] - ct[1];
        const db = p[2] - ct[2];
        const d = dr * dr + dg * dg + db * db;
        if (d < minD) {
          minD = d;
          nearest = j;
        }
      }
      sumR[nearest] += p[0];
      sumG[nearest] += p[1];
      sumB[nearest] += p[2];
      counts[nearest]++;
    }

    for (let j = 0; j < k; j++) {
      if (counts[j] > 0) {
        centroids[j] = [sumR[j] / counts[j], sumG[j] / counts[j], sumB[j] / counts[j]];
      }
    }
  }

  const total = pixels.length;
  const results = centroids
    .map((ct, idx) => ({
      swatch: makeSwatch(ct[0], ct[1], ct[2], Math.round((counts[idx] / total) * 100)),
      weight: counts[idx],
    }))
    .filter((item) => item.weight > 0)
    .sort((a, b) => b.weight - a.weight);

  // Deduplicate near-identical HEX results
  const seen = new Set<string>();
  return results
    .map((r) => r.swatch)
    .filter((s) => {
      if (seen.has(s.hex)) return false;
      seen.add(s.hex);
      return true;
    });
}

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

export default function ColorPaletteTool() {
  const [file, setFile] = useState<File | null>(null);
  const [loadedImg, setLoadedImg] = useState<HTMLImageElement | null>(null);
  const [paletteSize, setPaletteSize] = useState<number>(6);
  const [palette, setPalette] = useState<ColorSwatch[]>([]);
  const [pickedColor, setPickedColor] = useState<ColorSwatch | null>(null);
  const [pickerDot, setPickerDot] = useState<{ xPct: number; yPct: number } | null>(null);

  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isGlobalDragging, setIsGlobalDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragDepthRef = useRef(0);
  const selectHandlerRef = useRef<(files: FileList | File[] | null) => void>(() => {});

  const loadSelectedFile = async (picked: File) => {
    setErrorMsg(null);
    setPickedColor(null);
    setPickerDot(null);

    try {
      const isSvg = picked.type === 'image/svg+xml' || /\.svg$/i.test(picked.name);
      let img: HTMLImageElement;

      if (isSvg) {
        const text = await picked.text();
        const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
        if (doc.querySelector('parsererror')) throw new Error('Invalid SVG file.');
        const svgEl = doc.documentElement;
        svgEl.querySelectorAll('script').forEach((n) => n.remove());
        if (!svgEl.getAttribute('xmlns')) svgEl.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        svgEl.setAttribute('width', '800');
        svgEl.setAttribute('height', '800');
        const blob = new Blob([new XMLSerializer().serializeToString(svgEl)], {
          type: 'image/svg+xml;charset=utf-8',
        });
        const url = URL.createObjectURL(blob);
        img = await new Promise((resolve, reject) => {
          const el = new Image();
          el.onload = () => {
            URL.revokeObjectURL(url);
            resolve(el);
          };
          el.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Could not load SVG.'));
          };
          el.src = url;
        });
      } else {
        const valErr = validateImageFile(picked);
        if (valErr) throw new Error(valErr);
        const sigErr = await validateMagicBytes(picked);
        if (sigErr) throw new Error(sigErr);
        const normalized = await normalizeImageBlob(picked);
        const url = URL.createObjectURL(normalized);
        img = await new Promise((resolve, reject) => {
          const el = new Image();
          el.onload = () => {
            URL.revokeObjectURL(url);
            resolve(el);
          };
          el.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Could not decode this image.'));
          };
          el.src = url;
        });
      }

      setFile(picked);
      setLoadedImg(img);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not open image.');
    }
  };

  const handleFileSelect = (incoming: FileList | File[] | null) => {
    if (!incoming || incoming.length === 0) return;
    const picked = incoming[0];
    if (fileInputRef.current) fileInputRef.current.value = '';
    void loadSelectedFile(picked);
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

  // Render interactive eyedropper canvas & extract dominant colors
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !loadedImg) return;
    const maxDim = 900;
    const scale = Math.min(1, maxDim / Math.max(loadedImg.naturalWidth, loadedImg.naturalHeight));
    canvas.width = Math.max(1, Math.round(loadedImg.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(loadedImg.naturalHeight * scale));
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(loadedImg, 0, 0, canvas.width, canvas.height);
  }, [loadedImg]);

  useEffect(() => {
    drawCanvas();
    if (loadedImg) {
      setPalette(extractDominantPalette(loadedImg, paletteSize));
    } else {
      setPalette([]);
    }
  }, [loadedImg, paletteSize, drawCanvas]);

  const sampleCanvasAt = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const ny = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    const px = Math.min(canvas.width - 1, Math.floor(nx * canvas.width));
    const py = Math.min(canvas.height - 1, Math.floor(ny * canvas.height));

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    const pixel = ctx.getImageData(px, py, 1, 1).data;
    setPickedColor(makeSwatch(pixel[0], pixel[1], pixel[2]));
    setPickerDot({ xPct: nx * 100, yPct: ny * 100 });
  };

  const copyValue = async (key: string, val: string) => {
    try {
      await navigator.clipboard.writeText(val);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 1500);
    } catch {
      setErrorMsg('Clipboard access blocked. Copy the color value manually.');
    }
  };

  const handleCopyCss = () => {
    if (palette.length === 0) return;
    const lines = palette.map((c, idx) => `  --brand-color-${idx + 1}: ${c.hex};`);
    void copyValue('css-all', `:root {\n${lines.join('\n')}\n}`);
  };

  const handleDownloadPaletteCard = () => {
    if (palette.length === 0) return;
    const w = 1200;
    const h = 420;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    if (!ctx) return;

    const colW = w / palette.length;
    palette.forEach((swatch, idx) => {
      const x = idx * colW;
      ctx.fillStyle = swatch.hex;
      ctx.fillRect(x, 0, Math.ceil(colW), h);

      ctx.fillStyle = swatch.textColor;
      ctx.font = '700 22px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(swatch.hex, x + colW / 2, h - 54);

      ctx.globalAlpha = 0.78;
      ctx.font = '500 13px system-ui, -apple-system, sans-serif';
      ctx.fillText(swatch.rgb, x + colW / 2, h - 28);
      ctx.globalAlpha = 1;
    });

    c.toBlob((blob) => {
      c.width = 0;
      c.height = 0;
      if (blob) {
        const base = (file?.name || 'palette').replace(/\.[^/.]+$/, '');
        triggerDownload(blob, `${base}_palette.png`);
      }
    }, 'image/png');
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
              Release to Extract Colors
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
              aria-label="Select photo or logo to extract color palette"
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
                <Palette className="w-7 h-7 text-zinc-900 dark:text-white group-hover:text-blue-600 transition-colors" aria-hidden="true" />
              </div>
              <span className="btn-studio-accent inline-flex items-center gap-2 px-7 py-3.5 rounded-2xl font-semibold text-sm sm:text-[15px]">
                Select Image or Logo
              </span>
              <p className="text-xs sm:text-sm text-zinc-500 mt-4">
                Drop anywhere or press{' '}
                <kbd className="px-1.5 py-0.5 text-[11px] font-semibold bg-white border border-zinc-200 rounded-md text-zinc-700">
                  Ctrl+V
                </kbd>
              </p>
              <p className="text-[11px] font-medium text-zinc-400 mt-3 uppercase tracking-wide">
                Auto Dominant Palette · Live Pixel Eyedropper · HEX, RGB, HSL &amp; CSS Export
              </p>
            </div>
          </div>
        ) : (
          <div className="grid lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-zinc-200/80">
            {/* Left: Interactive Eyedropper Stage */}
            <div className="lg:col-span-6 bg-zinc-950 p-4 sm:p-6 flex flex-col justify-between gap-4 select-none">
              <div className="flex items-center justify-between gap-2 text-xs text-zinc-400">
                <span className="truncate font-medium">
                  {file?.name} {file ? `· ${formatFileSize(file.size)}` : ''}
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold cursor-pointer"
                  >
                    Change
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFile(null);
                      setLoadedImg(null);
                      setPickedColor(null);
                      setPickerDot(null);
                    }}
                    aria-label="Remove image"
                    className="p-2 rounded-xl bg-white/10 hover:bg-red-500/80 text-white cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>

              <div className="flex-1 flex flex-col items-center justify-center gap-2.5 min-h-[260px]">
                <p className="text-[11px] text-zinc-400 inline-flex items-center gap-1.5">
                  <Pipette className="w-3.5 h-3.5 text-blue-400" aria-hidden="true" />
                  <span>Click anywhere on the image to pick an exact pixel color</span>
                </p>

                <div className="relative inline-block max-w-full leading-none">
                  <canvas
                    ref={canvasRef}
                    onPointerDown={sampleCanvasAt}
                    className="max-h-[48vh] max-w-full w-auto h-auto rounded-xl shadow-2xl cursor-crosshair block"
                  />
                  {pickerDot && pickedColor && (
                    <span
                      className="pointer-events-none absolute w-5 h-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_2px_rgba(0,0,0,0.65)]"
                      style={{
                        left: `${pickerDot.xPct}%`,
                        top: `${pickerDot.yPct}%`,
                        backgroundColor: pickedColor.hex,
                      }}
                    />
                  )}
                </div>
              </div>

              {/* Inspected Pixel Swatch Bar */}
              {pickedColor && (
                <div className="rounded-2xl bg-zinc-900 border border-white/10 p-3 flex flex-wrap items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2.5">
                    <span
                      className="w-9 h-9 rounded-xl border border-white/20 shrink-0"
                      style={{ backgroundColor: pickedColor.hex }}
                    />
                    <div>
                      <p className="text-xs font-bold text-white tabular-nums">{pickedColor.hex}</p>
                      <p className="text-[11px] text-zinc-400 tabular-nums">{pickedColor.rgb}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {(
                      [
                        { k: 'pick-hex', label: 'HEX', val: pickedColor.hex },
                        { k: 'pick-rgb', label: 'RGB', val: pickedColor.rgb },
                        { k: 'pick-hsl', label: 'HSL', val: pickedColor.hsl },
                      ] as const
                    ).map((btn) => (
                      <button
                        key={btn.k}
                        type="button"
                        onClick={() => void copyValue(btn.k, btn.val)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[11px] font-semibold cursor-pointer"
                      >
                        {copiedKey === btn.k ? (
                          <Check className="w-3 h-3 text-emerald-400" aria-hidden="true" />
                        ) : (
                          <Copy className="w-3 h-3" aria-hidden="true" />
                        )}
                        <span>{btn.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right: Extracted Dominant Palette */}
            <div className="lg:col-span-6 p-5 sm:p-6 bg-white flex flex-col justify-between gap-5">
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                    Dominant Palette
                  </span>
                  <div className="inline-flex bg-zinc-200/70 dark:bg-zinc-800 p-0.5 rounded-xl gap-0.5 text-xs">
                    {[5, 6, 8].map((cnt) => (
                      <button
                        key={cnt}
                        type="button"
                        onClick={() => setPaletteSize(cnt)}
                        className={`px-2.5 py-1 rounded-[10px] font-semibold tabular-nums cursor-pointer ${
                          paletteSize === cnt
                            ? 'bg-white dark:bg-zinc-950 text-zinc-950 dark:text-white shadow-xs'
                            : 'text-zinc-600'
                        }`}
                      >
                        {cnt} Colors
                      </button>
                    ))}
                  </div>
                </div>

                {/* Visual Color Strip */}
                <div className="h-14 rounded-2xl overflow-hidden flex border border-zinc-200/80 shadow-xs">
                  {palette.map((c) => (
                    <button
                      key={c.hex}
                      type="button"
                      title={`Copy ${c.hex}`}
                      onClick={() => void copyValue(`strip-${c.hex}`, c.hex)}
                      className="flex-1 h-full transition-all hover:flex-[1.5] flex items-center justify-center cursor-pointer"
                      style={{ backgroundColor: c.hex, color: c.textColor }}
                    >
                      {copiedKey === `strip-${c.hex}` && (
                        <Check className="w-4 h-4" aria-hidden="true" />
                      )}
                    </button>
                  ))}
                </div>

                {/* Detailed Swatch List */}
                <div className="divide-y divide-zinc-100 rounded-2xl border border-zinc-200/80 overflow-hidden">
                  {palette.map((c) => (
                    <div
                      key={c.hex}
                      className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 hover:bg-zinc-50 transition"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className="w-8 h-8 rounded-xl border border-black/10 shrink-0 shadow-xs"
                          style={{ backgroundColor: c.hex }}
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-zinc-900 font-mono">
                              {c.hex}
                            </span>
                            {typeof c.sharePct === 'number' && c.sharePct > 0 && (
                              <span className="text-[10.5px] text-zinc-400 tabular-nums">
                                {c.sharePct}%
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-zinc-500 tabular-nums truncate">
                            {c.rgb} · {c.hsl}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => void copyValue(`hex-${c.hex}`, c.hex)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-100 text-[11px] font-semibold text-zinc-700 cursor-pointer"
                        >
                          {copiedKey === `hex-${c.hex}` ? (
                            <Check className="w-3 h-3 text-emerald-600" aria-hidden="true" />
                          ) : (
                            <Copy className="w-3 h-3" aria-hidden="true" />
                          )}
                          <span>HEX</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => void copyValue(`rgb-${c.hex}`, c.rgb)}
                          className="px-2 py-1.5 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-100 text-[11px] font-semibold text-zinc-600 cursor-pointer"
                        >
                          {copiedKey === `rgb-${c.hex}` ? 'Copied' : 'RGB'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-2 pt-2 border-t border-zinc-200/80">
                <button
                  type="button"
                  onClick={handleCopyCss}
                  className="inline-flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-100 text-xs sm:text-sm font-semibold text-zinc-800 transition cursor-pointer"
                >
                  {copiedKey === 'css-all' ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-600" aria-hidden="true" />
                      <span>Copied CSS!</span>
                    </>
                  ) : (
                    <>
                      <Code2 className="w-4 h-4 text-blue-600" aria-hidden="true" />
                      <span>Copy CSS Variables</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleDownloadPaletteCard}
                  className="btn-studio-accent inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-semibold cursor-pointer"
                >
                  <Download className="w-4 h-4" aria-hidden="true" />
                  <span>Save Palette PNG</span>
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
