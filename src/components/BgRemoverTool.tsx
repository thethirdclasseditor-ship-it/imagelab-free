import React, { useState, useRef, useEffect } from 'react';
import {
  Upload,
  Download,
  Sparkles,
  Trash2,
  Eye,
  Lock,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Image as ImageIcon,
} from 'lucide-react';
import {
  downscaleForAI,
  encodeCanvasWithCodec,
  formatFileSize,
  validateImageFile,
  validateMagicBytes,
  normalizeImageBlob,
  MAX_SAFE_CANVAS_PIXELS,
} from '../engine/imageEngine';

interface BgPreset {
  id: string;
  label: string;
  color: string | null; // null = transparent
}

const BG_PRESETS: BgPreset[] = [
  { id: 'transparent', label: 'Transparent', color: null },
  { id: 'white', label: 'White', color: '#ffffff' },
  { id: 'passport-blue', label: 'Light Blue', color: '#dbeafe' },
  { id: 'sky', label: 'Sky Blue', color: '#60a5fa' },
  { id: 'gray', label: 'Light Gray', color: '#f1f5f9' },
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

function loadBitmapFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not decode image bitmap.'));
    };
    img.src = url;
  });
}

export default function BgRemoverTool() {
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [cutoutBlob, setCutoutBlob] = useState<Blob | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);

  const [bgColor, setBgColor] = useState<string | null>(null);
  const [customColor, setCustomColor] = useState<string>('#e0f2fe');
  const [showOriginal, setShowOriginal] = useState(false);

  const [isProcessing, setIsProcessing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isGlobalDragging, setIsGlobalDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);
  const runIdRef = useRef(0);
  const trackedUrlsRef = useRef<Set<string>>(new Set());
  const selectHandlerRef = useRef<(files: FileList | null) => void>(() => {});

  const trackUrl = (url: string) => {
    trackedUrlsRef.current.add(url);
    return url;
  };

  const releaseUrl = (url: string | null) => {
    if (!url) return;
    URL.revokeObjectURL(url);
    trackedUrlsRef.current.delete(url);
  };

  // Unmount-only cleanup so updating resultUrl NEVER prematurely revokes originalUrl
  useEffect(() => {
    return () => {
      runIdRef.current++;
      trackedUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
      trackedUrlsRef.current.clear();
    };
  }, []);

  const processFile = async (picked: File) => {
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

    const runId = ++runIdRef.current;
    setErrorMsg(null);
    setStatusMsg(null);
    setShowOriginal(false);
    setIsProcessing(true);
    setProgressPct(4);
    setProgressLabel('Preparing image...');

    // Cleanly release previous session URLs
    releaseUrl(originalUrl);
    releaseUrl(resultUrl);
    setOriginalUrl(null);
    setResultUrl(null);
    setCutoutBlob(null);
    setSourceFile(picked);

    try {
      const normalized = await normalizeImageBlob(picked);
      if (runIdRef.current !== runId) return;

      const origObjUrl = trackUrl(URL.createObjectURL(normalized));
      setOriginalUrl(origObjUrl);

      setProgressPct(10);
      setProgressLabel('Optimizing input resolution...');
      const aiInputBlob = await downscaleForAI(picked, 2048);
      if (runIdRef.current !== runId) return;

      setProgressPct(15);
      setProgressLabel('Loading on-device AI model (cached after first use)...');
      const bgMod = await import('@imgly/background-removal');
      const removeBackground = bgMod.removeBackground ?? bgMod.default;

      const outBlob = await removeBackground(aiInputBlob, {
        model: 'isnet_quint8',
        progress: (key: string, current: number, total: number) => {
          if (runIdRef.current !== runId || total <= 0) return;
          const pct = Math.min(96, Math.max(15, Math.round((current / total) * 100)));
          setProgressPct(pct);
          if (key.includes('fetch')) {
            setProgressLabel(`Downloading AI weights (${pct}%)...`);
          } else {
            setProgressLabel(`Removing background (${pct}%)...`);
          }
        },
      });

      if (runIdRef.current !== runId) return;

      const resObjUrl = trackUrl(URL.createObjectURL(outBlob));
      setCutoutBlob(outBlob);
      setResultUrl(resObjUrl);
      setProgressPct(100);
      setProgressLabel('');
    } catch (err) {
      if (runIdRef.current !== runId) return;
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Background removal failed. Please try a different image.'
      );
    } finally {
      if (runIdRef.current === runId) {
        setIsProcessing(false);
      }
    }
  };

  const handleFileSelect = (incoming: FileList | null) => {
    if (!incoming || incoming.length === 0) return;
    const picked = incoming[0];
    if (fileInputRef.current) fileInputRef.current.value = '';
    void processFile(picked);
  };

  selectHandlerRef.current = handleFileSelect;

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

  const handleDownloadFull = async () => {
    if (!cutoutBlob || !sourceFile) return;
    setIsExporting(true);
    setErrorMsg(null);
    setStatusMsg(null);

    try {
      const baseName = sourceFile.name.replace(/\.[^/.]+$/, '');

      // Pure transparent PNG cutout
      if (bgColor === null) {
        triggerDownload(cutoutBlob, `${baseName}_nobg.png`);
        setStatusMsg(`Saved transparent PNG (${formatFileSize(cutoutBlob.size)})`);
        return;
      }

      // Composite onto chosen solid background & encode via MozJPEG
      const img = await loadBitmapFromBlob(cutoutBlob);
      let w = img.naturalWidth;
      let h = img.naturalHeight;
      if (w * h > MAX_SAFE_CANVAS_PIXELS) {
        const s = Math.sqrt(MAX_SAFE_CANVAS_PIXELS / (w * h));
        w = Math.max(1, Math.floor(w * s));
        h = Math.max(1, Math.floor(h * s));
      }

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('Canvas unavailable.');

      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);

      const encoded = await encodeCanvasWithCodec(canvas, 'image/jpeg', 0.92);
      canvas.width = 0;
      canvas.height = 0;

      triggerDownload(encoded.blob, `${baseName}_bg.jpg`);
      setStatusMsg(`Saved HD JPG (${formatFileSize(encoded.blob.size)} · ${encoded.encoderUsed})`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Download failed.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownload300x300 = async () => {
    if (!cutoutBlob || !sourceFile) return;
    setIsExporting(true);
    setErrorMsg(null);
    setStatusMsg(null);

    try {
      const img = await loadBitmapFromBlob(cutoutBlob);
      const size = 300;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('Canvas unavailable.');

      ctx.fillStyle = bgColor ?? '#ffffff';
      ctx.fillRect(0, 0, size, size);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      // Top-biased cover crop to protect head/face framing
      const srcW = img.naturalWidth;
      const srcH = img.naturalHeight;
      const srcRatio = srcW / srcH;
      let sx = 0;
      let sy = 0;
      let sw = srcW;
      let sh = srcH;

      if (srcRatio > 1) {
        sw = Math.round(srcH);
        sx = Math.round((srcW - sw) / 2);
      } else {
        sh = Math.round(srcW);
        sy = Math.round((srcH - sh) * 0.22);
      }

      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, size, size);
      const encoded = await encodeCanvasWithCodec(canvas, 'image/jpeg', 0.92, 100 * 1024);
      canvas.width = 0;
      canvas.height = 0;

      const baseName = sourceFile.name.replace(/\.[^/.]+$/, '');
      triggerDownload(encoded.blob, `${baseName}_300x300.jpg`);
      setStatusMsg(
        `Saved 300×300 Portrait (${formatFileSize(encoded.blob.size)} · ${encoded.encoderUsed})`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '300×300 export failed.');
    } finally {
      setIsExporting(false);
    }
  };

  const resetAll = () => {
    runIdRef.current++;
    releaseUrl(originalUrl);
    releaseUrl(resultUrl);
    setSourceFile(null);
    setOriginalUrl(null);
    setResultUrl(null);
    setCutoutBlob(null);
    setBgColor(null);
    setShowOriginal(false);
    setIsProcessing(false);
    setErrorMsg(null);
    setStatusMsg(null);
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
              Release to Remove Background
            </p>
          </div>
        </div>
      )}

      <div className="studio-card rounded-3xl overflow-hidden">
        {!sourceFile ? (
          <div className="p-6 sm:p-10">
            <div
              role="button"
              tabIndex={0}
              aria-label="Select photo to remove background"
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
                Select Photo
              </span>

              <p className="text-xs sm:text-sm text-zinc-500 mt-4">
                Drop anywhere or press{' '}
                <kbd className="px-1.5 py-0.5 text-[11px] font-semibold bg-white border border-zinc-200 rounded-md text-zinc-700">
                  Ctrl+V
                </kbd>
              </p>

              <p className="text-[11px] font-medium text-zinc-400 mt-3 uppercase tracking-wide">
                HD Transparent PNG · Custom Background Colors · 300×300 Export
              </p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-zinc-200/80">
            {/* Top Bar */}
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 sm:px-7 py-3.5 bg-zinc-50/80">
              <span className="text-xs sm:text-sm font-semibold text-zinc-800 truncate max-w-[260px]">
                {sourceFile.name}
              </span>

              <div className="flex items-center gap-2">
                {resultUrl && originalUrl && (
                  <button
                    type="button"
                    onClick={() => setShowOriginal((s) => !s)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                      showOriginal
                        ? 'bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 border-transparent'
                        : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-100'
                    }`}
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>{showOriginal ? 'Showing Original' : 'Compare Original'}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={resetAll}
                  aria-label="Remove image"
                  className="p-2 rounded-xl border border-zinc-200 bg-white hover:text-red-600 text-zinc-500 transition cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Preview Stage (Dark-mode safe transparency grid) */}
            <div className="bg-zinc-950 p-4 sm:p-6 flex items-center justify-center min-h-[320px] sm:min-h-[420px]">
              {isProcessing ? (
                <div className="w-full max-w-xs text-center space-y-4">
                  <Loader2 className="w-9 h-9 animate-spin text-blue-500 mx-auto" />
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs font-semibold text-zinc-300 tabular-nums">
                      <span className="truncate">{progressLabel}</span>
                      <span>{progressPct}%</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                      <div
                        className="h-full bg-blue-500 transition-all duration-200"
                        style={{ width: `${Math.max(4, progressPct)}%` }}
                      />
                    </div>
                  </div>
                </div>
              ) : resultUrl ? (
                <div
                  className="relative rounded-2xl overflow-hidden shadow-xl max-w-full flex items-center justify-center"
                  style={
                    showOriginal || bgColor === null
                      ? {
                          backgroundImage:
                            'linear-gradient(45deg, #27272a 25%, #18181b 25%), linear-gradient(-45deg, #27272a 25%, #18181b 25%), linear-gradient(45deg, #18181b 75%, #27272a 75%), linear-gradient(-45deg, #18181b 75%, #27272a 75%)',
                          backgroundSize: '20px 20px',
                          backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
                        }
                      : { backgroundColor: bgColor }
                  }
                >
                  <img
                    src={showOriginal && originalUrl ? originalUrl : resultUrl}
                    alt={showOriginal ? 'Original photo' : 'Background removed'}
                    className="max-h-[54vh] max-w-full w-auto h-auto object-contain block"
                  />
                </div>
              ) : null}
            </div>

            {/* Background Picker & Export Controls */}
            {resultUrl && !isProcessing && (
              <div className="p-5 sm:px-7 bg-zinc-50/80 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-zinc-500 mr-1">Background</span>
                    {BG_PRESETS.map((preset) => {
                      const active = bgColor === preset.color;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => {
                            setBgColor(preset.color);
                            setShowOriginal(false);
                            setStatusMsg(null);
                          }}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                            active
                              ? 'bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 border-transparent'
                              : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-100'
                          }`}
                        >
                          <span
                            className="w-3.5 h-3.5 rounded-full border border-zinc-300 shrink-0"
                            style={
                              preset.color
                                ? { backgroundColor: preset.color }
                                : {
                                    backgroundImage:
                                      'linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)',
                                    backgroundSize: '8px 8px',
                                  }
                            }
                          />
                          <span>{preset.label}</span>
                        </button>
                      );
                    })}

                    <label className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl border border-zinc-200 bg-white text-xs font-semibold text-zinc-700 cursor-pointer">
                      <input
                        type="color"
                        aria-label="Custom background color"
                        value={customColor}
                        onChange={(e) => {
                          setCustomColor(e.target.value);
                          setBgColor(e.target.value);
                          setShowOriginal(false);
                        }}
                        className="w-5 h-5 rounded border-0 p-0 bg-transparent cursor-pointer"
                      />
                      <span>Custom</span>
                    </label>
                  </div>

                  {statusMsg && (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      {statusMsg}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2.5 pt-1">
                  <button
                    type="button"
                    disabled={isExporting}
                    onClick={() => void handleDownload300x300()}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-100 disabled:opacity-40 text-xs sm:text-sm font-semibold text-zinc-800 transition cursor-pointer"
                  >
                    <ImageIcon className="w-4 h-4 text-blue-600" />
                    <span>300×300 Portrait (&lt;100KB)</span>
                  </button>

                  <button
                    type="button"
                    disabled={isExporting}
                    onClick={() => void handleDownloadFull()}
                    className="btn-studio-accent inline-flex items-center gap-2 px-6 py-2.5 rounded-xl disabled:opacity-40 text-xs sm:text-sm font-semibold cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>{bgColor === null ? 'Download HD PNG' : 'Download HD JPG'}</span>
                  </button>
                </div>
              </div>
            )}
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
        <span>On-device AI · Photos never leave your browser</span>
      </p>
    </div>
  );
}
