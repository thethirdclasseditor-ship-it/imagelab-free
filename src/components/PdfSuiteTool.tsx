import React, { useState, useRef, useEffect } from 'react';
import {
  Upload,
  FileText,
  Download,
  Archive,
  Trash2,
  ArrowUp,
  ArrowDown,
  Plus,
  X,
  Lock,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Layers,
  Scissors,
  Minimize2,
  Image as ImageIcon,
  ArrowRight,
  Sparkles,
  Zap,
  SlidersHorizontal,
} from 'lucide-react';
import { formatFileSize, type SupportedFormat } from '../engine/imageEngine';
import {
  validatePdfFileSync,
  inspectPdfPageCount,
  parsePageRangeExpression,
  mergePdfFiles,
  splitPdfPages,
  compressPdfFile,
  renderPdfToImages,
  type PdfCompressLevel,
  type PdfRenderedPage,
  type PdfCompressResult,
} from '../engine/pdfEngine';

export type PdfToolMode = 'merge' | 'split' | 'compress' | 'pdf-to-jpg';

interface PdfSuiteToolProps {
  mode: PdfToolMode;
}

interface PdfQueueEntry {
  id: string;
  file: File;
  pageCount: number | null;
  error?: string;
  compressResult?: PdfCompressResult;
}

const PDF_IMG_FORMATS: { id: SupportedFormat; label: string; icon: React.ReactNode }[] = [
  { id: 'image/jpeg', label: 'JPG', icon: <ImageIcon className="w-3.5 h-3.5" aria-hidden="true" /> },
  { id: 'image/png', label: 'PNG', icon: <Layers className="w-3.5 h-3.5" aria-hidden="true" /> },
  { id: 'image/webp', label: 'WEBP', icon: <Zap className="w-3.5 h-3.5" aria-hidden="true" /> },
];

const PDF_IMG_QUALITIES: { scale: number; label: string; icon: React.ReactNode }[] = [
  { scale: 1.5, label: 'Standard', icon: <Zap className="w-3.5 h-3.5" aria-hidden="true" /> },
  { scale: 2, label: 'High HD', icon: <Sparkles className="w-3.5 h-3.5" aria-hidden="true" /> },
  { scale: 3, label: 'Ultra HD', icon: <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" /> },
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

export default function PdfSuiteTool({ mode }: PdfSuiteToolProps) {
  const [entries, setEntries] = useState<PdfQueueEntry[]>([]);
  const [isBusy, setIsBusy] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isGlobalDragging, setIsGlobalDragging] = useState(false);

  const [mergedName, setMergedName] = useState('imagelab-merged');

  const [splitRange, setSplitRange] = useState('');
  const [splitOutputMode, setSplitOutputMode] = useState<'combined' | 'individual'>('combined');

  const [compressLevel, setCompressLevel] = useState<PdfCompressLevel>('balanced');

  const [imgFormat, setImgFormat] = useState<SupportedFormat>('image/jpeg');
  const [imgScale, setImgScale] = useState<number>(2);
  const [imgRange, setImgRange] = useState('');
  const [renderedPages, setRenderedPages] = useState<PdfRenderedPage[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);
  const trackedUrlsRef = useRef<Set<string>>(new Set());
  const addFilesRef = useRef<(files: FileList | null) => void>(() => {});

  const isMultiFile = mode === 'merge' || mode === 'compress';

  const releaseRenderedPages = (pages: PdfRenderedPage[]) => {
    pages.forEach((p) => {
      URL.revokeObjectURL(p.url);
      trackedUrlsRef.current.delete(p.url);
    });
  };

  useEffect(() => {
    return () => {
      trackedUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
      trackedUrlsRef.current.clear();
    };
  }, []);

  const handleAddFiles = async (incoming: FileList | null) => {
    if (!incoming || incoming.length === 0) return;
    setErrorMsg(null);
    setStatusMsg(null);

    const valid: File[] = [];
    const errs: string[] = [];

    Array.from(incoming).forEach((f) => {
      const err = validatePdfFileSync(f);
      if (err) errs.push(err);
      else valid.push(f);
    });

    if (fileInputRef.current) fileInputRef.current.value = '';
    if (valid.length === 0) {
      if (errs.length > 0) setErrorMsg(errs[0]);
      return;
    }

    let accepted: File[];
    if (!isMultiFile) {
      accepted = [valid[0]];
      releaseRenderedPages(renderedPages);
      setRenderedPages([]);
      setSplitRange('');
      setImgRange('');
    } else {
      accepted = valid;
    }

    if (errs.length > 0) setErrorMsg(errs[0]);

    const newEntries: PdfQueueEntry[] = accepted.map((file) => ({
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      file,
      pageCount: null,
    }));

    setEntries((prev) => (isMultiFile ? [...prev, ...newEntries] : newEntries));

    for (const entry of newEntries) {
      try {
        const count = await inspectPdfPageCount(entry.file);
        setEntries((prev) =>
          prev.map((it) => (it.id === entry.id ? { ...it, pageCount: count } : it))
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Invalid PDF file.';
        setEntries((prev) =>
          prev.map((it) => (it.id === entry.id ? { ...it, pageCount: 0, error: msg } : it))
        );
      }
    }
  };

  addFilesRef.current = (files) => {
    void handleAddFiles(files);
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
      if (e.dataTransfer?.files?.length) addFilesRef.current(e.dataTransfer.files);
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

  const moveEntry = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= entries.length) return;
    setEntries((prev) => {
      const copy = [...prev];
      const temp = copy[idx];
      copy[idx] = copy[target];
      copy[target] = temp;
      return copy;
    });
  };

  const removeEntry = (id: string) => {
    setEntries((prev) => prev.filter((it) => it.id !== id));
    if (!isMultiFile) {
      releaseRenderedPages(renderedPages);
      setRenderedPages([]);
    }
    setStatusMsg(null);
  };

  const clearAll = () => {
    releaseRenderedPages(renderedPages);
    setRenderedPages([]);
    setEntries([]);
    setStatusMsg(null);
    setErrorMsg(null);
  };

  const runMerge = async () => {
    const validEntries = entries.filter((e) => !e.error);
    if (validEntries.length < 2) {
      setErrorMsg('Add at least 2 valid PDF files to merge.');
      return;
    }

    setIsBusy(true);
    setErrorMsg(null);
    setStatusMsg(null);

    try {
      const { blob, totalPages } = await mergePdfFiles(
        validEntries.map((e) => e.file),
        setProgressText
      );
      const cleanName = (mergedName.trim() || 'imagelab-merged').replace(/\.pdf$/i, '');
      triggerDownload(blob, `${cleanName}.pdf`);
      setStatusMsg(
        `Saved "${cleanName}.pdf" (${totalPages} pages · ${formatFileSize(blob.size)})`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'PDF merge failed.');
    } finally {
      setIsBusy(false);
      setProgressText('');
    }
  };

  const runSplit = async () => {
    const primary = entries[0];
    if (!primary || primary.error || !primary.pageCount) return;

    const parsed = parsePageRangeExpression(splitRange, primary.pageCount);
    if (parsed.error) {
      setErrorMsg(parsed.error);
      return;
    }

    setIsBusy(true);
    setErrorMsg(null);
    setStatusMsg(null);

    try {
      const { files } = await splitPdfPages(
        primary.file,
        parsed.indices,
        splitOutputMode,
        setProgressText
      );

      if (files.length === 1) {
        triggerDownload(files[0].blob, files[0].name);
        setStatusMsg(
          `Saved "${files[0].name}" (${parsed.indices.length} ${parsed.indices.length === 1 ? 'page' : 'pages'})`
        );
      } else {
        setProgressText('Packaging ZIP archive...');
        const { default: JSZip } = await import('jszip');
        const zip = new JSZip();
        files.forEach((f) => zip.file(f.name, f.blob));
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const baseName = primary.file.name.replace(/\.pdf$/i, '');
        triggerDownload(zipBlob, `${baseName}_split_pages.zip`);
        setStatusMsg(`Saved ${files.length} individual PDFs as ZIP`);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'PDF split failed.');
    } finally {
      setIsBusy(false);
      setProgressText('');
    }
  };

  const runCompress = async () => {
    const validEntries = entries.filter((e) => !e.error);
    if (validEntries.length === 0) return;

    setIsBusy(true);
    setErrorMsg(null);
    setStatusMsg(null);

    const completed: PdfCompressResult[] = [];

    try {
      for (let i = 0; i < validEntries.length; i++) {
        const entry = validEntries[i];
        const res = await compressPdfFile(entry.file, compressLevel, (txt) =>
          setProgressText(
            validEntries.length > 1 ? `File ${i + 1}/${validEntries.length}: ${txt}` : txt
          )
        );
        completed.push(res);
        setEntries((prev) =>
          prev.map((it) => (it.id === entry.id ? { ...it, compressResult: res } : it))
        );
      }

      if (completed.length === 1) {
        const single = completed[0];
        triggerDownload(single.blob, single.fileName);
        setStatusMsg(
          single.savedPercent > 0
            ? `Saved "${single.fileName}" (-${single.savedPercent}% smaller)`
            : `Saved "${single.fileName}" (${formatFileSize(single.newSize)})`
        );
      } else if (completed.length > 1) {
        setProgressText('Packaging compressed PDFs into ZIP...');
        const { default: JSZip } = await import('jszip');
        const zip = new JSZip();
        completed.forEach((item, idx) => zip.file(`${idx + 1}_${item.fileName}`, item.blob));
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        triggerDownload(zipBlob, 'imagelab-compressed-pdfs.zip');
        setStatusMsg(`Downloaded ${completed.length} compressed PDFs as ZIP`);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'PDF compression failed.');
    } finally {
      setIsBusy(false);
      setProgressText('');
    }
  };

  const runPdfToImages = async () => {
    const primary = entries[0];
    if (!primary || primary.error || !primary.pageCount) return;

    const parsed = parsePageRangeExpression(imgRange, primary.pageCount);
    if (parsed.error) {
      setErrorMsg(parsed.error);
      return;
    }

    setIsBusy(true);
    setErrorMsg(null);
    setStatusMsg(null);
    releaseRenderedPages(renderedPages);
    setRenderedPages([]);

    try {
      const pages = await renderPdfToImages(
        primary.file,
        {
          format: imgFormat,
          quality: imgFormat === 'image/png' ? 1 : 0.9,
          scale: imgScale,
          pageIndices: parsed.indices,
        },
        setProgressText
      );
      pages.forEach((p) => trackedUrlsRef.current.add(p.url));
      setRenderedPages(pages);
      setStatusMsg(`Rendered ${pages.length} ${pages.length === 1 ? 'page' : 'pages'} ready to save`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to convert PDF pages to images.');
    } finally {
      setIsBusy(false);
      setProgressText('');
    }
  };

  const downloadRenderedZip = async () => {
    if (renderedPages.length === 0) return;
    if (renderedPages.length === 1) {
      triggerDownload(renderedPages[0].blob, renderedPages[0].fileName);
      return;
    }
    setIsBusy(true);
    setProgressText('Creating ZIP archive...');
    try {
      const { default: JSZip } = await import('jszip');
      const zip = new JSZip();
      renderedPages.forEach((p) => zip.file(p.fileName, p.blob));
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const baseName = (entries[0]?.file.name || 'document').replace(/\.pdf$/i, '');
      triggerDownload(zipBlob, `${baseName}_pages.zip`);
    } finally {
      setIsBusy(false);
      setProgressText('');
    }
  };

  const totalPages = entries.reduce((sum, e) => sum + (e.pageCount ?? 0), 0);
  const primaryPdf = entries[0] ?? null;

  const emptyConfig = {
    merge: {
      icon: <Layers className="w-7 h-7 text-zinc-900 dark:text-white group-hover:text-blue-600 transition-colors" aria-hidden="true" />,
      cta: 'Select PDF Files to Merge',
      hint: 'Drop unlimited PDFs anywhere · Reorder & merge cleanly',
    },
    split: {
      icon: <Scissors className="w-7 h-7 text-zinc-900 dark:text-white group-hover:text-blue-600 transition-colors" aria-hidden="true" />,
      cta: 'Select PDF to Split',
      hint: 'Extract page ranges or split every page into individual PDFs',
    },
    compress: {
      icon: <Minimize2 className="w-7 h-7 text-zinc-900 dark:text-white group-hover:text-blue-600 transition-colors" aria-hidden="true" />,
      cta: 'Select PDFs to Compress',
      hint: 'Drop unlimited PDFs anywhere · Shrink heavy files privately',
    },
    'pdf-to-jpg': {
      icon: <ImageIcon className="w-7 h-7 text-zinc-900 dark:text-white group-hover:text-blue-600 transition-colors" aria-hidden="true" />,
      cta: 'Select PDF to Convert to Images',
      hint: 'Export every page to crisp JPG, PNG, or WEBP images locally',
    },
  }[mode];

  return (
    <div className="space-y-4 animate-fade-up">
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        multiple={isMultiFile}
        className="hidden"
        onChange={(e) => void handleAddFiles(e.target.files)}
      />

      {isGlobalDragging && (
        <div className="fixed inset-0 z-50 bg-zinc-950/65 backdrop-blur-md flex items-center justify-center p-6 pointer-events-none animate-scale-in">
          <div className="max-w-md w-full rounded-3xl border border-blue-400/50 bg-white/95 dark:bg-zinc-900/95 p-10 text-center shadow-2xl">
            <div className="w-16 h-16 rounded-2xl bg-blue-600 text-white flex items-center justify-center mx-auto mb-5 shadow-lg">
              <Upload className="w-7 h-7" aria-hidden="true" />
            </div>
            <p className="text-xl font-bold text-zinc-950 dark:text-white">
              Release to Load PDF
            </p>
          </div>
        </div>
      )}

      <div className="studio-card rounded-3xl overflow-hidden">
        {entries.length === 0 ? (
          <div className="p-6 sm:p-10">
            <div
              role="button"
              tabIndex={0}
              aria-label={emptyConfig.cta}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              onClick={() => fileInputRef.current?.click()}
              className="group min-h-[310px] sm:min-h-[350px] flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 hover:border-blue-500/70 bg-zinc-50/60 hover:bg-blue-50/20 dark:hover:bg-blue-950/15 p-8 text-center cursor-pointer transition-all"
            >
              <div className="w-16 h-16 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 shadow-sm flex items-center justify-center mb-6 group-hover:-translate-y-1 transition-transform">
                {emptyConfig.icon}
              </div>
              <span className="btn-studio-accent inline-flex items-center gap-2 px-7 py-3.5 rounded-2xl font-semibold text-sm sm:text-[15px]">
                {emptyConfig.cta}
              </span>
              <p className="text-xs sm:text-sm text-zinc-500 mt-4">{emptyConfig.hint}</p>
              <p className="text-[11px] font-medium text-zinc-400 mt-3 uppercase tracking-wide">
                Unlimited File Size · Private Local Processing · Zero Uploads
              </p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-zinc-200/80">
            {/* Mode-Specific Options Header */}
            {mode === 'compress' && (
              <div className="p-5 sm:px-7 bg-zinc-50/80 space-y-2.5">
                <span className="block text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                  Compression Level
                </span>
                <div className="grid sm:grid-cols-3 gap-2.5">
                  {(
                    [
                      {
                        id: 'balanced',
                        title: 'Recommended (Balanced)',
                        desc: 'Best for scanned & photo PDFs (60–85% smaller)',
                        icon: <Sparkles className="w-4 h-4" aria-hidden="true" />,
                      },
                      {
                        id: 'strong',
                        title: 'Maximum Compression',
                        desc: 'Smallest size for strict email or portal limits',
                        icon: <Minimize2 className="w-4 h-4" aria-hidden="true" />,
                      },
                      {
                        id: 'lossless',
                        title: 'Keep Selectable Text',
                        desc: 'Optimizes file structure while keeping crisp text',
                        icon: <FileText className="w-4 h-4" aria-hidden="true" />,
                      },
                    ] as const
                  ).map((opt) => {
                    const active = compressLevel === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        disabled={isBusy}
                        onClick={() => setCompressLevel(opt.id)}
                        className={`text-left p-3.5 rounded-2xl border transition flex items-start gap-3 cursor-pointer ${
                          active
                            ? 'bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 border-transparent'
                            : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-100'
                        }`}
                      >
                        <span
                          className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                            active
                              ? 'bg-blue-600 text-white'
                              : 'bg-zinc-100 text-zinc-600'
                          }`}
                        >
                          {opt.icon}
                        </span>
                        <div className="min-w-0">
                          <div className="text-xs font-bold">{opt.title}</div>
                          <div
                            className={`text-[11px] mt-0.5 leading-snug ${
                              active
                                ? 'text-zinc-300 dark:text-zinc-600'
                                : 'text-zinc-500'
                            }`}
                          >
                            {opt.desc}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {mode === 'split' && primaryPdf && (
              <div className="p-5 sm:px-7 bg-zinc-50/80 space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="split-range"
                      className="block text-xs font-semibold text-zinc-700 mb-1.5"
                    >
                      Pages to Extract (leave blank for all {primaryPdf.pageCount ?? '...'} pages)
                    </label>
                    <input
                      id="split-range"
                      type="text"
                      placeholder="e.g. 1-3, 5, 8-10"
                      value={splitRange}
                      onChange={(e) => {
                        setSplitRange(e.target.value);
                        setErrorMsg(null);
                      }}
                      className="w-full bg-white border border-zinc-300 rounded-xl px-3.5 py-2 text-sm tabular-nums"
                    />
                    {primaryPdf.pageCount && primaryPdf.pageCount > 1 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        <button
                          type="button"
                          onClick={() => setSplitRange('1')}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-zinc-200 text-[11px] font-semibold text-zinc-600 hover:bg-zinc-100 cursor-pointer"
                        >
                          <FileText className="w-3 h-3 opacity-60" aria-hidden="true" />
                          First Page
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setSplitRange(
                              Array.from({ length: primaryPdf.pageCount! }, (_, i) => i + 1)
                                .filter((p) => p % 2 === 1)
                                .join(', ')
                            )
                          }
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-zinc-200 text-[11px] font-semibold text-zinc-600 hover:bg-zinc-100 cursor-pointer"
                        >
                          <Scissors className="w-3 h-3 opacity-60" aria-hidden="true" />
                          Odd Pages
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setSplitRange(
                              Array.from({ length: primaryPdf.pageCount! }, (_, i) => i + 1)
                                .filter((p) => p % 2 === 0)
                                .join(', ')
                            )
                          }
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-zinc-200 text-[11px] font-semibold text-zinc-600 hover:bg-zinc-100 cursor-pointer"
                        >
                          <Scissors className="w-3 h-3 opacity-60" aria-hidden="true" />
                          Even Pages
                        </button>
                        <button
                          type="button"
                          onClick={() => setSplitRange('')}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-zinc-200 text-[11px] font-semibold text-zinc-600 hover:bg-zinc-100 cursor-pointer"
                        >
                          <Layers className="w-3 h-3 opacity-60" aria-hidden="true" />
                          All Pages
                        </button>
                      </div>
                    )}
                  </div>

                  <div>
                    <span className="block text-xs font-semibold text-zinc-700 mb-1.5">
                      Output Mode
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setSplitOutputMode('combined')}
                        className={`inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-xs font-semibold border cursor-pointer ${
                          splitOutputMode === 'combined'
                            ? 'bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 border-transparent'
                            : 'bg-white text-zinc-700 border-zinc-200'
                        }`}
                      >
                        <FileText className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Single PDF</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setSplitOutputMode('individual')}
                        className={`inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-xs font-semibold border cursor-pointer ${
                          splitOutputMode === 'individual'
                            ? 'bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 border-transparent'
                            : 'bg-white text-zinc-700 border-zinc-200'
                        }`}
                      >
                        <Archive className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Separate (ZIP)</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {mode === 'pdf-to-jpg' && primaryPdf && (
              <div className="p-5 sm:px-7 bg-zinc-50/80 grid sm:grid-cols-3 gap-4 text-xs">
                <div>
                  <span className="block text-[11px] font-bold uppercase text-zinc-500 mb-1.5">
                    Image Format
                  </span>
                  <div className="grid grid-cols-3 bg-zinc-200/70 dark:bg-zinc-800 p-0.5 rounded-xl gap-0.5">
                    {PDF_IMG_FORMATS.map((fmt) => {
                      const active = imgFormat === fmt.id;
                      return (
                        <button
                          key={fmt.id}
                          type="button"
                          onClick={() => setImgFormat(fmt.id)}
                          className={`inline-flex items-center justify-center gap-1 py-1.5 px-2 rounded-[10px] text-xs font-semibold transition cursor-pointer ${
                            active
                              ? 'bg-white dark:bg-zinc-950 text-zinc-950 dark:text-white shadow-xs'
                              : 'text-zinc-600 hover:text-zinc-900'
                          }`}
                        >
                          <span className={active ? 'text-blue-600 dark:text-blue-400' : 'opacity-70'}>
                            {fmt.icon}
                          </span>
                          <span>{fmt.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <span className="block text-[11px] font-bold uppercase text-zinc-500 mb-1.5">
                    Image Quality
                  </span>
                  <div className="grid grid-cols-3 bg-zinc-200/70 dark:bg-zinc-800 p-0.5 rounded-xl gap-0.5">
                    {PDF_IMG_QUALITIES.map((q) => {
                      const active = imgScale === q.scale;
                      return (
                        <button
                          key={q.scale}
                          type="button"
                          onClick={() => setImgScale(q.scale)}
                          className={`inline-flex items-center justify-center gap-1 py-1.5 px-2 rounded-[10px] text-xs font-semibold transition cursor-pointer ${
                            active
                              ? 'bg-white dark:bg-zinc-950 text-zinc-950 dark:text-white shadow-xs'
                              : 'text-zinc-600 hover:text-zinc-900'
                          }`}
                        >
                          <span className={active ? 'text-blue-600 dark:text-blue-400' : 'opacity-70'}>
                            {q.icon}
                          </span>
                          <span className="truncate">{q.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label htmlFor="p2i-range" className="block text-[11px] font-bold uppercase text-zinc-500 mb-1.5">
                    Page Range (Optional)
                  </label>
                  <input
                    id="p2i-range"
                    type="text"
                    placeholder={`All (${primaryPdf.pageCount ?? '...'} pages)`}
                    value={imgRange}
                    onChange={(e) => {
                      setImgRange(e.target.value);
                      setErrorMsg(null);
                    }}
                    className="w-full bg-white border border-zinc-300 rounded-xl px-3 py-2 font-semibold tabular-nums"
                  />
                </div>
              </div>
            )}

            {/* Loaded PDF Queue Rows */}
            <div className="divide-y divide-zinc-100 max-h-[360px] overflow-y-auto">
              {entries.map((entry, idx) => (
                <div
                  key={entry.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 sm:px-7 py-3.5 hover:bg-zinc-50 transition"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-10 h-10 rounded-xl bg-red-500/10 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
                      <FileText className="w-5 h-5" aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-zinc-900 truncate">
                        {entry.file.name}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500 tabular-nums mt-0.5">
                        <span>{formatFileSize(entry.file.size)}</span>
                        <span>·</span>
                        <span>
                          {entry.pageCount === null
                            ? 'Reading pages...'
                            : `${entry.pageCount} ${entry.pageCount === 1 ? 'page' : 'pages'}`}
                        </span>

                        {entry.compressResult && (
                          <>
                            <ArrowRight className="w-3 h-3 text-zinc-400" aria-hidden="true" />
                            <span className="font-semibold text-zinc-900">
                              {formatFileSize(entry.compressResult.newSize)}
                            </span>
                            {entry.compressResult.savedPercent > 0 ? (
                              <span className="px-2 py-0.5 rounded-md bg-emerald-500/12 text-emerald-700 dark:text-emerald-400 text-[10.5px] font-semibold">
                                -{entry.compressResult.savedPercent}% saved
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-800 dark:text-amber-300 text-[10.5px] font-semibold">
                                Already compact
                              </span>
                            )}
                          </>
                        )}
                      </div>

                      {entry.error && (
                        <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                          <span>{entry.error}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {entry.compressResult && (
                      <button
                        type="button"
                        onClick={() =>
                          triggerDownload(entry.compressResult!.blob, entry.compressResult!.fileName)
                        }
                        className="btn-studio-primary inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Save</span>
                      </button>
                    )}

                    {mode === 'merge' && (
                      <>
                        <button
                          type="button"
                          disabled={idx === 0 || isBusy}
                          onClick={() => moveEntry(idx, -1)}
                          aria-label="Move PDF up"
                          className="p-1.5 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-100 disabled:opacity-30 text-zinc-600 cursor-pointer"
                        >
                          <ArrowUp className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === entries.length - 1 || isBusy}
                          onClick={() => moveEntry(idx, 1)}
                          aria-label="Move PDF down"
                          className="p-1.5 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-100 disabled:opacity-30 text-zinc-600 cursor-pointer"
                        >
                          <ArrowDown className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      </>
                    )}

                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => removeEntry(entry.id)}
                      aria-label={`Remove ${entry.file.name}`}
                      className="p-1.5 rounded-lg text-zinc-400 hover:text-red-600 hover:bg-red-500/10 cursor-pointer"
                    >
                      <X className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Rendered Image Grid for PDF-to-JPG */}
            {mode === 'pdf-to-jpg' && renderedPages.length > 0 && (
              <div className="p-5 sm:p-7 bg-zinc-50/50 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-zinc-700 tabular-nums">
                    Converted Pages ({renderedPages.length})
                  </span>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => void downloadRenderedZip()}
                    className="btn-studio-accent inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer"
                  >
                    {renderedPages.length > 1 ? (
                      <>
                        <Archive className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Download All ZIP ({renderedPages.length})</span>
                      </>
                    ) : (
                      <>
                        <Download className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Download Image</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 max-h-[420px] overflow-y-auto pr-1">
                  {renderedPages.map((pg) => (
                    <div
                      key={pg.pageNumber}
                      className="bg-white rounded-2xl border border-zinc-200/80 overflow-hidden flex flex-col justify-between"
                    >
                      <div className="aspect-[3/4] bg-zinc-100 overflow-hidden flex items-center justify-center p-1.5">
                        <img
                          src={pg.url}
                          alt={`Page ${pg.pageNumber}`}
                          className="max-w-full max-h-full object-contain rounded"
                        />
                      </div>
                      <div className="p-2.5 border-t border-zinc-100 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-zinc-900 tabular-nums">
                            Page {pg.pageNumber}
                          </p>
                          <p className="text-[10.5px] text-zinc-500 tabular-nums">
                            {formatFileSize(pg.size)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => triggerDownload(pg.blob, pg.fileName)}
                          aria-label={`Download page ${pg.pageNumber}`}
                          className="btn-studio-primary p-2 rounded-xl cursor-pointer shrink-0"
                        >
                          <Download className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Bottom Action Footer */}
            <div className="p-5 sm:px-7 bg-zinc-50/80 space-y-3">
              {mode === 'merge' && (
                <div className="flex flex-wrap items-center gap-2">
                  <label htmlFor="merge-name" className="text-xs font-semibold text-zinc-600">
                    Output Name
                  </label>
                  <input
                    id="merge-name"
                    type="text"
                    value={mergedName}
                    onChange={(e) => setMergedName(e.target.value)}
                    className="flex-1 min-w-[180px] max-w-xs bg-white border border-zinc-300 rounded-xl px-3 py-1.5 text-xs sm:text-sm"
                  />
                  <span className="text-xs font-semibold text-zinc-500">.pdf</span>
                </div>
              )}

              {statusMsg && (
                <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>{statusMsg}</span>
                </p>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-100 disabled:opacity-40 text-xs sm:text-[13px] font-semibold text-zinc-700 cursor-pointer tabular-nums"
                  >
                    <Plus className="w-4 h-4" aria-hidden="true" />
                    <span>
                      {isMultiFile
                        ? `Add PDFs (${entries.length})`
                        : 'Change PDF'}
                    </span>
                  </button>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={clearAll}
                    aria-label="Clear files"
                    className="p-2.5 rounded-xl border border-zinc-200 bg-white hover:text-red-600 text-zinc-500 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>

                {mode === 'merge' && (
                  <button
                    type="button"
                    disabled={isBusy || entries.filter((e) => !e.error).length < 2}
                    onClick={() => void runMerge()}
                    className="btn-studio-accent w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl disabled:opacity-40 text-xs sm:text-sm font-semibold cursor-pointer tabular-nums"
                  >
                    {isBusy ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                        <span>{progressText || 'Merging...'}</span>
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4" aria-hidden="true" />
                        <span>Merge {entries.length} PDFs ({totalPages} Pages)</span>
                      </>
                    )}
                  </button>
                )}

                {mode === 'split' && (
                  <button
                    type="button"
                    disabled={isBusy || !primaryPdf?.pageCount}
                    onClick={() => void runSplit()}
                    className="btn-studio-accent w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl disabled:opacity-40 text-xs sm:text-sm font-semibold cursor-pointer"
                  >
                    {isBusy ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                        <span>{progressText || 'Splitting...'}</span>
                      </>
                    ) : (
                      <>
                        <Scissors className="w-4 h-4" aria-hidden="true" />
                        <span>
                          {splitOutputMode === 'individual' ? 'Split & Download ZIP' : 'Extract & Download PDF'}
                        </span>
                      </>
                    )}
                  </button>
                )}

                {mode === 'compress' && (
                  <button
                    type="button"
                    disabled={isBusy || entries.filter((e) => !e.error).length === 0}
                    onClick={() => void runCompress()}
                    className="btn-studio-accent w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl disabled:opacity-40 text-xs sm:text-sm font-semibold cursor-pointer"
                  >
                    {isBusy ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                        <span>{progressText || 'Compressing...'}</span>
                      </>
                    ) : (
                      <>
                        <Minimize2 className="w-4 h-4" aria-hidden="true" />
                        <span>
                          Compress {entries.length > 1 ? `${entries.length} PDFs` : 'PDF'}
                        </span>
                      </>
                    )}
                  </button>
                )}

                {mode === 'pdf-to-jpg' && (
                  <button
                    type="button"
                    disabled={isBusy || !primaryPdf?.pageCount}
                    onClick={() => void runPdfToImages()}
                    className="btn-studio-accent w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl disabled:opacity-40 text-xs sm:text-sm font-semibold cursor-pointer"
                  >
                    {isBusy ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                        <span>{progressText || 'Rendering...'}</span>
                      </>
                    ) : (
                      <>
                        <ImageIcon className="w-4 h-4" aria-hidden="true" />
                        <span>Convert Pages to Images</span>
                      </>
                    )}
                  </button>
                )}
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
