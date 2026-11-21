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
  ShieldCheck,
  Loader2,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import {
  processImage,
  formatFileSize,
  validateImageFile,
} from '../engine/imageEngine';

interface PdfImageItem {
  id: string;
  file: File;
  previewUrl: string;
}

type PageSizeOption = 'a4' | 'letter' | 'fit';
type OrientationOption = 'auto' | 'portrait' | 'landscape';
type MarginOption = 'none' | 'small' | 'normal';

const MAX_PAGES = 30;

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Failed to read image data for PDF.'));
    reader.readAsDataURL(blob);
  });
}

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
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const trackedUrlsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    return () => {
      trackedUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
      trackedUrlsRef.current.clear();
    };
  }, []);

  const addFiles = (incoming: FileList | null) => {
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

    const remaining = MAX_PAGES - items.length;
    if (remaining <= 0) {
      setErrorMsg(`Maximum ${MAX_PAGES} images allowed in one PDF.`);
      return;
    }

    const accepted = valid.slice(0, remaining);
    if (valid.length > remaining) {
      errors.push(`Limit is ${MAX_PAGES} images per PDF. Extra files were skipped.`);
    }
    if (errors.length > 0) setErrorMsg(errors[0]);

    const nextItems: PdfImageItem[] = accepted.map((file) => {
      const url = URL.createObjectURL(file);
      trackedUrlsRef.current.add(url);
      return {
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        file,
        previewUrl: url,
      };
    });

    setItems((prev) => [...prev, ...nextItems]);
  };

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
    setProgressText('Loading PDF engine...');

    try {
      const { jsPDF } = await import('jspdf');
      const marginMm = margin === 'none' ? 0 : margin === 'small' ? 10 : 20;

      // Prepare each image safely (handles HEIC, AVIF, PNG transparency & MozJPEG compression)
      const prepared: { dataUrl: string; w: number; h: number }[] = [];
      for (let i = 0; i < items.length; i++) {
        setProgressText(`Optimizing page ${i + 1} of ${items.length}...`);
        const res = await processImage(items[i].file, {
          format: 'image/jpeg',
          quality: quality / 100,
          // Keep page images crisp (~2000px max width) while preventing bloated 50MB PDFs
          width: undefined,
        });
        const dataUrl = await blobToDataUrl(res.blob);
        prepared.push({ dataUrl, w: res.width, h: res.height });
        URL.revokeObjectURL(res.url);
        URL.revokeObjectURL(res.originalUrl);
      }

      setProgressText('Building PDF pages...');
      let doc: InstanceType<typeof jsPDF> | null = null;

      for (let i = 0; i < prepared.length; i++) {
        const pg = prepared[i];
        const isLandscapeImg = pg.w > pg.h;

        if (pageSize === 'fit') {
          // Convert pixels to mm at 96 DPI (1 px = 0.264583 mm)
          const imgWmm = Math.max(20, pg.w * 0.264583);
          const imgHmm = Math.max(20, pg.h * 0.264583);
          const pageW = imgWmm + marginMm * 2;
          const pageH = imgHmm + marginMm * 2;
          const orient = pageW > pageH ? 'landscape' : 'portrait';

          if (!doc) {
            doc = new jsPDF({ orientation: orient, unit: 'mm', format: [pageW, pageH] });
          } else {
            doc.addPage([pageW, pageH], orient);
          }
          doc.addImage(pg.dataUrl, 'JPEG', marginMm, marginMm, imgWmm, imgHmm, undefined, 'FAST');
        } else {
          const orient: 'portrait' | 'landscape' =
            orientation === 'auto'
              ? isLandscapeImg
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

          const scale = Math.min(availW / pg.w, availH / pg.h);
          const drawW = pg.w * scale;
          const drawH = pg.h * scale;
          const drawX = (pageW - drawW) / 2;
          const drawY = (pageH - drawH) / 2;

          doc.addImage(pg.dataUrl, 'JPEG', drawX, drawY, drawW, drawH, undefined, 'FAST');
        }
      }

      if (doc) {
        const cleanName = (pdfName.trim() || 'imagelab-document').replace(/\.pdf$/i, '');
        doc.save(`${cleanName}.pdf`);
        setDoneMessage(`Saved "${cleanName}.pdf" (${prepared.length} ${prepared.length === 1 ? 'page' : 'pages'})`);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to create PDF.');
    } finally {
      setIsGenerating(false);
      setProgressText('');
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.heic,.heif,.avif"
        multiple
        className="hidden"
        onChange={(e) => addFiles(e.target.files)}
      />

      {/* Top Settings Strip */}
      <div className="p-4 bg-slate-50 border-b border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs sm:text-sm">
        <div>
          <label htmlFor="pdf-size" className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
            Page Size
          </label>
          <select
            id="pdf-size"
            value={pageSize}
            onChange={(e) => setPageSize(e.target.value as PageSizeOption)}
            className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-semibold text-xs sm:text-sm"
          >
            <option value="a4">A4 (Standard)</option>
            <option value="letter">US Letter</option>
            <option value="fit">Fit to Image Size</option>
          </select>
        </div>

        <div>
          <label htmlFor="pdf-orient" className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
            Orientation
          </label>
          <select
            id="pdf-orient"
            disabled={pageSize === 'fit'}
            value={orientation}
            onChange={(e) => setOrientation(e.target.value as OrientationOption)}
            className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-semibold text-xs sm:text-sm disabled:opacity-50"
          >
            <option value="auto">Auto (Smart)</option>
            <option value="portrait">Portrait</option>
            <option value="landscape">Landscape</option>
          </select>
        </div>

        <div>
          <label htmlFor="pdf-margin" className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
            Margin
          </label>
          <select
            id="pdf-margin"
            value={margin}
            onChange={(e) => setMargin(e.target.value as MarginOption)}
            className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-semibold text-xs sm:text-sm"
          >
            <option value="none">No Margin (Full Bleed)</option>
            <option value="small">Small (10mm)</option>
            <option value="normal">Normal (20mm)</option>
          </select>
        </div>

        <div>
          <label htmlFor="pdf-qual" className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
            Quality ({quality}%)
          </label>
          <input
            id="pdf-qual"
            type="range"
            min={35}
            max={96}
            value={quality}
            onChange={(e) => setQuality(Number(e.target.value))}
            className="w-full mt-1.5 accent-blue-600"
          />
        </div>
      </div>

      {/* Empty Dropzone vs Active Page List */}
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
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              addFiles(e.dataTransfer.files);
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl py-12 px-4 text-center cursor-pointer transition-all ${
              isDragging
                ? 'border-blue-500 bg-blue-50/60'
                : 'border-slate-300 hover:border-blue-500 hover:bg-slate-50'
            }`}
          >
            <div className="w-14 h-14 rounded-2xl bg-red-600 text-white flex items-center justify-center mx-auto mb-4 shadow-md">
              <FileText className="w-7 h-7" />
            </div>
            <p className="font-bold text-slate-900 text-lg">Select Photos to Convert to PDF</p>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Combine up to {MAX_PAGES} JPG, PNG, WEBP, or HEIC images into one clean PDF · 100% Local
            </p>
          </div>
        </div>
      ) : (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            addFiles(e.dataTransfer.files);
          }}
        >
          {/* Reorderable Pages List */}
          <div className="divide-y divide-slate-100 max-h-[420px] overflow-y-auto">
            {items.map((item, idx) => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50/70"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-6 h-6 rounded-md bg-slate-100 text-slate-600 text-xs font-bold flex items-center justify-center shrink-0">
                    {idx + 1}
                  </span>
                  <img
                    src={item.previewUrl}
                    alt={`Page ${idx + 1}`}
                    className="w-11 h-11 rounded-lg object-cover border border-slate-200 shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{item.file.name}</p>
                    <p className="text-xs text-slate-500">{formatFileSize(item.file.size)}</p>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={() => moveItem(idx, -1)}
                    aria-label="Move page up"
                    className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-30 text-slate-600 cursor-pointer"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={idx === items.length - 1}
                    onClick={() => moveItem(idx, 1)}
                    aria-label="Move page down"
                    className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-30 text-slate-600 cursor-pointer"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    aria-label="Remove page"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Filename & Bottom Action Bar */}
          <div className="p-4 border-t border-slate-200 bg-slate-50 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                <label htmlFor="pdf-filename" className="text-xs font-semibold text-slate-600 shrink-0">
                  File Name:
                </label>
                <input
                  id="pdf-filename"
                  type="text"
                  value={pdfName}
                  onChange={(e) => setPdfName(e.target.value)}
                  className="flex-1 bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs sm:text-sm"
                />
                <span className="text-xs font-semibold text-slate-500">.pdf</span>
              </div>

              {doneMessage && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  {doneMessage}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={items.length >= MAX_PAGES}
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 bg-white hover:border-blue-500 text-xs sm:text-sm font-semibold text-slate-700 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Pages ({items.length}/{MAX_PAGES})</span>
                </button>
                <button
                  type="button"
                  onClick={clearAll}
                  aria-label="Clear all pages"
                  className="p-2 rounded-xl border border-slate-300 bg-white hover:text-red-600 text-slate-600 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <button
                type="button"
                disabled={isGenerating}
                onClick={handleGeneratePdf}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 disabled:bg-slate-400 text-white text-sm font-semibold shadow-sm cursor-pointer"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{progressText || 'Generating PDF...'}</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    <span>Create & Download PDF ({items.length} {items.length === 1 ? 'Page' : 'Pages'})</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="m-4 flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs sm:text-sm">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <div className="px-4 py-3 border-t border-slate-200 text-center">
        <p className="inline-flex items-center gap-1.5 text-xs text-slate-500">
          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>100% Private PDF Creator · Your IDs, notes & documents never leave your device.</span>
        </p>
      </div>
    </div>
  );
}
