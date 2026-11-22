import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Upload,
  Download,
  EyeOff,
  Square,
  Paintbrush,
  Undo2,
  RotateCcw,
  Trash2,
  Lock,
  Loader2,
  AlertCircle,
  CheckCircle2,
  LayoutGrid,
  Droplets,
  Ban,
} from 'lucide-react';
import {
  encodeCanvasWithCodec,
  formatFileSize,
  validateImageFile,
  validateMagicBytes,
  normalizeImageBlob,
  MAX_SAFE_CANVAS_PIXELS,
  type SupportedFormat,
} from '../engine/imageEngine';
import { consumeHandoffFile } from '../engine/handoff';
import ContinueToMenu from './ContinueToMenu';

type DrawTool = 'box' | 'brush';
type RedactEffect = 'pixelate' | 'blur' | 'blackout';

interface NormPoint {
  x: number;
  y: number;
}

type RedactAction =
  | {
      kind: 'box';
      effect: RedactEffect;
      strength: number;
      x: number;
      y: number;
      w: number;
      h: number;
    }
  | {
      kind: 'brush';
      effect: RedactEffect;
      strength: number;
      brushPct: number;
      points: NormPoint[];
    };

function triggerBlobDownload(blob: Blob, fileName: string) {
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
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  return 'jpg';
}

function renderEffectSlice(
  source: HTMLCanvasElement,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  effect: RedactEffect,
  strength: number,
  baseDim: number
): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.width = sw;
  out.height = sh;
  const oCtx = out.getContext('2d');
  if (!oCtx) return out;

  if (effect === 'blackout') {
    oCtx.fillStyle = '#09090b';
    oCtx.fillRect(0, 0, sw, sh);
    return out;
  }

  const blockPx = Math.max(4, Math.round(baseDim * (strength / 100) * 0.045 + 4));
  const tinyW = Math.max(1, Math.round(sw / blockPx));
  const tinyH = Math.max(1, Math.round(sh / blockPx));

  const tiny = document.createElement('canvas');
  tiny.width = tinyW;
  tiny.height = tinyH;
  const tCtx = tiny.getContext('2d');
  if (!tCtx) return out;

  tCtx.imageSmoothingEnabled = true;
  tCtx.imageSmoothingQuality = 'medium';
  tCtx.drawImage(source, sx, sy, sw, sh, 0, 0, tinyW, tinyH);

  if (effect === 'pixelate') {
    oCtx.imageSmoothingEnabled = false;
    oCtx.drawImage(tiny, 0, 0, tinyW, tinyH, 0, 0, sw, sh);
  } else {
    oCtx.imageSmoothingEnabled = true;
    oCtx.imageSmoothingQuality = 'high';
    oCtx.drawImage(tiny, 0, 0, tinyW, tinyH, 0, 0, sw, sh);

    const tiny2W = Math.max(1, Math.round(tinyW * 0.85));
    const tiny2H = Math.max(1, Math.round(tinyH * 0.85));
    tiny.width = tiny2W;
    tiny.height = tiny2H;
    tCtx.drawImage(out, 0, 0, sw, sh, 0, 0, tiny2W, tiny2H);
    oCtx.drawImage(tiny, 0, 0, tiny2W, tiny2H, 0, 0, sw, sh);
  }

  tiny.width = 0;
  tiny.height = 0;
  return out;
}

function applyRedactAction(
  ctx: CanvasRenderingContext2D,
  sourceCanvas: HTMLCanvasElement,
  w: number,
  h: number,
  action: RedactAction
) {
  const baseDim = Math.min(w, h);

  if (action.kind === 'box') {
    const rx = Math.max(0, Math.round(Math.min(action.x, action.x + action.w) * w));
    const ry = Math.max(0, Math.round(Math.min(action.y, action.y + action.h) * h));
    const rw = Math.min(w - rx, Math.max(1, Math.round(Math.abs(action.w) * w)));
    const rh = Math.min(h - ry, Math.max(1, Math.round(Math.abs(action.h) * h)));
    if (rw <= 1 || rh <= 1) return;

    if (action.effect === 'blackout') {
      ctx.fillStyle = '#09090b';
      ctx.fillRect(rx, ry, rw, rh);
      return;
    }

    const slice = renderEffectSlice(
      sourceCanvas,
      rx,
      ry,
      rw,
      rh,
      action.effect,
      action.strength,
      baseDim
    );
    ctx.drawImage(slice, rx, ry);
    slice.width = 0;
    slice.height = 0;
    return;
  }

  if (action.points.length === 0) return;
  const brushPx = Math.max(8, Math.round((baseDim * action.brushPct) / 100));

  if (action.effect === 'blackout') {
    ctx.save();
    ctx.strokeStyle = '#09090b';
    ctx.fillStyle = '#09090b';
    ctx.lineWidth = brushPx;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (action.points.length === 1) {
      ctx.beginPath();
      ctx.arc(action.points[0].x * w, action.points[0].y * h, brushPx / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(action.points[0].x * w, action.points[0].y * h);
      for (let i = 1; i < action.points.length; i++) {
        ctx.lineTo(action.points[i].x * w, action.points[i].y * h);
      }
      ctx.stroke();
    }
    ctx.restore();
    return;
  }

  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;
  for (const pt of action.points) {
    if (pt.x < minX) minX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y > maxY) maxY = pt.y;
  }

  const pad = Math.ceil(brushPx / 2) + 4;
  const bx = Math.max(0, Math.floor(minX * w - pad));
  const by = Math.max(0, Math.floor(minY * h - pad));
  const bx2 = Math.min(w, Math.ceil(maxX * w + pad));
  const by2 = Math.min(h, Math.ceil(maxY * h + pad));
  const bw = Math.max(1, bx2 - bx);
  const bh = Math.max(1, by2 - by);

  const mask = document.createElement('canvas');
  mask.width = bw;
  mask.height = bh;
  const mCtx = mask.getContext('2d');
  if (!mCtx) return;

  mCtx.strokeStyle = '#ffffff';
  mCtx.fillStyle = '#ffffff';
  mCtx.lineWidth = brushPx;
  mCtx.lineCap = 'round';
  mCtx.lineJoin = 'round';

  if (action.points.length === 1) {
    mCtx.beginPath();
    mCtx.arc(action.points[0].x * w - bx, action.points[0].y * h - by, brushPx / 2, 0, Math.PI * 2);
    mCtx.fill();
  } else {
    mCtx.beginPath();
    mCtx.moveTo(action.points[0].x * w - bx, action.points[0].y * h - by);
    for (let i = 1; i < action.points.length; i++) {
      mCtx.lineTo(action.points[i].x * w - bx, action.points[i].y * h - by);
    }
    mCtx.stroke();
  }

  const slice = renderEffectSlice(
    sourceCanvas,
    bx,
    by,
    bw,
    bh,
    action.effect,
    action.strength,
    baseDim
  );

  mCtx.globalCompositeOperation = 'source-in';
  mCtx.drawImage(slice, 0, 0);
  ctx.drawImage(mask, bx, by);

  slice.width = 0;
  slice.height = 0;
  mask.width = 0;
  mask.height = 0;
}

export default function PrivacyBlurTool() {
  const [file, setFile] = useState<File | null>(null);
  const [loadedImg, setLoadedImg] = useState<HTMLImageElement | null>(null);
  const [actions, setActions] = useState<RedactAction[]>([]);
  const [activeAction, setActiveAction] = useState<RedactAction | null>(null);

  const [drawTool, setDrawTool] = useState<DrawTool>('box');
  const [effect, setEffect] = useState<RedactEffect>('pixelate');
  const [strength, setStrength] = useState<number>(50);
  const [brushPct, setBrushPct] = useState<number>(8);
  const [format, setFormat] = useState<SupportedFormat>('image/jpeg');

  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isGlobalDragging, setIsGlobalDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sourcePreviewRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const dragDepthRef = useRef(0);
  const selectHandlerRef = useRef<(files: FileList | File[] | null) => void>(() => {});

  const loadSelectedFile = async (picked: File) => {
    const valErr = validateImageFile(picked);
    if (valErr) {
      setErrorMsg(valErr);
      return;
    }
    const sigErr = await validateMagicBytes(picked);
    if (sigErr) {
      setErrorMsg(sigErr);
      return;
    }

    setErrorMsg(null);
    setStatusMsg(null);
    setIsLoadingFile(true);
    setActions([]);
    setActiveAction(null);

    try {
      const normalized = await normalizeImageBlob(picked);
      const url = URL.createObjectURL(normalized);
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
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

      const scale = Math.min(1, 1100 / Math.max(img.naturalWidth, img.naturalHeight));
      const pw = Math.max(1, Math.round(img.naturalWidth * scale));
      const ph = Math.max(1, Math.round(img.naturalHeight * scale));
      const srcCanvas = document.createElement('canvas');
      srcCanvas.width = pw;
      srcCanvas.height = ph;
      const sCtx = srcCanvas.getContext('2d');
      sCtx?.drawImage(img, 0, 0, pw, ph);
      sourcePreviewRef.current = srcCanvas;

      setFile(picked);
      setLoadedImg(img);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to load image.');
    } finally {
      setIsLoadingFile(false);
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
      if (handoffFile) {
        selectHandlerRef.current([handoffFile]);
      }
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

  const redrawPreview = useCallback(() => {
    const canvas = canvasRef.current;
    const src = sourcePreviewRef.current;
    if (!canvas || !src) return;

    canvas.width = src.width;
    canvas.height = src.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(src, 0, 0);

    for (const act of actions) {
      applyRedactAction(ctx, src, src.width, src.height, act);
    }
    if (activeAction) {
      applyRedactAction(ctx, src, src.width, src.height, activeAction);
      if (activeAction.kind === 'box') {
        const rx = Math.min(activeAction.x, activeAction.x + activeAction.w) * src.width;
        const ry = Math.min(activeAction.y, activeAction.y + activeAction.h) * src.height;
        const rw = Math.abs(activeAction.w) * src.width;
        const rh = Math.abs(activeAction.h) * src.height;
        ctx.save();
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(rx, ry, rw, rh);
        ctx.restore();
      }
    }
  }, [actions, activeAction]);

  useEffect(() => {
    redrawPreview();
  }, [redrawPreview]);

  const getNormPoint = (e: React.PointerEvent<HTMLCanvasElement>): NormPoint => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    setStatusMsg(null);
    const pt = getNormPoint(e);

    if (drawTool === 'box') {
      setActiveAction({
        kind: 'box',
        effect,
        strength,
        x: pt.x,
        y: pt.y,
        w: 0,
        h: 0,
      });
    } else {
      setActiveAction({
        kind: 'brush',
        effect,
        strength,
        brushPct,
        points: [pt],
      });
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const pt = getNormPoint(e);

    setActiveAction((prev) => {
      if (!prev) return null;
      if (prev.kind === 'box') {
        return { ...prev, w: pt.x - prev.x, h: pt.y - prev.y };
      }
      return { ...prev, points: [...prev.points, pt] };
    });
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }

    setActiveAction((curr) => {
      if (curr) {
        const isTinyBox = curr.kind === 'box' && (Math.abs(curr.w) < 0.01 || Math.abs(curr.h) < 0.01);
        if (!isTinyBox) {
          setActions((prev) => [...prev, curr]);
        }
      }
      return null;
    });
  };

  const buildRedactedExport = async (): Promise<{
    blob: Blob;
    fileName: string;
    encoderUsed: string;
  } | null> => {
    if (!file || !loadedImg) return null;

    let w = loadedImg.naturalWidth;
    let h = loadedImg.naturalHeight;
    if (w * h > MAX_SAFE_CANVAS_PIXELS) {
      const s = Math.sqrt(MAX_SAFE_CANVAS_PIXELS / (w * h));
      w = Math.max(1, Math.floor(w * s));
      h = Math.max(1, Math.floor(h * s));
    }

    const fullSource = document.createElement('canvas');
    fullSource.width = w;
    fullSource.height = h;
    const fsCtx = fullSource.getContext('2d');
    if (!fsCtx) throw new Error('Canvas unavailable.');
    if (format === 'image/jpeg') {
      fsCtx.fillStyle = '#FFFFFF';
      fsCtx.fillRect(0, 0, w, h);
    }
    fsCtx.imageSmoothingEnabled = true;
    fsCtx.imageSmoothingQuality = 'high';
    fsCtx.drawImage(loadedImg, 0, 0, w, h);

    const outCanvas = document.createElement('canvas');
    outCanvas.width = w;
    outCanvas.height = h;
    const outCtx = outCanvas.getContext('2d', { willReadFrequently: true });
    if (!outCtx) throw new Error('Canvas unavailable.');
    outCtx.drawImage(fullSource, 0, 0);

    for (const act of actions) {
      applyRedactAction(outCtx, fullSource, w, h, act);
    }

    const encoded = await encodeCanvasWithCodec(
      outCanvas,
      format,
      format === 'image/png' ? 1 : 0.9
    );

    fullSource.width = 0;
    fullSource.height = 0;
    outCanvas.width = 0;
    outCanvas.height = 0;

    const baseName = file.name.replace(/\.[^/.]+$/, '');
    const ext = getExt(encoded.blob.type || format);
    return {
      blob: encoded.blob,
      fileName: `${baseName}_redacted.${ext}`,
      encoderUsed: encoded.encoderUsed,
    };
  };

  const handleExport = async () => {
    setIsExporting(true);
    setErrorMsg(null);
    setStatusMsg(null);

    try {
      const out = await buildRedactedExport();
      if (!out) return;
      triggerBlobDownload(out.blob, out.fileName);
      setStatusMsg(`Saved (${formatFileSize(out.blob.size)} · ${out.encoderUsed})`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Export failed.');
    } finally {
      setIsExporting(false);
    }
  };

  const resetAll = () => {
    setFile(null);
    setLoadedImg(null);
    setActions([]);
    setActiveAction(null);
    setStatusMsg(null);
    setErrorMsg(null);
    if (sourcePreviewRef.current) {
      sourcePreviewRef.current.width = 0;
      sourcePreviewRef.current.height = 0;
      sourcePreviewRef.current = null;
    }
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
            <div className="w-16 h-16 rounded-2xl bg-blue-600 text-white flex items-center justify-center mx-auto mb-5 shadow-lg">
              <Upload className="w-7 h-7" />
            </div>
            <p className="text-xl font-bold text-zinc-950 dark:text-white">
              Release to Blur / Redact Photo
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
              aria-label="Select photo to blur or redact"
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              onClick={() => fileInputRef.current?.click()}
              className="group min-h-[320px] sm:min-h-[360px] flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 hover:border-blue-500/70 bg-zinc-50/60 hover:bg-blue-50/20 dark:hover:bg-blue-950/15 p-8 text-center cursor-pointer transition-all"
            >
              {isLoadingFile ? (
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                  <p className="text-sm font-semibold text-zinc-700">Loading photo...</p>
                </div>
              ) : (
                <>
                  <div className="w-16 h-16 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 shadow-sm flex items-center justify-center mb-6 group-hover:-translate-y-1 transition-transform">
                    <EyeOff className="w-7 h-7 text-zinc-900 dark:text-white group-hover:text-blue-600 transition-colors" />
                  </div>
                  <span className="btn-studio-accent inline-flex items-center gap-2 px-7 py-3.5 rounded-2xl font-semibold text-sm sm:text-[15px]">
                    Select Photo to Redact
                  </span>
                  <p className="text-xs sm:text-sm text-zinc-500 mt-4">
                    Drop anywhere or press{' '}
                    <kbd className="px-1.5 py-0.5 text-[11px] font-semibold bg-white border border-zinc-200 rounded-md text-zinc-700">
                      Ctrl+V
                    </kbd>
                  </p>
                  <p className="text-[11px] font-medium text-zinc-400 mt-3 uppercase tracking-wide">
                    Pixelate · Smooth Blur · Solid Blackout · Strips EXIF Automatically
                  </p>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="divide-y divide-zinc-200/80">
            <div className="p-4 sm:px-6 bg-zinc-50/80 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex bg-zinc-200/70 dark:bg-zinc-800 p-0.5 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setDrawTool('box')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] text-xs font-semibold cursor-pointer ${
                      drawTool === 'box'
                        ? 'bg-white dark:bg-zinc-950 text-zinc-950 dark:text-white shadow-xs'
                        : 'text-zinc-600'
                    }`}
                  >
                    <Square className="w-3.5 h-3.5" /> Box
                  </button>
                  <button
                    type="button"
                    onClick={() => setDrawTool('brush')}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] text-xs font-semibold cursor-pointer ${
                      drawTool === 'brush'
                        ? 'bg-white dark:bg-zinc-950 text-zinc-950 dark:text-white shadow-xs'
                        : 'text-zinc-600'
                    }`}
                  >
                    <Paintbrush className="w-3.5 h-3.5" /> Brush
                  </button>
                </div>

                <div className="inline-flex bg-zinc-200/70 dark:bg-zinc-800 p-0.5 rounded-xl">
                  {(
                    [
                      { id: 'pixelate', label: 'Pixelate', icon: <LayoutGrid className="w-3.5 h-3.5" /> },
                      { id: 'blur', label: 'Blur', icon: <Droplets className="w-3.5 h-3.5" /> },
                      { id: 'blackout', label: 'Blackout', icon: <Ban className="w-3.5 h-3.5" /> },
                    ] as const
                  ).map((ef) => (
                    <button
                      key={ef.id}
                      type="button"
                      onClick={() => setEffect(ef.id)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] text-xs font-semibold cursor-pointer ${
                        effect === ef.id
                          ? 'bg-white dark:bg-zinc-950 text-zinc-950 dark:text-white shadow-xs'
                          : 'text-zinc-600'
                      }`}
                    >
                      {ef.icon}
                      <span>{ef.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={actions.length === 0}
                  onClick={() => setActions((prev) => prev.slice(0, -1))}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-100 disabled:opacity-35 text-xs font-semibold text-zinc-700 cursor-pointer"
                >
                  <Undo2 className="w-3.5 h-3.5" /> Undo
                </button>
                <button
                  type="button"
                  disabled={actions.length === 0}
                  onClick={() => setActions([])}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-100 disabled:opacity-35 text-xs font-semibold text-zinc-700 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Clear
                </button>
                <button
                  type="button"
                  onClick={resetAll}
                  aria-label="Remove image"
                  className="p-2 rounded-xl border border-zinc-200 bg-white hover:text-red-600 text-zinc-500 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {(effect !== 'blackout' || drawTool === 'brush') && (
              <div className="px-5 sm:px-6 py-3 bg-zinc-50/50 flex flex-wrap items-center gap-6 text-xs">
                {effect !== 'blackout' && (
                  <div className="flex items-center gap-2.5 tabular-nums">
                    <label htmlFor="redact-strength" className="font-semibold text-zinc-600">
                      {effect === 'pixelate' ? 'Block Size' : 'Blur Strength'} ({strength}%)
                    </label>
                    <input
                      id="redact-strength"
                      type="range"
                      min={15}
                      max={100}
                      value={strength}
                      onChange={(e) => setStrength(Number(e.target.value))}
                      className="w-28"
                    />
                  </div>
                )}
                {drawTool === 'brush' && (
                  <div className="flex items-center gap-2.5 tabular-nums">
                    <label htmlFor="redact-brush" className="font-semibold text-zinc-600">
                      Brush Size ({brushPct}%)
                    </label>
                    <input
                      id="redact-brush"
                      type="range"
                      min={2}
                      max={22}
                      value={brushPct}
                      onChange={(e) => setBrushPct(Number(e.target.value))}
                      className="w-28"
                    />
                  </div>
                )}
              </div>
            )}

            <div className="bg-zinc-950 p-4 sm:p-6 flex flex-col items-center justify-center gap-3 select-none">
              <p className="text-[11px] text-zinc-400">
                {drawTool === 'box'
                  ? 'Drag a rectangle over faces, text, license plates, or ID numbers'
                  : 'Paint directly over sensitive areas to redact them'}
              </p>
              <canvas
                ref={canvasRef}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                className="max-h-[56vh] max-w-full w-auto h-auto rounded-xl shadow-2xl cursor-crosshair touch-none"
              />
            </div>

            <div className="p-4 sm:px-6 bg-zinc-50/80 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <select
                  aria-label="Output format"
                  value={format}
                  onChange={(e) => setFormat(e.target.value as SupportedFormat)}
                  className="bg-white border border-zinc-300 rounded-xl px-3 py-2 font-semibold"
                >
                  <option value="image/jpeg">JPG · MozJPEG</option>
                  <option value="image/png">PNG · Lossless</option>
                  <option value="image/webp">WEBP</option>
                </select>

                <span className="text-zinc-500 tabular-nums">
                  {actions.length} {actions.length === 1 ? 'area' : 'areas'} redacted
                </span>

                {statusMsg && (
                  <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    {statusMsg}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">
                <ContinueToMenu
                  currentPath="/blur-image"
                  disabled={isExporting}
                  onPrepareFile={async () => {
                    const out = await buildRedactedExport();
                    return out ? { blob: out.blob, fileName: out.fileName } : null;
                  }}
                />

                <button
                  type="button"
                  disabled={isExporting}
                  onClick={() => void handleExport()}
                  className="btn-studio-accent inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl disabled:opacity-40 text-xs sm:text-sm font-semibold cursor-pointer"
                >
                  {isExporting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      <span>Download Redacted</span>
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
        <span>100% Private · Sensitive images are redacted locally and never leave your device</span>
      </p>
    </div>
  );
}
