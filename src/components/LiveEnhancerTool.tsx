import React, { useState, useRef, useEffect } from 'react';
import {
  Upload,
  Download,
  Archive,
  Sparkles,
  Trash2,
  Lock,
  Loader2,
  AlertCircle,
  ChevronsLeftRight,
  ZoomIn,
  ZoomOut,
  ArrowRight,
  Plus,
  X,
  CheckCircle2,
  Zap,
  RotateCcw,
} from 'lucide-react';
import {
  processImage,
  formatFileSize,
  validateImageFile,
  type SupportedFormat,
} from '../engine/imageEngine';
import type {
  AiEnhanceMode,
  AiEnhanceMessage,
  AiEnhanceRequest,
} from '../engine/aiEnhance.worker';

interface AiResultData {
  blob: Blob;
  url: string;
  originalUrl: string;
  fileName: string;
  originalWidth: number;
  originalHeight: number;
  width: number;
  height: number;
  backend: 'WebGPU' | 'WASM';
  processingMs: number;
}

interface QueueItem {
  id: string;
  file: File;
  mode: AiEnhanceMode;
  format: SupportedFormat;
  previewUrl: string;
  status: 'queued' | 'processing' | 'done' | 'error';
  progressPct: number;
  progressStatus: string;
  result?: AiResultData;
  error?: string;
}

const MAX_QUEUE_FILES = 10;

let aiWorkerSingleton: Worker | null = null;
let jobSeq = 1;

function getAiWorker(): Worker {
  if (!aiWorkerSingleton) {
    aiWorkerSingleton = new Worker(new URL('../engine/aiEnhance.worker.ts', import.meta.url), {
      type: 'module',
    });
  }
  return aiWorkerSingleton;
}

async function normalizeHeic(file: File): Promise<Blob> {
  const isHeic =
    /\.(heic|heif)$/i.test(file.name) ||
    file.type === 'image/heic' ||
    file.type === 'image/heif';
  if (!isHeic) return file;
  const { default: heic2any } = await import('heic2any');
  const res = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.96 });
  return Array.isArray(res) ? res[0] : res;
}

function loadImg(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not decode this image file.'));
    };
    img.src = url;
  });
}

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

export default function LiveEnhancerTool() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<AiEnhanceMode>('fast2x');
  const [format, setFormat] = useState<SupportedFormat>('image/jpeg');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isGlobalDragging, setIsGlobalDragging] = useState(false);
  const [isZipping, setIsZipping] = useState(false);

  const [splitPos, setSplitPos] = useState(50);
  const [zoomed, setZoomed] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const queueScrollRef = useRef<HTMLDivElement>(null);
  const draggingSplitRef = useRef(false);
  const dragDepthRef = useRef(0);

  // Race-condition-free queue refs
  const queueRef = useRef<QueueItem[]>([]);
  const sessionIdRef = useRef(0);
  const activeRunnerRef = useRef<number | null>(null);
  const runnerSeqRef = useRef(0);
  const trackedUrlsRef = useRef<Set<string>>(new Set());
  const addFilesRef = useRef<(files: FileList | null) => void>(() => {});

  queueRef.current = queue;

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
      sessionIdRef.current++;
      trackedUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
      trackedUrlsRef.current.clear();
    };
  }, []);

  const patchQueueItem = (id: string, patch: Partial<QueueItem>, session: number) => {
    if (sessionIdRef.current !== session) return;
    const next = queueRef.current.map((q) => (q.id === id ? { ...q, ...patch } : q));
    queueRef.current = next;
    setQueue(next);
  };

  const processSingleQueueItem = async (item: QueueItem, session: number) => {
    const t0 = performance.now();

    patchQueueItem(
      item.id,
      {
        status: 'processing',
        progressPct: 3,
        progressStatus: 'Preparing image...',
        error: undefined,
      },
      session
    );

    try {
      const normalized = await normalizeHeic(item.file);
      const img = await loadImg(normalized);
      const origW = img.naturalWidth;
      const origH = img.naturalHeight;

      // Optimized input caps: fast2x = 448px (max 4 small tiles -> up to 896px), deep4x = 384px (up to 1536px)
      const maxInputSide = item.mode === 'fast2x' ? 448 : 384;
      let inW = origW;
      let inH = origH;
      if (Math.max(inW, inH) > maxInputSide) {
        const s = maxInputSide / Math.max(inW, inH);
        inW = Math.max(16, Math.round(inW * s));
        inH = Math.max(16, Math.round(inH * s));
      }

      const inCanvas = document.createElement('canvas');
      inCanvas.width = inW;
      inCanvas.height = inH;
      const inCtx = inCanvas.getContext('2d', { willReadFrequently: true });
      if (!inCtx) throw new Error('Canvas unavailable.');

      inCtx.fillStyle = '#FFFFFF';
      inCtx.fillRect(0, 0, inW, inH);
      inCtx.imageSmoothingEnabled = true;
      inCtx.imageSmoothingQuality = 'high';
      inCtx.drawImage(img, 0, 0, inW, inH);

      const inData = inCtx.getImageData(0, 0, inW, inH);
      const transferBuf = inData.data.slice().buffer;
      inCanvas.width = 0;
      inCanvas.height = 0;

      const worker = getAiWorker();
      const jobId = jobSeq++;

      const aiOutput = await new Promise<{
        rgbaBuffer: ArrayBuffer;
        width: number;
        height: number;
        backend: 'WebGPU' | 'WASM';
      }>((resolve, reject) => {
        const handleMsg = (e: MessageEvent<AiEnhanceMessage>) => {
          const msg = e.data;
          if (msg.id !== jobId) return;

          if (msg.type === 'progress') {
            patchQueueItem(
              item.id,
              { progressPct: msg.percent, progressStatus: msg.status },
              session
            );
          } else if (msg.type === 'done') {
            worker.removeEventListener('message', handleMsg);
            worker.removeEventListener('error', handleErr);
            resolve({
              rgbaBuffer: msg.rgbaBuffer,
              width: msg.width,
              height: msg.height,
              backend: msg.backend,
            });
          } else if (msg.type === 'error') {
            worker.removeEventListener('message', handleMsg);
            worker.removeEventListener('error', handleErr);
            reject(new Error(msg.error));
          }
        };

        const handleErr = () => {
          worker.removeEventListener('message', handleMsg);
          worker.removeEventListener('error', handleErr);
          reject(new Error('AI worker stopped unexpectedly. Try Fast AI 2× mode.'));
        };

        worker.addEventListener('message', handleMsg);
        worker.addEventListener('error', handleErr);

        const req: AiEnhanceRequest = {
          id: jobId,
          rgbaBuffer: transferBuf,
          width: inW,
          height: inH,
          mode: item.mode,
        };
        worker.postMessage(req, [transferBuf]);
      });

      const stillExists = queueRef.current.some((q) => q.id === item.id);
      if (sessionIdRef.current !== session || !stillExists) return;

      patchQueueItem(item.id, { progressPct: 96, progressStatus: 'Saving HD output...' }, session);

      const outCanvas = document.createElement('canvas');
      outCanvas.width = aiOutput.width;
      outCanvas.height = aiOutput.height;
      const outCtx = outCanvas.getContext('2d');
      if (!outCtx) throw new Error('Output canvas unavailable.');

      outCtx.putImageData(
        new ImageData(new Uint8ClampedArray(aiOutput.rgbaBuffer), aiOutput.width, aiOutput.height),
        0,
        0
      );

      const rawPngBlob = await new Promise<Blob>((resolve, reject) => {
        outCanvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('Failed to render output image.'))),
          'image/png'
        );
      });
      outCanvas.width = 0;
      outCanvas.height = 0;

      const baseName = item.file.name.replace(/\.[^/.]+$/, '');
      const tag = item.mode === 'fast2x' ? '2x' : '4x';
      const tempFile = new File([rawPngBlob], `${baseName}_ai_${tag}.png`, { type: 'image/png' });
      const encoded = await processImage(tempFile, {
        format: item.format,
        quality: item.format === 'image/png' ? 1 : 0.92,
      });

      if (sessionIdRef.current !== session || !queueRef.current.some((q) => q.id === item.id)) {
        URL.revokeObjectURL(encoded.url);
        URL.revokeObjectURL(encoded.originalUrl);
        return;
      }

      URL.revokeObjectURL(encoded.originalUrl);
      const trackedResultUrl = trackUrl(encoded.url);
      const trackedOrigUrl = trackUrl(URL.createObjectURL(normalized));

      const currentEntry = queueRef.current.find((q) => q.id === item.id);
      if (currentEntry?.result) {
        releaseUrl(currentEntry.result.url);
        releaseUrl(currentEntry.result.originalUrl);
      }

      patchQueueItem(
        item.id,
        {
          status: 'done',
          progressPct: 100,
          progressStatus: 'Done',
          result: {
            blob: encoded.blob,
            url: trackedResultUrl,
            originalUrl: trackedOrigUrl,
            fileName: encoded.fileName,
            originalWidth: origW,
            originalHeight: origH,
            width: aiOutput.width,
            height: aiOutput.height,
            backend: aiOutput.backend,
            processingMs: Math.round(performance.now() - t0),
          },
        },
        session
      );
    } catch (err) {
      patchQueueItem(
        item.id,
        {
          status: 'error',
          progressPct: 0,
          progressStatus: '',
          error: err instanceof Error ? err.message : 'Enhancement failed.',
        },
        session
      );
    }
  };

  const pumpQueue = async () => {
    if (activeRunnerRef.current !== null) return;

    const runnerToken = ++runnerSeqRef.current;
    const session = sessionIdRef.current;
    activeRunnerRef.current = runnerToken;

    try {
      while (sessionIdRef.current === session && activeRunnerRef.current === runnerToken) {
        const nextItem = queueRef.current.find((q) => q.status === 'queued');
        if (!nextItem) break;
        await processSingleQueueItem(nextItem, session);
      }
    } finally {
      if (activeRunnerRef.current === runnerToken) {
        activeRunnerRef.current = null;
        if (
          sessionIdRef.current === session &&
          queueRef.current.some((q) => q.status === 'queued')
        ) {
          void pumpQueue();
        }
      }
    }
  };

  const handleAddFiles = (incoming: FileList | null) => {
    if (!incoming || incoming.length === 0) return;
    setErrorMsg(null);

    const valid: File[] = [];
    const errs: string[] = [];

    Array.from(incoming).forEach((f) => {
      const err = validateImageFile(f);
      if (err) errs.push(err);
      else valid.push(f);
    });

    if (fileInputRef.current) fileInputRef.current.value = '';
    if (valid.length === 0) {
      if (errs.length > 0) setErrorMsg(errs[0]);
      return;
    }

    const remaining = MAX_QUEUE_FILES - queueRef.current.length;
    if (remaining <= 0) {
      setErrorMsg(`Queue holds up to ${MAX_QUEUE_FILES} photos. Clear completed items first.`);
      return;
    }

    const accepted = valid.slice(0, remaining);
    if (valid.length > remaining) {
      errs.push(`Limit is ${MAX_QUEUE_FILES} photos per batch. Extra files were skipped.`);
    }
    if (errs.length > 0) setErrorMsg(errs[0]);

    const newItems: QueueItem[] = accepted.map((file) => ({
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      file,
      mode,
      format,
      previewUrl: trackUrl(URL.createObjectURL(file)),
      status: 'queued',
      progressPct: 0,
      progressStatus: 'Waiting in queue...',
    }));

    // Prepend newest uploads right to the TOP of the queue and focus the newest photo
    const nextQueue = [...newItems, ...queueRef.current];
    queueRef.current = nextQueue;
    setQueue(nextQueue);
    setSelectedId(newItems[0].id);
    setSplitPos(50);
    setZoomed(false);

    requestAnimationFrame(() => {
      queueScrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    });

    void pumpQueue();
  };

  addFilesRef.current = handleAddFiles;

  // Global Drop Anywhere + Ctrl+V Paste
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

  const rerunItem = (id: string, targetMode?: AiEnhanceMode) => {
    const next = queueRef.current.map((q) =>
      q.id === id
        ? {
            ...q,
            mode: targetMode ?? q.mode,
            format,
            status: 'queued' as const,
            progressPct: 0,
            progressStatus: 'Queued...',
            error: undefined,
          }
        : q
    );
    queueRef.current = next;
    setQueue(next);
    setSelectedId(id);
    void pumpQueue();
  };

  const removeItem = (id: string) => {
    const target = queueRef.current.find((q) => q.id === id);
    if (target) {
      releaseUrl(target.previewUrl);
      if (target.result) {
        releaseUrl(target.result.url);
        releaseUrl(target.result.originalUrl);
      }
    }
    const next = queueRef.current.filter((q) => q.id !== id);
    queueRef.current = next;
    setQueue(next);
    if (selectedId === id) {
      setSelectedId(next[0]?.id ?? null);
    }
  };

  const clearAll = () => {
    sessionIdRef.current++;
    activeRunnerRef.current = null;
    queueRef.current.forEach((q) => {
      releaseUrl(q.previewUrl);
      if (q.result) {
        releaseUrl(q.result.url);
        releaseUrl(q.result.originalUrl);
      }
    });
    queueRef.current = [];
    setQueue([]);
    setSelectedId(null);
    setErrorMsg(null);
  };

  const completedItems = queue.filter((q) => q.status === 'done' && q.result);
  const activeItem =
    queue.find((q) => q.id === selectedId) ??
    queue[0] ??
    null;

  const handleDownloadAllZip = async () => {
    if (completedItems.length === 0) return;
    if (completedItems.length === 1 && completedItems[0].result) {
      triggerBlobDownload(completedItems[0].result.blob, completedItems[0].result.fileName);
      return;
    }

    setIsZipping(true);
    try {
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      completedItems.forEach((item, idx) => {
        if (item.result) {
          zip.file(`${idx + 1}_${item.result.fileName}`, item.result.blob);
        }
      });
      const blob = await zip.generateAsync({ type: 'blob' });
      triggerBlobDownload(blob, 'imagelab-ai-enhanced.zip');
    } finally {
      setIsZipping(false);
    }
  };

  const updateSplit = (clientX: number) => {
    const el = stageRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    const pct = ((clientX - rect.left) / rect.width) * 100;
    setSplitPos(Math.max(0, Math.min(100, pct)));
  };

  const handleSplitDown = (e: React.PointerEvent<HTMLDivElement>) => {
    draggingSplitRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    updateSplit(e.clientX);
  };

  const handleSplitMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingSplitRef.current) return;
    updateSplit(e.clientX);
  };

  const handleSplitUp = (e: React.PointerEvent<HTMLDivElement>) => {
    draggingSplitRef.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
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

      {isGlobalDragging && (
        <div className="fixed inset-0 z-50 bg-zinc-950/65 backdrop-blur-md flex items-center justify-center p-6 pointer-events-none animate-scale-in">
          <div className="max-w-md w-full rounded-3xl border border-blue-400/50 bg-white/95 dark:bg-zinc-900/95 p-10 text-center shadow-2xl">
            <div className="w-16 h-16 rounded-2xl bg-blue-600 text-white flex items-center justify-center mx-auto mb-5 shadow-lg">
              <Upload className="w-7 h-7" />
            </div>
            <p className="text-xl font-bold text-zinc-950 dark:text-white">
              Drop to Add to Top of Queue
            </p>
            <p className="text-sm text-zinc-500 mt-1.5">
              New photos appear on top and process automatically
            </p>
          </div>
        </div>
      )}

      <div className="studio-card rounded-3xl overflow-hidden">
        {/* Clean Mode & Format Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 sm:px-7 py-3.5 border-b border-zinc-200/80 bg-zinc-50/80">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="inline-flex bg-zinc-200/70 dark:bg-zinc-800 p-0.5 rounded-xl">
              <button
                type="button"
                onClick={() => setMode('fast2x')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] text-xs font-semibold transition cursor-pointer ${
                  mode === 'fast2x'
                    ? 'bg-white dark:bg-zinc-950 text-zinc-950 dark:text-white shadow-xs'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                <Zap className="w-3.5 h-3.5 text-blue-600" />
                <span>Fast AI 2×</span>
              </button>
              <button
                type="button"
                onClick={() => setMode('deep4x')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] text-xs font-semibold transition cursor-pointer ${
                  mode === 'deep4x'
                    ? 'bg-white dark:bg-zinc-950 text-zinc-950 dark:text-white shadow-xs'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Deep 4×</span>
              </button>
            </div>

            <select
              aria-label="Output format for new uploads"
              value={format}
              onChange={(e) => setFormat(e.target.value as SupportedFormat)}
              className="bg-white border border-zinc-300 rounded-xl px-3 py-1.5 text-xs font-semibold cursor-pointer"
            >
              <option value="image/jpeg">JPG · MozJPEG</option>
              <option value="image/png">PNG · Lossless</option>
              <option value="image/webp">WEBP</option>
            </select>
          </div>

          {queue.length > 0 && (
            <span className="text-xs font-semibold text-zinc-600 tabular-nums">
              {completedItems.length}/{queue.length} Enhanced
            </span>
          )}
        </div>

        {/* EMPTY DROPZONE */}
        {queue.length === 0 ? (
          <div className="p-6 sm:p-10">
            <div
              role="button"
              tabIndex={0}
              aria-label="Select photos for fast AI enhancement"
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
                <Sparkles className="w-7 h-7 text-zinc-900 dark:text-white group-hover:text-blue-600 transition-colors" />
              </div>

              <span className="btn-studio-accent inline-flex items-center gap-2 px-7 py-3.5 rounded-2xl font-semibold text-sm sm:text-[15px]">
                Select Photos to Enhance
              </span>

              <p className="text-xs sm:text-sm text-zinc-500 mt-4">
                Drop up to {MAX_QUEUE_FILES} photos anywhere · New uploads stay on top
              </p>

              <p className="text-[11px] font-medium text-zinc-400 mt-3 uppercase tracking-wide">
                Fast 2× AI · Live Background Queue · Split Compare
              </p>
            </div>
          </div>
        ) : (
          /* ACTIVE WORKSPACE */
          <div>
            {/* Top Split-Screen Inspector */}
            {activeItem && (
              <div className="bg-zinc-950 p-4 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3 text-xs text-zinc-400">
                  <span className="truncate font-medium max-w-[260px]">
                    {activeItem.file.name}
                    {activeItem.result && (
                      <span className="ml-2 text-zinc-500 tabular-nums">
                        ({(activeItem.result.processingMs / 1000).toFixed(1)}s · {activeItem.result.backend})
                      </span>
                    )}
                  </span>

                  <div className="flex items-center gap-2 shrink-0">
                    {activeItem.result && activeItem.status === 'done' && (
                      <>
                        {activeItem.mode === 'fast2x' && (
                          <button
                            type="button"
                            onClick={() => rerunItem(activeItem.id, 'deep4x')}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold transition cursor-pointer"
                            title="Re-run this photo with Deep 4× BSRGAN model"
                          >
                            <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                            <span className="hidden sm:inline">Deep 4×</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setZoomed((z) => !z)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold transition cursor-pointer"
                        >
                          {zoomed ? <ZoomOut className="w-3.5 h-3.5" /> : <ZoomIn className="w-3.5 h-3.5" />}
                          <span>{zoomed ? '100%' : 'Zoom 2×'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            triggerBlobDownload(activeItem.result!.blob, activeItem.result!.fileName)
                          }
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold transition cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Save</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div
                  ref={stageRef}
                  onPointerDown={activeItem.result && activeItem.status === 'done' ? handleSplitDown : undefined}
                  onPointerMove={activeItem.result && activeItem.status === 'done' ? handleSplitMove : undefined}
                  onPointerUp={activeItem.result && activeItem.status === 'done' ? handleSplitUp : undefined}
                  onPointerCancel={activeItem.result && activeItem.status === 'done' ? handleSplitUp : undefined}
                  className="relative w-full h-[44vh] sm:h-[52vh] min-h-[270px] rounded-2xl overflow-hidden bg-black/50 select-none touch-none cursor-ew-resize"
                >
                  {activeItem.result && activeItem.status === 'done' ? (
                    <>
                      <img
                        src={activeItem.result.url}
                        alt="AI Enhanced"
                        draggable={false}
                        className={`absolute inset-0 w-full h-full object-contain transition-transform duration-200 ${
                          zoomed ? 'scale-175' : 'scale-100'
                        }`}
                      />
                      <img
                        src={activeItem.result.originalUrl}
                        alt="Original"
                        draggable={false}
                        style={{ clipPath: `inset(0 ${100 - splitPos}% 0 0)` }}
                        className={`absolute inset-0 w-full h-full object-contain transition-transform duration-200 ${
                          zoomed ? 'scale-175' : 'scale-100'
                        }`}
                      />

                      <div className="pointer-events-none absolute top-3 left-3 px-2.5 py-1 rounded-lg bg-zinc-950/75 text-white text-[11px] font-semibold tabular-nums">
                        Before · {activeItem.result.originalWidth}×{activeItem.result.originalHeight}
                      </div>
                      <div className="pointer-events-none absolute top-3 right-3 px-2.5 py-1 rounded-lg bg-blue-600/90 text-white text-[11px] font-semibold tabular-nums">
                        AI HD · {activeItem.result.width}×{activeItem.result.height}
                      </div>

                      <div
                        className="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_12px_rgba(0,0,0,0.85)]"
                        style={{ left: `${splitPos}%` }}
                      >
                        <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white text-zinc-950 shadow-xl border-2 border-blue-600 flex items-center justify-center">
                          <ChevronsLeftRight className="w-4 h-4" />
                        </div>
                      </div>
                    </>
                  ) : activeItem.status === 'error' ? (
                    <div className="w-full h-full flex flex-col items-center justify-center text-red-400 gap-3 px-6 text-center">
                      <AlertCircle className="w-7 h-7" />
                      <p className="text-xs font-medium">{activeItem.error}</p>
                      <button
                        type="button"
                        onClick={() => rerunItem(activeItem.id)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" /> Try Again
                      </button>
                    </div>
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center px-6 text-center gap-4">
                      <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                      <div className="w-full max-w-xs space-y-2">
                        <div className="flex justify-between text-xs font-semibold text-zinc-300 tabular-nums">
                          <span className="truncate">{activeItem.progressStatus}</span>
                          <span>{activeItem.progressPct}%</span>
                        </div>
                        <div className="w-full h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                          <div
                            className="h-full bg-blue-500 transition-all duration-200"
                            style={{ width: `${Math.max(5, activeItem.progressPct)}%` }}
                          />
                        </div>
                      </div>
                      <p className="text-[11px] text-zinc-500">
                        Keep dropping more photos — they stack at the top and run automatically
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Live Multi-Photo Queue List (Newest ALWAYS on TOP) */}
            <div ref={queueScrollRef} className="divide-y divide-zinc-100 max-h-[320px] overflow-y-auto">
              {queue.map((item) => {
                const isSelected = activeItem?.id === item.id;
                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      setSelectedId(item.id);
                      setZoomed(false);
                    }}
                    className={`flex items-center justify-between gap-3 px-5 sm:px-7 py-3 cursor-pointer transition ${
                      isSelected ? 'bg-blue-50/50 dark:bg-blue-950/20' : 'hover:bg-zinc-50'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <img
                        src={item.result ? item.result.url : item.previewUrl}
                        alt={item.file.name}
                        className="w-11 h-11 rounded-xl object-cover border border-zinc-200 shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs sm:text-sm font-semibold text-zinc-900 truncate">
                          {item.file.name}
                        </p>

                        {item.status === 'processing' && (
                          <div className="mt-1 space-y-1 max-w-xs">
                            <div className="flex justify-between text-[11px] text-blue-600 dark:text-blue-400 font-semibold tabular-nums">
                              <span className="truncate">{item.progressStatus}</span>
                              <span>{item.progressPct}%</span>
                            </div>
                            <div className="w-full h-1 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
                              <div
                                className="h-full bg-blue-600 transition-all duration-200"
                                style={{ width: `${Math.max(5, item.progressPct)}%` }}
                              />
                            </div>
                          </div>
                        )}

                        {item.status === 'queued' && (
                          <p className="text-[11px] text-zinc-500 mt-0.5">
                            Queued · {item.mode === 'fast2x' ? 'Fast AI 2×' : 'Deep 4×'}
                          </p>
                        )}

                        {item.status === 'done' && item.result && (
                          <p className="text-[11px] text-zinc-500 mt-0.5 flex items-center gap-1.5 tabular-nums">
                            <span>
                              {item.result.originalWidth}×{item.result.originalHeight}
                            </span>
                            <ArrowRight className="w-3 h-3 text-zinc-400" />
                            <span className="font-semibold text-zinc-900">
                              {item.result.width}×{item.result.height}
                            </span>
                            <span>· {formatFileSize(item.result.blob.size)}</span>
                          </p>
                        )}

                        {item.status === 'error' && (
                          <p className="text-[11px] text-red-600 mt-0.5 truncate">{item.error}</p>
                        )}
                      </div>
                    </div>

                    <div
                      className="flex items-center gap-2 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {item.status === 'processing' && (
                        <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                      )}

                      {item.status === 'error' && (
                        <button
                          type="button"
                          onClick={() => rerunItem(item.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-100 text-xs font-semibold text-zinc-700 cursor-pointer"
                        >
                          <RotateCcw className="w-3 h-3" /> Retry
                        </button>
                      )}

                      {item.status === 'done' && item.result && (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 hidden sm:block" />
                          <button
                            type="button"
                            onClick={() =>
                              triggerBlobDownload(item.result!.blob, item.result!.fileName)
                            }
                            className="btn-studio-primary inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Download</span>
                          </button>
                        </>
                      )}

                      <button
                        type="button"
                        aria-label={`Remove ${item.file.name}`}
                        onClick={() => removeItem(item.id)}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-red-600 hover:bg-red-500/10 transition cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Bottom Action Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 sm:px-7 py-4 border-t border-zinc-200/80 bg-zinc-50/80">
              <button
                type="button"
                disabled={queue.length >= MAX_QUEUE_FILES}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-100 disabled:opacity-40 text-xs sm:text-[13px] font-semibold text-zinc-700 transition cursor-pointer tabular-nums"
              >
                <Plus className="w-4 h-4" />
                <span>Add More Photos ({queue.length}/{MAX_QUEUE_FILES})</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={clearAll}
                  title="Clear queue"
                  aria-label="Clear queue"
                  className="p-2.5 rounded-xl border border-zinc-200 bg-white hover:text-red-600 text-zinc-500 transition cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  disabled={completedItems.length === 0 || isZipping}
                  onClick={() => void handleDownloadAllZip()}
                  className="btn-studio-accent inline-flex items-center gap-2 px-5 py-2.5 rounded-xl disabled:opacity-40 text-xs sm:text-sm font-semibold cursor-pointer"
                >
                  {isZipping ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Zipping...</span>
                    </>
                  ) : completedItems.length > 1 ? (
                    <>
                      <Archive className="w-4 h-4" />
                      <span>Download ZIP ({completedItems.length})</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      <span>Download HD</span>
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
        <span>On-device AI · Photos never leave your browser (model caches once locally)</span>
      </p>
    </div>
  );
}
