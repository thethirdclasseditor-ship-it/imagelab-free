import React, { useState, useRef, useEffect } from 'react';
import {
  Upload,
  ScanText,
  Copy,
  Check,
  Download,
  Trash2,
  ShieldCheck,
  Loader2,
  AlertCircle,
  RotateCcw,
  Sparkles,
  Globe,
  Languages,
  Type,
  PenTool,
} from 'lucide-react';
import {
  validateImageFile,
  validateMagicBytes,
  normalizeImageBlob,
  formatFileSize,
} from '../engine/imageEngine';
import { consumeHandoffFile } from '../engine/handoff';

type OcrLang = 'auto' | 'ben' | 'eng' | 'handwriting';

const LANG_OPTIONS: { id: OcrLang; label: string; icon: React.ReactNode }[] = [
  { id: 'auto', label: 'Auto (বাংলা + Eng)', icon: <Globe className="w-3.5 h-3.5" aria-hidden="true" /> },
  { id: 'ben', label: 'বাংলা (Bengali)', icon: <Languages className="w-3.5 h-3.5" aria-hidden="true" /> },
  { id: 'eng', label: 'English', icon: <Type className="w-3.5 h-3.5" aria-hidden="true" /> },
  { id: 'handwriting', label: 'Handwriting', icon: <PenTool className="w-3.5 h-3.5" aria-hidden="true" /> },
];

const MAX_UPLOAD_SIDE = 1600;

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

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const str = typeof reader.result === 'string' ? reader.result : '';
      const idx = str.indexOf(',');
      resolve(idx >= 0 ? str.slice(idx + 1) : str);
    };
    reader.onerror = () => reject(new Error('Failed to read image bytes.'));
    reader.readAsDataURL(blob);
  });
}

async function prepareCompactJpeg(blob: Blob): Promise<{ base64: string; mimeType: string }> {
  const img = await loadBitmap(blob);
  const { naturalWidth: w, naturalHeight: h } = img;
  const scale = Math.min(1, MAX_UPLOAD_SIDE / Math.max(w, h));
  const outW = Math.max(1, Math.round(w * scale));
  const outH = Math.max(1, Math.round(h * scale));

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable.');

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, outW, outH);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, outW, outH);

  const jpegBlob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Could not prepare image for OCR.'))),
      'image/jpeg',
      0.88
    );
  });
  canvas.width = 0;
  canvas.height = 0;

  const base64 = await blobToBase64(jpegBlob);
  return { base64, mimeType: 'image/jpeg' };
}

export default function OcrTool() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [normalizedBlob, setNormalizedBlob] = useState<Blob | null>(null);

  const [lang, setLang] = useState<OcrLang>('auto');
  const [extractedText, setExtractedText] = useState<string>('');
  const [elapsedSec, setElapsedSec] = useState<number | null>(null);

  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isGlobalDragging, setIsGlobalDragging] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const trackedUrlRef = useRef<string | null>(null);
  const selectHandlerRef = useRef<(files: FileList | File[] | null) => void>(() => {});

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (trackedUrlRef.current) {
        URL.revokeObjectURL(trackedUrlRef.current);
        trackedUrlRef.current = null;
      }
    };
  }, []);

  const runVisionOcr = async (targetBlob: Blob, targetLang: OcrLang) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const t0 = performance.now();
    setIsRunning(true);
    setErrorMsg(null);
    setCopied(false);
    setElapsedSec(null);

    try {
      const { base64, mimeType } = await prepareCompactJpeg(targetBlob);
      if (controller.signal.aborted) return;

      const res = await fetch('/api/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: base64,
          mimeType,
          language: targetLang,
        }),
        signal: controller.signal,
      });

      const data = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
      if (controller.signal.aborted) return;

      if (!res.ok) {
        throw new Error(data.error || `OCR request failed (${res.status}).`);
      }

      const cleanText = (data.text || '').trim();
      setExtractedText(cleanText);
      setElapsedSec(Number(((performance.now() - t0) / 1000).toFixed(1)));

      if (!cleanText) {
        setErrorMsg('No readable text found in this image.');
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      setErrorMsg(
        err instanceof Error ? err.message : 'Failed to extract text. Please try again.'
      );
    } finally {
      if (!controller.signal.aborted) {
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

      void runVisionOcr(normalized, lang);
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
      void runVisionOcr(normalizedBlob, nextLang);
    }
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
    abortRef.current?.abort();
    setIsRunning(false);
    setFile(null);
    setNormalizedBlob(null);
    if (trackedUrlRef.current) {
      URL.revokeObjectURL(trackedUrlRef.current);
      trackedUrlRef.current = null;
    }
    setPreviewUrl(null);
    setExtractedText('');
    setElapsedSec(null);
    setErrorMsg(null);
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
              <Upload className="w-7 h-7" aria-hidden="true" />
            </div>
            <p className="text-xl font-bold text-zinc-950 dark:text-white">
              Release to Extract Text Instantly
            </p>
          </div>
        </div>
      )}

      <div className="studio-card rounded-3xl overflow-hidden">
        {/* Top Mode Bar with SVG Icons */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 sm:px-7 py-3.5 border-b border-zinc-200/80 bg-zinc-50/80">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-zinc-500">Mode</span>
            <div className="inline-flex bg-zinc-200/70 dark:bg-zinc-800 p-0.5 rounded-xl flex-wrap gap-0.5">
              {LANG_OPTIONS.map((opt) => {
                const active = lang === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={isRunning}
                    onClick={() => handleLangChange(opt.id)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] text-xs font-semibold transition cursor-pointer ${
                      active
                        ? 'bg-white dark:bg-zinc-950 text-zinc-950 dark:text-white shadow-xs'
                        : 'text-zinc-600 hover:text-zinc-900'
                    }`}
                  >
                    <span className={active ? 'text-blue-600 dark:text-blue-400' : 'opacity-70'}>
                      {opt.icon}
                    </span>
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[11px] font-semibold">
            <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
            Smart AI · Instant
          </span>
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
                <ScanText className="w-7 h-7 text-zinc-900 dark:text-white group-hover:text-blue-600 transition-colors" aria-hidden="true" />
              </div>

              <span className="btn-studio-accent inline-flex items-center gap-2 px-7 py-3.5 rounded-2xl font-semibold text-sm sm:text-[15px]">
                Select Image or Screenshot
              </span>

              <p className="text-xs sm:text-sm text-zinc-500 mt-4">
                Drop anywhere or press{' '}
                <kbd className="px-1.5 py-0.5 text-[11px] font-semibold bg-white border border-zinc-200 rounded-md text-zinc-700">
                  Ctrl+V
                </kbd>{' '}
                to paste directly
              </p>

              <p className="text-[11px] font-medium text-zinc-400 mt-3 uppercase tracking-wide">
                Instant Results · বাংলা &amp; English · Signs, Scans &amp; Handwriting
              </p>
            </div>
          </div>
        ) : (
          <div className="grid lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-zinc-200/80">
            {/* Left: Source Preview */}
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
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
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
                  onClick={() => void runVisionOcr(normalizedBlob, lang)}
                  className="w-full py-2 px-3 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-zinc-200 inline-flex items-center justify-center gap-1.5 cursor-pointer transition"
                >
                  <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Re-run OCR</span>
                </button>
              )}
            </div>

            {/* Right: Editable Extracted Text */}
            <div className="lg:col-span-7 p-5 sm:p-6 flex flex-col justify-between gap-4 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-bold text-zinc-900">Extracted Text</span>
                  {elapsedSec !== null && !isRunning && (
                    <span className="px-2 py-0.5 rounded-md bg-emerald-500/12 text-emerald-700 dark:text-emerald-400 font-semibold tabular-nums">
                      Done in {elapsedSec}s
                    </span>
                  )}
                </div>

                {extractedText && !isRunning && (
                  <span className="text-[11px] font-medium text-zinc-500 tabular-nums">
                    {wordCount} words · {extractedText.length} chars
                  </span>
                )}
              </div>

              {isRunning ? (
                <div className="flex-1 min-h-[280px] flex flex-col items-center justify-center gap-3 px-6 text-center rounded-2xl border border-zinc-200/80 bg-zinc-50/60">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-600" aria-hidden="true" />
                  <p className="text-xs font-semibold text-zinc-700">Extracting text...</p>
                  <p className="text-[11px] text-zinc-500">Usually finishes in 1–2 seconds</p>
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
                  <Download className="w-4 h-4" aria-hidden="true" />
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
                      <Check className="w-4 h-4" aria-hidden="true" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" aria-hidden="true" />
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
            <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{errorMsg}</span>
          </div>
        )}
      </div>

      <p className="flex items-center justify-center gap-1.5 text-xs text-zinc-500 text-center">
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" aria-hidden="true" />
        <span>Encrypted processing · Images are never stored</span>
      </p>
    </div>
  );
}
