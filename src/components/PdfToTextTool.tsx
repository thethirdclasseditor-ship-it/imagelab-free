import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';

interface ExtractedPage {
  pageNumber: number;
  text: string;
  wordCount: number;
}

interface TextItemLike {
  str: string;
  hasEOL?: boolean;
  transform?: number[];
  height?: number;
}

type ViewMode = 'combined' | 'pages';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}

function parsePageRange(input: string, maxPages: number): number[] {
  const cleaned = input.trim();
  if (!cleaned) {
    return Array.from({ length: maxPages }, (_, i) => i + 1);
  }

  const pages = new Set<number>();
  const parts = cleaned.split(',');

  for (const rawPart of parts) {
    const part = rawPart.trim();
    if (!part) continue;

    if (part.includes('-')) {
      const [startStr, endStr] = part.split('-').map((s) => s.trim());
      const start = Math.max(1, Math.min(maxPages, parseInt(startStr, 10) || 1));
      const end = Math.max(1, Math.min(maxPages, parseInt(endStr, 10) || maxPages));
      const lo = Math.min(start, end);
      const hi = Math.max(start, end);
      for (let p = lo; p <= hi; p++) pages.add(p);
    } else {
      const num = parseInt(part, 10);
      if (!Number.isNaN(num) && num >= 1 && num <= maxPages) {
        pages.add(num);
      }
    }
  }

  return Array.from(pages).sort((a, b) => a - b);
}

function reconstructPageText(items: unknown[]): string {
  const lines: string[] = [];
  let currentLine = '';
  let lastY: number | null = null;
  let lastHeight = 12;

  for (const raw of items) {
    if (!raw || typeof raw !== 'object' || !('str' in raw)) continue;
    const item = raw as TextItemLike;
    const str = item.str ?? '';
    const transform = Array.isArray(item.transform) ? item.transform : null;
    const y = transform ? transform[5] : lastY;
    const height =
      typeof item.height === 'number' && item.height > 0
        ? item.height
        : transform
        ? Math.hypot(transform[2] || 0, transform[3] || 0) || 12
        : lastHeight;

    if (lastY !== null && y !== null) {
      const yDiff = Math.abs(y - lastY);
      const lineThreshold = Math.max(4, Math.min(height, lastHeight) * 0.55);
      if (yDiff > lineThreshold) {
        lines.push(currentLine.trimEnd());
        // Preserve intentional paragraph spacing on large vertical jumps
        if (yDiff > Math.max(height, lastHeight) * 1.9) {
          lines.push('');
        }
        currentLine = '';
      }
    }

    if (str.length > 0) {
      if (currentLine.length > 0 && !currentLine.endsWith(' ') && !str.startsWith(' ')) {
        currentLine += ' ';
      }
      currentLine += str;
    }

    if (item.hasEOL) {
      lines.push(currentLine.trimEnd());
      currentLine = '';
    }

    if (y !== null) lastY = y;
    if (height > 0) lastHeight = height;
  }

  if (currentLine.trim()) {
    lines.push(currentLine.trimEnd());
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function normalizeWhitespace(text: string): string {
  return text
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export default function PdfToTextTool() {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [pages, setPages] = useState<ExtractedPage[]>([]);

  const [viewMode, setViewMode] = useState<ViewMode>('combined');
  const [includeHeaders, setIncludeHeaders] = useState<boolean>(true);
  const [cleanSpaces, setCleanSpaces] = useState<boolean>(true);
  const [pageRangeInput, setPageRangeInput] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isExtracting, setIsExtracting] = useState<boolean>(false);
  const [progress, setProgress] = useState<{ current: number; total: number }>({
    current: 0,
    total: 0,
  });
  const [error, setError] = useState<string>('');
  const [copiedKey, setCopiedKey] = useState<string>('');

  const [txtUrl, setTxtUrl] = useState<string>('');
  const [mdUrl, setMdUrl] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const extractJobRef = useRef<number>(0);

  const extractPdf = useCallback(async (file: File) => {
    setError('');
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setError('Please select a valid PDF file.');
      return;
    }

    const jobId = ++extractJobRef.current;
    setPdfFile(file);
    setPages([]);
    setTotalPages(0);
    setPageRangeInput('');
    setSearchQuery('');
    setIsExtracting(true);
    setProgress({ current: 0, total: 0 });

    try {
      const pdfjsLib = await import('pdfjs-dist');
      if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
        const ver = pdfjsLib.version || '4.4.168';
        const major = parseInt(ver.split('.')[0], 10) || 4;
        const ext = major >= 4 ? 'mjs' : 'js';
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${ver}/build/pdf.worker.min.${ext}`;
      }

      const data = new Uint8Array(await file.arrayBuffer());
      const loadingTask = pdfjsLib.getDocument({ data });
      const pdf = await loadingTask.promise;

      if (jobId !== extractJobRef.current) {
        await pdf.destroy();
        return;
      }

      const numPages = pdf.numPages;
      setTotalPages(numPages);
      setProgress({ current: 0, total: numPages });

      const extracted: ExtractedPage[] = [];
      for (let i = 1; i <= numPages; i++) {
        if (jobId !== extractJobRef.current) {
          await pdf.destroy();
          return;
        }
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const text = reconstructPageText(content.items as unknown[]);
        extracted.push({
          pageNumber: i,
          text,
          wordCount: countWords(text),
        });
        setProgress({ current: i, total: numPages });
      }

      await pdf.destroy();

      if (jobId === extractJobRef.current) {
        setPages(extracted);
      }
    } catch (err) {
      if (jobId !== extractJobRef.current) return;
      const msg = err instanceof Error ? err.message.toLowerCase() : '';
      if (msg.includes('password') || msg.includes('encrypt')) {
        setError('This PDF is password-protected. Unlock it first to extract text.');
      } else {
        setError('Could not read this PDF file. Please verify the file is not corrupted.');
      }
    } finally {
      if (jobId === extractJobRef.current) {
        setIsExtracting(false);
      }
    }
  }, []);

  const filteredPages = useMemo(() => {
    if (pages.length === 0) return [];
    const allowed = new Set(parsePageRange(pageRangeInput, totalPages || pages.length));
    const q = searchQuery.trim().toLowerCase();

    return pages
      .filter((p) => allowed.has(p.pageNumber))
      .map((p) => {
        const text = cleanSpaces ? normalizeWhitespace(p.text) : p.text;
        return { ...p, text, wordCount: countWords(text) };
      })
      .filter((p) => (!q ? true : p.text.toLowerCase().includes(q)));
  }, [pages, pageRangeInput, totalPages, cleanSpaces, searchQuery]);

  const combinedText = useMemo(() => {
    if (filteredPages.length === 0) return '';
    return filteredPages
      .map((p) => {
        const body = p.text || '[No selectable text on this page]';
        return includeHeaders && filteredPages.length > 1
          ? `--- Page ${p.pageNumber} ---\n${body}`
          : body;
      })
      .join('\n\n');
  }, [filteredPages, includeHeaders]);

  const markdownText = useMemo(() => {
    if (filteredPages.length === 0) return '';
    return filteredPages
      .map((p) => {
        const body = p.text || '_No selectable text on this page_';
        return filteredPages.length > 1 ? `## Page ${p.pageNumber}\n\n${body}` : body;
      })
      .join('\n\n---\n\n');
  }, [filteredPages]);

  const totalExtractedChars = useMemo(
    () => pages.reduce((sum, p) => sum + p.text.trim().length, 0),
    [pages]
  );
  const isLikelyScanned = !isExtracting && pages.length > 0 && totalExtractedChars < 20;

  const activeWordCount = useMemo(() => countWords(combinedText), [combinedText]);
  const activeCharCount = combinedText.length;

  // Generate downloadable .txt and .md Blob URLs
  useEffect(() => {
    if (!combinedText) {
      setTxtUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return '';
      });
      setMdUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return '';
      });
      return;
    }

    const nextTxt = URL.createObjectURL(
      new Blob([combinedText], { type: 'text/plain;charset=utf-8' })
    );
    const nextMd = URL.createObjectURL(
      new Blob([markdownText], { type: 'text/markdown;charset=utf-8' })
    );

    setTxtUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return nextTxt;
    });
    setMdUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return nextMd;
    });

    return () => {
      URL.revokeObjectURL(nextTxt);
      URL.revokeObjectURL(nextMd);
    };
  }, [combinedText, markdownText]);

  const copyText = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      window.setTimeout(() => {
        setCopiedKey((cur) => (cur === key ? '' : cur));
      }, 1800);
    } catch {
      setError('Clipboard permission denied. Select the text manually to copy.');
    }
  };

  const clearAll = () => {
    extractJobRef.current++;
    setPdfFile(null);
    setPages([]);
    setTotalPages(0);
    setPageRangeInput('');
    setSearchQuery('');
    setIsExtracting(false);
    setError('');
  };

  const baseName = pdfFile ? pdfFile.name.replace(/\.pdf$/i, '') : 'extracted';

  return (
    <div className="space-y-6">
      {/* Upload Dropzone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file) extractPdf(file);
        }}
        onClick={() => fileInputRef.current?.click()}
        className={`studio-card rounded-3xl border-2 border-dashed transition-all cursor-pointer text-center ${
          pdfFile ? 'py-4 px-6' : 'py-14 px-6'
        } ${
          isDragging
            ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/20'
            : 'border-zinc-300 dark:border-zinc-700 hover:border-blue-500/60'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              extractPdf(file);
              e.target.value = '';
            }
          }}
        />
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-blue-600/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div className={pdfFile ? 'text-center sm:text-left' : 'text-center'}>
            <p className="text-sm sm:text-base font-bold text-zinc-900 dark:text-zinc-100">
              {pdfFile
                ? `${pdfFile.name} (${totalPages || '…'} pages · ${formatBytes(pdfFile.size)})`
                : 'Drop your PDF file here or click to extract text'}
            </p>
            <p className="text-xs text-zinc-500">
              {pdfFile
                ? 'Click to upload another PDF · Runs 100% locally in your browser'
                : 'Instant text extraction for digital PDFs · Export as .TXT or .MD'}
            </p>
          </div>
        </div>
      </div>

      {/* Extraction Progress */}
      {isExtracting && (
        <div className="studio-card rounded-2xl p-4 space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-zinc-700 dark:text-zinc-300">
            <span>
              Extracting text
              {progress.total > 0 ? ` — Page ${progress.current} of ${progress.total}` : '…'}
            </span>
            {progress.total > 0 && (
              <span className="font-mono">
                {Math.round((progress.current / progress.total) * 100)}%
              </span>
            )}
          </div>
          <div className="h-2 w-full rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
            <div
              className="h-full bg-blue-600 transition-all duration-150"
              style={{
                width:
                  progress.total > 0
                    ? `${Math.max(8, Math.round((progress.current / progress.total) * 100))}%`
                    : '25%',
              }}
            />
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-xs font-medium text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Scanned PDF Smart Callout */}
      {isLikelyScanned && (
        <div className="rounded-3xl border border-amber-300 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/30 p-5 space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0 mt-0.5">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86l-7.1 12.29A2 2 0 004.92 19h14.16a2 2 0 001.73-2.85l-7.1-12.29a2 2 0 00-3.42 0z" />
              </svg>
            </div>
            <div className="space-y-1">
              <h2 className="text-sm font-bold text-amber-900 dark:text-amber-200">
                This PDF looks like a scanned image (no selectable text layer)
              </h2>
              <p className="text-xs text-amber-800/90 dark:text-amber-300/90 leading-relaxed">
                Standard PDF text extraction works on digital PDFs. For scanned documents or Bangla/handwritten PDFs, convert pages to images first and extract them with our AI OCR tool:
              </p>
              <div className="flex flex-wrap gap-2 pt-2">
                <a
                  href="/pdf-to-jpg"
                  className="px-3.5 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-amber-300 dark:border-amber-700 text-xs font-bold text-zinc-900 dark:text-zinc-100 hover:border-blue-500 transition"
                >
                  1. Convert PDF to JPG →
                </a>
                <a
                  href="/image-to-text"
                  className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition"
                >
                  2. Extract via AI OCR (English &amp; বাংলা) →
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Results Workspace */}
      {!isExtracting && pages.length > 0 && (
        <div className="space-y-4">
          {/* Controls & Stats Bar */}
          <div className="studio-card rounded-3xl p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* Stats Pills */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="px-2.5 py-1 rounded-xl bg-zinc-100 dark:bg-zinc-800 font-semibold text-zinc-800 dark:text-zinc-200">
                  {filteredPages.length} / {totalPages} pages
                </span>
                <span className="px-2.5 py-1 rounded-xl bg-blue-600/10 text-blue-600 dark:text-blue-400 font-bold">
                  {activeWordCount.toLocaleString()} words
                </span>
                <span className="px-2.5 py-1 rounded-xl bg-zinc-100 dark:bg-zinc-800 font-mono text-zinc-600 dark:text-zinc-300">
                  {activeCharCount.toLocaleString()} chars
                </span>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => copyText(combinedText, 'all')}
                  disabled={!combinedText}
                  className="btn-studio-primary inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold disabled:opacity-50 cursor-pointer"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  <span>{copiedKey === 'all' ? 'Copied!' : 'Copy All'}</span>
                </button>

                {txtUrl && (
                  <a
                    href={txtUrl}
                    download={`${baseName}.txt`}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:border-blue-500 text-xs font-bold text-zinc-800 dark:text-zinc-100 transition"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
                    </svg>
                    <span>.TXT</span>
                  </a>
                )}

                {mdUrl && (
                  <a
                    href={mdUrl}
                    download={`${baseName}.md`}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:border-blue-500 text-xs font-bold text-zinc-800 dark:text-zinc-100 transition"
                  >
                    <span>.MD</span>
                  </a>
                )}

                <button
                  type="button"
                  onClick={clearAll}
                  className="px-2.5 py-2 rounded-xl text-xs font-semibold text-zinc-500 hover:text-red-600 transition cursor-pointer"
                >
                  Clear
                </button>
              </div>
            </div>

            {/* Filters & View Toggles */}
            <div className="grid sm:grid-cols-12 gap-3 pt-3 border-t border-zinc-200/80 dark:border-zinc-800 items-center">
              <div className="sm:col-span-3">
                <input
                  type="text"
                  value={pageRangeInput}
                  onChange={(e) => setPageRangeInput(e.target.value)}
                  placeholder={`Pages (e.g. 1-${Math.min(3, totalPages)})`}
                  aria-label="Filter page range"
                  className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
                />
              </div>

              <div className="sm:col-span-4">
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Find keyword in pages…"
                  aria-label="Search extracted text"
                  className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400"
                />
              </div>

              <div className="sm:col-span-5 flex flex-wrap items-center justify-between sm:justify-end gap-3">
                <label className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeHeaders}
                    onChange={(e) => setIncludeHeaders(e.target.checked)}
                    className="accent-blue-600 rounded"
                  />
                  <span>Page headers</span>
                </label>

                <label className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cleanSpaces}
                    onChange={(e) => setCleanSpaces(e.target.checked)}
                    className="accent-blue-600 rounded"
                  />
                  <span>Clean spaces</span>
                </label>

                <div className="inline-flex rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setViewMode('combined')}
                    className={`px-2.5 py-1.5 cursor-pointer ${
                      viewMode === 'combined'
                        ? 'bg-blue-600 text-white'
                        : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300'
                    }`}
                  >
                    Combined
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('pages')}
                    className={`px-2.5 py-1.5 cursor-pointer ${
                      viewMode === 'pages'
                        ? 'bg-blue-600 text-white'
                        : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300'
                    }`}
                  >
                    By Page
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Output Display */}
          {filteredPages.length === 0 ? (
            <div className="studio-card rounded-3xl p-8 text-center text-xs text-zinc-500">
              No pages match your current range or search filter.
            </div>
          ) : viewMode === 'combined' ? (
            <div className="studio-card rounded-3xl p-3 sm:p-4">
              <textarea
                readOnly
                value={combinedText}
                rows={18}
                aria-label="Extracted PDF text"
                className="w-full rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-950/70 p-4 text-xs sm:text-[13.5px] leading-relaxed text-zinc-900 dark:text-zinc-100 font-sans focus:outline-none focus:ring-2 focus:ring-blue-500/40 resize-y"
              />
            </div>
          ) : (
            <div className="space-y-3">
              {filteredPages.map((p) => (
                <div
                  key={p.pageNumber}
                  className="studio-card rounded-2xl p-4 space-y-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-lg bg-blue-600/10 text-blue-600 dark:text-blue-400 text-xs font-bold">
                        Page {p.pageNumber}
                      </span>
                      <span className="text-[11px] text-zinc-500">
                        {p.wordCount.toLocaleString()} words
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyText(p.text, `page-${p.pageNumber}`)}
                      disabled={!p.text}
                      className="px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:border-blue-500 text-[11px] font-semibold text-zinc-700 dark:text-zinc-200 disabled:opacity-40 cursor-pointer"
                    >
                      {copiedKey === `page-${p.pageNumber}` ? 'Copied!' : 'Copy Page'}
                    </button>
                  </div>
                  <pre className="whitespace-pre-wrap break-words rounded-xl bg-zinc-50/80 dark:bg-zinc-950/70 border border-zinc-200/70 dark:border-zinc-800 p-3.5 text-xs sm:text-[13px] leading-relaxed text-zinc-800 dark:text-zinc-200 font-sans max-h-80 overflow-y-auto">
                    {p.text || 'No selectable text detected on this page.'}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
