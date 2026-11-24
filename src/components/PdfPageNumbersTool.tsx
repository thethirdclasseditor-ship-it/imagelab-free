import React, { useState, useRef, useEffect, useCallback } from 'react';

type PositionId =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right';

type FormatPresetId = 'num' | 'page-num' | 'num-slash-total' | 'page-of-total' | 'dash-num' | 'custom';
type FontChoice = 'helvetica' | 'times' | 'courier';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function hexToRgbUnit(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const num = parseInt(full, 16);
  if (Number.isNaN(num)) return { r: 0.04, g: 0.04, b: 0.04 };
  return {
    r: ((num >> 16) & 255) / 255,
    g: ((num >> 8) & 255) / 255,
    b: (num & 255) / 255,
  };
}

// pdf-lib StandardFonts use WinAnsi encoding; strip unsupported characters safely
function toWinAnsiSafe(text: string): string {
  return text.replace(/[^\x20-\x7E\xA0-\xFF]/g, '');
}

function buildLabel(
  preset: FormatPresetId,
  customTemplate: string,
  pageNumber: number,
  totalNumbered: number
): string {
  switch (preset) {
    case 'num':
      return `${pageNumber}`;
    case 'page-num':
      return `Page ${pageNumber}`;
    case 'num-slash-total':
      return `${pageNumber} / ${totalNumbered}`;
    case 'page-of-total':
      return `Page ${pageNumber} of ${totalNumbered}`;
    case 'dash-num':
      return `- ${pageNumber} -`;
    case 'custom': {
      const safe = toWinAnsiSafe(customTemplate || '{n}');
      return safe
        .replace(/\{n\}/gi, String(pageNumber))
        .replace(/\{total\}/gi, String(totalNumbered));
    }
  }
}

export default function PdfPageNumbersTool() {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [totalPages, setTotalPages] = useState<number>(0);

  // Positioning & Range
  const [position, setPosition] = useState<PositionId>('bottom-center');
  const [mirrorFacing, setMirrorFacing] = useState<boolean>(false);
  const [fromPage, setFromPage] = useState<number>(1);
  const [toPage, setToPage] = useState<number>(1);
  const [startNumber, setStartNumber] = useState<number>(1);
  const [totalMode, setTotalMode] = useState<'document' | 'numbered'>('document');

  // Format & Styling
  const [formatPreset, setFormatPreset] = useState<FormatPresetId>('page-of-total');
  const [customTemplate, setCustomTemplate] = useState<string>('Page {n} of {total}');
  const [fontChoice, setFontChoice] = useState<FontChoice>('helvetica');
  const [isBold, setIsBold] = useState<boolean>(false);
  const [fontSize, setFontSize] = useState<number>(11);
  const [marginPt, setMarginPt] = useState<number>(28);
  const [textColor, setTextColor] = useState<string>('#18181b');
  const [opacity, setOpacity] = useState<number>(90);

  // Processing State
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isReading, setIsReading] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [downloadUrl, setDownloadUrl] = useState<string>('');
  const [outputSize, setOutputSize] = useState<number>(0);
  const [isDirty, setIsDirty] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const downloadUrlRef = useRef<string>('');
  downloadUrlRef.current = downloadUrl;

  useEffect(() => {
    return () => {
      if (downloadUrlRef.current) URL.revokeObjectURL(downloadUrlRef.current);
    };
  }, []);

  // Mark output stale whenever settings change after generation
  useEffect(() => {
    if (downloadUrl) setIsDirty(true);
  }, [
    position,
    mirrorFacing,
    fromPage,
    toPage,
    startNumber,
    totalMode,
    formatPreset,
    customTemplate,
    fontChoice,
    isBold,
    fontSize,
    marginPt,
    textColor,
    opacity,
  ]);

  const loadPdf = useCallback(async (file: File) => {
    setError('');
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setError('Please select a valid PDF file.');
      return;
    }

    setIsReading(true);
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const { PDFDocument } = await import('pdf-lib');
      const doc = await PDFDocument.load(bytes);
      const count = doc.getPageCount();

      if (count === 0) {
        setError('This PDF has no pages.');
        return;
      }

      if (downloadUrlRef.current) {
        URL.revokeObjectURL(downloadUrlRef.current);
        setDownloadUrl('');
      }

      setPdfFile(file);
      setPdfBytes(bytes);
      setTotalPages(count);
      setFromPage(1);
      setToPage(count);
      setStartNumber(1);
      setOutputSize(0);
      setIsDirty(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message.toLowerCase() : '';
      if (msg.includes('encrypt') || msg.includes('password')) {
        setError('This PDF is password-protected. Please unlock it before adding page numbers.');
      } else {
        setError('Could not read this PDF file. It may be corrupted or unsupported.');
      }
    } finally {
      setIsReading(false);
    }
  }, []);

  const handleApply = async () => {
    if (!pdfBytes || !pdfFile) return;
    setError('');
    setIsProcessing(true);

    try {
      const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const pages = pdfDoc.getPages();
      const pageCount = pages.length;

      const fontKey =
        fontChoice === 'helvetica'
          ? isBold
            ? StandardFonts.HelveticaBold
            : StandardFonts.Helvetica
          : fontChoice === 'times'
          ? isBold
            ? StandardFonts.TimesRomanBold
            : StandardFonts.TimesRoman
          : isBold
          ? StandardFonts.CourierBold
          : StandardFonts.Courier;

      const font = await pdfDoc.embedFont(fontKey);
      const { r, g, b } = hexToRgbUnit(textColor);
      const color = rgb(r, g, b);
      const alpha = Math.min(1, Math.max(0.1, opacity / 100));

      const safeFrom = Math.max(1, Math.min(pageCount, fromPage));
      const safeTo = Math.max(safeFrom, Math.min(pageCount, toPage));
      const numberedSpan = safeTo - safeFrom + 1;
      const totalForLabel =
        totalMode === 'document' ? pageCount : startNumber + numberedSpan - 1;

      const [vPos, hPos] = position.split('-') as ['top' | 'bottom', 'left' | 'center' | 'right'];

      for (let i = safeFrom - 1; i < safeTo; i++) {
        const page = pages[i];
        const { width, height } = page.getSize();
        const displayNum = startNumber + (i - (safeFrom - 1));
        const label = buildLabel(formatPreset, customTemplate, displayNum, totalForLabel);
        if (!label) continue;

        const textWidth = font.widthOfTextAtSize(label, fontSize);

        // Mirror horizontal alignment on even pages when Facing Pages is enabled
        let activeH = hPos;
        if (mirrorFacing && (i + 1) % 2 === 0) {
          if (hPos === 'right') activeH = 'left';
          else if (hPos === 'left') activeH = 'right';
        }

        let x = marginPt;
        if (activeH === 'center') {
          x = (width - textWidth) / 2;
        } else if (activeH === 'right') {
          x = width - marginPt - textWidth;
        }

        const y = vPos === 'top' ? height - marginPt - fontSize : marginPt;

        const safeX = Math.max(6, Math.min(width - textWidth - 6, x));
        const safeY = Math.max(6, Math.min(height - fontSize - 6, y));

        page.drawText(label, {
          x: safeX,
          y: safeY,
          size: fontSize,
          font,
          color,
          opacity: alpha,
        });
      }

      const outBytes = await pdfDoc.save();
      const blob = new Blob([outBytes as BlobPart], { type: 'application/pdf' });
      const nextUrl = URL.createObjectURL(blob);

      setDownloadUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return nextUrl;
      });
      setOutputSize(blob.size);
      setIsDirty(false);
    } catch {
      setError('Failed to add page numbers. Try removing special symbols from custom text.');
    } finally {
      setIsProcessing(false);
    }
  };

  const resetAll = () => {
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    setPdfFile(null);
    setPdfBytes(null);
    setTotalPages(0);
    setDownloadUrl('');
    setOutputSize(0);
    setError('');
    setIsDirty(false);
  };

  const baseName = pdfFile ? pdfFile.name.replace(/\.pdf$/i, '') : 'document';
  const outputFilename = `${baseName}-numbered.pdf`;

  const safeFrom = Math.max(1, Math.min(totalPages || 1, fromPage));
  const safeTo = Math.max(safeFrom, Math.min(totalPages || 1, toPage));
  const numberedSpan = Math.max(1, safeTo - safeFrom + 1);
  const previewTotal =
    totalMode === 'document' ? Math.max(1, totalPages) : startNumber + numberedSpan - 1;

  const fontCss =
    fontChoice === 'times'
      ? 'Georgia, "Times New Roman", serif'
      : fontChoice === 'courier'
      ? 'ui-monospace, SFMono-Regular, Menlo, monospace'
      : 'Inter, system-ui, -apple-system, sans-serif';

  const getPreviewAlignment = (pageIndex1Based: number) => {
    const [vPos, hPos] = position.split('-') as ['top' | 'bottom', 'left' | 'center' | 'right'];
    let activeH = hPos;
    if (mirrorFacing && pageIndex1Based % 2 === 0) {
      if (hPos === 'right') activeH = 'left';
      else if (hPos === 'left') activeH = 'right';
    }
    return { vPos, hPos: activeH };
  };

  const colorSwatches = ['#18181b', '#52525b', '#2563eb', '#dc2626'];

  const positions: { id: PositionId; label: string }[] = [
    { id: 'top-left', label: 'Top Left' },
    { id: 'top-center', label: 'Top Center' },
    { id: 'top-right', label: 'Top Right' },
    { id: 'bottom-left', label: 'Bottom Left' },
    { id: 'bottom-center', label: 'Bottom Center' },
    { id: 'bottom-right', label: 'Bottom Right' },
  ];

  const formats: { id: FormatPresetId; label: string; example: string }[] = [
    { id: 'num', label: '1', example: '1' },
    { id: 'page-num', label: 'Page 1', example: 'Page 1' },
    { id: 'num-slash-total', label: '1 / N', example: `1 / ${totalPages || 10}` },
    { id: 'page-of-total', label: 'Page 1 of N', example: `Page 1 of ${totalPages || 10}` },
    { id: 'dash-num', label: '- 1 -', example: '- 1 -' },
    { id: 'custom', label: 'Custom', example: '{n} / {total}' },
  ];

  const previewPages = totalPages >= 2 ? [1, 2] : [1];
  const isSidePosition = !position.endsWith('center');

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
          if (file) loadPdf(file);
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
              loadPdf(file);
              e.target.value = '';
            }
          }}
        />
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-blue-600/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          </div>
          <div className={pdfFile ? 'text-center sm:text-left' : 'text-center'}>
            <p className="text-sm sm:text-base font-bold text-zinc-900 dark:text-zinc-100">
              {isReading
                ? 'Reading PDF structure…'
                : pdfFile
                ? `${pdfFile.name} (${totalPages} ${totalPages === 1 ? 'page' : 'pages'} · ${formatBytes(pdfFile.size)})`
                : 'Drop your PDF file here or click to browse'}
            </p>
            <p className="text-xs text-zinc-500">
              {pdfFile
                ? 'Click to replace file · 100% processed locally in your browser'
                : 'Lossless text stamping · Assignments, reports, theses & contracts'}
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-4 py-3 text-xs font-medium text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {pdfFile && (
        <div className="grid lg:grid-cols-12 gap-6 items-start">
          {/* Left Settings Column */}
          <div className="lg:col-span-6 space-y-5">
            {/* Position & Page Range */}
            <div className="studio-card rounded-3xl p-4 sm:p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                  1. Position &amp; Range
                </h2>
                <button
                  type="button"
                  onClick={resetAll}
                  className="text-xs font-semibold text-zinc-500 hover:text-red-600 transition cursor-pointer"
                >
                  Clear PDF
                </button>
              </div>

              {/* Visual 3x2 Position Picker */}
              <div className="grid grid-cols-3 gap-2">
                {positions.map((pos) => {
                  const active = position === pos.id;
                  return (
                    <button
                      key={pos.id}
                      type="button"
                      onClick={() => setPosition(pos.id)}
                      className={`px-3 py-2.5 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                        active
                          ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                          : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:border-blue-500'
                      }`}
                    >
                      {pos.label}
                    </button>
                  );
                })}
              </div>

              {isSidePosition && (
                <label className="flex items-center justify-between gap-3 pt-1 text-xs font-semibold text-zinc-700 dark:text-zinc-300 cursor-pointer">
                  <span>Mirror on even pages (Book / Facing pages)</span>
                  <input
                    type="checkbox"
                    checked={mirrorFacing}
                    onChange={(e) => setMirrorFacing(e.target.checked)}
                    className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                  />
                </label>
              )}

              {/* Quick Skip Cover Toggle */}
              {totalPages > 1 && (
                <label className="flex items-center justify-between gap-3 pt-2 border-t border-zinc-200/80 dark:border-zinc-800 text-xs font-semibold text-zinc-700 dark:text-zinc-300 cursor-pointer">
                  <span>Skip cover page (start on page 2)</span>
                  <input
                    type="checkbox"
                    checked={fromPage === 2}
                    onChange={(e) => setFromPage(e.target.checked ? 2 : 1)}
                    className="w-4 h-4 accent-blue-600 rounded cursor-pointer"
                  />
                </label>
              )}

              {/* Range Inputs */}
              <div className="grid grid-cols-3 gap-2.5 pt-1">
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-500 mb-1">
                    From Page
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={totalPages}
                    value={fromPage}
                    onChange={(e) => {
                      const val = Math.max(1, Math.min(totalPages, Number(e.target.value) || 1));
                      setFromPage(val);
                      if (val > toPage) setToPage(val);
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs font-mono font-semibold text-zinc-900 dark:text-zinc-100"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-500 mb-1">
                    To Page
                  </label>
                  <input
                    type="number"
                    min={fromPage}
                    max={totalPages}
                    value={toPage}
                    onChange={(e) => {
                      const val = Math.max(fromPage, Math.min(totalPages, Number(e.target.value) || totalPages));
                      setToPage(val);
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs font-mono font-semibold text-zinc-900 dark:text-zinc-100"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-500 mb-1">
                    First Number
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={9999}
                    value={startNumber}
                    onChange={(e) => setStartNumber(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs font-mono font-semibold text-zinc-900 dark:text-zinc-100"
                  />
                </div>
              </div>
            </div>

            {/* Format & Typography */}
            <div className="studio-card rounded-3xl p-4 sm:p-5 space-y-4">
              <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                2. Format &amp; Typography
              </h2>

              <div className="grid grid-cols-3 gap-1.5">
                {formats.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFormatPreset(f.id)}
                    className={`py-2 px-2 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                      formatPreset === f.id
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:border-blue-500'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {formatPreset === 'custom' && (
                <div className="space-y-1">
                  <input
                    type="text"
                    value={customTemplate}
                    onChange={(e) => setCustomTemplate(e.target.value)}
                    placeholder="e.g. Report — {n} / {total}"
                    className="w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs font-medium text-zinc-900 dark:text-zinc-100"
                  />
                  <p className="text-[11px] text-zinc-500">
                    Use <code className="font-mono">{'{n}'}</code> for current page and{' '}
                    <code className="font-mono">{'{total}'}</code> for total pages (English/Latin text).
                  </p>
                </div>
              )}

              {(formatPreset === 'num-slash-total' ||
                formatPreset === 'page-of-total' ||
                formatPreset === 'custom') &&
                fromPage > 1 && (
                  <div className="flex items-center justify-between text-xs pt-1">
                    <span className="font-medium text-zinc-600 dark:text-zinc-400">
                      Total count represents
                    </span>
                    <div className="inline-flex rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden text-[11px] font-semibold">
                      <button
                        type="button"
                        onClick={() => setTotalMode('document')}
                        className={`px-2.5 py-1 cursor-pointer ${
                          totalMode === 'document'
                            ? 'bg-blue-600 text-white'
                            : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300'
                        }`}
                      >
                        All ({totalPages})
                      </button>
                      <button
                        type="button"
                        onClick={() => setTotalMode('numbered')}
                        className={`px-2.5 py-1 cursor-pointer ${
                          totalMode === 'numbered'
                            ? 'bg-blue-600 text-white'
                            : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300'
                        }`}
                      >
                        Numbered ({numberedSpan})
                      </button>
                    </div>
                  </div>
                )}

              {/* Font + Bold */}
              <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-zinc-200/80 dark:border-zinc-800">
                <div className="grid grid-cols-3 gap-1.5 flex-1">
                  {(
                    [
                      { id: 'helvetica', label: 'Sans' },
                      { id: 'times', label: 'Serif' },
                      { id: 'courier', label: 'Mono' },
                    ] as { id: FontChoice; label: string }[]
                  ).map((ft) => (
                    <button
                      key={ft.id}
                      type="button"
                      onClick={() => setFontChoice(ft.id)}
                      className={`py-1.5 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                        fontChoice === ft.id
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300'
                      }`}
                    >
                      {ft.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setIsBold((b) => !b)}
                  className={`px-3.5 py-1.5 rounded-xl border text-xs font-extrabold transition cursor-pointer ${
                    isBold
                      ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 border-zinc-900 dark:border-white'
                      : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300'
                  }`}
                >
                  B
                </button>
              </div>

              {/* Font Size & Margin */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    <span>Font Size</span>
                    <span className="font-mono text-zinc-900 dark:text-zinc-100">{fontSize} pt</span>
                  </div>
                  <input
                    type="range"
                    min={8}
                    max={28}
                    value={fontSize}
                    onChange={(e) => setFontSize(Number(e.target.value))}
                    className="w-full accent-blue-600 cursor-pointer"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    <span>Edge Margin</span>
                    <span className="font-mono text-zinc-900 dark:text-zinc-100">{marginPt} pt</span>
                  </div>
                  <input
                    type="range"
                    min={12}
                    max={72}
                    value={marginPt}
                    onChange={(e) => setMarginPt(Number(e.target.value))}
                    className="w-full accent-blue-600 cursor-pointer"
                  />
                </div>
              </div>

              {/* Color & Opacity */}
              <div className="grid sm:grid-cols-2 gap-3 items-center">
                <div className="space-y-1.5">
                  <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Color</span>
                  <div className="flex items-center gap-2">
                    {colorSwatches.map((hex) => (
                      <button
                        key={hex}
                        type="button"
                        onClick={() => setTextColor(hex)}
                        style={{ backgroundColor: hex }}
                        aria-label={`Color ${hex}`}
                        className={`w-6 h-6 rounded-lg border cursor-pointer ${
                          textColor === hex
                            ? 'ring-2 ring-blue-600 border-blue-600'
                            : 'border-zinc-300 dark:border-zinc-700'
                        }`}
                      />
                    ))}
                    <input
                      type="color"
                      value={textColor}
                      onChange={(e) => setTextColor(e.target.value)}
                      className="w-7 h-6 rounded border border-zinc-300 dark:border-zinc-700 cursor-pointer bg-transparent"
                      title="Custom color"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-xs font-medium text-zinc-600 dark:text-zinc-400">
                    <span>Opacity</span>
                    <span className="font-mono text-zinc-900 dark:text-zinc-100">{opacity}%</span>
                  </div>
                  <input
                    type="range"
                    min={30}
                    max={100}
                    value={opacity}
                    onChange={(e) => setOpacity(Number(e.target.value))}
                    className="w-full accent-blue-600 cursor-pointer"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Live Placement Preview & Export */}
          <div className="lg:col-span-6 studio-card rounded-3xl p-4 sm:p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-zinc-950 dark:text-zinc-100">
                  Live Placement Preview
                </h2>
                <p className="text-[11.5px] text-zinc-500">
                  Numbering pages {safeFrom}–{safeTo} of {totalPages}
                </p>
              </div>
              <span className="px-2.5 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">
                Lossless PDF
              </span>
            </div>

            {/* Interactive Page Mockups */}
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-950 p-4 sm:p-5">
              <div className={`grid gap-4 ${previewPages.length === 2 ? 'grid-cols-2' : 'grid-cols-1 max-w-[240px] mx-auto'}`}>
                {previewPages.map((pageNum) => {
                  const isIncluded = pageNum >= safeFrom && pageNum <= safeTo;
                  const displayNum = startNumber + (pageNum - safeFrom);
                  const label = isIncluded
                    ? buildLabel(formatPreset, customTemplate, displayNum, previewTotal)
                    : '';
                  const { vPos, hPos } = getPreviewAlignment(pageNum);
                  const scaledMargin = Math.max(8, Math.round(marginPt * 0.42));
                  const scaledFont = Math.max(9, Math.min(20, Math.round(fontSize * 0.85)));

                  return (
                    <div key={pageNum} className="space-y-1.5">
                      <div className="relative aspect-[1/1.414] w-full bg-white rounded-lg shadow-sm border border-zinc-200 overflow-hidden select-none">
                        {/* Subtle Skeleton Content */}
                        <div className="absolute inset-x-5 top-10 space-y-2 opacity-30">
                          <div className="h-2 w-2/3 rounded bg-zinc-400" />
                          <div className="h-1.5 w-full rounded bg-zinc-300" />
                          <div className="h-1.5 w-5/6 rounded bg-zinc-300" />
                          <div className="h-1.5 w-full rounded bg-zinc-300" />
                          <div className="h-1.5 w-4/5 rounded bg-zinc-300" />
                          <div className="pt-3 space-y-2">
                            <div className="h-1.5 w-full rounded bg-zinc-300" />
                            <div className="h-1.5 w-11/12 rounded bg-zinc-300" />
                            <div className="h-1.5 w-3/4 rounded bg-zinc-300" />
                          </div>
                        </div>

                        {isIncluded ? (
                          <div
                            style={{
                              top: vPos === 'top' ? `${scaledMargin}px` : undefined,
                              bottom: vPos === 'bottom' ? `${scaledMargin}px` : undefined,
                              left: hPos === 'left' ? `${scaledMargin}px` : hPos === 'center' ? '50%' : undefined,
                              right: hPos === 'right' ? `${scaledMargin}px` : undefined,
                              transform: hPos === 'center' ? 'translateX(-50%)' : undefined,
                              fontFamily: fontCss,
                              fontWeight: isBold ? 700 : 500,
                              fontSize: `${scaledFont}px`,
                              color: textColor,
                              opacity: opacity / 100,
                            }}
                            className="absolute whitespace-nowrap leading-none px-1 rounded bg-blue-500/8 ring-1 ring-blue-500/20"
                          >
                            {label}
                          </div>
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center bg-zinc-50/60">
                            <span className="px-2.5 py-1 rounded-full bg-zinc-200 text-zinc-700 text-[10px] font-bold uppercase tracking-wide">
                              Skipped (Cover)
                            </span>
                          </div>
                        )}
                      </div>
                      <p className="text-center text-[11px] font-medium text-zinc-500">
                        Page {pageNum}
                        {pageNum === 1 && fromPage > 1 ? ' · Cover' : ''}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Action & Download Bar */}
            <div className="space-y-3">
              <button
                type="button"
                onClick={handleApply}
                disabled={isProcessing}
                className="btn-studio-primary w-full py-3.5 px-5 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                </svg>
                <span>
                  {isProcessing
                    ? 'Stamping Page Numbers…'
                    : downloadUrl && !isDirty
                    ? 'Regenerate Numbered PDF'
                    : 'Add Page Numbers to PDF'}
                </span>
              </button>

              {downloadUrl && (
                <div
                  className={`rounded-2xl border p-4 flex flex-wrap items-center justify-between gap-3 ${
                    isDirty
                      ? 'border-amber-300 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/30'
                      : 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/30'
                  }`}
                >
                  <div className="min-w-0">
                    <p
                      className={`text-xs font-bold ${
                        isDirty
                          ? 'text-amber-800 dark:text-amber-300'
                          : 'text-emerald-800 dark:text-emerald-300'
                      }`}
                    >
                      {isDirty ? 'Settings changed — click Apply to update' : 'Numbered PDF is ready!'}
                    </p>
                    <p className="text-[11px] text-zinc-600 dark:text-zinc-400 font-mono truncate">
                      {outputFilename} · {formatBytes(outputSize)}
                    </p>
                  </div>

                  <a
                    href={downloadUrl}
                    download={outputFilename}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shrink-0"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
                    </svg>
                    <span>Download PDF</span>
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
