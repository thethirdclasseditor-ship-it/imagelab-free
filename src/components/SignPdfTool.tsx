import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Upload,
  Download,
  PenTool,
  Type,
  Image as ImageIcon,
  Calendar,
  Trash2,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Lock,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Plus,
  X,
  Move,
  Sparkles,
} from 'lucide-react';
import { formatFileSize } from '../engine/imageEngine';
import { validatePdfFileSync } from '../engine/pdfEngine';

type SigCreatorTab = 'draw' | 'type' | 'upload';

interface PlacedStamp {
  id: string;
  pageNumber: number; // 1-based
  kind: 'signature' | 'date';
  dataUrl: string;
  aspect: number; // width / height
  xPct: number; // 0..100 left
  yPct: number; // 0..100 top
  wPct: number; // 8..60 width % of page
}

const INK_COLORS = [
  { hex: '#09090b', label: 'Black' },
  { hex: '#1e3a8a', label: 'Navy Ink' },
  { hex: '#2563eb', label: 'Royal Blue' },
];

const TYPE_STYLES = [
  { id: 'script', label: 'Signature Script', font: 'italic 64px Georgia, "Times New Roman", serif' },
  { id: 'elegant', label: 'Classic Cursive', font: 'italic 68px "Brush Script MT", "Segoe Script", cursive' },
  { id: 'clean', label: 'Executive Bold', font: '700 54px Inter, system-ui, sans-serif' },
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

async function loadPdfJs() {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString();
  return pdfjs;
}

/** Auto-trims empty transparent padding around a drawn signature canvas */
function trimCanvasToPng(src: HTMLCanvasElement): { dataUrl: string; aspect: number } | null {
  const ctx = src.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  const { width, height } = src;
  const data = ctx.getImageData(0, 0, width, height).data;

  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  let found = false;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 12) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
        found = true;
      }
    }
  }

  if (!found) return null;

  const pad = 12;
  const cx = Math.max(0, minX - pad);
  const cy = Math.max(0, minY - pad);
  const cw = Math.min(width - cx, maxX - minX + 1 + pad * 2);
  const ch = Math.min(height - cy, maxY - minY + 1 + pad * 2);

  const out = document.createElement('canvas');
  out.width = cw;
  out.height = ch;
  out.getContext('2d')?.drawImage(src, cx, cy, cw, ch, 0, 0, cw, ch);

  const dataUrl = out.toDataURL('image/png');
  const aspect = Math.max(0.4, Math.min(8, cw / Math.max(1, ch)));
  out.width = 0;
  out.height = 0;
  return { dataUrl, aspect };
}

/** Renders text (typed signature or date stamp) into a crisp transparent PNG */
function renderTextToPng(
  text: string,
  font: string,
  color: string
): { dataUrl: string; aspect: number } | null {
  const clean = text.trim();
  if (!clean) return null;

  const probe = document.createElement('canvas');
  const pCtx = probe.getContext('2d');
  if (!pCtx) return null;

  pCtx.font = font;
  const metrics = pCtx.measureText(clean);
  const w = Math.max(120, Math.ceil(metrics.width) + 48);
  const h = 112;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(clean, w / 2, h / 2);

  const trimmed = trimCanvasToPng(canvas);
  canvas.width = 0;
  canvas.height = 0;
  return trimmed;
}

/** Converts an uploaded signature photo into a clean PNG, optionally removing white paper background */
async function processUploadedSignature(
  file: File,
  stripWhiteBg: boolean
): Promise<{ dataUrl: string; aspect: number }> {
  const url = URL.createObjectURL(file);
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => {
      URL.revokeObjectURL(url);
      resolve(el);
    };
    el.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not decode signature image.'));
    };
    el.src = url;
  });

  const maxSide = 900;
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas unavailable.');

  ctx.drawImage(img, 0, 0, w, h);

  if (stripWhiteBg) {
    const imgData = ctx.getImageData(0, 0, w, h);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      if (lum > 215) {
        d[i + 3] = 0;
      } else if (lum > 175) {
        const factor = (215 - lum) / 40;
        d[i + 3] = Math.round(d[i + 3] * factor);
      }
    }
    ctx.putImageData(imgData, 0, 0);
  }

  const trimmed = trimCanvasToPng(canvas);
  const fallbackUrl = canvas.toDataURL('image/png');
  canvas.width = 0;
  canvas.height = 0;

  return trimmed ?? { dataUrl: fallbackUrl, aspect: Math.max(0.4, w / Math.max(1, h)) };
}

async function dataUrlToUint8Array(dataUrl: string): Promise<Uint8Array> {
  const res = await fetch(dataUrl);
  return new Uint8Array(await res.arrayBuffer());
}

export default function SignPdfTool() {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfBytes, setPdfBytes] = useState<ArrayBuffer | null>(null);
  const [pageCount, setPageCount] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageAspect, setPageAspect] = useState<number>(0.707);

  // Signature Creator State
  const [sigTab, setSigTab] = useState<SigCreatorTab>('draw');
  const [inkColor, setInkColor] = useState<string>('#09090b');
  const [typedName, setTypedName] = useState<string>('');
  const [typeStyleId, setTypeStyleId] = useState<string>('script');
  const [stripPaperBg, setStripPaperBg] = useState<boolean>(true);
  const [uploadedSigFile, setUploadedSigFile] = useState<File | null>(null);
  const [hasDrawnInk, setHasDrawnInk] = useState<boolean>(false);

  // Placed Stamps across all PDF pages
  const [placements, setPlacements] = useState<PlacedStamp[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [isLoadingPdf, setIsLoadingPdf] = useState(false);
  const [isRenderingPage, setIsRenderingPage] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isGlobalDragging, setIsGlobalDragging] = useState(false);

  const pdfInputRef = useRef<HTMLInputElement>(null);
  const sigUploadInputRef = useRef<HTMLInputElement>(null);
  const pdfCanvasRef = useRef<HTMLCanvasElement>(null);
  const stageWrapRef = useRef<HTMLDivElement>(null);
  const drawCanvasRef = useRef<HTMLCanvasElement>(null);

  const pdfDocProxyRef = useRef<{
    numPages: number;
    getPage: (n: number) => Promise<{
      getViewport: (opts: { scale: number }) => { width: number; height: number };
      render: (opts: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }) => { promise: Promise<void> };
    }>;
    destroy: () => Promise<void>;
  } | null>(null);

  const isDrawingSigRef = useRef(false);
  const lastDrawPtRef = useRef<{ x: number; y: number } | null>(null);
  const dragDepthRef = useRef(0);
  const dragStampRef = useRef<{
    id: string;
    mode: 'move' | 'resize';
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    origW: number;
    aspect: number;
  } | null>(null);
  const loadPdfRef = useRef<(files: FileList | null) => void>(() => {});

  useEffect(() => {
    return () => {
      void pdfDocProxyRef.current?.destroy?.();
      pdfDocProxyRef.current = null;
    };
  }, []);

  const renderPagePreview = useCallback(async (pageNum: number) => {
    const doc = pdfDocProxyRef.current;
    const canvas = pdfCanvasRef.current;
    if (!doc || !canvas) return;

    setIsRenderingPage(true);
    try {
      const page = await doc.getPage(pageNum);
      const baseVp = page.getViewport({ scale: 1 });
      const targetScale = Math.min(2, Math.max(1.2, 860 / Math.max(baseVp.width, 1)));
      const vp = page.getViewport({ scale: targetScale });

      canvas.width = Math.round(vp.width);
      canvas.height = Math.round(vp.height);
      setPageAspect(vp.width / Math.max(1, vp.height));

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({ canvasContext: ctx, viewport: vp }).promise;
    } catch {
      setErrorMsg('Failed to render PDF page preview.');
    } finally {
      setIsRenderingPage(false);
    }
  }, []);

  useEffect(() => {
    if (pageCount > 0 && currentPage >= 1 && currentPage <= pageCount) {
      void renderPagePreview(currentPage);
    }
  }, [pageCount, currentPage, renderPagePreview]);

  const handleLoadPdf = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    if (pdfInputRef.current) pdfInputRef.current.value = '';

    const valErr = validatePdfFileSync(file);
    if (valErr) {
      setErrorMsg(valErr);
      return;
    }

    setErrorMsg(null);
    setStatusMsg(null);
    setIsLoadingPdf(true);
    setPlacements([]);
    setSelectedId(null);

    try {
      const bytes = await file.arrayBuffer();
      const pdfjs = await loadPdfJs();

      if (pdfDocProxyRef.current) {
        await pdfDocProxyRef.current.destroy();
        pdfDocProxyRef.current = null;
      }

      const loadingTask = pdfjs.getDocument({ data: new Uint8Array(bytes.slice(0)) });
      const proxy = (await loadingTask.promise) as unknown as typeof pdfDocProxyRef.current;
      if (!proxy || proxy.numPages < 1) {
        throw new Error('This PDF has no readable pages.');
      }

      pdfDocProxyRef.current = proxy;
      setPdfFile(file);
      setPdfBytes(bytes);
      setPageCount(proxy.numPages);
      setCurrentPage(1);
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Could not open this PDF. Encrypted or damaged PDFs may not be supported.'
      );
    } finally {
      setIsLoadingPdf(false);
    }
  };

  loadPdfRef.current = (files) => {
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
      if (e.dataTransfer?.files?.length) loadPdfRef.current(e.dataTransfer.files);
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

  // Signature Drawing Pad Pointer Handlers
  const getDrawCoords = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = e.currentTarget;
    const rect = c.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * c.width,
      y: ((e.clientY - rect.top) / rect.height) * c.height,
    };
  };

  const onSigPadDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    isDrawingSigRef.current = true;
    const pt = getDrawCoords(e);
    lastDrawPtRef.current = pt;

    const ctx = e.currentTarget.getContext('2d');
    if (ctx) {
      ctx.fillStyle = inkColor;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    setHasDrawnInk(true);
  };

  const onSigPadMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingSigRef.current || !lastDrawPtRef.current) return;
    const pt = getDrawCoords(e);
    const ctx = e.currentTarget.getContext('2d');
    if (ctx) {
      ctx.strokeStyle = inkColor;
      ctx.lineWidth = 4.4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(lastDrawPtRef.current.x, lastDrawPtRef.current.y);
      ctx.lineTo(pt.x, pt.y);
      ctx.stroke();
    }
    lastDrawPtRef.current = pt;
  };

  const onSigPadUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    isDrawingSigRef.current = false;
    lastDrawPtRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const clearDrawPad = () => {
    const c = drawCanvasRef.current;
    if (c) {
      c.getContext('2d')?.clearRect(0, 0, c.width, c.height);
    }
    setHasDrawnInk(false);
  };

  const placeOnCurrentPage = (
    stamp: { dataUrl: string; aspect: number },
    kind: 'signature' | 'date'
  ) => {
    const wPct = kind === 'date' ? 18 : 26;
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const nextStamp: PlacedStamp = {
      id,
      pageNumber: currentPage,
      kind,
      dataUrl: stamp.dataUrl,
      aspect: stamp.aspect,
      xPct: kind === 'date' ? 62 : 58,
      yPct: kind === 'date' ? 80 : 72,
      wPct,
    };
    setPlacements((prev) => [...prev, nextStamp]);
    setSelectedId(id);
    setStatusMsg(null);
    setErrorMsg(null);
  };

  const handleAddSignatureToPage = async () => {
    setErrorMsg(null);
    try {
      if (sigTab === 'draw') {
        const c = drawCanvasRef.current;
        if (!c) return;
        const trimmed = trimCanvasToPng(c);
        if (!trimmed) {
          setErrorMsg('Draw your signature inside the pad first.');
          return;
        }
        placeOnCurrentPage(trimmed, 'signature');
        return;
      }

      if (sigTab === 'type') {
        const style = TYPE_STYLES.find((s) => s.id === typeStyleId) ?? TYPE_STYLES[0];
        const rendered = renderTextToPng(typedName, style.font, inkColor);
        if (!rendered) {
          setErrorMsg('Type your name first.');
          return;
        }
        placeOnCurrentPage(rendered, 'signature');
        return;
      }

      if (!uploadedSigFile) {
        setErrorMsg('Upload a signature image first.');
        return;
      }
      const processed = await processUploadedSignature(uploadedSigFile, stripPaperBg);
      placeOnCurrentPage(processed, 'signature');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not prepare signature.');
    }
  };

  const handleAddDateStamp = () => {
    const today = new Date().toLocaleDateString('en-US', {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
    });
    const rendered = renderTextToPng(today, '600 42px Inter, system-ui, sans-serif', inkColor);
    if (rendered) {
      placeOnCurrentPage(rendered, 'date');
    }
  };

  // Drag & Resize Placed Stamp on PDF Page
  const startStampInteraction = (
    stamp: PlacedStamp,
    mode: 'move' | 'resize',
    e: React.PointerEvent
  ) => {
    e.stopPropagation();
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setSelectedId(stamp.id);
    dragStampRef.current = {
      id: stamp.id,
      mode,
      startX: e.clientX,
      startY: e.clientY,
      origX: stamp.xPct,
      origY: stamp.yPct,
      origW: stamp.wPct,
      aspect: stamp.aspect,
    };
  };

  const onStampMove = (e: React.PointerEvent) => {
    const st = dragStampRef.current;
    const wrap = stageWrapRef.current;
    if (!st || !wrap) return;

    const rect = wrap.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const dxPct = ((e.clientX - st.startX) / rect.width) * 100;
    const dyPct = ((e.clientY - st.startY) / rect.height) * 100;

    setPlacements((prev) =>
      prev.map((item) => {
        if (item.id !== st.id) return item;
        if (st.mode === 'move') {
          const hPct = (item.wPct * pageAspect) / Math.max(0.3, item.aspect);
          const nx = Math.max(0, Math.min(100 - item.wPct, st.origX + dxPct));
          const ny = Math.max(0, Math.min(100 - Math.min(90, hPct), st.origY + dyPct));
          return { ...item, xPct: nx, yPct: ny };
        }
        const maxW = Math.min(70, 100 - item.xPct);
        const nw = Math.max(8, Math.min(maxW, st.origW + dxPct));
        return { ...item, wPct: nw };
      })
    );
  };

  const endStampInteraction = (e: React.PointerEvent) => {
    dragStampRef.current = null;
    if ((e.currentTarget as HTMLElement).hasPointerCapture?.(e.pointerId)) {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    }
  };

  const removePlacement = (id: string) => {
    setPlacements((prev) => prev.filter((p) => p.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  /** Permanently embeds all placed signatures & date stamps into the vector PDF via pdf-lib */
  const handleDownloadSignedPdf = async () => {
    if (!pdfBytes || !pdfFile) return;
    if (placements.length === 0) {
      setErrorMsg('Place at least one signature or date stamp onto a page first.');
      return;
    }

    setIsExporting(true);
    setErrorMsg(null);
    setStatusMsg(null);

    try {
      const { PDFDocument, degrees } = await import('pdf-lib');
      const pdfDoc = await PDFDocument.load(pdfBytes.slice(0), { ignoreEncryption: true });
      const pages = pdfDoc.getPages();

      const embeddedCache = new Map<string, Awaited<ReturnType<typeof pdfDoc.embedPng>>>();

      for (const stamp of placements) {
        const page = pages[stamp.pageNumber - 1];
        if (!page) continue;

        let pdfImg = embeddedCache.get(stamp.dataUrl);
        if (!pdfImg) {
          const pngBytes = await dataUrlToUint8Array(stamp.dataUrl);
          pdfImg = await pdfDoc.embedPng(pngBytes);
          embeddedCache.set(stamp.dataUrl, pdfImg);
        }

        const box = page.getCropBox();
        const rawW = box.width;
        const rawH = box.height;
        const rotAngle = ((page.getRotation().angle % 360) + 360) % 360;

        const isSwapped = rotAngle === 90 || rotAngle === 270;
        const visW = isSwapped ? rawH : rawW;
        const visH = isSwapped ? rawW : rawH;

        const drawW = (stamp.wPct / 100) * visW;
        const drawH = drawW / Math.max(0.3, stamp.aspect);
        const vx = (stamp.xPct / 100) * visW;
        const vy = (stamp.yPct / 100) * visH;

        if (rotAngle === 90) {
          page.drawImage(pdfImg, {
            x: box.x + vy + drawH,
            y: box.y + vx,
            width: drawW,
            height: drawH,
            rotate: degrees(90),
          });
        } else if (rotAngle === 180) {
          page.drawImage(pdfImg, {
            x: box.x + rawW - vx,
            y: box.y + vy + drawH,
            width: drawW,
            height: drawH,
            rotate: degrees(180),
          });
        } else if (rotAngle === 270) {
          page.drawImage(pdfImg, {
            x: box.x + rawW - (vy + drawH),
            y: box.y + rawH - vx,
            width: drawW,
            height: drawH,
            rotate: degrees(-90),
          });
        } else {
          page.drawImage(pdfImg, {
            x: box.x + vx,
            y: box.y + rawH - (vy + drawH),
            width: drawW,
            height: drawH,
          });
        }
      }

      const outBytes = await pdfDoc.save({ useObjectStreams: true });
      const blob = new Blob([outBytes], { type: 'application/pdf' });
      const baseName = pdfFile.name.replace(/\.pdf$/i, '');
      triggerDownload(blob, `${baseName}_signed.pdf`);
      setStatusMsg(
        `Saved "${baseName}_signed.pdf" (${formatFileSize(blob.size)} · ${placements.length} ${
          placements.length === 1 ? 'stamp' : 'stamps'
        })`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save signed PDF.');
    } finally {
      setIsExporting(false);
    }
  };

  const resetAll = () => {
    void pdfDocProxyRef.current?.destroy?.();
    pdfDocProxyRef.current = null;
    setPdfFile(null);
    setPdfBytes(null);
    setPageCount(0);
    setCurrentPage(1);
    setPlacements([]);
    setSelectedId(null);
    setStatusMsg(null);
    setErrorMsg(null);
  };

  const currentPageStamps = placements.filter((p) => p.pageNumber === currentPage);

  return (
    <div className="space-y-4 animate-fade-up">
      <input
        ref={pdfInputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => void handleLoadPdf(e.target.files)}
      />
      <input
        ref={sigUploadInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const picked = e.target.files?.[0] ?? null;
          if (sigUploadInputRef.current) sigUploadInputRef.current.value = '';
          if (picked) {
            setUploadedSigFile(picked);
            setErrorMsg(null);
          }
        }}
      />

      {isGlobalDragging && (
        <div className="fixed inset-0 z-50 bg-zinc-950/65 backdrop-blur-md flex items-center justify-center p-6 pointer-events-none animate-scale-in">
          <div className="max-w-md w-full rounded-3xl border border-blue-400/50 bg-white/95 dark:bg-zinc-900/95 p-10 text-center shadow-2xl">
            <div className="w-16 h-16 rounded-2xl bg-blue-600 text-white flex items-center justify-center mx-auto mb-5 shadow-lg">
              <Upload className="w-7 h-7" aria-hidden="true" />
            </div>
            <p className="text-xl font-bold text-zinc-950 dark:text-white">
              Release to Sign PDF
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
              aria-label="Select PDF document to sign"
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  pdfInputRef.current?.click();
                }
              }}
              onClick={() => pdfInputRef.current?.click()}
              className="group min-h-[320px] sm:min-h-[360px] flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 hover:border-blue-500/70 bg-zinc-50/60 hover:bg-blue-50/20 dark:hover:bg-blue-950/15 p-8 text-center cursor-pointer transition-all"
            >
              {isLoadingPdf ? (
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-600" aria-hidden="true" />
                  <p className="text-sm font-semibold text-zinc-700">Opening PDF...</p>
                </div>
              ) : (
                <>
                  <div className="w-16 h-16 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 shadow-sm flex items-center justify-center mb-6 group-hover:-translate-y-1 transition-transform">
                    <PenTool className="w-7 h-7 text-zinc-900 dark:text-white group-hover:text-blue-600 transition-colors" aria-hidden="true" />
                  </div>
                  <span className="btn-studio-accent inline-flex items-center gap-2 px-7 py-3.5 rounded-2xl font-semibold text-sm sm:text-[15px]">
                    Select PDF to Sign
                  </span>
                  <p className="text-xs sm:text-sm text-zinc-500 mt-4">
                    Drop your contract, form, or agreement anywhere on screen
                  </p>
                  <p className="text-[11px] font-medium text-zinc-400 mt-3 uppercase tracking-wide">
                    Draw · Type · Upload Signature · Add Date Stamp · Unlimited &amp; Private
                  </p>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="grid lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-zinc-200/80">
            {/* Left: Interactive PDF Page Preview */}
            <div className="lg:col-span-7 bg-zinc-950 p-4 sm:p-6 flex flex-col justify-between gap-4 select-none">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-400">
                <span className="truncate font-semibold max-w-[240px]">
                  {pdfFile.name}
                </span>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={currentPage <= 1 || isRenderingPage}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    aria-label="Previous page"
                    className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-30 text-white cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" aria-hidden="true" />
                  </button>
                  <span className="px-2 font-semibold text-zinc-200 tabular-nums">
                    Page {currentPage} / {pageCount}
                  </span>
                  <button
                    type="button"
                    disabled={currentPage >= pageCount || isRenderingPage}
                    onClick={() => setCurrentPage((p) => Math.min(pageCount, p + 1))}
                    aria-label="Next page"
                    className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-30 text-white cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={resetAll}
                    aria-label="Close PDF"
                    className="p-1.5 ml-1 rounded-lg bg-white/10 hover:bg-red-500/80 text-white cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>

              <div className="flex-1 flex flex-col items-center justify-center gap-2.5 min-h-[340px]">
                <p className="text-[11px] text-zinc-400 inline-flex items-center gap-1.5">
                  <Move className="w-3.5 h-3.5 text-blue-400" aria-hidden="true" />
                  <span>
                    {currentPageStamps.length > 0
                      ? 'Drag signature to position · Pull blue corner dot to resize'
                      : 'Create your signature on the right, then click Place on Page'}
                  </span>
                </p>

                <div
                  ref={stageWrapRef}
                  onClick={() => setSelectedId(null)}
                  className="relative inline-block max-w-full leading-none shadow-2xl rounded-lg overflow-hidden bg-white"
                >
                  <canvas
                    ref={pdfCanvasRef}
                    className="block max-h-[60vh] max-w-full w-auto h-auto pointer-events-none"
                  />

                  {isRenderingPage && (
                    <div className="absolute inset-0 bg-zinc-950/35 flex items-center justify-center">
                      <Loader2 className="w-7 h-7 animate-spin text-white" aria-hidden="true" />
                    </div>
                  )}

                  {currentPageStamps.map((stamp) => {
                    const isSelected = selectedId === stamp.id;
                    return (
                      <div
                        key={stamp.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedId(stamp.id);
                        }}
                        onPointerDown={(e) => startStampInteraction(stamp, 'move', e)}
                        onPointerMove={onStampMove}
                        onPointerUp={endStampInteraction}
                        onPointerCancel={endStampInteraction}
                        style={{
                          left: `${stamp.xPct}%`,
                          top: `${stamp.yPct}%`,
                          width: `${stamp.wPct}%`,
                        }}
                        className={`absolute cursor-move touch-none rounded-md transition-shadow ${
                          isSelected
                            ? 'ring-2 ring-blue-500 bg-blue-500/8'
                            : 'ring-1 ring-dashed ring-blue-500/60 hover:ring-blue-500'
                        }`}
                      >
                        <img
                          src={stamp.dataUrl}
                          alt={stamp.kind === 'date' ? 'Date stamp' : 'Signature'}
                          draggable={false}
                          className="w-full h-auto block pointer-events-none select-none"
                        />

                        {/* Remove Stamp Button */}
                        <button
                          type="button"
                          aria-label="Remove stamp"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            removePlacement(stamp.id);
                          }}
                          className="absolute -top-2.5 -right-2.5 w-5 h-5 rounded-full bg-red-600 text-white flex items-center justify-center shadow-md hover:bg-red-700 cursor-pointer"
                        >
                          <X className="w-3 h-3" aria-hidden="true" />
                        </button>

                        {/* Resize Corner Handle */}
                        <div
                          title="Drag to resize"
                          onPointerDown={(e) => startStampInteraction(stamp, 'resize', e)}
                          onPointerMove={onStampMove}
                          onPointerUp={endStampInteraction}
                          onPointerCancel={endStampInteraction}
                          className="absolute -bottom-2.5 -right-2.5 w-5 h-5 rounded-full bg-blue-600 border-2 border-white shadow-md cursor-nwse-resize touch-none"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Right: Signature Studio & Export */}
            <div className="lg:col-span-5 p-5 sm:p-6 bg-white flex flex-col justify-between gap-5">
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                    Create Signature
                  </span>
                  <div className="flex items-center gap-1.5">
                    {INK_COLORS.map((c) => (
                      <button
                        key={c.hex}
                        type="button"
                        title={c.label}
                        aria-label={`Ink color ${c.label}`}
                        onClick={() => setInkColor(c.hex)}
                        className={`w-5 h-5 rounded-full border-2 cursor-pointer transition ${
                          inkColor === c.hex ? 'border-blue-500 scale-110' : 'border-zinc-300'
                        }`}
                        style={{ backgroundColor: c.hex }}
                      />
                    ))}
                  </div>
                </div>

                {/* Mode Tabs */}
                <div className="grid grid-cols-3 bg-zinc-200/70 dark:bg-zinc-800 p-0.5 rounded-xl gap-0.5">
                  {(
                    [
                      { id: 'draw', label: 'Draw', icon: <PenTool className="w-3.5 h-3.5" aria-hidden="true" /> },
                      { id: 'type', label: 'Type', icon: <Type className="w-3.5 h-3.5" aria-hidden="true" /> },
                      { id: 'upload', label: 'Upload', icon: <ImageIcon className="w-3.5 h-3.5" aria-hidden="true" /> },
                    ] as const
                  ).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setSigTab(t.id)}
                      className={`inline-flex items-center justify-center gap-1.5 py-2 px-2 rounded-[10px] text-xs font-semibold transition cursor-pointer ${
                        sigTab === t.id
                          ? 'bg-white dark:bg-zinc-950 text-zinc-950 dark:text-white shadow-xs'
                          : 'text-zinc-600'
                      }`}
                    >
                      {t.icon}
                      <span>{t.label}</span>
                    </button>
                  ))}
                </div>

                {/* Tab 1: Draw Signature Pad */}
                {sigTab === 'draw' && (
                  <div className="space-y-2">
                    <div className="relative rounded-2xl border border-zinc-300 bg-zinc-50 dark:bg-zinc-100 overflow-hidden">
                      <canvas
                        ref={drawCanvasRef}
                        width={520}
                        height={180}
                        onPointerDown={onSigPadDown}
                        onPointerMove={onSigPadMove}
                        onPointerUp={onSigPadUp}
                        onPointerCancel={onSigPadUp}
                        className="w-full h-36 block cursor-crosshair touch-none"
                      />
                      {!hasDrawnInk && (
                        <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-zinc-400">
                          Sign here with mouse, stylus, or finger
                        </span>
                      )}
                      {hasDrawnInk && (
                        <button
                          type="button"
                          onClick={clearDrawPad}
                          className="absolute top-2 right-2 inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/90 border border-zinc-200 text-[11px] font-semibold text-zinc-600 hover:text-red-600 cursor-pointer"
                        >
                          <RotateCcw className="w-3 h-3" aria-hidden="true" /> Clear
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Tab 2: Type Signature */}
                {sigTab === 'type' && (
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={typedName}
                      onChange={(e) => setTypedName(e.target.value)}
                      placeholder="Type your full name..."
                      className="w-full bg-zinc-50 border border-zinc-300 rounded-xl px-3.5 py-2.5 text-sm font-medium"
                    />
                    <div className="grid grid-cols-3 gap-1.5">
                      {TYPE_STYLES.map((st) => (
                        <button
                          key={st.id}
                          type="button"
                          onClick={() => setTypeStyleId(st.id)}
                          className={`py-2 px-2 rounded-xl text-[11px] font-semibold border cursor-pointer ${
                            typeStyleId === st.id
                              ? 'bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 border-transparent'
                              : 'bg-zinc-50 text-zinc-700 border-zinc-200'
                          }`}
                        >
                          {st.label}
                        </button>
                      ))}
                    </div>
                    <div className="h-20 rounded-2xl border border-zinc-200 bg-zinc-50 dark:bg-zinc-100 flex items-center justify-center px-4 overflow-hidden">
                      <span
                        className="text-3xl truncate"
                        style={{
                          color: inkColor,
                          fontFamily:
                            typeStyleId === 'elegant'
                              ? '"Brush Script MT", "Segoe Script", cursive'
                              : typeStyleId === 'script'
                                ? 'Georgia, serif'
                                : 'Inter, system-ui, sans-serif',
                          fontStyle: typeStyleId === 'clean' ? 'normal' : 'italic',
                          fontWeight: typeStyleId === 'clean' ? 700 : 400,
                        }}
                      >
                        {typedName.trim() || 'Your Signature'}
                      </span>
                    </div>
                  </div>
                )}

                {/* Tab 3: Upload Signature Image */}
                {sigTab === 'upload' && (
                  <div className="space-y-3">
                    <button
                      type="button"
                      onClick={() => sigUploadInputRef.current?.click()}
                      className="w-full py-5 px-4 rounded-2xl border border-dashed border-zinc-300 hover:border-blue-500 text-xs font-semibold text-zinc-700 flex flex-col items-center justify-center gap-2 cursor-pointer"
                    >
                      <Upload className="w-5 h-5 text-blue-600" aria-hidden="true" />
                      <span>
                        {uploadedSigFile
                          ? `Loaded: ${uploadedSigFile.name} (Change)`
                          : 'Upload Signature Photo (PNG / JPG)'}
                      </span>
                    </button>

                    <label className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-zinc-50 border border-zinc-200 text-xs font-semibold text-zinc-700 cursor-pointer">
                      <span className="inline-flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-blue-600" aria-hidden="true" />
                        Auto-remove white paper background
                      </span>
                      <input
                        type="checkbox"
                        checked={stripPaperBg}
                        onChange={(e) => setStripPaperBg(e.target.checked)}
                        className="w-4 h-4 accent-blue-600"
                      />
                    </label>
                  </div>
                )}

                {/* Place on Page Actions */}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => void handleAddSignatureToPage()}
                    className="btn-studio-primary inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-xs font-semibold cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Place Signature</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleAddDateStamp}
                    className="inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-100 text-xs font-semibold text-zinc-700 transition cursor-pointer"
                  >
                    <Calendar className="w-3.5 h-3.5 text-blue-600" aria-hidden="true" />
                    <span>Add Date Stamp</span>
                  </button>
                </div>

                {/* Placed Summary */}
                {placements.length > 0 && (
                  <div className="rounded-2xl bg-zinc-50 border border-zinc-200/80 p-3 flex items-center justify-between gap-2 text-xs">
                    <span className="text-zinc-600 font-medium tabular-nums">
                      <strong>{placements.length}</strong>{' '}
                      {placements.length === 1 ? 'stamp' : 'stamps'} placed ({currentPageStamps.length}{' '}
                      on this page)
                    </span>
                    <button
                      type="button"
                      onClick={() => setPlacements([])}
                      className="text-zinc-500 hover:text-red-600 font-semibold cursor-pointer"
                    >
                      Clear all
                    </button>
                  </div>
                )}
              </div>

              <div className="space-y-2.5 pt-3 border-t border-zinc-200/80">
                {statusMsg && (
                  <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>{statusMsg}</span>
                  </p>
                )}

                <button
                  type="button"
                  disabled={isExporting || placements.length === 0}
                  onClick={() => void handleDownloadSignedPdf()}
                  className="btn-studio-accent w-full py-3 px-5 rounded-xl disabled:opacity-40 text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isExporting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                      <span>Signing PDF...</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" aria-hidden="true" />
                      <span>Download Signed PDF</span>
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
        <span>100% Private · Contracts and handwritten signatures never leave your device</span>
      </p>
    </div>
  );
}
