import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Upload,
  ScanText,
  Copy,
  Check,
  Download,
  RotateCw,
  Lock,
  AlertCircle,
  Sparkles,
  FileText,
} from 'lucide-react';

type LangMode = 'auto' | 'ben' | 'eng' | 'handwriting';

const LANG_OPTIONS: { id: LangMode; label: string }[] = [
  { id: 'auto', label: 'Auto (বাংলা + Eng)' },
  { id: 'ben', label: 'বাংলা (Bengali)' },
  { id: 'eng', label: 'English' },
  { id: 'handwriting', label: 'Handwriting' },
];

async function prepareFastOcrPayload(
  file: File
): Promise<{ base64: string; mimeType: string; previewUrl: string }> {
  const previewUrl = URL.createObjectURL(file);

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const maxDim = 1400;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width >= height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context unavailable'));
          return;
        }

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        resolve({
          base64: dataUrl,
          mimeType: 'image/jpeg',
          previewUrl,
        });
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error('Could not read image file.'));
    img.src = previewUrl;
  });
}

export default function OcrTool() {
  const [language, setLanguage] = useState<LangMode>('auto');
  const [fileName, setFileName] = useState<string>('');
  const [fileSizeKb, setFileSizeKb] = useState<number>(0);
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [cachedPayload, setCachedPayload] = useState<{ base64: string; mimeType: string } | null>(
    null
  );
  const [extractedText, setExtractedText] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [elapsedSec, setElapsedSec] = useState<string>('0.0');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);
  const [dragOver, setDragOver] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const runOcrRequest = useCallback(
    async (payload: { base64: string; mimeType: string }, lang: LangMode) => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      setErrorMsg('');
      const startTime = performance.now();

      const ticker = window.setInterval(() => {
        setElapsedSec(((performance.now() - startTime) / 1000).toFixed(1));
      }, 100);

      const clientTimeout = window.setTimeout(() => {
        controller.abort();
      }, 22000);

      try {
        const res = await fetch('/api/ocr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageBase64: payload.base64,
            mimeType: payload.mimeType,
            language: lang,
          }),
          signal: controller.signal,
        });

        const data = await res.json().catch(() => ({}));
        const totalSec = ((performance.now() - startTime) / 1000).toFixed(1);
        setElapsedSec(totalSec);

        if (!res.ok) {
          setErrorMsg(data?.error || `OCR failed (HTTP ${res.status}). Click Re-run OCR.`);
          return;
        }

        setExtractedText(typeof data?.text === 'string' ? data.text : '');
      } catch (err) {
        const totalSec = ((performance.now() - startTime) / 1000).toFixed(1);
        setElapsedSec(totalSec);
        if (err instanceof Error && err.name === 'AbortError') {
          setErrorMsg('Request timed out after 22s. Please check connection and click Re-run OCR.');
        } else {
          setErrorMsg('Network error while contacting OCR server. Please retry.');
        }
      } finally {
        window.clearInterval(ticker);
        window.clearTimeout(clientTimeout);
        setLoading(false);
      }
    },
    []
  );

  const handleFile = useCallback(
    async (file: File | undefined | null) => {
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        setErrorMsg('Please select a valid image file (JPG, PNG, WEBP).');
        return;
      }

      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }

      setFileName(file.name);
      setFileSizeKb(Math.round((file.size / 1024) * 10) / 10);
      setExtractedText('');
      setErrorMsg('');

      try {
        const prepared = await prepareFastOcrPayload(file);
        setPreviewUrl(prepared.previewUrl);
        const payload = { base64: prepared.base64, mimeType: prepared.mimeType };
        setCachedPayload(payload);
        await runOcrRequest(payload, language);
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Failed to process image.');
      }
    },
    [language, previewUrl, runOcrRequest]
  );

  // Support Ctrl+V image paste anywhere on page
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const blob = item.getAsFile();
          if (blob) {
            e.preventDefault();
            void handleFile(blob);
            break;
          }
        }
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [handleFile]);

  const handleLanguageSwitch = (nextLang: LangMode) => {
    setLanguage(nextLang);
    if (cachedPayload && !loading) {
      void runOcrRequest(cachedPayload, nextLang);
    }
  };

  const handleCopy = async () => {
    if (!extractedText) return;
    try {
      await navigator.clipboard.writeText(extractedText);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  };

  const handleDownloadTxt = () => {
    if (!extractedText) return;
    const blob = new Blob([extractedText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'extracted-text.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  };

  const wordCount = extractedText.trim() ? extractedText.trim().split(/\s+/).length : 0;
  const charCount = Array.from(extractedText).length;

  return (
    <div className="space-y-4 animate-fade-up">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          void handleFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />

      <div className="studio-card rounded-3xl overflow-hidden">
        {/* Language Mode Bar */}
        <div className="px-4 sm:px-6 py-3 bg-zinc-50/80 border-b border-zinc-200/80 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold text-zinc-500 mr-1">Mode</span>
            {LANG_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => handleLanguageSwitch(opt.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                  language === opt.id
                    ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 shadow-xs'
                    : 'bg-white border border-zinc-200 text-zinc-600 hover:text-zinc-950'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[11px] font-semibold">
            <Sparkles className="w-3 h-3" aria-hidden="true" />
            Smart AI · Instant
          </span>
        </div>

        {/* Split Workspace */}
        <div className="grid lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-zinc-200/80 bg-white">
          {/* Left: Image Dropzone / Preview */}
          <div className="p-4 sm:p-6 flex flex-col justify-between gap-4">
            {!previewUrl ? (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  void handleFile(e.dataTransfer.files?.[0]);
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`min-h-[290px] rounded-2xl border-2 border-dashed flex flex-col items-center justify-center text-center p-6 cursor-pointer transition ${
                  dragOver
                    ? 'border-blue-500 bg-blue-50/50'
                    : 'border-zinc-200 hover:border-blue-400 bg-zinc-50/60'
                }`}
              >
                <div className="w-12 h-12 rounded-2xl bg-white border border-zinc-200/90 shadow-xs flex items-center justify-center text-zinc-700 mb-3">
                  <Upload className="w-5 h-5" aria-hidden="true" />
                </div>
                <span className="btn-studio-primary px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold">
                  Select or Drop Image
                </span>
                <p className="text-xs text-zinc-500 mt-3">
                  Or press <kbd className="px-1.5 py-0.5 rounded bg-zinc-200/70 text-[11px]">Ctrl+V</kbd> to paste screenshot
                </p>
                <p className="text-[11px] text-zinc-400 mt-1">JPG · PNG · WEBP</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-medium text-zinc-600 truncate">
                    {fileName} · {fileSizeKb} KB
                  </span>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-2.5 py-1 rounded-lg border border-zinc-200 bg-zinc-50 hover:bg-zinc-100 font-semibold text-zinc-700 shrink-0 cursor-pointer"
                  >
                    Change
                  </button>
                </div>

                <div className="rounded-2xl bg-zinc-950/95 border border-zinc-200/80 overflow-hidden flex items-center justify-center min-h-[230px] max-h-[320px]">
                  <img
                    src={previewUrl}
                    alt="Uploaded for OCR"
                    className="max-h-[310px] w-auto object-contain"
                  />
                </div>

                <button
                  type="button"
                  disabled={loading || !cachedPayload}
                  onClick={() => cachedPayload && void runOcrRequest(cachedPayload, language)}
                  className="w-full py-2.5 rounded-xl border border-zinc-200 bg-zinc-50 hover:bg-zinc-100 disabled:opacity-50 text-xs font-semibold text-zinc-700 inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
                  <span>{loading ? `Extracting (${elapsedSec}s)...` : 'Re-run OCR'}</span>
                </button>
              </>
            )}
          </div>

          {/* Right: Extracted Text Result */}
          <div className="p-4 sm:p-6 flex flex-col justify-between gap-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-zinc-800">Extracted Text</span>
                {loading && (
                  <span className="px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-600 text-[11px] font-bold tabular-nums">
                    Scanning · {elapsedSec}s
                  </span>
                )}
                {!loading && previewUrl && !errorMsg && (
                  <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[11px] font-bold tabular-nums">
                    Done in {elapsedSec}s
                  </span>
                )}
              </div>

              <span className="text-[11px] font-medium text-zinc-400 tabular-nums">
                {wordCount} words · {charCount} chars
              </span>
            </div>

            {errorMsg && (
              <div className="rounded-xl bg-red-500/10 border border-red-500/25 px-3.5 py-2.5 text-xs text-red-700 dark:text-red-300 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                <span>{errorMsg}</span>
              </div>
            )}

            <textarea
              aria-label="Extracted OCR text"
              value={extractedText}
              onChange={(e) => setExtractedText(e.target.value)}
              rows={10}
              placeholder={
                loading
                  ? 'Reading text from image...'
                  : 'Extracted English or বাংলা text will appear here — edit freely before copying...'
              }
              className="w-full flex-1 bg-zinc-50/70 dark:bg-zinc-950/60 border border-zinc-200/90 rounded-2xl p-4 text-sm leading-relaxed text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 resize-y"
            />

            <div className="flex flex-wrap items-center justify-between gap-2">
              <a
                href="/word-counter"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-zinc-200 bg-zinc-50 hover:bg-zinc-100 text-xs font-semibold text-zinc-600"
              >
                <FileText className="w-3.5 h-3.5 text-blue-600" aria-hidden="true" />
                <span>Word Counter</span>
              </a>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={!extractedText}
                  onClick={handleDownloadTxt}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-100 disabled:opacity-40 text-xs font-semibold text-zinc-700 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Download .TXT</span>
                </button>

                <button
                  type="button"
                  disabled={!extractedText}
                  onClick={() => void handleCopy()}
                  className="btn-studio-accent inline-flex items-center gap-1.5 px-4 py-2 rounded-xl disabled:opacity-40 text-xs font-semibold cursor-pointer"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Copy Text</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <p className="flex items-center justify-center gap-1.5 text-xs text-zinc-500">
        <Lock className="w-3.5 h-3.5 text-emerald-600 shrink-0" aria-hidden="true" />
        <span>Encrypted processing · Images are never stored</span>
      </p>
    </div>
  );
}
