import React, { useState, useRef, useEffect, useCallback } from 'react';

type MergeMode = 'horizontal' | 'vertical' | 'nid-a4' | 'grid';
type OutputFormat = 'jpeg' | 'png' | 'webp' | 'pdf';

interface ImageItem {
  id: string;
  name: string;
  url: string;
  img: HTMLImageElement;
  width: number;
  height: number;
  rotation: 0 | 90 | 180 | 270;
}

const MAX_CANVAS_EDGE = 4096;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getEffectiveSize(item: ImageItem) {
  return item.rotation === 90 || item.rotation === 270
    ? { w: item.height, h: item.width }
    : { w: item.width, h: item.height };
}

function clipRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  ctx.clip();
}

function drawItemInBox(
  ctx: CanvasRenderingContext2D,
  item: ImageItem,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
  drawBorder: boolean
) {
  ctx.save();
  if (radius > 0) {
    clipRoundedRect(ctx, x, y, w, h, radius);
  }
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate((item.rotation * Math.PI) / 180);
  if (item.rotation === 90 || item.rotation === 270) {
    ctx.drawImage(item.img, -h / 2, -w / 2, h, w);
  } else {
    ctx.drawImage(item.img, -w / 2, -h / 2, w, h);
  }
  ctx.restore();

  if (drawBorder) {
    ctx.save();
    ctx.strokeStyle = '#d4d4d8';
    ctx.lineWidth = 2;
    if (radius > 0) {
      const r = Math.min(radius, w / 2, h / 2);
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
      ctx.stroke();
    } else {
      ctx.strokeRect(x, y, w, h);
    }
    ctx.restore();
  }
}

export default function MergeImagesTool() {
  const [items, setItems] = useState<ImageItem[]>([]);
  const [mode, setMode] = useState<MergeMode>('horizontal');
  const [matchSize, setMatchSize] = useState<boolean>(true);
  const [gap, setGap] = useState<number>(20);
  const [padding, setPadding] = useState<number>(24);
  const [radius, setRadius] = useState<number>(0);
  const [bgColor, setBgColor] = useState<string>('#ffffff');
  const [transparentBg, setTransparentBg] = useState<boolean>(false);
  const [cardBorder, setCardBorder] = useState<boolean>(true);
  const [format, setFormat] = useState<OutputFormat>('jpeg');
  const [quality, setQuality] = useState<number>(92);

  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isRendering, setIsRendering] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [downloadUrl, setDownloadUrl] = useState<string>('');
  const [outputDims, setOutputDims] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [outputSize, setOutputSize] = useState<number>(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const itemsRef = useRef<ImageItem[]>([]);
  itemsRef.current = items;

  const loadFiles = useCallback(async (fileList: FileList | File[]) => {
    setError('');
    const incoming = Array.from(fileList).filter((f) => f.type.startsWith('image/'));
    if (incoming.length === 0) {
      setError('Please select valid image files (JPG, PNG, WEBP, AVIF).');
      return;
    }

    const loaded: ImageItem[] = [];

    for (const file of incoming) {
      try {
        const url = URL.createObjectURL(file);
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const el = new Image();
          el.onload = () => resolve(el);
          el.onerror = () => reject(new Error('Failed to load image'));
          el.src = url;
        });

        loaded.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: file.name || 'image.png',
          url,
          img,
          width: img.naturalWidth || img.width,
          height: img.naturalHeight || img.height,
          rotation: 0,
        });
      } catch {
        setError('One or more images could not be decoded.');
      }
    }

    if (loaded.length > 0) {
      setItems((prev) => [...prev, ...loaded]);
    }
  }, []);

  // Support Ctrl+V clipboard image paste
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = e.clipboardData?.files;
      if (files && files.length > 0) {
        loadFiles(files);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [loadFiles]);

  // Cleanup image object URLs on unmount
  useEffect(() => {
    return () => {
      itemsRef.current.forEach((item) => URL.revokeObjectURL(item.url));
    };
  }, []);

  const handleModeChange = (nextMode: MergeMode) => {
    setMode(nextMode);
    if (nextMode === 'nid-a4') {
      setTransparentBg(false);
      setBgColor('#ffffff');
      setGap(48);
      setPadding(80);
    }
  };

  const moveItem = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    setItems((prev) => {
      const next = [...prev];
      const temp = next[index];
      next[index] = next[target];
      next[target] = temp;
      return next;
    });
  };

  const rotateItem = (id: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, rotation: (((item.rotation + 90) % 360) as 0 | 90 | 180 | 270) }
          : item
      )
    );
  };

  const removeItem = (id: string) => {
    setItems((prev) => {
      const found = prev.find((i) => i.id === id);
      if (found) URL.revokeObjectURL(found.url);
      return prev.filter((i) => i.id !== id);
    });
  };

  const clearAll = () => {
    items.forEach((i) => URL.revokeObjectURL(i.url));
    setItems([]);
    setError('');
  };

  // Live Canvas & Export Rendering
  useEffect(() => {
    if (items.length === 0) {
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
        const effs = items.map(getEffectiveSize);
        const canvas = document.createElement('canvas');
        let canvasW = 0;
        let canvasH = 0;

        interface DrawBox {
          item: ImageItem;
          x: number;
          y: number;
          w: number;
          h: number;
        }
        const boxes: DrawBox[] = [];

        if (mode === 'nid-a4') {
          // Crisp 200 DPI A4 sheet (1654 x 2339 px)
          canvasW = 1654;
          canvasH = 2339;
          const safePad = Math.max(40, padding * 1.5);
          const safeGap = Math.max(24, gap * 1.5);
          const count = items.length;
          const maxSlotW = Math.round(canvasW * (count <= 2 ? 0.64 : 0.56));
          const maxSlotH = (canvasH - safePad * 2 - safeGap * (count - 1)) / count;

          const sized = effs.map((e) => {
            const scale = Math.min(maxSlotW / e.w, maxSlotH / e.h);
            return { w: e.w * scale, h: e.h * scale };
          });

          const totalBlockH =
            sized.reduce((sum, s) => sum + s.h, 0) + safeGap * (count - 1);
          let curY = (canvasH - totalBlockH) / 2;

          sized.forEach((s, idx) => {
            boxes.push({
              item: items[idx],
              x: (canvasW - s.w) / 2,
              y: curY,
              w: s.w,
              h: s.h,
            });
            curY += s.h + safeGap;
          });
        } else if (mode === 'horizontal') {
          const baseH = Math.min(1800, Math.max(...effs.map((e) => e.h)));
          const sized = effs.map((e) =>
            matchSize ? { w: (e.w / e.h) * baseH, h: baseH } : { w: e.w, h: e.h }
          );
          const innerH = Math.max(...sized.map((s) => s.h));
          const innerW =
            sized.reduce((sum, s) => sum + s.w, 0) + gap * (items.length - 1);

          canvasW = innerW + padding * 2;
          canvasH = innerH + padding * 2;

          let curX = padding;
          sized.forEach((s, idx) => {
            boxes.push({
              item: items[idx],
              x: curX,
              y: padding + (innerH - s.h) / 2,
              w: s.w,
              h: s.h,
            });
            curX += s.w + gap;
          });
        } else if (mode === 'vertical') {
          const baseW = Math.min(1800, Math.max(...effs.map((e) => e.w)));
          const sized = effs.map((e) =>
            matchSize ? { w: baseW, h: (e.h / e.w) * baseW } : { w: e.w, h: e.h }
          );
          const innerW = Math.max(...sized.map((s) => s.w));
          const innerH =
            sized.reduce((sum, s) => sum + s.h, 0) + gap * (items.length - 1);

          canvasW = innerW + padding * 2;
          canvasH = innerH + padding * 2;

          let curY = padding;
          sized.forEach((s, idx) => {
            boxes.push({
              item: items[idx],
              x: padding + (innerW - s.w) / 2,
              y: curY,
              w: s.w,
              h: s.h,
            });
            curY += s.h + gap;
          });
        } else {
          // 2-column balanced grid
          const cols = items.length === 1 ? 1 : 2;
          const rows = Math.ceil(items.length / cols);
          const cellW = 1000;
          const sized = effs.map((e) => ({
            w: cellW,
            h: (e.h / e.w) * cellW,
          }));

          const rowHeights: number[] = [];
          for (let r = 0; r < rows; r++) {
            const slice = sized.slice(r * cols, r * cols + cols);
            rowHeights.push(Math.max(...slice.map((s) => s.h)));
          }

          canvasW = cols * cellW + gap * (cols - 1) + padding * 2;
          canvasH =
            rowHeights.reduce((sum, h) => sum + h, 0) +
            gap * (rows - 1) +
            padding * 2;

          let curY = padding;
          for (let r = 0; r < rows; r++) {
            const rowH = rowHeights[r];
            for (let c = 0; c < cols; c++) {
              const idx = r * cols + c;
              if (idx >= items.length) break;
              const s = sized[idx];
              boxes.push({
                item: items[idx],
                x: padding + c * (cellW + gap),
                y: curY + (rowH - s.h) / 2,
                w: s.w,
                h: s.h,
              });
            }
            curY += rowH + gap;
          }
        }

        // Prevent oversized canvases on mobile/desktop browsers
        const maxEdge = Math.max(canvasW, canvasH);
        const downscale = maxEdge > MAX_CANVAS_EDGE ? MAX_CANVAS_EDGE / maxEdge : 1;
        const finalW = Math.max(1, Math.round(canvasW * downscale));
        const finalH = Math.max(1, Math.round(canvasH * downscale));

        canvas.width = finalW;
        canvas.height = finalH;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas not supported');

        const useTransparency =
          transparentBg && (format === 'png' || format === 'webp') && mode !== 'nid-a4';

        if (!useTransparency) {
          ctx.fillStyle = mode === 'nid-a4' ? '#ffffff' : bgColor;
          ctx.fillRect(0, 0, finalW, finalH);
        } else {
          ctx.clearRect(0, 0, finalW, finalH);
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        const scaledRadius = radius * downscale;
        const showBorder = mode === 'nid-a4' && cardBorder;

        for (const box of boxes) {
          drawItemInBox(
            ctx,
            box.item,
            box.x * downscale,
            box.y * downscale,
            box.w * downscale,
            box.h * downscale,
            scaledRadius,
            showBorder
          );
        }

        const previewMime = useTransparency ? 'image/png' : 'image/jpeg';
        const previewBlob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, previewMime, 0.9)
        );
        if (!previewBlob || cancelled) return;

        let finalBlob: Blob = previewBlob;

        if (format === 'pdf') {
          const jpgBlob = await new Promise<Blob | null>((resolve) =>
            canvas.toBlob(resolve, 'image/jpeg', quality / 100)
          );
          if (!jpgBlob || cancelled) return;

          const { PDFDocument } = await import('pdf-lib');
          const pdfDoc = await PDFDocument.create();
          const jpgBytes = await jpgBlob.arrayBuffer();
          const embedded = await pdfDoc.embedJpg(jpgBytes);

          let pageW = 595.28;
          let pageH = 841.89;
          if (mode !== 'nid-a4') {
            const aspect = finalW / finalH;
            if (aspect >= 1) {
              pageW = 841.89;
              pageH = pageW / aspect;
            } else {
              pageH = 841.89;
              pageW = pageH * aspect;
            }
          }

          const page = pdfDoc.addPage([pageW, pageH]);
          page.drawImage(embedded, { x: 0, y: 0, width: pageW, height: pageH });
          const pdfBytes = await pdfDoc.save();
          finalBlob = new Blob([pdfBytes], { type: 'application/pdf' });
        } else {
          const mime =
            format === 'png'
              ? 'image/png'
              : format === 'webp'
              ? 'image/webp'
              : 'image/jpeg';
          const outBlob = await new Promise<Blob | null>((resolve) =>
            canvas.toBlob(resolve, mime, quality / 100)
          );
          if (!outBlob || cancelled) return;
          finalBlob = outBlob;
        }

        if (cancelled) return;

        const nextPreview = URL.createObjectURL(previewBlob);
        const nextDownload =
          finalBlob === previewBlob ? nextPreview : URL.createObjectURL(finalBlob);

        setPreviewUrl((old) => {
          if (old) URL.revokeObjectURL(old);
          return nextPreview;
        });
        setDownloadUrl((old) => {
          if (old && old !== nextPreview) URL.revokeObjectURL(old);
          return nextDownload;
        });
        setOutputDims({ w: finalW, h: finalH });
        setOutputSize(finalBlob.size);
      } catch {
        if (!cancelled) {
          setError('Could not merge images. Try reducing image count or size.');
        }
      } finally {
        if (!cancelled) setIsRendering(false);
      }
    }, 90);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [items, mode, matchSize, gap, padding, radius, bgColor, transparentBg, cardBorder, format, quality]);

  const ext = format === 'jpeg' ? 'jpg' : format;
  const downloadFilename =
    mode === 'nid-a4'
      ? `imagelabkit-nid-a4.${ext}`
      : `imagelabkit-merged-${mode}.${ext}`;

  const presets: { id: MergeMode; label: string; sub: string }[] = [
    { id: 'horizontal', label: 'Side-by-Side', sub: 'Left to right' },
    { id: 'vertical', label: 'Top-to-Bottom', sub: 'Stacked vertically' },
    { id: 'nid-a4', label: 'NID / ID (A4)', sub: 'Front & Back print' },
    { id: 'grid', label: '2-Column Grid', sub: 'Photo collage' },
  ];

  const bgSwatches = ['#ffffff', '#f4f4f5', '#09090b', '#e2e8f0'];

  return (
    <div className="space-y-6">
      {/* Mode Switcher */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {presets.map((p) => {
          const active = mode === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => handleModeChange(p.id)}
              className={`px-3.5 py-3 rounded-2xl border text-left transition cursor-pointer ${
                active
                  ? 'border-blue-600 bg-blue-600/8 dark:bg-blue-500/15 ring-1 ring-blue-600/30'
                  : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/60 hover:border-zinc-300 dark:hover:border-zinc-700'
              }`}
            >
              <div
                className={`text-xs sm:text-sm font-bold ${
                  active ? 'text-blue-600 dark:text-blue-400' : 'text-zinc-900 dark:text-zinc-100'
                }`}
              >
                {p.label}
              </div>
              <div className="text-[11px] text-zinc-500 mt-0.5">{p.sub}</div>
            </button>
          );
        })}
      </div>

      {/* Dropzone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          if (e.dataTransfer.files?.length) loadFiles(e.dataTransfer.files);
        }}
        onClick={() => fileInputRef.current?.click()}
        className={`studio-card rounded-3xl border-2 border-dashed transition-all cursor-pointer text-center ${
          items.length === 0 ? 'py-12 px-6' : 'py-5 px-6'
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
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) {
              loadFiles(e.target.files);
              e.target.value = '';
            }
          }}
        />
        <div className="flex flex-col items-center justify-center gap-2">
          <div className="w-11 h-11 rounded-2xl bg-blue-600/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </div>
          <p className="text-sm sm:text-base font-bold text-zinc-900 dark:text-zinc-100">
            {items.length === 0
              ? mode === 'nid-a4'
                ? 'Upload NID / ID Front & Back Photos'
                : 'Drop 2 or more images here (or click / Ctrl+V)'
              : `Add more images (${items.length} added)`}
          </p>
          <p className="text-xs text-zinc-500">
            Unlimited images · JPG, PNG, WEBP, AVIF · 100% private in your browser
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-xs font-medium text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Main Workspace */}
      {items.length > 0 && (
        <div className="grid lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Image List + Controls */}
          <div className="lg:col-span-5 space-y-5">
            {/* Uploaded Queue */}
            <div className="studio-card rounded-3xl p-4 sm:p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                  Images ({items.length})
                </h2>
                <div className="flex items-center gap-2">
                  {items.length === 2 && (
                    <button
                      type="button"
                      onClick={() => moveItem(0, 1)}
                      className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer"
                    >
                      Swap Order
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={clearAll}
                    className="text-xs font-semibold text-zinc-500 hover:text-red-600 transition cursor-pointer"
                  >
                    Clear All
                  </button>
                </div>
              </div>

              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {items.map((item, idx) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 p-2 rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/60"
                  >
                    <img
                      src={item.url}
                      alt={item.name}
                      style={{ transform: `rotate(${item.rotation}deg)` }}
                      className="w-11 h-11 rounded-xl object-cover bg-white border border-zinc-200 dark:border-zinc-700 shrink-0 transition-transform"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        {mode === 'nid-a4' && idx < 2 && (
                          <span className="px-1.5 py-0.5 rounded bg-blue-600/10 text-blue-600 dark:text-blue-400 text-[10px] font-bold uppercase">
                            {idx === 0 ? 'Front' : 'Back'}
                          </span>
                        )}
                        <p className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                          {item.name}
                        </p>
                      </div>
                      <p className="text-[11px] text-zinc-500">
                        {item.width}×{item.height}px
                        {item.rotation !== 0 ? ` · ${item.rotation}°` : ''}
                      </p>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => moveItem(idx, -1)}
                        disabled={idx === 0}
                        title="Move earlier"
                        className="w-7 h-7 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 disabled:opacity-30 flex items-center justify-center hover:border-blue-500 cursor-pointer"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => moveItem(idx, 1)}
                        disabled={idx === items.length - 1}
                        title="Move later"
                        className="w-7 h-7 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 disabled:opacity-30 flex items-center justify-center hover:border-blue-500 cursor-pointer"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => rotateItem(item.id)}
                        title="Rotate 90°"
                        className="w-7 h-7 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 flex items-center justify-center hover:border-blue-500 cursor-pointer"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5M20 9A8 8 0 005.6 5.6L4 7m16 10l-1.6 1.4A8 8 0 014 15" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        title="Remove"
                        className="w-7 h-7 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-500 hover:text-red-600 hover:border-red-300 flex items-center justify-center cursor-pointer"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Settings Card */}
            <div className="studio-card rounded-3xl p-4 sm:p-5 space-y-4">
              <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                Layout &amp; Export
              </h2>

              {(mode === 'horizontal' || mode === 'vertical') && (
                <label className="flex items-center justify-between gap-3 text-xs font-semibold text-zinc-800 dark:text-zinc-200 cursor-pointer">
                  <span>
                    {mode === 'horizontal' ? 'Auto-match height' : 'Auto-match width'}
                  </span>
                  <input
                    type="checkbox"
                    checked={matchSize}
                    onChange={(e) => setMatchSize(e.target.checked)}
                    className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                  />
                </label>
              )}

              {mode === 'nid-a4' && (
                <label className="flex items-center justify-between gap-3 text-xs font-semibold text-zinc-800 dark:text-zinc-200 cursor-pointer">
                  <span>Subtle card outline border</span>
                  <input
                    type="checkbox"
                    checked={cardBorder}
                    onChange={(e) => setCardBorder(e.target.checked)}
                    className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                  />
                </label>
              )}

              {/* Gap Slider */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  <span>Spacing (Gap)</span>
                  <span className="font-mono text-zinc-900 dark:text-zinc-100">{gap}px</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={gap}
                  onChange={(e) => setGap(Number(e.target.value))}
                  className="w-full accent-blue-600 cursor-pointer"
                />
              </div>

              {/* Padding Slider */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  <span>Outer Margin</span>
                  <span className="font-mono text-zinc-900 dark:text-zinc-100">{padding}px</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={120}
                  value={padding}
                  onChange={(e) => setPadding(Number(e.target.value))}
                  className="w-full accent-blue-600 cursor-pointer"
                />
              </div>

              {/* Corner Radius */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  <span>Corner Radius</span>
                  <span className="font-mono text-zinc-900 dark:text-zinc-100">{radius}px</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={48}
                  value={radius}
                  onChange={(e) => setRadius(Number(e.target.value))}
                  className="w-full accent-blue-600 cursor-pointer"
                />
              </div>

              {/* Background Color */}
              {mode !== 'nid-a4' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                      Background
                    </span>
                    {(format === 'png' || format === 'webp') && (
                      <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-zinc-600 dark:text-zinc-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={transparentBg}
                          onChange={(e) => setTransparentBg(e.target.checked)}
                          className="accent-blue-600"
                        />
                        Transparent
                      </label>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {bgSwatches.map((hex) => (
                      <button
                        key={hex}
                        type="button"
                        onClick={() => {
                          setTransparentBg(false);
                          setBgColor(hex);
                        }}
                        style={{ backgroundColor: hex }}
                        aria-label={`Background ${hex}`}
                        className={`w-7 h-7 rounded-lg border cursor-pointer ${
                          !transparentBg && bgColor === hex
                            ? 'ring-2 ring-blue-600 border-blue-600'
                            : 'border-zinc-300 dark:border-zinc-700'
                        }`}
                      />
                    ))}
                    <input
                      type="color"
                      value={bgColor}
                      onChange={(e) => {
                        setTransparentBg(false);
                        setBgColor(e.target.value);
                      }}
                      className="w-8 h-7 rounded-lg border border-zinc-300 dark:border-zinc-700 cursor-pointer bg-transparent"
                      title="Custom color"
                    />
                  </div>
                </div>
              )}

              {/* Format Picker */}
              <div className="space-y-2 pt-1 border-t border-zinc-200/80 dark:border-zinc-800">
                <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  Export Format
                </span>
                <div className="grid grid-cols-4 gap-1.5">
                  {(['jpeg', 'png', 'webp', 'pdf'] as OutputFormat[]).map((fmt) => (
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
              </div>

              {format !== 'png' && (
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    <span>Quality</span>
                    <span className="font-mono text-zinc-900 dark:text-zinc-100">{quality}%</span>
                  </div>
                  <input
                    type="range"
                    min={60}
                    max={100}
                    value={quality}
                    onChange={(e) => setQuality(Number(e.target.value))}
                    className="w-full accent-blue-600 cursor-pointer"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Live Preview & Download */}
          <div className="lg:col-span-7 studio-card rounded-3xl p-4 sm:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-zinc-950 dark:text-zinc-100">
                  Live Merged Preview
                </h2>
                {outputDims.w > 0 && (
                  <p className="text-[11.5px] text-zinc-500 font-mono">
                    {outputDims.w} × {outputDims.h} px · {formatBytes(outputSize)} ·{' '}
                    {ext.toUpperCase()}
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

            <div className="relative rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-[repeating-conic-gradient(#f4f4f5_0%_25%,#ffffff_0%_50%)] dark:bg-[repeating-conic-gradient(#18181b_0%_25%,#09090b_0%_50%)] bg-[length:20px_20px] p-4 min-h-[300px] flex items-center justify-center overflow-hidden">
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt="Merged output preview"
                  className={`max-h-[540px] w-auto max-w-full object-contain rounded-lg shadow-md transition-opacity ${
                    isRendering ? 'opacity-60' : 'opacity-100'
                  }`}
                />
              ) : (
                <span className="text-xs text-zinc-400">Rendering preview…</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
