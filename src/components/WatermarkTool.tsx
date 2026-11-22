import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Upload,
  Download,
  Archive,
  Stamp,
  Type,
  Image as ImageIcon,
  Trash2,
  Plus,
  Lock,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Zap,
  Layers,
  LayoutGrid,
  Maximize2,
  Eye,
  RotateCw,
} from 'lucide-react';
import {
  encodeCanvasWithCodec,
  validateImageFile,
  validateMagicBytes,
  normalizeImageBlob,
  MAX_SAFE_CANVAS_PIXELS,
  type SupportedFormat,
} from '../engine/imageEngine';

type WatermarkKind = 'text' | 'logo';
type LayoutPattern = 'single' | 'tile';
type GridPosition = 'tl' | 'tc' | 'tr' | 'ml' | 'mc' | 'mr' | 'bl' | 'bc' | 'br';

const MAX_BATCH = 20;

const POSITIONS: { id: GridPosition; label: string }[] = [
  { id: 'tl', label: '↖' },
  { id: 'tc', label: '↑' },
  { id: 'tr', label: '↗' },
  { id: 'ml', label: '←' },
  { id: 'mc', label: '●' },
  { id: 'mr', label: '→' },
  { id: 'bl', label: '↙' },
  { id: 'bc', label: '↓' },
  { id: 'br', label: '↘' },
];

const WATERMARK_FORMATS: { id: SupportedFormat; label: string; icon: React.ReactNode }[] = [
  { id: 'image/jpeg', label: 'JPG', icon: <ImageIcon className="w-3.5 h-3.5" aria-hidden="true" /> },
  { id: 'image/webp', label: 'WEBP', icon: <Zap className="w-3.5 h-3.5" aria-hidden="true" /> },
  { id: 'image/png', label: 'PNG', icon: <Layers className="w-3.5 h-3.5" aria-hidden="true" /> },
];

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

function drawWatermarkOnCanvas(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  opts: {
    kind: WatermarkKind;
    text: string;
    color: string;
    sizePct: number;
    opacity: number;
    rotation: number;
    layout: LayoutPattern;
    position: GridPosition;
    logoImg: HTMLImageElement | null;
  }
) {
  ctx.save();
  ctx.globalAlpha = Math.max(0.05, Math.min(1, opts.opacity / 100));

  const baseDim = Math.min(w, h);
  const pad = Math.round(baseDim * 0.045);

  const drawSingleMark = (cx: number, cy: number) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((opts.rotation * Math.PI) / 180);

    if (opts.kind === 'text') {
      const text = opts.text.trim() || 'ImageLab';
      const fontSize = Math.max(12, Math.round((baseDim * opts.sizePct) / 100));
      ctx.font = `700 ${fontSize}px system-ui, -apple-system, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
      ctx.shadowBlur = Math.max(2, fontSize * 0.14);
      ctx.fillStyle = opts.color;
      ctx.fillText(text, 0, 0);
    } else if (opts.logoImg) {
      const targetW = Math.max(24, (w * opts.sizePct) / 100);
      const ratio = opts.logoImg.naturalHeight / (opts.logoImg.naturalWidth || 1);
      const targetH = targetW * ratio;
      ctx.drawImage(opts.logoImg, -targetW / 2, -targetH / 2, targetW, targetH);
    }
    ctx.restore();
  };

  if (opts.layout === 'tile') {
    const stepX = Math.max(120, Math.round(w * 0.36));
    const stepY = Math.max(100, Math.round(h * 0.28));
    for (let y = stepY / 2; y < h + stepY / 2; y += stepY) {
      const rowOffset = Math.round(y / stepY) % 2 === 0 ? 0 : stepX / 2;
      for (let x = -stepX / 2 + rowOffset; x < w + stepX; x += stepX) {
        drawSingleMark(x, y);
      }
    }
  } else {
    let halfW = baseDim * 0.08;
    let halfH = baseDim * 0.04;
    if (opts.kind === 'text') {
      const fontSize = Math.max(12, Math.round((baseDim * opts.sizePct) / 100));
      ctx.font = `700 ${fontSize}px system-ui, -apple-system, sans-serif`;
      halfW = ctx.measureText(opts.text.trim() || 'ImageLab').width / 2;
      halfH = fontSize / 2;
    } else if (opts.logoImg) {
      const targetW = Math.max(24, (w * opts.sizePct) / 100);
      const ratio = opts.logoImg.naturalHeight / (opts.logoImg.naturalWidth || 1);
      halfW = targetW / 2;
      halfH = (targetW * ratio) / 2;
    }

    const rad = Math.abs((opts.rotation * Math.PI) / 180);
    const rotHalfW = halfW * Math.cos(rad) + halfH * Math.sin(rad);
    const rotHalfH = halfW * Math.sin(rad) + halfH * Math.cos(rad);

    let cx = w / 2;
    let cy = h / 2;
    if (opts.position.endsWith('l')) cx = pad + rotHalfW;
    if (opts.position.endsWith('r')) cx = w - pad - rotHalfW;
    if (opts.position.startsWith('t')) cy = pad + rotHalfH;
    if (opts.position.startsWith('b')) cy = h - pad - rotHalfH;

    cx = Math.max(rotHalfW + 4, Math.min(w - rotHalfW - 4, cx));
    cy = Math.max(rotHalfH + 4, Math.min(h - rotHalfH - 4, cy));

    drawSingleMark(cx, cy);
  }

  ctx.restore();
}

export default function WatermarkTool() {
  const [files, setFiles] = useState<File[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [previewImg, setPreviewImg] = useState<HTMLImageElement | null>(null);

  const [kind, setKind] = useState<WatermarkKind>('text');
  const [text, setText] = useState('© My Brand');
  const [color, setColor] = useState('#ffffff');
  const [sizePct, setSizePct] = useState(8);
  const [opacity, setOpacity] = useState(65);
  const [rotation, setRotation] = useState(0);
  const [layout, setLayout] = useState<LayoutPattern>('single');
  const [position, setPosition] = useState<GridPosition>('br');
  const [logoImg, setLogoImg] = useState<HTMLImageElement | null>(null);
  const [logoName, setLogoName] = useState<string>('');
  const [format, setFormat] = useState<SupportedFormat>('image/jpeg');

  const [isExporting, setIsExporting] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [doneMsg, setDoneMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isGlobalDragging, setIsGlobalDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragDepthRef = useRef(0);
  const addFilesRef = useRef<(files: FileList | null) => void>(() => {});

  useEffect(() => {
    const activeFile = files[activeIndex];
    if (!activeFile) {
      setPreviewImg(null);
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;

    (async () => {
      try {
        const normalized = await normalizeImageBlob(activeFile);
        if (cancelled) return;
        objectUrl = URL.createObjectURL(normalized);
        const img = new Image();
        img.onload = () => {
          if (objectUrl) URL.revokeObjectURL(objectUrl);
          if (!cancelled) setPreviewImg(img);
        };
        img.onerror = () => {
          if (objectUrl) URL.revokeObjectURL(objectUrl);
          if (!cancelled) setErrorMsg(`Could not preview "${activeFile.name}".`);
        };
        img.src = objectUrl;
      } catch {
        if (!cancelled) setErrorMsg(`Could not decode "${activeFile.name}".`);
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [files, activeIndex]);

  const renderLivePreview = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !previewImg) return;

    const maxPreview = 900;
    const scale = Math.min(
      1,
      maxPreview / Math.max(previewImg.naturalWidth, previewImg.naturalHeight)
    );
    const w = Math.max(1, Math.round(previewImg.naturalWidth * scale));
    const h = Math.max(1, Math.round(previewImg.naturalHeight * scale));

    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(previewImg, 0, 0, w, h);

    drawWatermarkOnCanvas(ctx, w, h, {
      kind,
      text,
      color,
      sizePct,
      opacity,
      rotation,
      layout,
      position,
      logoImg,
    });
  }, [previewImg, kind, text, color, sizePct, opacity, rotation, layout, position, logoImg]);

  useEffect(() => {
    renderLivePreview();
  }, [renderLivePreview]);

  const handleAddFiles = (incoming: FileList | null) => {
    if (!incoming || incoming.length === 0) return;
    setErrorMsg(null);
    setDoneMsg(null);

    const valid: File[] = [];
    for (const f of Array.from(incoming)) {
      const err = validateImageFile(f);
      if (err) setErrorMsg(err);
      else valid.push(f);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (valid.length === 0) return;

    setFiles((prev) => [...prev, ...valid].slice(0, MAX_BATCH));
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

  const handleLogoUpload = (incoming: FileList | null) => {
    if (!incoming || incoming.length === 0) return;
    const f = incoming[0];
    if (logoInputRef.current) logoInputRef.current.value = '';

    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      setLogoImg(img);
      setLogoName(f.name);
      setKind('logo');
      if (sizePct < 15) setSizePct(22);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setErrorMsg('Could not load logo image.');
    };
    img.src = url;
  };

  const handleExportAll = async () => {
    if (files.length === 0) return;
    if (kind === 'logo' && !logoImg) {
      setErrorMsg('Please upload a logo PNG first, or switch to Text Watermark.');
      return;
    }

    setIsExporting(true);
    setErrorMsg(null);
    setDoneMsg(null);

    const outputs: { fileName: string; blob: Blob }[] = [];

    try {
      for (let i = 0; i < files.length; i++) {
        setProgressText(`Watermarking ${i + 1} of ${files.length}...`);
        const file = files[i];
        const sigErr = await validateMagicBytes(file);
        if (sigErr) throw new Error(sigErr);

        const normalized = await normalizeImageBlob(file);
        const objUrl = URL.createObjectURL(normalized);
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const el = new Image();
          el.onload = () => {
            URL.revokeObjectURL(objUrl);
            resolve(el);
          };
          el.onerror = () => {
            URL.revokeObjectURL(objUrl);
            reject(new Error(`Failed to decode "${file.name}".`));
          };
          el.src = objUrl;
        });

        let w = img.naturalWidth;
        let h = img.naturalHeight;
        if (w * h > MAX_SAFE_CANVAS_PIXELS) {
          const s = Math.sqrt(MAX_SAFE_CANVAS_PIXELS / (w * h));
          w = Math.max(1, Math.floor(w * s));
          h = Math.max(1, Math.floor(h * s));
        }

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) throw new Error('Canvas unavailable.');

        if (format === 'image/jpeg') {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, w, h);
        }
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, w, h);

        drawWatermarkOnCanvas(ctx, w, h, {
          kind,
          text,
          color,
          sizePct,
          opacity,
          rotation,
          layout,
          position,
          logoImg,
        });

        const encoded = await encodeCanvasWithCodec(canvas, format, 0.88);
        canvas.width = 0;
        canvas.height = 0;

        const baseName = file.name.replace(/\.[^/.]+$/, '');
        const ext = getExt(encoded.blob.type || format);
        outputs.push({ fileName: `${baseName}_watermarked.${ext}`, blob: encoded.blob });
      }

      if (outputs.length === 1) {
        triggerBlobDownload(outputs[0].blob, outputs[0].fileName);
        setDoneMsg(`Downloaded ${outputs[0].fileName}`);
      } else if (outputs.length > 1) {
        setProgressText('Creating ZIP archive...');
        const { default: JSZip } = await import('jszip');
        const zip = new JSZip();
        outputs.forEach((item, idx) => {
          zip.file(`${idx + 1}_${item.fileName}`, item.blob);
        });
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        triggerBlobDownload(zipBlob, 'imagelab-watermarked.zip');
        setDoneMsg(`Downloaded ${outputs.length} watermarked images as ZIP`);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Batch watermarking failed.');
    } finally {
      setIsExporting(false);
      setProgressText('');
    }
  };

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
      <input
        ref={logoInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleLogoUpload(e.target.files)}
      />

      {isGlobalDragging && (
        <div className="fixed inset-0 z-50 bg-zinc-950/65 backdrop-blur-md flex items-center justify-center p-6 pointer-events-none animate-scale-in">
          <div className="max-w-md w-full rounded-3xl border border-blue-400/50 bg-white/95 dark:bg-zinc-900/95 p-10 text-center shadow-2xl">
            <div className="w-16 h-16 rounded-2xl bg-blue-600 text-white flex items-center justify-center mx-auto mb-5 shadow-lg">
              <Upload className="w-7 h-7" aria-hidden="true" />
            </div>
            <p className="text-xl font-bold text-zinc-950 dark:text-white">
              Release to Add Photos
            </p>
          </div>
        </div>
      )}

      <div className="studio-card rounded-3xl overflow-hidden">
        {files.length === 0 ? (
          <div className="p-6 sm:p-10">
            <div
              role="button"
              tabIndex={0}
              aria-label="Select photos to watermark"
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
                <Stamp className="w-7 h-7 text-zinc-900 dark:text-white group-hover:text-blue-600 transition-colors" aria-hidden="true" />
              </div>
              <span className="btn-studio-accent inline-flex items-center gap-2 px-7 py-3.5 rounded-2xl font-semibold text-sm sm:text-[15px]">
                Select Photos to Watermark
              </span>
              <p className="text-xs sm:text-sm text-zinc-500 mt-4">
                Drop up to {MAX_BATCH} photos anywhere or press{' '}
                <kbd className="px-1.5 py-0.5 text-[11px] font-semibold bg-white border border-zinc-200 rounded-md text-zinc-700">
                  Ctrl+V
                </kbd>
              </p>
            </div>
          </div>
        ) : (
          <div className="grid lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-zinc-200/80">
            {/* Left: Live Watermark Preview */}
            <div className="lg:col-span-7 bg-zinc-950 p-4 sm:p-6 flex flex-col justify-between gap-4">
              <div className="flex items-center justify-between gap-2 text-xs text-zinc-400">
                <span className="font-semibold truncate">
                  Preview ({activeIndex + 1}/{files.length}): {files[activeIndex]?.name}
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    disabled={files.length >= MAX_BATCH}
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" aria-hidden="true" /> Add
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setFiles([]);
                      setActiveIndex(0);
                      setDoneMsg(null);
                    }}
                    title="Clear all"
                    aria-label="Clear all"
                    className="p-2 rounded-xl bg-white/10 hover:bg-red-500/80 text-white cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>

              <div className="flex-1 flex items-center justify-center min-h-[260px] max-h-[54vh] overflow-hidden rounded-2xl bg-black/50 p-2">
                <canvas
                  ref={canvasRef}
                  className="max-h-[50vh] max-w-full w-auto h-auto rounded-lg shadow-lg"
                />
              </div>

              {files.length > 1 && (
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                  {files.map((f, idx) => (
                    <button
                      key={`${f.name}-${idx}`}
                      type="button"
                      onClick={() => setActiveIndex(idx)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer ${
                        idx === activeIndex
                          ? 'bg-blue-600 text-white'
                          : 'bg-white/10 text-zinc-300 hover:bg-white/20'
                      }`}
                    >
                      #{idx + 1} {f.name.slice(0, 12)}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Right: Watermark Controls */}
            <div className="lg:col-span-5 p-5 sm:p-6 flex flex-col justify-between gap-4 bg-white">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-1 bg-zinc-100 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setKind('text')}
                    className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold cursor-pointer ${
                      kind === 'text' ? 'bg-white text-zinc-950 shadow-xs' : 'text-zinc-500'
                    }`}
                  >
                    <Type className="w-3.5 h-3.5" aria-hidden="true" /> Text
                  </button>
                  <button
                    type="button"
                    onClick={() => setKind('logo')}
                    className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold cursor-pointer ${
                      kind === 'logo' ? 'bg-white text-zinc-950 shadow-xs' : 'text-zinc-500'
                    }`}
                  >
                    <ImageIcon className="w-3.5 h-3.5" aria-hidden="true" /> Logo PNG
                  </button>
                </div>

                {kind === 'text' ? (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      placeholder="Enter watermark text..."
                      className="flex-1 bg-zinc-50 border border-zinc-300 rounded-xl px-3 py-2 text-sm font-medium"
                    />
                    <input
                      type="color"
                      aria-label="Watermark text color"
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                      className="w-10 h-10 p-1 bg-white border border-zinc-300 rounded-xl cursor-pointer shrink-0"
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => logoInputRef.current?.click()}
                    className="w-full py-2.5 px-3 rounded-xl border border-dashed border-zinc-300 hover:border-blue-500 text-xs font-semibold text-zinc-700 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Upload className="w-4 h-4 text-blue-600" aria-hidden="true" />
                    <span>{logoName ? `Logo: ${logoName} (Change)` : 'Upload Transparent PNG Logo'}</span>
                  </button>
                )}

                <div>
                  <span className="block text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
                    Pattern
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setLayout('single');
                        setRotation(0);
                      }}
                      className={`inline-flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold border cursor-pointer ${
                        layout === 'single'
                          ? 'bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 border-transparent'
                          : 'bg-zinc-50 text-zinc-700 border-zinc-200'
                      }`}
                    >
                      <Stamp className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Single Stamp</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setLayout('tile');
                        setRotation(-28);
                      }}
                      className={`inline-flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold border cursor-pointer ${
                        layout === 'tile'
                          ? 'bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 border-transparent'
                          : 'bg-zinc-50 text-zinc-700 border-zinc-200'
                      }`}
                    >
                      <LayoutGrid className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Tiled Repeat</span>
                    </button>
                  </div>
                </div>

                {layout === 'single' && (
                  <div>
                    <span className="block text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
                      Position
                    </span>
                    <div className="grid grid-cols-3 gap-1.5 w-36">
                      {POSITIONS.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setPosition(p.id)}
                          className={`py-1.5 rounded-lg text-xs font-bold border cursor-pointer ${
                            position === p.id
                              ? 'bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 border-transparent'
                              : 'bg-zinc-50 text-zinc-600 border-zinc-200 hover:bg-zinc-100'
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-2.5">
                  <div>
                    <div className="flex justify-between text-xs text-zinc-600 mb-0.5 tabular-nums">
                      <label htmlFor="wm-size" className="inline-flex items-center gap-1.5">
                        <Maximize2 className="w-3.5 h-3.5 text-zinc-400" aria-hidden="true" />
                        <span>Size</span>
                      </label>
                      <span className="font-semibold text-zinc-900">{sizePct}%</span>
                    </div>
                    <input
                      id="wm-size"
                      type="range"
                      min={3}
                      max={45}
                      value={sizePct}
                      onChange={(e) => setSizePct(Number(e.target.value))}
                      className="w-full"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-xs text-zinc-600 mb-0.5 tabular-nums">
                      <label htmlFor="wm-op" className="inline-flex items-center gap-1.5">
                        <Eye className="w-3.5 h-3.5 text-zinc-400" aria-hidden="true" />
                        <span>Opacity</span>
                      </label>
                      <span className="font-semibold text-zinc-900">{opacity}%</span>
                    </div>
                    <input
                      id="wm-op"
                      type="range"
                      min={10}
                      max={100}
                      value={opacity}
                      onChange={(e) => setOpacity(Number(e.target.value))}
                      className="w-full"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-xs text-zinc-600 mb-0.5 tabular-nums">
                      <label htmlFor="wm-rot" className="inline-flex items-center gap-1.5">
                        <RotateCw className="w-3.5 h-3.5 text-zinc-400" aria-hidden="true" />
                        <span>Angle</span>
                      </label>
                      <span className="font-semibold text-zinc-900">{rotation}°</span>
                    </div>
                    <input
                      id="wm-rot"
                      type="range"
                      min={-90}
                      max={90}
                      value={rotation}
                      onChange={(e) => setRotation(Number(e.target.value))}
                      className="w-full"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-3 border-t border-zinc-200/80 pt-3">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-zinc-500">Format</span>
                  <div
                    role="radiogroup"
                    aria-label="Watermark output format"
                    className="inline-flex bg-zinc-200/70 dark:bg-zinc-800 p-0.5 rounded-xl"
                  >
                    {WATERMARK_FORMATS.map((fmt) => {
                      const active = format === fmt.id;
                      return (
                        <button
                          key={fmt.id}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          onClick={() => setFormat(fmt.id)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-[10px] text-xs font-semibold transition cursor-pointer ${
                            active
                              ? 'bg-white dark:bg-zinc-950 text-zinc-950 dark:text-white shadow-xs'
                              : 'text-zinc-600 hover:text-zinc-900'
                          }`}
                        >
                          <span className={active ? 'text-blue-600 dark:text-blue-400' : 'opacity-70'}>
                            {fmt.icon}
                          </span>
                          <span>{fmt.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {doneMsg && (
                  <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>{doneMsg}</span>
                  </p>
                )}

                {errorMsg && (
                  <p className="text-xs text-red-600 flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>{errorMsg}</span>
                  </p>
                )}

                <button
                  type="button"
                  disabled={isExporting}
                  onClick={() => void handleExportAll()}
                  className="btn-studio-accent w-full py-3 px-5 rounded-xl disabled:opacity-40 text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isExporting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                      <span>{progressText || 'Applying...'}</span>
                    </>
                  ) : files.length > 1 ? (
                    <>
                      <Archive className="w-4 h-4" aria-hidden="true" />
                      <span>Watermark All ({files.length}) &amp; ZIP</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" aria-hidden="true" />
                      <span>Download Watermarked</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {errorMsg && files.length === 0 && (
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
