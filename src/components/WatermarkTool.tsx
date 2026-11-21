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
  ShieldCheck,
  Loader2,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import {
  processImage,
  validateImageFile,
  type SupportedFormat,
  type ProcessedImageResult,
} from '../engine/imageEngine';
import { downloadSingleImage, downloadBatchAsZip } from '../engine/zipHelper';

type WatermarkKind = 'text' | 'logo';
type LayoutPattern = 'single' | 'tile';
type GridPosition =
  | 'tl'
  | 'tc'
  | 'tr'
  | 'ml'
  | 'mc'
  | 'mr'
  | 'bl'
  | 'bc'
  | 'br';

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
    // Calculate bounding half-size for clean padding
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

    let cx = w / 2;
    let cy = h / 2;
    if (opts.position.endsWith('l')) cx = pad + halfW;
    if (opts.position.endsWith('r')) cx = w - pad - halfW;
    if (opts.position.startsWith('t')) cy = pad + halfH;
    if (opts.position.startsWith('b')) cy = h - pad - halfH;

    drawSingleMark(cx, cy);
  }

  ctx.restore();
}

export default function WatermarkTool() {
  const [files, setFiles] = useState<File[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [previewImg, setPreviewImg] = useState<HTMLImageElement | null>(null);

  // Watermark Settings
  const [kind, setKind] = useState<WatermarkKind>('text');
  const [text, setText] = useState('© My Brand');
  const [color, setColor] = useState('#ffffff');
  const [sizePct, setSizePct] = useState(8);
  const [opacity, setOpacity] = useState(65);
  const [rotation, setRotation] = useState(-20);
  const [layout, setLayout] = useState<LayoutPattern>('single');
  const [position, setPosition] = useState<GridPosition>('br');
  const [logoImg, setLogoImg] = useState<HTMLImageElement | null>(null);
  const [logoName, setLogoName] = useState<string>('');
  const [format, setFormat] = useState<SupportedFormat>('image/jpeg');

  const [isExporting, setIsExporting] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [doneMsg, setDoneMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Load active image for live canvas preview
  useEffect(() => {
    const activeFile = files[activeIndex];
    if (!activeFile) {
      setPreviewImg(null);
      return;
    }

    let cancelled = false;
    const url = URL.createObjectURL(activeFile);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      if (!cancelled) setPreviewImg(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      if (!cancelled) setErrorMsg(`Could not preview "${activeFile.name}".`);
    };
    img.src = url;

    return () => {
      cancelled = true;
    };
  }, [files, activeIndex]);

  // Redraw live watermark preview whenever any setting changes
  const renderLivePreview = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !previewImg) return;

    const maxPreview = 900;
    const scale = Math.min(1, maxPreview / Math.max(previewImg.naturalWidth, previewImg.naturalHeight));
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

    const results: ProcessedImageResult[] = [];

    try {
      for (let i = 0; i < files.length; i++) {
        setProgressText(`Watermarking ${i + 1} of ${files.length}...`);
        const file = files[i];

        // First normalize & cap pixels via engine
        const baseRes = await processImage(file, { format: 'image/png', quality: 1 });
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const el = new Image();
          el.onload = () => resolve(el);
          el.onerror = () => reject(new Error(`Failed to decode "${file.name}".`));
          el.src = baseRes.url;
        });

        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas unavailable.');

        ctx.drawImage(img, 0, 0);
        drawWatermarkOnCanvas(ctx, canvas.width, canvas.height, {
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

        const rawBlob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Watermark render failed.'))), 'image/png');
        });
        canvas.width = 0;
        canvas.height = 0;
        URL.revokeObjectURL(baseRes.url);
        URL.revokeObjectURL(baseRes.originalUrl);

        // Final studio-grade MozJPEG / LibWebP / UPNG compression
        const wmFile = new File([rawBlob], file.name, { type: 'image/png' });
        const finalRes = await processImage(wmFile, { format, quality: 0.88 });
        results.push(finalRes);
      }

      if (results.length === 1) {
        downloadSingleImage(results[0]);
        setDoneMsg(`Downloaded ${results[0].fileName}`);
      } else if (results.length > 1) {
        setProgressText('Creating ZIP archive...');
        await downloadBatchAsZip(results, 'imagelab-watermarked.zip');
        setDoneMsg(`Downloaded ${results.length} watermarked images as ZIP`);
      }

      results.forEach((r) => {
        URL.revokeObjectURL(r.url);
        URL.revokeObjectURL(r.originalUrl);
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Batch watermarking failed.');
    } finally {
      setIsExporting(false);
      setProgressText('');
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
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
            className={`border-2 border-dashed rounded-2xl py-12 px-4 text-center cursor-pointer transition-all ${
              isDragging
                ? 'border-blue-500 bg-blue-50/60'
                : 'border-slate-300 hover:border-blue-500 hover:bg-slate-50'
            }`}
          >
            <div className="w-14 h-14 rounded-2xl bg-indigo-600 text-white flex items-center justify-center mx-auto mb-4 shadow-md">
              <Stamp className="w-7 h-7" />
            </div>
            <p className="font-bold text-slate-900 text-lg">Select Photos to Add Watermark</p>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Batch watermark up to {MAX_BATCH} product photos with custom Text or PNG Logo · 100% Private
            </p>
          </div>
        </div>
      ) : (
        <div className="grid lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
          {/* Left: Live Watermark Canvas Preview */}
          <div className="lg:col-span-7 bg-slate-900 p-4 sm:p-6 flex flex-col justify-between gap-4">
            <div className="flex items-center justify-between gap-2 text-xs text-slate-300">
              <span className="font-semibold truncate">
                Preview ({activeIndex + 1}/{files.length}): {files[activeIndex]?.name}
              </span>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  disabled={files.length >= MAX_BATCH}
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white font-semibold cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Add
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFiles([]);
                    setActiveIndex(0);
                    setDoneMsg(null);
                  }}
                  title="Clear all"
                  className="p-1.5 rounded-lg bg-white/10 hover:bg-red-500/80 text-white cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 flex items-center justify-center min-h-[260px] max-h-[54vh] overflow-hidden rounded-xl bg-slate-950/60 p-2">
              <canvas
                ref={canvasRef}
                className="max-h-[50vh] max-w-full w-auto h-auto rounded-lg shadow-lg"
              />
            </div>

            {/* Batch Switcher Strip when multiple photos uploaded */}
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
                        : 'bg-white/10 text-slate-300 hover:bg-white/20'
                    }`}
                  >
                    #{idx + 1} {f.name.slice(0, 12)}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right: Watermark Controls */}
          <div className="lg:col-span-5 p-4 sm:p-5 flex flex-col justify-between gap-4 bg-white">
            <div className="space-y-4">
              {/* Kind Switch: Text vs Logo */}
              <div className="grid grid-cols-2 gap-1.5 bg-slate-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setKind('text')}
                  className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold cursor-pointer ${
                    kind === 'text' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  <Type className="w-3.5 h-3.5" /> Text Watermark
                </button>
                <button
                  type="button"
                  onClick={() => setKind('logo')}
                  className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold cursor-pointer ${
                    kind === 'logo' ? 'bg-white text-blue-600 shadow-xs' : 'text-slate-600'
                  }`}
                >
                  <ImageIcon className="w-3.5 h-3.5" /> Logo Image
                </button>
              </div>

              {kind === 'text' ? (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Enter watermark text..."
                    className="flex-1 bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm font-medium"
                  />
                  <input
                    type="color"
                    aria-label="Watermark text color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="w-10 h-10 p-1 bg-white border border-slate-300 rounded-lg cursor-pointer shrink-0"
                  />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  className="w-full py-2.5 px-3 rounded-xl border border-dashed border-slate-300 hover:border-blue-500 text-xs font-semibold text-slate-700 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Upload className="w-4 h-4 text-blue-600" />
                  <span>{logoName ? `Logo: ${logoName} (Change)` : 'Upload Transparent PNG Logo'}</span>
                </button>
              )}

              {/* Layout Pattern: Single vs Diagonal Tiled */}
              <div>
                <span className="block text-xs font-bold uppercase tracking-wide text-slate-500 mb-1.5">
                  Pattern
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setLayout('single');
                      setRotation(0);
                    }}
                    className={`py-1.5 rounded-lg text-xs font-semibold border cursor-pointer ${
                      layout === 'single'
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-slate-50 text-slate-700 border-slate-200'
                    }`}
                  >
                    Single Stamp
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setLayout('tile');
                      setRotation(-28);
                    }}
                    className={`py-1.5 rounded-lg text-xs font-semibold border cursor-pointer ${
                      layout === 'tile'
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-slate-50 text-slate-700 border-slate-200'
                    }`}
                  >
                    Tiled Repeat (Full)
                  </button>
                </div>
              </div>

              {/* 9-Point Position Selector (Single Mode) */}
              {layout === 'single' && (
                <div>
                  <span className="block text-xs font-bold uppercase tracking-wide text-slate-500 mb-1.5">
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
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-blue-400'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Sliders */}
              <div className="space-y-2.5">
                <div>
                  <div className="flex justify-between text-xs font-medium text-slate-700 mb-0.5">
                    <label htmlFor="wm-size">Size</label>
                    <span className="font-bold text-blue-600">{sizePct}%</span>
                  </div>
                  <input
                    id="wm-size"
                    type="range"
                    min={3}
                    max={45}
                    value={sizePct}
                    onChange={(e) => setSizePct(Number(e.target.value))}
                    className="w-full accent-blue-600"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs font-medium text-slate-700 mb-0.5">
                    <label htmlFor="wm-op">Opacity</label>
                    <span className="font-bold text-blue-600">{opacity}%</span>
                  </div>
                  <input
                    id="wm-op"
                    type="range"
                    min={10}
                    max={100}
                    value={opacity}
                    onChange={(e) => setOpacity(Number(e.target.value))}
                    className="w-full accent-blue-600"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs font-medium text-slate-700 mb-0.5">
                    <label htmlFor="wm-rot">Angle</label>
                    <span className="font-bold text-blue-600">{rotation}°</span>
                  </div>
                  <input
                    id="wm-rot"
                    type="range"
                    min={-90}
                    max={90}
                    value={rotation}
                    onChange={(e) => setRotation(Number(e.target.value))}
                    className="w-full accent-blue-600"
                  />
                </div>
              </div>
            </div>

            {/* Export Controls */}
            <div className="space-y-2.5 border-t border-slate-200 pt-3">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-semibold text-slate-600">Output Format:</span>
                <select
                  aria-label="Watermark output format"
                  value={format}
                  onChange={(e) => setFormat(e.target.value as SupportedFormat)}
                  className="bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 font-semibold"
                >
                  <option value="image/jpeg">JPG (MozJPEG)</option>
                  <option value="image/webp">WEBP (Smallest)</option>
                  <option value="image/png">PNG (UPNG)</option>
                </select>
              </div>

              {doneMsg && (
                <p className="text-xs font-semibold text-emerald-600 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{doneMsg}</span>
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
                onClick={handleExportAll}
                className="w-full py-3 px-5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 text-white text-sm font-semibold shadow-sm flex items-center justify-center gap-2 cursor-pointer"
              >
                {isExporting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{progressText || 'Applying...'}</span>
                  </>
                ) : files.length > 1 ? (
                  <>
                    <Archive className="w-4 h-4" />
                    <span>Watermark All ({files.length}) & Download ZIP</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    <span>Download Watermarked Image</span>
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
          <span>100% Private Batch Watermarker · Protect shop photos & ID copies locally.</span>
        </p>
      </div>
    </div>
  );
}
