import React, { useState, useRef, useEffect } from 'react';
import {
  Upload,
  ScanText,
  Copy,
  Check,
  Download,
  Trash2,
  Lock,
  Loader2,
  AlertCircle,
  Square,
  Sparkles,
  RotateCcw,
  Contrast,
} from 'lucide-react';
import {
  validateImageFile,
  validateMagicBytes,
  normalizeImageBlob,
  formatFileSize,
} from '../engine/imageEngine';
import { consumeHandoffFile } from '../engine/handoff';

type OcrLang = 'eng' | 'ben' | 'ben+eng';

interface TesseractWorkerLike {
  recognize: (
    image: Blob | HTMLCanvasElement | string
  ) => Promise<{ data: { text: string; confidence: number } }>;
  terminate: () => Promise<unknown>;
}

const LANG_OPTIONS: { id: OcrLang; label: string }[] = [
  { id: 'eng', label: 'English' },
  { id: 'ben', label: 'বাংলা (Bengali)' },
  { id: 'ben+eng', label: 'বাংলা + English' },
];

const MAX_OCR_SIDE = 2400;

function loadBitmap(blob: Blob): Promise<HTMLImageElement> {
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

/** Smart OCR preprocessor: upscales small screenshots 2x, auto-inverts dark backgrounds (white text on dark bg) */
async function prepareOcrBitmap(
  blob: Blob,
  enhanceText: boolean,
  forceInvert: boolean
): Promise<{ blob: Blob; autoInverted: boolean }> {
  const img = await loadBitmap(blob);
  const { naturalWidth: w, naturalHeight: h } = img;
  const longest = Math.max(w, h);

  // Upscale small screenshots (<1000px) by 2x for sharper glyphs; cap huge phone photos at 2400px
  let scale = 1;
  if (longest < 1000) {
    scale = Math.min(2, 1600 / longest);
  } else if (longest > MAX_OCR_SIDE) {
    scale = MAX_OCR_SIDE / longest;
  }

  const outW = Math.max(1, Math.round(w * scale));
  const outH = Math.max(1, Math.round(h * scale));

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return { blob, autoInverted: false };

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, outW, outH);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, outW, outH);

  const imgData = ctx.getImageData(0, 0, outW, outH);
  const d = imgData.data;

  // Measure average brightness to detect dark-background photos/screenshots (e.g. white text on dark wall)
  let lumSum = 0;
  const pixelCount = outW * outH;
  for (let i = 0; i < d.length; i += 4) {
    lumSum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  }
  const avgLum = lumSum / Math.max(1, pixelCount);
  const shouldInvert = forceInvert || (enhanceText && avgLum < 115);

  if (enhanceText || forceInvert) {
    const contrast = enhanceText ? 1.32 : 1.0;
    for (let i = 0; i < d.length; i += 4) {
      let gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      if (shouldInvert) {
        gray = 255 - gray;
      }
      let val = (gray - 128) * contrast + 128;
      val = val < 0 ? 0 : val > 255 ? 255 : val;
      d[i] = val;
      d[i + 1] = val;
      d[i + 2] = val;
    }
    ctx.putImageData(imgData, 0, 0);
  }

  const outBlob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Failed to prepare image for OCR.'))),
      'image/png'
    );
  });
  canvas.width = 0;
  canvas.height = 0;
  return { blob: outBlob, autoInverted: shouldInvert };
}

export default function OcrTool() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [normalizedBlob, setNormalizedBlob] = useState<Blob | null>(null);

  const [lang, setLang] = useState<OcrLang>('eng');
  const [enhanceText, setEnhanceText] = useState<boolean>(true);
  const [forceInvert, setForceInvert] = useState<boolean>(false);
  const [didInvert, setDidInvert] = useState<boolean>(false);
  const [extractedText, setExtractedText] = useState<string>('');
  const [confidence, setConfidence] = useState<number | null>(null);
  const [elapsedSec, setElapsedSec] = useState<number | null>(null);

  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [progressPct, setProgressPct] = useState<number>(0);
  const [progressStatus, setProgressStatus] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isGlobalDragging, setIsGlobalDragging] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);
  const runIdRef = useRef(0);
  const workerRef = useRef<{ lang: OcrLang; instance: TesseractWorkerLike } | null>(null);
  const trackedUrlRef = useRef<string | null>(null);
  const selectHandlerRef = useRef<(files: FileList | File[] | null) => void>(() => {});

  const terminateWorker = async () => {
    const active = workerRef.current;
    workerRef.current = null;
    if (active) {
      try {
        await active.instance.terminate();
      } catch {
        // Ignore
      }
    }
  };

  useEffect(() => {
    return () => {
      runIdRef.current++;
      void terminateWorker();
      if (trackedUrlRef.current) {
        URL.revokeObjectURL(trackedUrlRef.current);
        trackedUrlRef.current = null;
      }
    };
  }, []);

  const runOcr = async (
    targetBlob: Blob,
    targetLang: OcrLang,
    useEnhance: boolean,
    useInvert: boolean
  ) => {
    const runId = ++runIdRef.current;
    const t0 = performance.now();

    setIsRunning(true);
    setErrorMsg(null);
    setCopied(false);
    setConfidence(null);
    setElapsedSec(null);
    setProgressPct(4);
    setProgressStatus('Optimizing image for OCR...');

    try {
      const prepared = await prepareOcrBitmap(targetBlob, useEnhance, useInvert);
      if (runIdRef.current !== runId) return;
      setDidInvert(prepared.autoInverted);

      let worker: TesseractWorkerLike;
      if (workerRef.current && workerRef.current.lang === targetLang) {
        worker = workerRef.current.instance;
      } else {
        await terminateWorker();
        if (runIdRef.current !== runId) return;

        setProgressPct(10);
        setProgressStatus('Loading OCR engine...');

        const tesseractMod = (await import('tesseract.js')) as unknown as {
          createWorker: (
            langs: string,
            oem?: number,
            options?: Record<string, unknown>
          ) => Promise<TesseractWorkerLike>;
        };

        worker = await tesseractMod.createWorker(targetLang, 1, {
          langPath: 'https://tessdata.projectnaptha.com/4.0.0',
          logger: (info: { status?: string; progress?: number }) => {
            if (runIdRef.current !== runId) return;
            const rawPct = typeof info.progress === 'number' ? Math.round(info.progress * 100) : 0;
            if (info.status === 'loading language traineddata') {
              setProgressPct(Math.max(15, Math.min(60, 15 + Math.round(rawPct * 0.45))));
              setProgressStatus(`Downloading accurate language pack (${rawPct}%)...`);
            } else if (info.status === 'recognizing text') {
              setProgressPct(Math.max(60, Math.min(98, 60 + Math.round(rawPct * 0.38))));
              setProgressStatus(`Extracting text (${rawPct}%)...`);
            } else if (info.status) {
              setProgressStatus(
                info.status.charAt(0).toUpperCase() + info.status.slice(1) + '...'
              );
            }
          },
        });

        if (runIdRef.current !== runId) {
          await worker.terminate();
          return;
        }
        workerRef.current = { lang: targetLang, instance: worker };
      }

      setProgressPct(60);
      setProgressStatus('Extracting text...');

      const result = await worker.recognize(prepared.blob);
      if (runIdRef.current !== runId) return;

      const cleanText = (result.data.text || '').trim();
      setExtractedText(cleanText);
      setConfidence(Math.round(result.data.confidence || 0));
      setElapsedSec(Number(((performance.now() - t0) / 1000).toFixed(1)));
      setProgressPct(100);
      setProgressStatus('');

      if (!cleanText) {
        setErrorMsg(
          'No clear text detected. For best accuracy, crop around the text or try toggling Invert / Clarity Boost.'
        );
      }
    } catch (err) {
      if (runIdRef.current !== runId) return;
      await terminateWorker();
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'OCR failed. Check your connection on first language download and try again.'
      );
    } finally {
      if (runIdRef.current === runId) {
        setIsRunning(false);
      }
    }
  };

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
    setExtractedText('');
    setConfidence(null);

    try {
      const normalized = await normalizeImageBlob(picked);
      if (trackedUrlRef.current) {
        URL.revokeObjectURL(trackedUrlRef.current);
      }
      const url = URL.createObjectURL(normalized);
      trackedUrlRef.current = url;

      setFile(picked);
      setNormalizedBlob(normalized);
      setPreviewUrl(url);

      void runOcr(normalized, lang, enhanceText, forceInvert);
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

  const handleLangChange = (nextLang: OcrLang) => {
    setLang(nextLang);
    if (normalizedBlob && !isRunning) {
      void runOcr(normalizedBlob, nextLang, enhanceText, forceInvert);
    }
  };

  const handleToggleEnhance = () => {
    const next = !enhanceText;
    setEnhanceText(next);
    if (normalizedBlob && !isRunning) {
      void runOcr(normalizedBlob, lang, next, forceInvert);
    }
  };

  const handleToggleInvert = () => {
    const next = !forceInvert;
    setForceInvert(next);
    if (normalizedBlob && !isRunning) {
      void runOcr(normalizedBlob, lang, enhanceText, next);
    }
  };

  const handleStop = () => {
    runIdRef.current++;
    void terminateWorker();
    setIsRunning(false);
    setProgressPct(0);
    setProgressStatus('');
  };

  const handleCopyText = async () => {
    if (!extractedText) return;
    try {
      await navigator.clipboard.writeText(extractedText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setErrorMsg('Clipboard access blocked. Select and copy the text manually.');
    }
  };

  const handleDownloadTxt = () => {
    if (!extractedText) return;
    const baseName = (file?.name || 'extracted-text').replace(/\.[^/.]+$/, '');
    const blob = new Blob([extractedText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${baseName}_ocr.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  };

  const resetAll = () => {
    runIdRef.current++;
    setIsRunning(false);
    setFile(null);
    setNormalizedBlob(null);
    if (trackedUrlRef.current) {
      URL.revokeObjectURL(trackedUrlRef.current);
      trackedUrlRef.current = null;
    }
    setPreviewUrl(null);
    setExtractedText('');
    setConfidence(null);
    setElapsedSec(null);
    setErrorMsg(null);
    setProgressPct(0);
    setProgressStatus('');
  };

  const wordCount = extractedText.trim() ? extractedText.trim().split(/\s+/).length : 0;

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
              Release to Extract Text
            </p>
          </div>
        </div>
      )}

      <div className="studio-card rounded-3xl overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 sm:px-7 py-3.5 border-b border-zinc-200/80 bg-zinc-50/80">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-zinc-500">Language</span>
            <div className="inline-flex bg-zinc-200/70 dark:bg-zinc-800 p-0.5 rounded-xl flex-wrap">
              {LANG_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  disabled={isRunning}
                  onClick={() => handleLangChange(opt.id)}
                  className={`px-3 py-1.5 rounded-[10px] text-xs font-semibold transition cursor-pointer ${
                    lang === opt.id
                      ? 'bg-white dark:bg-zinc-950 text-zinc-950 dark:text-white shadow-xs'
                      : 'text-zinc-600 hover:text-zinc-900'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={isRunning}
              onClick={handleToggleInvert}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                forceInvert
                  ? 'bg-blue-600 text-white border-transparent'
                  : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-100'
              }`}
              title="Force invert colors for white text on dark backgrounds"
            >
              <Contrast className="w-3.5 h-3.5" />
              <span>Dark BG</span>
            </button>

            <button
              type="button"
              disabled={isRunning}
              onClick={handleToggleEnhance}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                enhanceText
                  ? 'bg-blue-600 text-white border-transparent'
                  : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-100'
              }`}
              title="Auto-invert dark backgrounds and boost text contrast"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Smart Boost</span>
            </button>

            {isRunning && (
              <button
                type="button"
                onClick={handleStop}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 text-xs font-semibold cursor-pointer"
              >
                <Square className="w-3 h-3 fill-current" />
                <span>Stop</span>
              </button>
            )}
          </div>
        </div>

        {!file || !previewUrl ? (
          <div className="p-6 sm:p-10">
            <div
              role="button"
              tabIndex={0}
              aria-label="Select image to extract text"
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
                <ScanText className="w-7 h-7 text-zinc-900 dark:text-white group-hover:text-blue-600 transition-colors" />
              </div>

              <span className="btn-studio-accent inline-flex items-center gap-2 px-7 py-3.5 rounded-2xl font-semibold text-sm sm:text-[15px]">
                Select Image or Screenshot
              </span>

              <p className="text-xs sm:text-sm text-zinc-500 mt-4">
                Drop anywhere or press{' '}
                <kbd className="px-1.5 py-0.5 text-[11px] font-semibold bg-white border border-zinc-200 rounded-md text-zinc-700">
                  Ctrl+V
                </kbd>{' '}
                to paste a screenshot directly
              </p>

              <p className="text-[11px] font-medium text-zinc-400 mt-3 uppercase tracking-wide">
                English · বাংলা (Bengali) · Auto Dark-BG Detection · Zero Uploads
              </p>
            </div>
          </div>
        ) : (
          <div className="grid lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-zinc-200/80">
            <div className="lg:col-span-5 bg-zinc-950 p-4 sm:p-6 flex flex-col justify-between gap-4">
              <div className="flex items-center justify-between gap-2 text-xs text-zinc-400">
                <span className="truncate font-medium">
                  {file.name} · {formatFileSize(file.size)}
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    disabled={isRunning}
                    onClick={() => fileInputRef.current?.click()}
                    className="px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold cursor-pointer disabled:opacity-40"
                  >
                    Change
                  </button>
                  <button
                    type="button"
                    onClick={resetAll}
                    aria-label="Remove image"
                    className="p-2 rounded-xl bg-white/10 hover:bg-red-500/80 text-white cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="flex-1 flex items-center justify-center min-h-[240px] max-h-[52vh] rounded-2xl bg-black/50 p-2 overflow-hidden">
                <img
                  src={previewUrl}
                  alt={file.name}
                  className="max-h-[48vh] max-w-full w-auto h-auto object-contain rounded-lg"
                />
              </div>

              {normalizedBlob && !isRunning && (
                <button
                  type="button"
                  onClick={() => void runOcr(normalizedBlob, lang, enhanceText, forceInvert)}
                  className="w-full py-2 px-3 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-zinc-200 inline-flex items-center justify-center gap-1.5 cursor-pointer transition"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Re-run Recognition</span>
                </button>
              )}
            </div>

            <div className="lg:col-span-7 p-5 sm:p-6 flex flex-col justify-between gap-4 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-bold text-zinc-900">Extracted Text</span>
                  {confidence !== null && !isRunning && (
                    <span className="px-2 py-0.5 rounded-md bg-emerald-500/12 text-emerald-700 dark:text-emerald-400 font-semibold tabular-nums">
                      {confidence}% confidence
                    </span>
                  )}
                  {didInvert && !isRunning && (
                    <span className="px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 font-semibold">
                      Dark-BG Inverted
                    </span>
                  )}
                  {elapsedSec !== null && !isRunning && (
                    <span className="text-zinc-400 tabular-nums">{elapsedSec}s</span>
                  )}
                </div>

                {extractedText && !isRunning && (
                  <span className="text-[11px] font-medium text-zinc-500 tabular-nums">
                    {wordCount} words · {extractedText.length} chars
                  </span>
                )}
              </div>

              {isRunning ? (
                <div className="flex-1 min-h-[280px] flex flex-col items-center justify-center gap-4 px-6 text-center rounded-2xl border border-zinc-200/80 bg-zinc-50/60">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                  <div className="w-full max-w-xs space-y-2">
                    <div className="flex justify-between text-xs font-semibold text-zinc-700 tabular-nums">
                      <span className="truncate">{progressStatus || 'Scanning...'}</span>
                      <span>{progressPct}%</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
                      <div
                        className="h-full bg-blue-600 transition-all duration-200"
                        style={{ width: `${Math.max(5, progressPct)}%` }}
                      />
                    </div>
                  </div>
                  <p className="text-[11px] text-zinc-500">
                    Language packs download once and cache locally in your browser
                  </p>
                </div>
              ) : (
                <textarea
                  aria-label="Extracted text output"
                  value={extractedText}
                  onChange={(e) => setExtractedText(e.target.value)}
                  placeholder="Recognized text will appear here — you can edit it before copying or saving."
                  rows={12}
                  className="flex-1 w-full min-h-[280px] rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 p-4 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500/30 resize-y"
                />
              )}

              <div className="flex flex-wrap items-center justify-end gap-2.5 pt-1">
                <button
                  type="button"
                  disabled={!extractedText || isRunning}
                  onClick={handleDownloadTxt}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-100 disabled:opacity-40 text-xs sm:text-sm font-semibold text-zinc-700 transition cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Download .TXT</span>
                </button>

                <button
                  type="button"
                  disabled={!extractedText || isRunning}
                  onClick={() => void handleCopyText()}
                  className="btn-studio-accent inline-flex items-center gap-2 px-6 py-2.5 rounded-xl disabled:opacity-40 text-xs sm:text-sm font-semibold cursor-pointer"
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>Copy Text</span>
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
        <span>On-device OCR · Screenshots and scanned documents never leave your browser</span>
      </p>
    </div>
  );
}
