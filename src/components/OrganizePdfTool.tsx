import React, { useState, useRef, useEffect } from 'react';
import {
  Upload,
  Download,
  LayoutGrid,
  RotateCw,
  RotateCcw,
  ArrowLeft,
  ArrowRight,
  Trash2,
  Undo2,
  Stamp,
  Lock,
  Loader2,
  AlertCircle,
  CheckCircle2,
  ArrowUpDown,
} from 'lucide-react';
import { formatFileSize } from '../engine/imageEngine';
import { validatePdfFileSync } from '../engine/pdfEngine';

interface OrganizedPage {
  id: string;
  origIndex: number; // 0-based index in source PDF
  thumbUrl: string;
  addedRotation: number; // 0 | 90 | 180 | 270
}

type WatermarkSize = 'sm' | 'md' | 'lg';

const MAX_PREVIEW_PAGES = 60;

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

async function loadPdfJs() {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString();
  return pdfjs;
}

/** Renders watermark text (supports English, বাংলা & Unicode cleanly) to a single reusable transparent PNG */
async function renderWatermarkPngBytes(
  text: string,
  color: string,
  opacityPct: number
): Promise<{ bytes: Uint8Array; aspect: number }> {
  const clean = text.trim() || 'CONFIDENTIAL';
  const probe = document.createElement('canvas');
  const pCtx = probe.getContext('2d');
  const font = '800 96px Inter, system-ui, sans-serif';
  if (pCtx) pCtx.font = font;
  const textW = Math.max(200, Math.ceil(pCtx?.measureText(clean).width ?? 400));

  const pad = 40;
  const w = textW + pad * 2;
  const h = 156;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create watermark.');

  ctx.globalAlpha = Math.max(0.08, Math.min(0.85, opacityPct / 100));
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(clean, w / 2, h / 2);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Watermark encode failed.'))),
      'image/png'
    );
  });
  canvas.width = 0;
  canvas.height = 0;

  return {
    bytes: new Uint8Array(await blob.arrayBuffer()),
    aspect: w / h,
  };
}

export default function OrganizePdfTool() {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfBytes, setPdfBytes] = useState<ArrayBuffer | null>(null);
  const [pages, setPages] = useState<OrganizedPage[]>([]);
  const [deletedPages, setDeletedPages] = useState<OrganizedPage[]>([]);

  // Optional PDF Watermark Controls
  const [watermarkOn, setWatermarkOn] = useState<boolean>(false);
  const [wmText, setWmText] = useState<string>('CONFIDENTIAL');
  const [wmColor, setWmColor] = useState<string>('#dc2626');
  const [wmOpacity, setWmOpacity] = useState<number>(22);
  const [wmSize, setWmSize] = useState<WatermarkSize>('md');
  const [wmDiagonal, setWmDiagonal] = useState<boolean>(true);

  const [isLoading, setIsLoading] = useState(false);
  const [loadProgress, setLoadProgress] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isGlobalDragging, setIsGlobalDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);
  const runIdRef = useRef(0);
  const loadHandlerRef = useRef<(files: FileList | null) => void>(() => {});

  useEffect(() => {
    return () => {
      runIdRef.current++;
    };
  }, []);

  const handleLoadPdf = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (fileInputRef.current) fileInputRef.current.value = '';

    const valErr = validatePdfFileSync(file);
    if (valErr) {
      setErrorMsg(valErr);
      return;
    }

    const runId = ++runIdRef.current;
    setErrorMsg(null);
    setStatusMsg(null);
    setIsLoading(true);
    setLoadProgress('Reading PDF pages...');
    setPages([]);
    setDeletedPages([]);

    try {
      const bytes = await file.arrayBuffer();
      const pdfjs = await loadPdfJs();
      const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes.slice(0)) }).promise;

      if (runIdRef.current !== runId) {
        await doc.destroy();
        return;
      }

      const total = doc.numPages;
      if (total < 1) {
        await doc.destroy();
        throw new Error('This PDF contains no pages.');
      }

      setPdfFile(file);
      setPdfBytes(bytes);

      const loaded: OrganizedPage[] = [];
      const renderCount = Math.min(total, MAX_PREVIEW_PAGES);

      for (let i = 1; i <= total; i++) {
        if (runIdRef.current !== runId) {
          await doc.destroy();
          return;
        }

        let thumbUrl = '';
        if (i <= renderCount) {
          setLoadProgress(`Rendering thumbnail ${i} of ${renderCount}...`);
          const page = await doc.getPage(i);
          const baseVp = page.getViewport({ scale: 1 });
          const scale = Math.min(0.65, 220 / Math.max(baseVp.width, 1));
          const vp = page.getViewport({ scale });

          const c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(vp.width));
          c.height = Math.max(1, Math.round(vp.height));
          const ctx = c.getContext('2d');
          if (ctx) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, c.width, c.height);
            await page.render({ canvasContext: ctx, viewport: vp }).promise;
            thumbUrl = c.toDataURL('image/jpeg', 0.72);
          }
          c.width = 0;
          c.height = 0;
        }

        loaded.push({
          id: `pg_${i}_${Date.now()}`,
          origIndex: i - 1,
          thumbUrl,
          addedRotation: 0,
        });

        if (i % 4 === 0 || i === total) {
          setPages([...loaded]);
        }
      }

      await doc.destroy();
    } catch (err) {
      if (runIdRef.current === runId) {
        setErrorMsg(err instanceof Error ? err.message : 'Could not load PDF file.');
      }
    } finally {
      if (runIdRef.current === runId) {
        setIsLoading(false);
        setLoadProgress('');
      }
    }
  };

  loadHandlerRef.current = (files) => {
    void handleLoadPdf(files);
  };

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
      if (e.dataTransfer?.files?.length) loadHandlerRef.current(e.dataTransfer.files);
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

  const movePage = (idx: number, dir: -1 | 1) => {
    const nextIdx = idx + dir;
    if (nextIdx < 0 || nextIdx >= pages.length) return;
    setStatusMsg(null);
    setPages((prev) => {
      const copy = [...prev];
      const temp = copy[idx];
      copy[idx] = copy[nextIdx];
      copy[nextIdx] = temp;
      return copy;
    });
  };

  const rotatePage = (id: string, delta: 90 | -90) => {
    setStatusMsg(null);
    setPages((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, addedRotation: (p.addedRotation + delta + 360) % 360 } : p
      )
    );
  };

  const rotateAll = (delta: 90 | -90) => {
    setStatusMsg(null);
    setPages((prev) =>
      prev.map((p) => ({ ...p, addedRotation: (p.addedRotation + delta + 360) % 360 }))
    );
  };

  const reverseOrder = () => {
    setStatusMsg(null);
    setPages((prev) => [...prev].reverse());
  };

  const deletePage = (id: string) => {
    if (pages.length <= 1) {
      setErrorMsg('A PDF must keep at least 1 page.');
      return;
    }
    setErrorMsg(null);
    setStatusMsg(null);
    const target = pages.find((p) => p.id === id);
    if (!target) return;
    setPages((prev) => prev.filter((p) => p.id !== id));
    setDeletedPages((prev) => [...prev, target]);
  };

  const restoreLastDeleted = () => {
    if (deletedPages.length === 0) return;
    const restored = deletedPages[deletedPages.length - 1];
    setDeletedPages((prev) => prev.slice(0, -1));
    setPages((prev) => [...prev, restored]);
  };

  const handleSavePdf = async () => {
    if (!pdfBytes || !pdfFile || pages.length === 0) return;

    setIsExporting(true);
    setErrorMsg(null);
    setStatusMsg(null);

    try {
      const { PDFDocument, degrees } = await import('pdf-lib');
      const srcDoc = await PDFDocument.load(pdfBytes.slice(0), { ignoreEncryption: true });
      const outDoc = await PDFDocument.create();

      const copiedPages = await outDoc.copyPages(
        srcDoc,
        pages.map((p) => p.origIndex)
      );

      let embeddedWm: { img: Awaited<ReturnType<typeof outDoc.embedPng>>; aspect: number } | null =
        null;
      if (watermarkOn && wmText.trim()) {
        const wmAsset = await renderWatermarkPngBytes(wmText, wmColor, wmOpacity);
        const img = await outDoc.embedPng(wmAsset.bytes);
        embeddedWm = { img, aspect: wmAsset.aspect };
      }

      copiedPages.forEach((page, idx) => {
        const spec = pages[idx];
        const origRot = page.getRotation().angle || 0;
        const finalRot = ((origRot + spec.addedRotation) % 360 + 360) % 360;
        if (spec.addedRotation !== 0) {
          page.setRotation(degrees(finalRot));
        }

        if (embeddedWm) {
          const { width: w, height: h } = page.getSize();
          const baseDim = Math.min(w, h);
          const scaleFactor = wmSize === 'sm' ? 0.45 : wmSize === 'lg' ? 0.88 : 0.68;
          const drawW = baseDim * scaleFactor;
          const drawH = drawW / Math.max(0.5, embeddedWm.aspect);
          const angleDeg = wmDiagonal ? 38 : 0;
          const rad = (angleDeg * Math.PI) / 180;

          // Center the rotated rectangle accurately around page midpoint
          const cx = w / 2;
          const cy = h / 2;
          const x = cx - (drawW / 2) * Math.cos(rad) + (drawH / 2) * Math.sin(rad);
          const y = cy - (drawW / 2) * Math.sin(rad) - (drawH / 2) * Math.cos(rad);

          page.drawImage(embeddedWm.img, {
            x,
            y,
            width: drawW,
            height: drawH,
            rotate: degrees(angleDeg),
          });
        }

        outDoc.addPage(page);
      });

      const outBytes = await outDoc.save({ useObjectStreams: true });
      const blob = new Blob([outBytes], { type: 'application/pdf' });
      const baseName = pdfFile.name.replace(/\.pdf$/i, '');
      const suffix = watermarkOn ? 'watermarked' : 'organized';
      triggerDownload(blob, `${baseName}_${suffix}.pdf`);
      setStatusMsg(
        `Saved "${baseName}_${suffix}.pdf" (${pages.length} ${
          pages.length === 1 ? 'page' : 'pages'
        } · ${formatFileSize(blob.size)})`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save PDF.');
    } finally {
      setIsExporting(false);
    }
  };

  const resetAll = () => {
    runIdRef.current++;
    setPdfFile(null);
    setPdfBytes(null);
    setPages([]);
    setDeletedPages([]);
    setStatusMsg(null);
    setErrorMsg(null);
  };

  return (
    <div className="space-y-4 animate-fade-up">
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => void handleLoadPdf(e.target.files)}
      />

      {isGlobalDragging && (
        <div className="fixed inset-0 z-50 bg-zinc-950/65 backdrop-blur-md flex items-center justify-center p-6 pointer-events-none animate-scale-in">
          <div className="max-w-md w-full rounded-3xl border border-blue-400/50 bg-white/95 dark:bg-zinc-900/95 p-10 text-center shadow-2xl">
            <div className="w-16 h-16 rounded-2xl bg-blue-600 text-white flex items-center justify-center mx-auto mb-5 shadow-lg">
              <Upload className="w-7 h-7" aria-hidden="true" />
            </div>
            <p className="text-xl font-bold text-zinc-950 dark:text-white">
              Release to Organize PDF
            </p>
          </div>
        </div>
      )}

      <div className="studio-card rounded-3xl overflow-hidden">
        {!pdfFile ? (
          <div className="p-6 sm:p-10">
            <div
              role="button"
              tabIndex={0}
              aria-label="Select PDF to organize, rotate, or watermark"
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              onClick={() => fileInputRef.current?.click()}
              className="group min-h-[320px] sm:min-h-[360px] flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 hover:border-blue-500/70 bg-zinc-50/60 hover:bg-blue-50/20 dark:hover:bg-blue-950/15 p-8 text-center cursor-pointer transition-all"
            >
              {isLoading ? (
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-600" aria-hidden="true" />
                  <p className="text-sm font-semibold text-zinc-700">
                    {loadProgress || 'Loading PDF pages...'}
                  </p>
                </div>
              ) : (
                <>
                  <div className="w-16 h-16 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 shadow-sm flex items-center justify-center mb-6 group-hover:-translate-y-1 transition-transform">
                    <LayoutGrid className="w-7 h-7 text-zinc-900 dark:text-white group-hover:text-blue-600 transition-colors" aria-hidden="true" />
                  </div>
                  <span className="btn-studio-accent inline-flex items-center gap-2 px-7 py-3.5 rounded-2xl font-semibold text-sm sm:text-[15px]">
                    Select PDF Document
                  </span>
                  <p className="text-xs sm:text-sm text-zinc-500 mt-4">
                    Drop any PDF anywhere on screen to reorder, rotate, delete, or watermark pages
                  </p>
                  <p className="text-[11px] font-medium text-zinc-400 mt-3 uppercase tracking-wide">
                    Visual Thumbnails · Lossless Page Rotation · Custom Text Watermark · Zero Uploads
                  </p>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="divide-y divide-zinc-200/80">
            {/* Top Toolbar */}
            <div className="p-4 sm:px-6 bg-zinc-50/80 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => rotateAll(90)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-100 text-xs font-semibold text-zinc-700 cursor-pointer"
                >
                  <RotateCw className="w-3.5 h-3.5 text-blue-600" aria-hidden="true" />
                  <span>Rotate All 90°</span>
                </button>
                <button
                  type="button"
                  onClick={reverseOrder}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-100 text-xs font-semibold text-zinc-700 cursor-pointer"
                >
                  <ArrowUpDown className="w-3.5 h-3.5 text-blue-600" aria-hidden="true" />
                  <span>Reverse Order</span>
                </button>
                <button
                  type="button"
                  onClick={() => setWatermarkOn((v) => !v)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                    watermarkOn
                      ? 'bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 border-transparent'
                      : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-100'
                  }`}
                >
                  <Stamp className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Watermark {watermarkOn ? 'On' : 'Off'}</span>
                </button>
                {deletedPages.length > 0 && (
                  <button
                    type="button"
                    onClick={restoreLastDeleted}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-amber-500/15 text-amber-800 dark:text-amber-300 text-xs font-semibold cursor-pointer"
                  >
                    <Undo2 className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Undo Delete ({deletedPages.length})</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 text-xs">
                <span className="text-zinc-500 font-medium truncate max-w-[180px]">
                  {pdfFile.name}
                </span>
                <button
                  type="button"
                  onClick={resetAll}
                  aria-label="Close PDF"
                  className="p-2 rounded-xl border border-zinc-200 bg-white hover:text-red-600 text-zinc-500 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            </div>

            {/* Optional Watermark Controls Bar */}
            {watermarkOn && (
              <div className="p-4 sm:px-6 bg-blue-50/40 dark:bg-blue-950/15 flex flex-wrap items-center gap-4 text-xs animate-scale-in">
                <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                  <label htmlFor="pdf-wm-text" className="font-semibold text-zinc-700 shrink-0">
                    Text
                  </label>
                  <input
                    id="pdf-wm-text"
                    type="text"
                    value={wmText}
                    onChange={(e) => setWmText(e.target.value)}
                    placeholder="CONFIDENTIAL / DRAFT"
                    className="flex-1 bg-white border border-zinc-300 rounded-xl px-3 py-1.5 font-semibold"
                  />
                  <input
                    type="color"
                    aria-label="Watermark color"
                    value={wmColor}
                    onChange={(e) => setWmColor(e.target.value)}
                    className="w-8 h-8 p-0.5 rounded-xl border border-zinc-300 bg-white cursor-pointer shrink-0"
                  />
                </div>

                <div className="flex items-center gap-2 tabular-nums">
                  <label htmlFor="pdf-wm-op" className="font-semibold text-zinc-600">
                    Opacity ({wmOpacity}%)
                  </label>
                  <input
                    id="pdf-wm-op"
                    type="range"
                    min={10}
                    max={70}
                    value={wmOpacity}
                    onChange={(e) => setWmOpacity(Number(e.target.value))}
                    className="w-24"
                  />
                </div>

                <div className="inline-flex bg-zinc-200/70 dark:bg-zinc-800 p-0.5 rounded-xl gap-0.5">
                  {(
                    [
                      { id: 'sm', label: 'Small' },
                      { id: 'md', label: 'Medium' },
                      { id: 'lg', label: 'Large' },
                    ] as const
                  ).map((sz) => (
                    <button
                      key={sz.id}
                      type="button"
                      onClick={() => setWmSize(sz.id)}
                      className={`px-2.5 py-1 rounded-[10px] font-semibold cursor-pointer ${
                        wmSize === sz.id
                          ? 'bg-white dark:bg-zinc-950 text-zinc-950 dark:text-white shadow-xs'
                          : 'text-zinc-600'
                      }`}
                    >
                      {sz.label}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => setWmDiagonal((d) => !d)}
                  className={`px-2.5 py-1.5 rounded-xl font-semibold border cursor-pointer ${
                    wmDiagonal
                      ? 'bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 border-transparent'
                      : 'bg-white text-zinc-700 border-zinc-200'
                  }`}
                >
                  {wmDiagonal ? 'Diagonal' : 'Horizontal'}
                </button>
              </div>
            )}

            {/* Visual Page Thumbnail Grid */}
            <div className="p-5 sm:p-7 bg-zinc-50/50">
              {isLoading && (
                <div className="mb-4 flex items-center gap-2 text-xs font-semibold text-blue-600">
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  <span>{loadProgress}</span>
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5 max-h-[540px] overflow-y-auto pr-1">
                {pages.map((pg, idx) => (
                  <div
                    key={pg.id}
                    className="bg-white rounded-2xl border border-zinc-200/90 overflow-hidden flex flex-col justify-between shadow-xs hover:border-blue-500/40 transition"
                  >
                    <div className="relative aspect-[3/4] bg-zinc-100 flex items-center justify-center p-2 overflow-hidden">
                      {pg.thumbUrl ? (
                        <img
                          src={pg.thumbUrl}
                          alt={`Page ${idx + 1}`}
                          style={{ transform: `rotate(${pg.addedRotation}deg)` }}
                          className="max-w-full max-h-full object-contain rounded shadow-xs transition-transform duration-200"
                        />
                      ) : (
                        <span className="text-xs font-bold text-zinc-400">
                          Page #{pg.origIndex + 1}
                        </span>
                      )}

                      {watermarkOn && wmText.trim() && (
                        <span
                          className="pointer-events-none absolute inset-0 flex items-center justify-center px-2 text-center font-extrabold tracking-wide select-none overflow-hidden"
                          style={{
                            color: wmColor,
                            opacity: Math.max(0.15, wmOpacity / 100),
                            fontSize: wmSize === 'sm' ? '10px' : wmSize === 'lg' ? '16px' : '13px',
                            transform: wmDiagonal ? 'rotate(-38deg)' : 'none',
                          }}
                        >
                          {wmText}
                        </span>
                      )}

                      <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-zinc-950/80 text-white text-[10px] font-bold tabular-nums">
                        {idx + 1}
                      </span>
                      {pg.addedRotation !== 0 && (
                        <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded-md bg-blue-600 text-white text-[10px] font-bold tabular-nums">
                          {pg.addedRotation}°
                        </span>
                      )}
                    </div>

                    <div className="p-2 border-t border-zinc-100 flex items-center justify-between gap-1">
                      <div className="flex items-center gap-0.5">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => movePage(idx, -1)}
                          aria-label="Move page earlier"
                          title="Move left"
                          className="p-1.5 rounded-lg hover:bg-zinc-100 disabled:opacity-25 text-zinc-600 cursor-pointer"
                        >
                          <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === pages.length - 1}
                          onClick={() => movePage(idx, 1)}
                          aria-label="Move page later"
                          title="Move right"
                          className="p-1.5 rounded-lg hover:bg-zinc-100 disabled:opacity-25 text-zinc-600 cursor-pointer"
                        >
                          <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      </div>

                      <div className="flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => rotatePage(pg.id, -90)}
                          aria-label="Rotate page left"
                          title="Rotate left 90°"
                          className="p-1.5 rounded-lg hover:bg-zinc-100 text-zinc-600 cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => rotatePage(pg.id, 90)}
                          aria-label="Rotate page right"
                          title="Rotate right 90°"
                          className="p-1.5 rounded-lg hover:bg-zinc-100 text-zinc-600 cursor-pointer"
                        >
                          <RotateCw className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deletePage(pg.id)}
                          aria-label="Delete page"
                          title="Delete page"
                          className="p-1.5 rounded-lg hover:bg-red-500/10 text-zinc-400 hover:text-red-600 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Bottom Save Bar */}
            <div className="p-5 sm:px-7 bg-zinc-50/80 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3 text-xs">
                <span className="font-semibold text-zinc-600 tabular-nums">
                  {pages.length} {pages.length === 1 ? 'page' : 'pages'} ready
                </span>
                {statusMsg && (
                  <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                    {statusMsg}
                  </span>
                )}
              </div>

              <button
                type="button"
                disabled={isExporting || isLoading || pages.length === 0}
                onClick={() => void handleSavePdf()}
                className="btn-studio-accent w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl disabled:opacity-40 text-xs sm:text-sm font-semibold cursor-pointer"
              >
                {isExporting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                    <span>Saving PDF...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" aria-hidden="true" />
                    <span>Save Organized PDF</span>
                  </>
                )}
              </button>
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
