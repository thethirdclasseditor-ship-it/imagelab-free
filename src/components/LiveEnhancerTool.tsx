import React, { useState, useRef, useEffect } from 'react';
import {
  Upload,
  Download,
  Sparkles,
  Trash2,
  Lock,
  Loader2,
  AlertCircle,
  ChevronsLeftRight,
  ZoomIn,
  ZoomOut,
  ArrowRight,
  Cpu,
} from 'lucide-react';
import {
  processImage,
  formatFileSize,
  validateImageFile,
  type SupportedFormat,
} from '../engine/imageEngine';
import type { AiEnhanceMessage, AiEnhanceRequest } from '../engine/aiEnhance.worker';

type QualityMode = 'hd' | 'ultra';

interface AiResultState {
  blob: Blob;
  url: string;
  originalUrl: string;
  rawCanvasBlob: Blob;
  fileName: string;
  originalWidth: number;
  originalHeight: number;
  width: number;
  height: number;
  backend: 'WebGPU' | 'WASM';
  processingMs: number;
}

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

export default function LiveEnhancerTool() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<AiResultState | null>(null);
  const [qualityMode, setQualityMode] = useState<QualityMode>('hd');
  const [format, setFormat] = useState<SupportedFormat>('image/jpeg');

  const [isProcessing, setIsProcessing] = useState(false);
  const [isReEncoding, setIsReEncoding] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [progressStatus, setProgressStatus] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isGlobalDragging, setIsGlobalDragging] = useState(false);

  // Split-screen compare state
  const [splitPos, setSplitPos] = useState(50);
  const [zoomed, setZoomed] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const draggingSplitRef = useRef(false);
  const dragDepthRef = useRef(0);
  const activeRunIdRef = useRef(0);
  const selectHandlerRef = useRef<(files: FileList | null) => void>(() => {});

  useEffect(() => {
    return () => {
      if (result) {
        URL.revokeObjectURL(result.url);
        URL.revokeObjectURL(result.originalUrl);
      }
    };
  }, [result]);

  const runAiRestore = async (targetFile: File, mode: QualityMode, outFormat: SupportedFormat) => {
    const runId = ++activeRunIdRef.current;
    const t0 = performance.now();

    setIsProcessing(true);
    setErrorMsg(null);
    setProgressPct(2);
    setProgressStatus('Preparing image for Neural Super-Resolution...');

    try {
      const normalized = await normalizeHeic(targetFile);
      const img = await loadImg(normalized);
      const origW = img.naturalWidth;
      const origH = img.naturalHeight;

      // Cap AI input side so 4x output stays crisp (up to 2048px HD or 2816px Ultra) without crashing RAM
      const maxInputSide = mode === 'ultra' ? 704 : 512;
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

      const inImgData = inCtx.getImageData(0, 0, inW, inH);
      const transferBuf = inImgData.data.slice().buffer;
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
            if (activeRunIdRef.current === runId) {
              setProgressPct(msg.percent);
              setProgressStatus(msg.status);
            }
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
          reject(new Error('AI worker crashed. Try Standard HD mode or a smaller photo.'));
        };

        worker.addEventListener('message', handleMsg);
        worker.addEventListener('error', handleErr);

        const req: AiEnhanceRequest = {
          id: jobId,
          rgbaBuffer: transferBuf,
          width: inW,
          height: inH,
        };
        worker.postMessage(req, [transferBuf]);
      });

      if (activeRunIdRef.current !== runId) return;

      setProgressPct(98);
      setProgressStatus('Encoding HD output...');

      const outCanvas = document.createElement('canvas');
      outCanvas.width = aiOutput.width;
      outCanvas.height = aiOutput.height;
      const outCtx = outCanvas.getContext('2d');
      if (!outCtx) throw new Error('Output canvas unavailable.');

      const outData = new ImageData(
        new Uint8ClampedArray(aiOutput.rgbaBuffer),
        aiOutput.width,
        aiOutput.height
      );
      outCtx.putImageData(outData, 0, 0);

      const rawPngBlob = await new Promise<Blob>((resolve, reject) => {
        outCanvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('Failed to build output bitmap.'))),
          'image/png'
        );
      });
      outCanvas.width = 0;
      outCanvas.height = 0;

      // Encode cleanly with our MozJPEG / LibWebP / UPNG engine
      const baseName = targetFile.name.replace(/\.[^/.]+$/, '');
      const tempFile = new File([rawPngBlob], `${baseName}_ai_hd.png`, { type: 'image/png' });
      const encoded = await processImage(tempFile, {
        format: outFormat,
        quality: outFormat === 'image/png' ? 1 : 0.92,
      });

      if (activeRunIdRef.current !== runId) {
        URL.revokeObjectURL(encoded.url);
        URL.revokeObjectURL(encoded.originalUrl);
        return;
      }

      URL.revokeObjectURL(encoded.originalUrl);

      setResult({
        blob: encoded.blob,
        url: encoded.url,
        originalUrl: URL.createObjectURL(normalized),
        rawCanvasBlob: rawPngBlob,
        fileName: encoded.fileName,
        originalWidth: origW,
        originalHeight: origH,
        width: aiOutput.width,
        height: aiOutput.height,
        backend: aiOutput.backend,
        processingMs: Math.round(performance.now() - t0),
      });
      setProgressPct(100);
    } catch (err) {
      if (activeRunIdRef.current !== runId) return;
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'AI enhancement failed. Check your internet connection on first run.'
      );
    } finally {
      if (activeRunIdRef.current === runId) {
        setIsProcessing(false);
        setProgressStatus('');
      }
    }
  };

  const handleFileSelect = (incoming: FileList | null) => {
    if (!incoming || incoming.length === 0) return;
    const picked = incoming[0];
    const err = validateImageFile(picked);
    if (err) {
      setErrorMsg(err);
      return;
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
    setFile(picked);
    setResult(null);
    setSplitPos(50);
    setZoomed(false);
    void runAiRestore(picked, qualityMode, format);
  };

  selectHandlerRef.current = handleFileSelect;

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

  // Re-encode already restored bitmap instantaneously when switching JPG / PNG / WEBP
  const handleFormatChange = async (nextFmt: SupportedFormat) => {
    setFormat(nextFmt);
    if (!result || !file) return;
    setIsReEncoding(true);
    try {
      const baseName = file.name.replace(/\.[^/.]+$/, '');
      const tempFile = new File([result.rawCanvasBlob], `${baseName}_ai_hd.png`, {
        type: 'image/png',
      });
      const encoded = await processImage(tempFile, {
        format: nextFmt,
        quality: nextFmt === 'image/png' ? 1 : 0.92,
      });
      URL.revokeObjectURL(encoded.originalUrl);

      setResult((prev) =>
        prev
          ? {
              ...prev,
              blob: encoded.blob,
              url: encoded.url,
              fileName: encoded.fileName,
            }
          : null
      );
    } finally {
      setIsReEncoding(false);
    }
  };

  const handleModeSwitch = (nextMode: QualityMode) => {
    setQualityMode(nextMode);
    if (file && !isProcessing) {
      void runAiRestore(file, nextMode, format);
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

  const handleDownload = () => {
    if (!result) return;
    const a = document.createElement('a');
    a.href = result.url;
    a.download = result.fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const resetAll = () => {
    activeRunIdRef.current++;
    setFile(null);
    setResult(null);
    setIsProcessing(false);
    setErrorMsg(null);
    setProgressPct(0);
    setProgressStatus('');
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
              Release for AI Restoration
            </p>
          </div>
        </div>
      )}

      <div className="studio-card rounded-3xl overflow-hidden">
        {/* Clean AI Control Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 sm:px-7 py-3.5 border-b border-zinc-200/80 bg-zinc-50/80">
          <div className="flex items-center gap-2.5">
            <span className="text-xs font-semibold text-zinc-500">AI Engine</span>
            <div className="inline-flex bg-zinc-200/70 dark:bg-zinc-800 p-0.5 rounded-xl">
              <button
                type="button"
                disabled={isProcessing}
                onClick={() => handleModeSwitch('hd')}
                className={`px-3 py-1 rounded-[10px] text-xs font-semibold transition cursor-pointer ${
                  qualityMode === 'hd'
                    ? 'bg-white dark:bg-zinc-950 text-zinc-950 dark:text-white shadow-xs'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                Standard HD (Up to 2K)
              </button>
              <button
                type="button"
                disabled={isProcessing}
                onClick={() => handleModeSwitch('ultra')}
                className={`px-3 py-1 rounded-[10px] text-xs font-semibold transition cursor-pointer ${
                  qualityMode === 'ultra'
                    ? 'bg-white dark:bg-zinc-950 text-zinc-950 dark:text-white shadow-xs'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                Ultra Detail (Up to 3K)
              </button>
            </div>
          </div>

          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-100 text-zinc-600 text-[11px] font-semibold">
            <Cpu className="w-3.5 h-3.5 text-blue-600" />
            Swin2SR Real-World 4× AI
          </span>
        </div>

        {/* Empty Upload State vs Built-In Split-Screen AI Stage */}
        {!file ? (
          <div className="p-6 sm:p-10">
            <div
              role="button"
              tabIndex={0}
              aria-label="Select blurry or low-res photo for AI enhancement"
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
                Select Photo to Restore
              </span>

              <p className="text-xs sm:text-sm text-zinc-500 mt-4">
                Drop anywhere or press{' '}
                <kbd className="px-1.5 py-0.5 text-[11px] font-semibold bg-white border border-zinc-200 rounded-md text-zinc-700">
                  Ctrl+V
                </kbd>
              </p>

              <p className="text-[11px] text-zinc-400 mt-3 max-w-md">
                True neural super-resolution · Removes blur & compression blocks without sharpening artifacts (first run caches the AI model once)
              </p>
            </div>
          </div>
        ) : (
          <div>
            {/* Stage */}
            <div className="relative bg-zinc-950 p-4 sm:p-6">
              <div className="flex items-center justify-between gap-3 mb-3 text-xs text-zinc-400">
                <span className="truncate font-medium max-w-[240px]">{file.name}</span>
                <div className="flex items-center gap-2 shrink-0">
                  {result && (
                    <button
                      type="button"
                      onClick={() => setZoomed((z) => !z)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold transition cursor-pointer"
                    >
                      {zoomed ? <ZoomOut className="w-3.5 h-3.5" /> : <ZoomIn className="w-3.5 h-3.5" />}
                      <span>{zoomed ? '100%' : 'Inspect 2×'}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={resetAll}
                    aria-label="Remove photo"
                    className="p-2 rounded-xl bg-white/10 hover:bg-red-500/80 text-white transition cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div
                ref={stageRef}
                onPointerDown={result ? handleSplitDown : undefined}
                onPointerMove={result ? handleSplitMove : undefined}
                onPointerUp={result ? handleSplitUp : undefined}
                onPointerCancel={result ? handleSplitUp : undefined}
                className="relative w-full h-[50vh] sm:h-[58vh] min-h-[320px] rounded-2xl overflow-hidden bg-black/50 select-none touch-none cursor-ew-resize"
              >
                {result ? (
                  <>
                    <img
                      src={result.url}
                      alt="AI Restored HD"
                      draggable={false}
                      className={`absolute inset-0 w-full h-full object-contain transition-transform duration-200 ${
                        zoomed ? 'scale-175' : 'scale-100'
                      }`}
                    />
                    <img
                      src={result.originalUrl}
                      alt="Original Photo"
                      draggable={false}
                      style={{ clipPath: `inset(0 ${100 - splitPos}% 0 0)` }}
                      className={`absolute inset-0 w-full h-full object-contain transition-transform duration-200 ${
                        zoomed ? 'scale-175' : 'scale-100'
                      }`}
                    />

                    <div className="pointer-events-none absolute top-3 left-3 px-2.5 py-1 rounded-lg bg-zinc-950/75 text-white text-[11px] font-semibold backdrop-blur-xs tabular-nums">
                      Before · {result.originalWidth}×{result.originalHeight}
                    </div>
                    <div className="pointer-events-none absolute top-3 right-3 px-2.5 py-1 rounded-lg bg-blue-600/90 text-white text-[11px] font-semibold backdrop-blur-xs tabular-nums">
                      AI Restored · {result.width}×{result.height}
                    </div>

                    <div
                      className="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_12px_rgba(0,0,0,0.85)]"
                      style={{ left: `${splitPos}%` }}
                    >
                      <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white text-zinc-950 shadow-xl border-2 border-blue-600 flex items-center justify-center">
                        <ChevronsLeftRight className="w-5 h-5" />
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center px-6 text-center gap-4">
                    <Loader2 className="w-9 h-9 animate-spin text-blue-500" />
                    <div className="w-full max-w-sm space-y-2">
                      <div className="flex justify-between text-xs font-semibold text-zinc-300 tabular-nums">
                        <span className="truncate">{progressStatus || 'Initializing AI...'}</span>
                        <span>{progressPct}%</span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-zinc-800 overflow-hidden">
                        <div
                          className="h-full bg-blue-500 transition-all duration-300"
                          style={{ width: `${Math.max(4, progressPct)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {isProcessing && result && (
                  <div className="absolute inset-0 bg-zinc-950/65 backdrop-blur-xs flex flex-col items-center justify-center text-white gap-3 px-6">
                    <Loader2 className="w-7 h-7 animate-spin text-blue-400" />
                    <span className="text-xs font-semibold tabular-nums">
                      {progressStatus || 'Re-running AI restoration...'} ({progressPct}%)
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Export Footer */}
            <div className="flex flex-wrap items-center justify-between gap-4 px-5 sm:px-7 py-4 border-t border-zinc-200/80 bg-zinc-50/80">
              <div className="flex flex-wrap items-center gap-2.5 text-xs text-zinc-600 tabular-nums">
                {result && (
                  <>
                    <span className="font-semibold text-zinc-900 inline-flex items-center gap-1.5">
                      {result.originalWidth}×{result.originalHeight}
                      <ArrowRight className="w-3.5 h-3.5 text-zinc-400" />
                      {result.width}×{result.height} px
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-zinc-200/70 dark:bg-zinc-800 text-zinc-700 font-semibold">
                      {formatFileSize(result.blob.size)} · {result.backend}
                    </span>
                    <span className="text-zinc-400">{(result.processingMs / 1000).toFixed(1)}s</span>
                  </>
                )}
              </div>

              <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
                <select
                  aria-label="Output format"
                  value={format}
                  disabled={isProcessing || isReEncoding}
                  onChange={(e) => void handleFormatChange(e.target.value as SupportedFormat)}
                  className="bg-white border border-zinc-300 rounded-xl px-3 py-2 text-xs font-semibold cursor-pointer"
                >
                  <option value="image/jpeg">JPG · MozJPEG</option>
                  <option value="image/png">PNG · Lossless</option>
                  <option value="image/webp">WEBP</option>
                </select>

                <button
                  type="button"
                  disabled={!result || isProcessing || isReEncoding}
                  onClick={handleDownload}
                  className="btn-studio-accent inline-flex items-center gap-2 px-6 py-2.5 rounded-xl disabled:opacity-40 text-xs sm:text-sm font-semibold cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>{isReEncoding ? 'Preparing...' : 'Download AI HD'}</span>
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
        <span>On-device AI inference · Photos stay on your device (model loads once from CDN)</span>
      </p>
    </div>
  );
}
