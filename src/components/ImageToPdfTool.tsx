import React, { useState, useRef, useEffect } from 'react';
import {
  Upload,
  FileText,
  Download,
  Trash2,
  ArrowUp,
  ArrowDown,
  Plus,
  X,
  Lock,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Maximize,
  Sparkles,
  RectangleVertical,
  RectangleHorizontal,
  Square,
  SlidersHorizontal,
} from 'lucide-react';
import {
  processImage,
  formatFileSize,
  validateImageFile,
  normalizeImageBlob,
} from '../engine/imageEngine';
import { consumeHandoffFile } from '../engine/handoff';

interface PdfImageItem {
  id: string;
  file: File;
  previewUrl: string;
}

type PageSizeOption = 'a4' | 'letter' | 'fit';
type OrientationOption = 'auto' | 'portrait' | 'landscape';
type MarginOption = 'none' | 'small' | 'normal';

const PDF_MAX_IMAGE_SIDE = 2000;
const FIT_MODE_MAX_MM = 297;

const PAGE_SIZE_OPTIONS: { id: PageSizeOption; label: string; icon: React.ReactNode }[] = [
  { id: 'a4', label: 'A4', icon: <FileText className="w-3.5 h-3.5" aria-hidden="true" /> },
  { id: 'letter', label: 'Letter', icon: <FileText className="w-3.5 h-3.5" aria-hidden="true" /> },
  { id: 'fit', label: 'Fit Image', icon: <Maximize className="w-3.5 h-3.5" aria-hidden="true" /> },
];

const ORIENTATION_OPTIONS: { id: OrientationOption; label: string; icon: React.ReactNode }[] = [
  { id: 'auto', label: 'Auto', icon: <Sparkles className="w-3.5 h-3.5" aria-hidden="true" /> },
  { id: 'portrait', label: 'Portrait', icon: <RectangleVertical className="w-3.5 h-3.5" aria-hidden="true" /> },
  { id: 'landscape', label: 'Landscape', icon: <RectangleHorizontal className="w-3.5 h-3.5" aria-hidden="true" /> },
];

const MARGIN_OPTIONS: { id: MarginOption; label: string; icon: React.ReactNode }[] = [
  { id: 'none', label: 'None', icon: <Maximize className="w-3.5 h-3.5" aria-hidden="true" /> },
  { id: 'small', label: 'Small', icon: <Square className="w-3.5 h-3.5" aria-hidden="true" /> },
  { id: 'normal', label: 'Wide', icon: <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" /> },
];

export default function ImageToPdfTool() {
  const [items, setItems] = useState<PdfImageItem[]>([]);
  const [pageSize, setPageSize] = useState<PageSizeOption>('a4');
  const [orientation, setOrientation] = useState<OrientationOption>('auto');
  const [margin, setMargin] = useState<MarginOption>('small');
  const [quality, setQuality] = useState<number>(85);
  const [pdfName, setPdfName] = useState<string>('imagelab-document');

  const [isGenerating, setIsGenerating] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [doneMessage, setDoneMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isGlobalDragging, setIsGlobalDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);
  const trackedUrlsRef = useRef<Set<string>>(new Set());
  const addFilesRef = useRef<(files: FileList | File[] | null) => void>(() => {});

  useEffect(() => {
    return () => {
      trackedUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
      trackedUrlsRef.current.clear();
    };
  }, []);

  const addFiles = async (incoming: FileList | File[] | null) => {
    if (!incoming || incoming.length === 0) return;
    setErrorMsg(null);
    setDoneMessage(null);

    const valid: File[] = [];
    const errors: string[] = [];

    Array.from(incoming).forEach((f) => {
      const err = validateImageFile(f);
      if (err) errors.push(err);
      else valid.push(f);
    });

    if (fileInputRef.current) fileInputRef.current.value = '';
    if (valid.length === 0) {
      if (errors.length > 0) setErrorMsg(errors[0]);
      return;
    }

    if (errors.length > 0) setErrorMsg(errors[0]);

    const nextItems: PdfImageItem[] = await Promise.all(
      valid.map(async (file) => {
        let previewBlob: Blob = file;
        try {
          if (/\.(heic|heif)$/i.test(file.name) || file.type.includes('heic')) {
            previewBlob = await normalizeImageBlob(file);
          }
        } catch {
          previewBlob = file;
        }
        const url = URL.createObjectURL(previewBlob);
        trackedUrlsRef.current.add(url);
        return {
          id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          file,
          previewUrl: url,
        };
      })
    );

    setItems((prev) => [...prev, ...nextItems]);
  };

  addFilesRef.current = (files) => {
    void addFiles(files);
  };

  useEffect(() => {
    void consumeHandoffFile().then((handoffFile) => {
      if (handoffFile) {
        addFilesRef.current([handoffFile]);
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

  const moveItem = (index: number, dir: -1 | 1) => {
    const nextIdx = index + dir;
    if (nextIdx < 0 || nextIdx >= items.length) return;
    setDoneMessage(null);
    setItems((prev) => {
      const copy = [...prev];
      const temp = copy[index];
      copy[index] = copy[nextIdx];
      copy[nextIdx] = temp;
      return copy;
    });
  };

  const removeItem = (id: string) => {
    setDoneMessage(null);
    setItems((prev) => {
      const target = prev.find((i) => i.id === id);
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
        trackedUrlsRef.current.delete(target.previewUrl);
      }
      return prev.filter((i) => i.id !== id);
    });
  };

  const clearAll = () => {
    items.forEach((it) => {
      URL.revokeObjectURL(it.previewUrl);
      trackedUrlsRef.current.delete(it.previewUrl);
    });
    setItems([]);
    setErrorMsg(null);
    setDoneMessage(null);
  };

  const handleGeneratePdf = async () => {
    if (items.length === 0) return;
    setIsGenerating(true);
    setErrorMsg(null);
    setDoneMessage(null);
    setProgressText('Preparing PDF engine...');

    try {
      const { jsPDF } = await import('jspdf');
      const marginMm = margin === 'none' ? 0 : margin === 'small' ? 10 : 20;
      let doc: InstanceType<typeof jsPDF> | null = null;

      for (let i = 0; i < items.length; i++) {
        setProgressText(`Processing page ${i + 1} of ${items.length}...`);

        const res = await processImage(items[i].file, {
          format: 'image/jpeg',
          quality: quality / 100,
          maxSide: PDF_MAX_IMAGE_SIDE,
        });

        const jpegBytes = new Uint8Array(await res.blob.arrayBuffer());
        const imgW = res.width;
        const imgH = res.height;

        URL.revokeObjectURL(res.url);
        URL.revokeObjectURL(res.originalUrl);

        if (pageSize === 'fit') {
          let imgWmm = Math.max(20, imgW * 0.264583);
          let imgHmm = Math.max(20, imgH * 0.264583);
          const longestMm = Math.max(imgWmm, imgHmm);
          if (longestMm > FIT_MODE_MAX_MM) {
            const s = FIT_MODE_MAX_MM / longestMm;
            imgWmm *= s;
            imgHmm *= s;
          }

          const pageW = imgWmm + marginMm * 2;
          const pageH = imgHmm + marginMm * 2;
          const orient: 'portrait' | 'landscape' = pageW > pageH ? 'landscape' : 'portrait';

          if (!doc) {
            doc = new jsPDF({ orientation: orient, unit: 'mm', format: [pageW, pageH] });
          } else {
            doc.addPage([pageW, pageH], orient);
          }
          doc.addImage(jpegBytes, 'JPEG', marginMm, marginMm, imgWmm, imgHmm, undefined, 'FAST');
        } else {
          const orient: 'portrait' | 'landscape' =
            orientation === 'auto'
              ? imgW > imgH
                ? 'landscape'
                : 'portrait'
              : orientation;

          if (!doc) {
            doc = new jsPDF({ orientation: orient, unit: 'mm', format: pageSize });
          } else {
            doc.addPage(pageSize, orient);
          }

          const pageW = doc.internal.pageSize.getWidth();
          const pageH = doc.internal.pageSize.getHeight();
          const availW = Math.max(10, pageW - marginMm * 2);
          const availH = Math.max(10, pageH - marginMm * 2);

          const scale = Math.min(availW / imgW, availH / imgH);
          const drawW = imgW * scale;
          const drawH = imgH * scale;
          const drawX = (pageW - drawW) / 2;
          const drawY = (pageH - drawH) / 2;

          doc.addImage(jpegBytes, 'JPEG', drawX, drawY, drawW, drawH, undefined, 'FAST');
        }
      }

      if (doc) {
        const cleanName = (pdfName.trim() || 'imagelab-document').replace(/\.pdf$/i, '');
        doc.save(`${cleanName}.pdf`);
        setDoneMessage(
          `Saved "${cleanName}.pdf" (${items.length} ${items.length === 1 ? 'page' : 'pages'})`
        );
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to create PDF.');
    } finally {
      setIsGenerating(false);
      setProgressText('');
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
        onChange={(e) => void addFiles(e.target.files)}
      />

      {isGlobalDragging && (
        <div className="fixed inset-0 z-50 bg-zinc-950/65 backdrop-blur-md flex items-center justify-center p-6 pointer-events-none animate-scale-in">
          <div className="max-w-md w-full rounded-3xl border border-blue-400/50 bg-white/95 dark:bg-zinc-900/95 p-10 text-center shadow-2xl">
            <div className="w-16 h-16 rounded-2xl bg-blue-600 text-white flex items-center justify-center mx-auto mb-5 shadow-lg">
              <Upload className="w-7 h-7" aria-hidden="true" />
            </div>
            <p className="text-xl font-bold text-zinc-950 dark:text-white">
              Release to Add PDF Pages
            </p>
          </div>
        </div>
      )}

      <div className="studio-card rounded-3xl overflow-hidden">
        {/* Icon Segmented Settings Strip */}
        <div className="p-4 sm:px-6 bg-zinc-50/80 border-b border-zinc-200/80 grid sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          <div>
            <span className="block text-[11px] font-bold uppercase text-zinc-500 mb-1.5">
              Page Size
            </span>
            <div
              role="radiogroup"
              aria-label="Page Size"
              className="grid grid-cols-3 bg-zinc-200/70 dark:bg-zinc-800 p-0.5 rounded-xl gap-0.5"
            >
              {PAGE_SIZE_OPTIONS.map((opt) => {
                const active = pageSize === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setPageSize(opt.id)}
                    className={`inline-flex items-center justify-center gap-1 py-1.5 px-1.5 rounded-[10px] text-[11.5px] font-semibold transition cursor-pointer ${
                      active
                        ? 'bg-white dark:bg-zinc-950 text-zinc-950 dark:text-white shadow-xs'
                        : 'text-zinc-600 hover:text-zinc-900'
                    }`}
                  >
                    <span className={active ? 'text-blue-600 dark:text-blue-400' : 'opacity-70'}>
                      {opt.icon}
                    </span>
                    <span className="truncate">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className={pageSize === 'fit' ? 'opacity-45 pointer-events-none' : ''}>
            <span className="block text-[11px] font-bold uppercase text-zinc-500 mb-1.5">
              Orientation
            </span>
            <div
              role="radiogroup"
              aria-label="Orientation"
              className="grid grid-cols-3 bg-zinc-200/70 dark:bg-zinc-800 p-0.5 rounded-xl gap-0.5"
            >
              {ORIENTATION_OPTIONS.map((opt) => {
                const active = orientation === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    disabled={pageSize === 'fit'}
                    onClick={() => setOrientation(opt.id)}
                    className={`inline-flex items-center justify-center gap-1 py-1.5 px-1.5 rounded-[10px] text-[11.5px] font-semibold transition cursor-pointer ${
                      active
                        ? 'bg-white dark:bg-zinc-950 text-zinc-950 dark:text-white shadow-xs'
                        : 'text-zinc-600 hover:text-zinc-900'
                    }`}
                  >
                    <span className={active ? 'text-blue-600 dark:text-blue-400' : 'opacity-70'}>
                      {opt.icon}
                    </span>
                    <span className="truncate">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <span className="block text-[11px] font-bold uppercase text-zinc-500 mb-1.5">
              Margin
            </span>
            <div
              role="radiogroup"
              aria-label="Margin"
              className="grid grid-cols-3 bg-zinc-200/70 dark:bg-zinc-800 p-0.5 rounded-xl gap-0.5"
            >
              {MARGIN_OPTIONS.map((opt) => {
                const active = margin === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setMargin(opt.id)}
                    className={`inline-flex items-center justify-center gap-1 py-1.5 px-1.5 rounded-[10px] text-[11.5px] font-semibold transition cursor-pointer ${
                      active
                        ? 'bg-white dark:bg-zinc-950 text-zinc-950 dark:text-white shadow-xs'
                        : 'text-zinc-600 hover:text-zinc-900'
                    }`}
                  >
                    <span className={active ? 'text-blue-600 dark:text-blue-400' : 'opacity-70'}>
                      {opt.icon}
                    </span>
                    <span className="truncate">{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label
              htmlFor="pdf-qual"
              className="block text-[11px] font-bold uppercase text-zinc-500 mb-1.5 tabular-nums"
            >
              Quality ({quality}%)
            </label>
            <input
              id="pdf-qual"
              type="range"
              min={35}
              max={96}
              value={quality}
              onChange={(e) => setQuality(Number(e.target.value))}
              className="w-full mt-2"
            />
          </div>
        </div>

        {items.length === 0 ? (
          <div className="p-6 sm:p-10">
            <div
              role="button"
              tabIndex={0}
              aria-label="Select images to merge into PDF"
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              onClick={() => fileInputRef.current?.click()}
              className="group min-h-[300px] sm:min-h-[340px] flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 hover:border-blue-500/70 bg-zinc-50/60 hover:bg-blue-50/20 dark:hover:bg-blue-950/15 p-8 text-center cursor-pointer transition-all"
            >
              <div className="w-16 h-16 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 shadow-sm flex items-center justify-center mb-6 group-hover:-translate-y-1 transition-transform">
                <FileText className="w-7 h-7 text-zinc-900 dark:text-white group-hover:text-blue-600 transition-colors" aria-hidden="true" />
              </div>
              <span className="btn-studio-accent inline-flex items-center gap-2 px-7 py-3.5 rounded-2xl font-semibold text-sm sm:text-[15px]">
                Select Images for PDF
              </span>
              <p className="text-xs sm:text-sm text-zinc-500 mt-4">
                Drop unlimited photos anywhere or press{' '}
                <kbd className="px-1.5 py-0.5 text-[11px] font-semibold bg-white border border-zinc-200 rounded-md text-zinc-700">
                  Ctrl+V
                </kbd>
              </p>
            </div>
          </div>
        ) : (
          <div>
            <div className="divide-y divide-zinc-100 max-h-[420px] overflow-y-auto">
              {items.map((item, idx) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 px-5 sm:px-7 py-3.5 hover:bg-zinc-50 transition"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-6 h-6 rounded-lg bg-zinc-100 text-zinc-600 text-xs font-bold flex items-center justify-center shrink-0 tabular-nums">
                      {idx + 1}
                    </span>
                    <img
                      src={item.previewUrl}
                      alt={`Page ${idx + 1}`}
                      className="w-12 h-12 rounded-xl object-cover border border-zinc-200 shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-zinc-900 truncate">{item.file.name}</p>
                      <p className="text-xs text-zinc-500 tabular-nums">{formatFileSize(item.file.size)}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => moveItem(idx, -1)}
                      aria-label="Move page up"
                      className="p-1.5 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-100 disabled:opacity-30 text-zinc-600 cursor-pointer"
                    >
                      <ArrowUp className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === items.length - 1}
                      onClick={() => moveItem(idx, 1)}
                      aria-label="Move page down"
                      className="p-1.5 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-100 disabled:opacity-30 text-zinc-600 cursor-pointer"
                    >
                      <ArrowDown className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      aria-label="Remove page"
                      className="p-1.5 rounded-lg text-zinc-400 hover:text-red-600 hover:bg-red-500/10 cursor-pointer"
                    >
                      <X className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-5 sm:px-7 border-t border-zinc-200/80 bg-zinc-50/80 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                  <label htmlFor="pdf-filename" className="text-xs font-semibold text-zinc-600 shrink-0">
                    File Name
                  </label>
                  <input
                    id="pdf-filename"
                    type="text"
                    value={pdfName}
                    onChange={(e) => setPdfName(e.target.value)}
                    className="flex-1 bg-white border border-zinc-300 rounded-xl px-3 py-1.5 text-xs sm:text-sm"
                  />
                  <span className="text-xs font-semibold text-zinc-500">.pdf</span>
                </div>

                {doneMessage && (
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                    {doneMessage}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-100 text-xs sm:text-[13px] font-semibold text-zinc-700 cursor-pointer tabular-nums"
                  >
                    <Plus className="w-4 h-4" aria-hidden="true" />
                    <span>Add Pages ({items.length})</span>
                  </button>
                  <button
                    type="button"
                    onClick={clearAll}
                    aria-label="Clear all pages"
                    className="p-2.5 rounded-xl border border-zinc-200 bg-white hover:text-red-600 text-zinc-500 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>

                <button
                  type="button"
                  disabled={isGenerating}
                  onClick={() => void handleGeneratePdf()}
                  className="btn-studio-accent w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl disabled:opacity-40 text-xs sm:text-sm font-semibold cursor-pointer"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                      <span>{progressText || 'Generating PDF...'}</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" aria-hidden="true" />
                      <span>
                        Create PDF ({items.length} {items.length === 1 ? 'Page' : 'Pages'})
                      </span>
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
        <span>Processed privately on your device · Zero uploads</span>
      </p>
    </div>
  );
}
