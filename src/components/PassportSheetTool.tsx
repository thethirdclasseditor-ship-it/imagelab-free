import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';

type PhotoPresetId = 'bd-passport' | 'intl-35x45' | 'us-2x2' | 'bd-stamp';
type PaperPresetId = '4x6' | 'a4' | '5x7' | 'letter';
type Orientation = 'portrait' | 'landscape';
type CutGuideStyle = 'dashed' | 'border' | 'none';
type ExportFormat = 'jpeg' | 'pdf' | 'png';

interface PhotoPreset {
  id: PhotoPresetId;
  label: string;
  sub: string;
  widthMm: number;
  heightMm: number;
}

interface PaperPreset {
  id: PaperPresetId;
  label: string;
  sub: string;
  widthMm: number;
  heightMm: number;
  defaultOrientation: Orientation;
}

const DPI = 300;
const MM_PER_INCH = 25.4;

const PHOTO_PRESETS: PhotoPreset[] = [
  { id: 'bd-passport', label: 'BD Passport', sub: '40 × 50 mm', widthMm: 40, heightMm: 50 },
  { id: 'intl-35x45', label: 'Standard / Visa', sub: '35 × 45 mm', widthMm: 35, heightMm: 45 },
  { id: 'us-2x2', label: 'US / Square 2×2"', sub: '50.8 × 50.8 mm', widthMm: 50.8, heightMm: 50.8 },
  { id: 'bd-stamp', label: 'Stamp Size', sub: '20 × 25 mm', widthMm: 20, heightMm: 25 },
];

const PAPER_PRESETS: PaperPreset[] = [
  { id: '4x6', label: '4×6 inch', sub: 'Photo Lab', widthMm: 101.6, heightMm: 152.4, defaultOrientation: 'landscape' },
  { id: 'a4', label: 'A4 Sheet', sub: '210 × 297 mm', widthMm: 210, heightMm: 297, defaultOrientation: 'portrait' },
  { id: '5x7', label: '5×7 inch', sub: 'Studio Print', widthMm: 127, heightMm: 177.8, defaultOrientation: 'landscape' },
  { id: 'letter', label: 'US Letter', sub: '8.5 × 11 in', widthMm: 215.9, heightMm: 279.4, defaultOrientation: 'portrait' },
];

function mmToPx(mm: number): number {
  return Math.round((mm / MM_PER_INCH) * DPI);
}

function mmToPt(mm: number): number {
  return (mm / MM_PER_INCH) * 72;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function createFramedTile(
  img: HTMLImageElement,
  photoW: number,
  photoH: number,
  rotation: 0 | 90 | 180 | 270,
  zoom: number,
  offsetX: number,
  offsetY: number
): HTMLCanvasElement {
  const tile = document.createElement('canvas');
  tile.width = photoW;
  tile.height = photoH;
  const ctx = tile.getContext('2d');
  if (!ctx) return tile;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, photoW, photoH);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const effW = rotation === 90 || rotation === 270 ? img.naturalHeight : img.naturalWidth;
  const effH = rotation === 90 || rotation === 270 ? img.naturalWidth : img.naturalHeight;

  const baseScale = Math.max(photoW / effW, photoH / effH);
  const scale = baseScale * zoom;
  const drawW = effW * scale;
  const drawH = effH * scale;

  const maxShiftX = Math.max(0, (drawW - photoW) / 2);
  const maxShiftY = Math.max(0, (drawH - photoH) / 2);
  const shiftX = (offsetX / 100) * maxShiftX;
  const shiftY = (offsetY / 100) * maxShiftY;

  ctx.save();
  ctx.translate(photoW / 2 + shiftX, photoH / 2 + shiftY);
  ctx.rotate((rotation * Math.PI) / 180);

  if (rotation === 90 || rotation === 270) {
    ctx.drawImage(img, -drawH / 2, -drawW / 2, drawH, drawW);
  } else {
    ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
  }
  ctx.restore();

  return tile;
}

export default function PassportSheetTool() {
  const [sourceImg, setSourceImg] = useState<HTMLImageElement | null>(null);
  const [sourceUrl, setSourceUrl] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');

  const [photoPresetId, setPhotoPresetId] = useState<PhotoPresetId>('bd-passport');
  const [paperPresetId, setPaperPresetId] = useState<PaperPresetId>('4x6');
  const [orientation, setOrientation] = useState<Orientation>('landscape');

  const [autoFill, setAutoFill] = useState<boolean>(true);
  const [copies, setCopies] = useState<number>(6);
  const [autoRotateTiles, setAutoRotateTiles] = useState<boolean>(true);
  const [gapMm, setGapMm] = useState<number>(3);
  const [marginMm, setMarginMm] = useState<number>(4);
  const [cutGuide, setCutGuide] = useState<CutGuideStyle>('dashed');
  const [paperBg, setPaperBg] = useState<'#ffffff' | '#f4f4f5'>('#ffffff');

  // Photo framing adjustments
  const [zoom, setZoom] = useState<number>(1);
  const [offsetX, setOffsetX] = useState<number>(0);
  const [offsetY, setOffsetY] = useState<number>(0);
  const [photoRotation, setPhotoRotation] = useState<0 | 90 | 180 | 270>(0);

  const [format, setFormat] = useState<ExportFormat>('jpeg');
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isRendering, setIsRendering] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [downloadUrl, setDownloadUrl] = useState<string>('');
  const [outputDims, setOutputDims] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [outputSize, setOutputSize] = useState<number>(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const sourceUrlRef = useRef<string>('');
  sourceUrlRef.current = sourceUrl;

  const photoPreset = PHOTO_PRESETS.find((p) => p.id === photoPresetId) || PHOTO_PRESETS[0];
  const paperPreset = PAPER_PRESETS.find((p) => p.id === paperPresetId) || PAPER_PRESETS[0];

  const sheetDimsMm = useMemo(() => {
    const minSide = Math.min(paperPreset.widthMm, paperPreset.heightMm);
    const maxSide = Math.max(paperPreset.widthMm, paperPreset.heightMm);
    return orientation === 'landscape'
      ? { w: maxSide, h: minSide }
      : { w: minSide, h: maxSide };
  }, [paperPreset, orientation]);

  // Compute grid fit (checking normal vs 90-deg rotated tiles)
  const layoutCalc = useMemo(() => {
    const usableW = Math.max(10, sheetDimsMm.w - marginMm * 2);
    const usableH = Math.max(10, sheetDimsMm.h - marginMm * 2);
    const eps = 0.05;

    const normalCols = Math.max(0, Math.floor((usableW + gapMm + eps) / (photoPreset.widthMm + gapMm)));
    const normalRows = Math.max(0, Math.floor((usableH + gapMm + eps) / (photoPreset.heightMm + gapMm)));
    const normalMax = normalCols * normalRows;

    const rotCols = Math.max(0, Math.floor((usableW + gapMm + eps) / (photoPreset.heightMm + gapMm)));
    const rotRows = Math.max(0, Math.floor((usableH + gapMm + eps) / (photoPreset.widthMm + gapMm)));
    const rotMax = rotCols * rotRows;

    const useRotatedTile = autoRotateTiles && rotMax > normalMax;
    const cols = Math.max(1, useRotatedTile ? rotCols : normalCols);
    const rows = Math.max(1, useRotatedTile ? rotRows : normalRows);
    const maxCopies = Math.max(1, useRotatedTile ? rotMax : normalMax);
    const tileWmm = useRotatedTile ? photoPreset.heightMm : photoPreset.widthMm;
    const tileHmm = useRotatedTile ? photoPreset.widthMm : photoPreset.heightMm;

    return { cols, rows, maxCopies, useRotatedTile, tileWmm, tileHmm };
  }, [sheetDimsMm, marginMm, gapMm, photoPreset, autoRotateTiles]);

  const effectiveCopies = autoFill
    ? layoutCalc.maxCopies
    : Math.min(Math.max(1, copies), layoutCalc.maxCopies);

  const loadFile = useCallback(async (file: File) => {
    setError('');
    if (!file.type.startsWith('image/')) {
      setError('Please select a valid photo (JPG, PNG, WEBP, AVIF).');
      return;
    }

    try {
      const nextUrl = URL.createObjectURL(file);
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('Could not decode image'));
        el.src = nextUrl;
      });

      if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
      setSourceUrl(nextUrl);
      setSourceImg(img);
      setFileName(file.name || 'photo.jpg');
      setZoom(1);
      setOffsetX(0);
      setOffsetY(0);
      setPhotoRotation(0);
    } catch {
      setError('Could not read this image. Please try another photo.');
    }
  }, []);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = e.clipboardData?.files?.[0];
      if (file) loadFile(file);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [loadFile]);

  useEffect(() => {
    return () => {
      if (sourceUrlRef.current) URL.revokeObjectURL(sourceUrlRef.current);
    };
  }, []);

  const handlePaperChange = (id: PaperPresetId) => {
    setPaperPresetId(id);
    const nextPaper = PAPER_PRESETS.find((p) => p.id === id);
    if (nextPaper) setOrientation(nextPaper.defaultOrientation);
    setAutoFill(true);
  };

  const handlePhotoPresetChange = (id: PhotoPresetId) => {
    setPhotoPresetId(id);
    // Borderless 2x2" on 4x6" fits 6 exact photos with 0mm margin & gap
    if (id === 'us-2x2' && paperPresetId === '4x6') {
      setMarginMm(0);
      setGapMm(0);
    }
    setAutoFill(true);
  };

  // Render 300 DPI Sheet Preview + Download Blob
  useEffect(() => {
    if (!sourceImg) {
      setPreviewUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return '';
      });
      setDownloadUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return '';
      });
      setOutputDims({ w: 0, h: 0 });
      setOutputSize(0);
      return;
    }

    let cancelled = false;
    setIsRendering(true);

    const timer = window.setTimeout(async () => {
      try {
        const sheetWpx = mmToPx(sheetDimsMm.w);
        const sheetHpx = mmToPx(sheetDimsMm.h);

        const canvas = document.createElement('canvas');
        canvas.width = sheetWpx;
        canvas.height = sheetHpx;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas not supported');

        ctx.fillStyle = paperBg;
        ctx.fillRect(0, 0, sheetWpx, sheetHpx);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        const photoWpx = mmToPx(photoPreset.widthMm);
        const photoHpx = mmToPx(photoPreset.heightMm);
        const framedTile = createFramedTile(
          sourceImg,
          photoWpx,
          photoHpx,
          photoRotation,
          zoom,
          offsetX,
          offsetY
        );

        const tileWpx = layoutCalc.useRotatedTile ? photoHpx : photoWpx;
        const tileHpx = layoutCalc.useRotatedTile ? photoWpx : photoHpx;
        const gapPx = mmToPx(gapMm);
        const marginPx = mmToPx(marginMm);

        const actualCols = Math.min(layoutCalc.cols, effectiveCopies);
        const actualRows = Math.ceil(effectiveCopies / layoutCalc.cols);

        const gridW = actualCols * tileWpx + Math.max(0, actualCols - 1) * gapPx;
        const gridH = actualRows * tileHpx + Math.max(0, actualRows - 1) * gapPx;

        // Center horizontally; keep top-aligned on A4/Letter to save paper when cutting partial sheets
        const startX = Math.max(marginPx, Math.round((sheetWpx - gridW) / 2));
        const isSmallPaper = paperPresetId === '4x6' || paperPresetId === '5x7';
        const startY =
          isSmallPaper || effectiveCopies === layoutCalc.maxCopies
            ? Math.max(marginPx, Math.round((sheetHpx - gridH) / 2))
            : Math.max(marginPx, mmToPx(10));

        for (let i = 0; i < effectiveCopies; i++) {
          const r = Math.floor(i / layoutCalc.cols);
          const c = i % layoutCalc.cols;
          const x = startX + c * (tileWpx + gapPx);
          const y = startY + r * (tileHpx + gapPx);

          ctx.save();
          if (layoutCalc.useRotatedTile) {
            ctx.translate(x + tileWpx / 2, y + tileHpx / 2);
            ctx.rotate(Math.PI / 2);
            ctx.drawImage(framedTile, -photoWpx / 2, -photoHpx / 2, photoWpx, photoHpx);
          } else {
            ctx.drawImage(framedTile, x, y, tileWpx, tileHpx);
          }
          ctx.restore();

          if (cutGuide === 'border') {
            ctx.save();
            ctx.strokeStyle = '#9ca3af';
            ctx.lineWidth = 2;
            ctx.strokeRect(x, y, tileWpx, tileHpx);
            ctx.restore();
          } else if (cutGuide === 'dashed') {
            ctx.save();
            ctx.strokeStyle = '#71717a';
            ctx.lineWidth = 2;
            ctx.setLineDash([12, 8]);
            ctx.strokeRect(x, y, tileWpx, tileHpx);
            ctx.restore();
          }
        }

        // Fast lightweight preview
        const previewBlob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, 'image/jpeg', 0.88)
        );
        if (!previewBlob || cancelled) return;

        let finalBlob: Blob = previewBlob;

        if (format === 'pdf') {
          const jpgBlob = await new Promise<Blob | null>((resolve) =>
            canvas.toBlob(resolve, 'image/jpeg', 0.96)
          );
          if (!jpgBlob || cancelled) return;

          const { PDFDocument } = await import('pdf-lib');
          const pdfDoc = await PDFDocument.create();
          const jpgBytes = await jpgBlob.arrayBuffer();
          const embedded = await pdfDoc.embedJpg(jpgBytes);

          const pageWpt = mmToPt(sheetDimsMm.w);
          const pageHpt = mmToPt(sheetDimsMm.h);
          const page = pdfDoc.addPage([pageWpt, pageHpt]);
          page.drawImage(embedded, { x: 0, y: 0, width: pageWpt, height: pageHpt });

          const pdfBytes = await pdfDoc.save();
          finalBlob = new Blob([pdfBytes as BlobPart], { type: 'application/pdf' });
        } else if (format === 'png') {
          const pngBlob = await new Promise<Blob | null>((resolve) =>
            canvas.toBlob(resolve, 'image/png')
          );
          if (!pngBlob || cancelled) return;
          finalBlob = pngBlob;
        } else {
          const hqJpg = await new Promise<Blob | null>((resolve) =>
            canvas.toBlob(resolve, 'image/jpeg', 0.96)
          );
          if (!hqJpg || cancelled) return;
          finalBlob = hqJpg;
        }

        if (cancelled) return;

        const nextPreview = URL.createObjectURL(previewBlob);
        const nextDownload = URL.createObjectURL(finalBlob);

        setPreviewUrl((old) => {
          if (old) URL.revokeObjectURL(old);
          return nextPreview;
        });
        setDownloadUrl((old) => {
          if (old) URL.revokeObjectURL(old);
          return nextDownload;
        });
        setOutputDims({ w: sheetWpx, h: sheetHpx });
        setOutputSize(finalBlob.size);
      } catch {
        if (!cancelled) {
          setError('Failed to render print sheet. Please try a smaller photo.');
        }
      } finally {
        if (!cancelled) setIsRendering(false);
      }
    }, 85);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    sourceImg,
    sheetDimsMm,
    photoPreset,
    paperPresetId,
    layoutCalc,
    effectiveCopies,
    gapMm,
    marginMm,
    cutGuide,
    paperBg,
    zoom,
    offsetX,
    offsetY,
    photoRotation,
    format,
  ]);

  const ext = format === 'jpeg' ? 'jpg' : format;
  const downloadFilename = `imagelabkit-passport-${photoPresetId}-${paperPresetId}-${effectiveCopies}up.${ext}`;

  const quickCopyCounts = [4, 6, 8, 12].filter((n) => n < layoutCalc.maxCopies);

  return (
    <div className="space-y-6">
      {/* Photo & Paper Presets */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="studio-card rounded-3xl p-4 space-y-2.5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
            1. Photo Size Standard
          </p>
          <div className="grid grid-cols-2 gap-2">
            {PHOTO_PRESETS.map((p) => {
              const active = photoPresetId === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handlePhotoPresetChange(p.id)}
                  className={`px-3 py-2.5 rounded-2xl border text-left transition cursor-pointer ${
                    active
                      ? 'border-blue-600 bg-blue-600/8 dark:bg-blue-500/15 ring-1 ring-blue-600/30'
                      : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 hover:border-zinc-300 dark:hover:border-zinc-700'
                  }`}
                >
                  <div
                    className={`text-xs font-bold ${
                      active ? 'text-blue-600 dark:text-blue-400' : 'text-zinc-900 dark:text-zinc-100'
                    }`}
                  >
                    {p.label}
                  </div>
                  <div className="text-[11px] text-zinc-500">{p.sub}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="studio-card rounded-3xl p-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">
              2. Print Paper Size
            </p>
            <div className="inline-flex rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden text-[11px] font-semibold">
              <button
                type="button"
                onClick={() => setOrientation('portrait')}
                className={`px-2 py-0.5 cursor-pointer ${
                  orientation === 'portrait'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300'
                }`}
              >
                Portrait
              </button>
              <button
                type="button"
                onClick={() => setOrientation('landscape')}
                className={`px-2 py-0.5 cursor-pointer ${
                  orientation === 'landscape'
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300'
                }`}
              >
                Landscape
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {PAPER_PRESETS.map((p) => {
              const active = paperPresetId === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handlePaperChange(p.id)}
                  className={`px-3 py-2.5 rounded-2xl border text-left transition cursor-pointer ${
                    active
                      ? 'border-blue-600 bg-blue-600/8 dark:bg-blue-500/15 ring-1 ring-blue-600/30'
                      : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 hover:border-zinc-300 dark:hover:border-zinc-700'
                  }`}
                >
                  <div
                    className={`text-xs font-bold ${
                      active ? 'text-blue-600 dark:text-blue-400' : 'text-zinc-900 dark:text-zinc-100'
                    }`}
                  >
                    {p.label}
                  </div>
                  <div className="text-[11px] text-zinc-500">{p.sub}</div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Upload Dropzone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) loadFile(file);
        }}
        onClick={() => fileInputRef.current?.click()}
        className={`studio-card rounded-3xl border-2 border-dashed transition-all cursor-pointer text-center ${
          sourceImg ? 'py-4 px-6' : 'py-12 px-6'
        } ${
          isDragging
            ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/20'
            : 'border-zinc-300 dark:border-zinc-700 hover:border-blue-500/60'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              loadFile(file);
              e.target.value = '';
            }
          }}
        />
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          {sourceUrl ? (
            <img
              src={sourceUrl}
              alt="Uploaded portrait"
              className="w-11 h-11 rounded-xl object-cover border border-zinc-200 dark:border-zinc-700 shrink-0"
            />
          ) : (
            <div className="w-11 h-11 rounded-2xl bg-blue-600/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          )}
          <div className={sourceImg ? 'text-center sm:text-left' : 'text-center'}>
            <p className="text-sm sm:text-base font-bold text-zinc-900 dark:text-zinc-100">
              {sourceImg ? `Loaded: ${fileName} (Click to replace)` : 'Upload your passport photo (or drop / Ctrl+V)'}
            </p>
            <p className="text-xs text-zinc-500">
              300 DPI print accuracy · {layoutCalc.maxCopies} copies fit on {paperPreset.label} ({orientation})
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-xs font-medium text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Workspace */}
      {sourceImg && (
        <div className="grid lg:grid-cols-12 gap-6 items-start">
          {/* Left Controls */}
          <div className="lg:col-span-5 space-y-5">
            {/* Sheet Layout */}
            <div className="studio-card rounded-3xl p-4 sm:p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                  Sheet Layout
                </h2>
                <span className="px-2 py-0.5 rounded-lg bg-blue-600/10 text-blue-600 dark:text-blue-400 text-[11px] font-bold">
                  {effectiveCopies} Copies
                </span>
              </div>

              {/* Copy Count */}
              <div className="space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setAutoFill(true)}
                    className={`px-2.5 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                      autoFill
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300'
                    }`}
                  >
                    Max ({layoutCalc.maxCopies})
                  </button>
                  {quickCopyCounts.map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => {
                        setAutoFill(false);
                        setCopies(n);
                      }}
                      className={`px-2.5 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                        !autoFill && effectiveCopies === n
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <input
                  type="range"
                  min={1}
                  max={layoutCalc.maxCopies}
                  value={effectiveCopies}
                  onChange={(e) => {
                    setAutoFill(false);
                    setCopies(Number(e.target.value));
                  }}
                  className="w-full accent-blue-600 cursor-pointer"
                />
              </div>

              {/* Spacing & Margin */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    <span>Gap</span>
                    <span className="font-mono text-zinc-900 dark:text-zinc-100">{gapMm} mm</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={12}
                    step={0.5}
                    value={gapMm}
                    onChange={(e) => setGapMm(Number(e.target.value))}
                    className="w-full accent-blue-600 cursor-pointer"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    <span>Margin</span>
                    <span className="font-mono text-zinc-900 dark:text-zinc-100">{marginMm} mm</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={18}
                    step={1}
                    value={marginMm}
                    onChange={(e) => setMarginMm(Number(e.target.value))}
                    className="w-full accent-blue-600 cursor-pointer"
                  />
                </div>
              </div>

              {/* Cut Guides */}
              <div className="space-y-1.5">
                <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  Cutting Guides
                </span>
                <div className="grid grid-cols-3 gap-1.5">
                  {(
                    [
                      { id: 'dashed', label: 'Dashed' },
                      { id: 'border', label: 'Solid Line' },
                      { id: 'none', label: 'None' },
                    ] as { id: CutGuideStyle; label: string }[]
                  ).map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => setCutGuide(g.id)}
                      className={`py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                        cutGuide === g.id
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300'
                      }`}
                    >
                      {g.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Paper Background & Smart Rotate */}
              <div className="space-y-2.5 pt-1 border-t border-zinc-200/80 dark:border-zinc-800">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-zinc-600 dark:text-zinc-400">Sheet Tint</span>
                  <div className="inline-flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => setPaperBg('#ffffff')}
                      className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold cursor-pointer ${
                        paperBg === '#ffffff'
                          ? 'border-blue-600 bg-blue-600/10 text-blue-600 dark:text-blue-400'
                          : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300'
                      }`}
                    >
                      Pure White
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaperBg('#f4f4f5')}
                      className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold cursor-pointer ${
                        paperBg === '#f4f4f5'
                          ? 'border-blue-600 bg-blue-600/10 text-blue-600 dark:text-blue-400'
                          : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300'
                      }`}
                    >
                      Light Gray
                    </button>
                  </div>
                </div>

                <label className="flex items-center justify-between gap-2 text-xs font-semibold text-zinc-700 dark:text-zinc-300 cursor-pointer">
                  <span>Auto-rotate tiles for maximum copies</span>
                  <input
                    type="checkbox"
                    checked={autoRotateTiles}
                    onChange={(e) => setAutoRotateTiles(e.target.checked)}
                    className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                  />
                </label>
              </div>
            </div>

            {/* Fine-tune Photo Framing */}
            <div className="studio-card rounded-3xl p-4 sm:p-5 space-y-3.5">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                  Photo Framing
                </h2>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setPhotoRotation((r) => (((r + 90) % 360) as 0 | 90 | 180 | 270))
                    }
                    className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                  >
                    Rotate 90°
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setZoom(1);
                      setOffsetX(0);
                      setOffsetY(0);
                      setPhotoRotation(0);
                    }}
                    className="text-xs font-semibold text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 cursor-pointer"
                  >
                    Reset
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  <span>Zoom</span>
                  <span className="font-mono text-zinc-900 dark:text-zinc-100">{zoom.toFixed(2)}×</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={2.4}
                  step={0.05}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="w-full accent-blue-600 cursor-pointer"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    <span>Pan Left / Right</span>
                    <span className="font-mono text-zinc-900 dark:text-zinc-100">{offsetX}%</span>
                  </div>
                  <input
                    type="range"
                    min={-100}
                    max={100}
                    value={offsetX}
                    onChange={(e) => setOffsetX(Number(e.target.value))}
                    className="w-full accent-blue-600 cursor-pointer"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    <span>Pan Up / Down</span>
                    <span className="font-mono text-zinc-900 dark:text-zinc-100">{offsetY}%</span>
                  </div>
                  <input
                    type="range"
                    min={-100}
                    max={100}
                    value={offsetY}
                    onChange={(e) => setOffsetY(Number(e.target.value))}
                    className="w-full accent-blue-600 cursor-pointer"
                  />
                </div>
              </div>

              {/* Export Format */}
              <div className="space-y-2 pt-2 border-t border-zinc-200/80 dark:border-zinc-800">
                <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  Export Format (300 DPI)
                </span>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['jpeg', 'pdf', 'png'] as ExportFormat[]).map((fmt) => (
                    <button
                      key={fmt}
                      type="button"
                      onClick={() => setFormat(fmt)}
                      className={`py-2 rounded-xl text-xs font-bold uppercase border transition cursor-pointer ${
                        format === fmt
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:border-blue-500'
                      }`}
                    >
                      {fmt === 'jpeg' ? 'JPG' : fmt}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-zinc-500">
                  Tip: Choose <strong>PDF</strong> for home/office A4 printers (prints at 100% exact mm size) or <strong>JPG</strong> for photo studio labs.
                </p>
              </div>
            </div>
          </div>

          {/* Right Preview */}
          <div className="lg:col-span-7 studio-card rounded-3xl p-4 sm:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-zinc-950 dark:text-zinc-100">
                  Print-Ready Sheet Preview
                </h2>
                {outputDims.w > 0 && (
                  <p className="text-[11.5px] text-zinc-500 font-mono">
                    {effectiveCopies}× ({photoPreset.sub}) on {paperPreset.label} · {outputDims.w}×{outputDims.h}px (300 DPI) · {formatBytes(outputSize)}
                  </p>
                )}
              </div>

              {downloadUrl && (
                <a
                  href={downloadUrl}
                  download={downloadFilename}
                  className="btn-studio-primary inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
                  </svg>
                  <span>Download {ext.toUpperCase()}</span>
                </a>
              )}
            </div>

            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-950 p-5 min-h-[340px] flex items-center justify-center overflow-hidden">
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt="Passport print sheet preview"
                  className={`max-h-[560px] w-auto max-w-full object-contain rounded shadow-lg ring-1 ring-zinc-300 dark:ring-zinc-800 transition-opacity ${
                    isRendering ? 'opacity-60' : 'opacity-100'
                  }`}
                />
              ) : (
                <span className="text-xs text-zinc-400">Rendering 300 DPI sheet…</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
