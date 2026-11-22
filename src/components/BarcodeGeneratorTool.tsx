import React, { useState, useRef, useEffect } from 'react';
import {
  Barcode,
  Layers,
  Download,
  Archive,
  FileCode2,
  Image as ImageIcon,
  Lock,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Palette,
  Type,
  Sparkles,
} from 'lucide-react';
import ContinueToMenu from './ContinueToMenu';

type BarcodeFormat = 'CODE128' | 'EAN13' | 'UPC' | 'CODE39' | 'ITF14';
type GeneratorMode = 'single' | 'bulk';

interface FormatMeta {
  id: BarcodeFormat;
  label: string;
  sample: string;
  rule: string;
}

const BARCODE_FORMATS: FormatMeta[] = [
  {
    id: 'CODE128',
    label: 'Code 128',
    sample: 'SKU-2026-0048',
    rule: 'Any letters, numbers & symbols (ideal for inventory & shipping)',
  },
  {
    id: 'EAN13',
    label: 'EAN-13',
    sample: '890123456789',
    rule: '12 digits (auto check digit) or 13 valid digits (global retail)',
  },
  {
    id: 'UPC',
    label: 'UPC-A',
    sample: '01234567890',
    rule: '11 digits (auto check digit) or 12 valid digits (North America retail)',
  },
  {
    id: 'CODE39',
    label: 'Code 39',
    sample: 'ITEM-4092',
    rule: 'Uppercase A–Z, digits 0–9, and - . $ / + % space',
  },
  {
    id: 'ITF14',
    label: 'ITF-14',
    sample: '1001234567890',
    rule: '13 digits (auto check digit) or 14 valid digits (shipping cartons)',
  },
];

const MAX_BULK_CODES = 100;

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

function sanitizeFileName(val: string): string {
  return val.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40) || 'barcode';
}

function svgElementToPngBlob(svgEl: SVGSVGElement, scale = 3): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(svgEl);
    const svgBlob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const w = Math.max(1, Math.round((img.naturalWidth || 400) * scale));
      const h = Math.max(1, Math.round((img.naturalHeight || 160) * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not export PNG.'));
        return;
      }
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob((blob) => {
        canvas.width = 0;
        canvas.height = 0;
        if (blob) resolve(blob);
        else reject(new Error('Failed to encode barcode PNG.'));
      }, 'image/png');
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to render barcode image.'));
    };
    img.src = url;
  });
}

export default function BarcodeGeneratorTool() {
  const [mode, setMode] = useState<GeneratorMode>('single');
  const [format, setFormat] = useState<BarcodeFormat>('CODE128');
  const [value, setValue] = useState<string>('SKU-2026-0048');
  const [bulkInput, setBulkInput] = useState<string>('SKU-2026-001\nSKU-2026-002\nSKU-2026-003');
  const [bulkFormat, setBulkFormat] = useState<'png' | 'svg'>('png');

  const [barWidth, setBarWidth] = useState<number>(2);
  const [barHeight, setBarHeight] = useState<number>(85);
  const [showText, setShowText] = useState<boolean>(true);
  const [lineColor, setLineColor] = useState<string>('#09090b');
  const [bgColor, setBgColor] = useState<string>('#ffffff');
  const [transparentBg, setTransparentBg] = useState<boolean>(false);

  const [isValid, setIsValid] = useState<boolean>(true);
  const [isGeneratingBulk, setIsGeneratingBulk] = useState<boolean>(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);

  const activeMeta = BARCODE_FORMATS.find((f) => f.id === format) ?? BARCODE_FORMATS[0];

  const handleFormatSwitch = (nextFmt: BarcodeFormat) => {
    setFormat(nextFmt);
    setErrorMsg(null);
    setStatusMsg(null);
    const meta = BARCODE_FORMATS.find((f) => f.id === nextFmt);
    if (meta) {
      setValue(meta.sample);
    }
  };

  // Live SVG rendering
  useEffect(() => {
    if (mode !== 'single') return;
    let cancelled = false;

    (async () => {
      const svgEl = svgRef.current;
      if (!svgEl) return;

      const trimmed = value.trim();
      if (!trimmed) {
        setIsValid(false);
        setErrorMsg('Enter a value to generate a barcode.');
        return;
      }

      try {
        const mod = await import('jsbarcode');
        const JsBarcode = (mod.default ?? mod) as unknown as (
          el: SVGSVGElement,
          data: string,
          opts: Record<string, unknown>
        ) => void;
        if (cancelled) return;

        let ok = true;
        JsBarcode(svgEl, trimmed, {
          format,
          width: barWidth,
          height: barHeight,
          displayValue: showText,
          lineColor,
          background: transparentBg ? 'transparent' : bgColor,
          margin: 14,
          fontSize: 16,
          font: 'Inter, system-ui, sans-serif',
          valid: (validFlag: boolean) => {
            ok = validFlag;
          },
        });

        setIsValid(ok);
        if (!ok) {
          setErrorMsg(`"${trimmed}" is not valid for ${activeMeta.label}. ${activeMeta.rule}.`);
        } else {
          setErrorMsg(null);
        }
      } catch {
        if (!cancelled) {
          setIsValid(false);
          setErrorMsg(`Invalid input for ${activeMeta.label}. ${activeMeta.rule}.`);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mode, value, format, barWidth, barHeight, showText, lineColor, bgColor, transparentBg, activeMeta]);

  const handleDownloadSingle = async (ext: 'svg' | 'png') => {
    const svgEl = svgRef.current;
    if (!svgEl || !isValid) return;
    setErrorMsg(null);

    try {
      const clean = sanitizeFileName(value.trim());
      if (ext === 'svg') {
        const str = new XMLSerializer().serializeToString(svgEl);
        const blob = new Blob([str], { type: 'image/svg+xml;charset=utf-8' });
        triggerDownload(blob, `${clean}_${format.toLowerCase()}.svg`);
      } else {
        const blob = await svgElementToPngBlob(svgEl, 3);
        triggerDownload(blob, `${clean}_${format.toLowerCase()}.png`);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Download failed.');
    }
  };

  const handleBulkExport = async () => {
    const lines = bulkInput
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, MAX_BULK_CODES);

    if (lines.length === 0) {
      setErrorMsg('Enter at least one barcode value (one per line).');
      return;
    }

    setIsGeneratingBulk(true);
    setErrorMsg(null);
    setStatusMsg(null);

    try {
      const [{ default: JSZip }, barcodeMod] = await Promise.all([
        import('jszip'),
        import('jsbarcode'),
      ]);
      const JsBarcode = (barcodeMod.default ?? barcodeMod) as unknown as (
        el: SVGSVGElement,
        data: string,
        opts: Record<string, unknown>
      ) => void;

      const zip = new JSZip();
      let successCount = 0;
      let skippedCount = 0;

      for (let i = 0; i < lines.length; i++) {
        const code = lines[i];
        const tempSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        let ok = true;
        try {
          JsBarcode(tempSvg, code, {
            format,
            width: barWidth,
            height: barHeight,
            displayValue: showText,
            lineColor,
            background: transparentBg ? 'transparent' : bgColor,
            margin: 14,
            fontSize: 16,
            font: 'Inter, system-ui, sans-serif',
            valid: (v: boolean) => {
              ok = v;
            },
          });
        } catch {
          ok = false;
        }

        if (!ok) {
          skippedCount++;
          continue;
        }

        const safeName = `${String(i + 1).padStart(2, '0')}_${sanitizeFileName(code)}`;
        if (bulkFormat === 'svg') {
          const str = new XMLSerializer().serializeToString(tempSvg);
          zip.file(`${safeName}.svg`, str);
        } else {
          const pngBlob = await svgElementToPngBlob(tempSvg, 3);
          zip.file(`${safeName}.png`, pngBlob);
        }
        successCount++;
      }

      if (successCount === 0) {
        throw new Error(
          `None of the entered lines matched ${activeMeta.label}. ${activeMeta.rule}.`
        );
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      triggerDownload(zipBlob, `imagelab-barcodes-${format.toLowerCase()}.zip`);
      setStatusMsg(
        skippedCount > 0
          ? `Downloaded ${successCount} barcodes as ZIP (${skippedCount} invalid line${skippedCount > 1 ? 's' : ''} skipped)`
          : `Downloaded ${successCount} barcodes as ZIP`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Bulk export failed.');
    } finally {
      setIsGeneratingBulk(false);
    }
  };

  const bulkLineCount = bulkInput
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean).length;

  return (
    <div className="space-y-4 animate-fade-up">
      <div className="studio-card rounded-3xl overflow-hidden">
        {/* Top Mode & Symbology Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 sm:px-7 py-3.5 border-b border-zinc-200/80 bg-zinc-50/80">
          <div className="inline-flex bg-zinc-200/70 dark:bg-zinc-800 p-0.5 rounded-xl gap-0.5">
            <button
              type="button"
              onClick={() => {
                setMode('single');
                setStatusMsg(null);
              }}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-[10px] text-xs font-semibold transition cursor-pointer ${
                mode === 'single'
                  ? 'bg-white dark:bg-zinc-950 text-zinc-950 dark:text-white shadow-xs'
                  : 'text-zinc-600'
              }`}
            >
              <Barcode className="w-3.5 h-3.5 text-blue-600" aria-hidden="true" />
              <span>Single Barcode</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('bulk');
                setErrorMsg(null);
              }}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-[10px] text-xs font-semibold transition cursor-pointer ${
                mode === 'bulk'
                  ? 'bg-white dark:bg-zinc-950 text-zinc-950 dark:text-white shadow-xs'
                  : 'text-zinc-600'
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-blue-600" aria-hidden="true" />
              <span>Bulk Generator (ZIP)</span>
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {BARCODE_FORMATS.map((fmt) => (
              <button
                key={fmt.id}
                type="button"
                onClick={() => handleFormatSwitch(fmt.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                  format === fmt.id
                    ? 'bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 border-transparent'
                    : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-100'
                }`}
              >
                {fmt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Main Studio Grid */}
        <div className="grid lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-zinc-200/80">
          {/* Left: Input & Style */}
          <div className="lg:col-span-6 p-5 sm:p-7 space-y-5 bg-white">
            {mode === 'single' ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor="bc-val" className="text-xs font-semibold text-zinc-700">
                    Barcode Value ({activeMeta.label})
                  </label>
                  <button
                    type="button"
                    onClick={() => setValue(activeMeta.sample)}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:underline cursor-pointer"
                  >
                    <Sparkles className="w-3 h-3" aria-hidden="true" />
                    Use Example
                  </button>
                </div>
                <input
                  id="bc-val"
                  type="text"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={activeMeta.sample}
                  className="w-full bg-zinc-50 border border-zinc-300 rounded-xl px-3.5 py-2.5 text-sm font-semibold tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                />
                <p className="text-[11.5px] text-zinc-500">{activeMeta.rule}</p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor="bc-bulk" className="text-xs font-semibold text-zinc-700">
                    Enter One Code Per Line (up to {MAX_BULK_CODES})
                  </label>
                  <span className="text-[11px] font-semibold text-zinc-500 tabular-nums">
                    {Math.min(bulkLineCount, MAX_BULK_CODES)}/{MAX_BULK_CODES} codes
                  </span>
                </div>
                <textarea
                  id="bc-bulk"
                  rows={6}
                  value={bulkInput}
                  onChange={(e) => setBulkInput(e.target.value)}
                  placeholder={`${activeMeta.sample}\n...`}
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-xl p-3.5 text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                />
                <p className="text-[11.5px] text-zinc-500">{activeMeta.rule}</p>
              </div>
            )}

            {/* Bar Dimensions & Text Toggle */}
            <div className="space-y-3.5 pt-3 border-t border-zinc-200/80">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <div className="flex justify-between text-xs text-zinc-600 mb-1 tabular-nums">
                    <label htmlFor="bc-width">Bar Thickness</label>
                    <span className="font-semibold text-zinc-900">{barWidth}×</span>
                  </div>
                  <input
                    id="bc-width"
                    type="range"
                    min={1}
                    max={4}
                    step={0.5}
                    value={barWidth}
                    onChange={(e) => setBarWidth(Number(e.target.value))}
                    className="w-full"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs text-zinc-600 mb-1 tabular-nums">
                    <label htmlFor="bc-height">Bar Height</label>
                    <span className="font-semibold text-zinc-900">{barHeight} px</span>
                  </div>
                  <input
                    id="bc-height"
                    type="range"
                    min={40}
                    max={150}
                    step={5}
                    value={barHeight}
                    onChange={(e) => setBarHeight(Number(e.target.value))}
                    className="w-full"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <div className="flex items-center gap-3">
                  <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-700 cursor-pointer">
                    <Palette className="w-3.5 h-3.5 text-zinc-400" aria-hidden="true" />
                    <span>Bars</span>
                    <input
                      type="color"
                      aria-label="Barcode bar color"
                      value={lineColor}
                      onChange={(e) => setLineColor(e.target.value)}
                      className="w-6 h-6 p-0.5 rounded-lg border border-zinc-300 bg-white cursor-pointer"
                    />
                  </label>

                  <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-700 cursor-pointer">
                    <span>BG</span>
                    <input
                      type="color"
                      aria-label="Barcode background color"
                      disabled={transparentBg}
                      value={bgColor}
                      onChange={(e) => setBgColor(e.target.value)}
                      className="w-6 h-6 p-0.5 rounded-lg border border-zinc-300 bg-white cursor-pointer disabled:opacity-40"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => setTransparentBg((v) => !v)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold border cursor-pointer ${
                      transparentBg
                        ? 'bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 border-transparent'
                        : 'bg-zinc-50 text-zinc-700 border-zinc-200'
                    }`}
                  >
                    Transparent
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setShowText((s) => !s)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border cursor-pointer ${
                    showText
                      ? 'bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 border-transparent'
                      : 'bg-zinc-50 text-zinc-700 border-zinc-200'
                  }`}
                >
                  <Type className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Show Text</span>
                </button>
              </div>
            </div>
          </div>

          {/* Right: Live Preview or Bulk ZIP Panel */}
          <div className="lg:col-span-6 p-6 sm:p-7 bg-zinc-50/70 flex flex-col items-center justify-between gap-6">
            {mode === 'single' ? (
              <>
                <div className="w-full flex-1 flex flex-col items-center justify-center gap-4">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                    Print-Ready Preview
                  </p>

                  <div
                    className="w-full min-h-[180px] rounded-2xl border border-zinc-200/90 shadow-sm p-5 flex items-center justify-center overflow-x-auto"
                    style={
                      transparentBg
                        ? {
                            backgroundImage:
                              'linear-gradient(45deg, #e4e4e7 25%, #fafafa 25%), linear-gradient(-45deg, #e4e4e7 25%, #fafafa 25%), linear-gradient(45deg, #fafafa 75%, #e4e4e7 75%), linear-gradient(-45deg, #fafafa 75%, #e4e4e7 75%)',
                            backgroundSize: '18px 18px',
                            backgroundPosition: '0 0, 0 9px, 9px -9px, -9px 0px',
                          }
                        : { backgroundColor: bgColor }
                    }
                  >
                    <svg
                      ref={svgRef}
                      className={`max-w-full h-auto ${!isValid ? 'opacity-20' : ''}`}
                    />
                  </div>
                </div>

                <div className="w-full space-y-2.5">
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={!isValid}
                      onClick={() => void handleDownloadSingle('png')}
                      className="btn-studio-accent inline-flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl disabled:opacity-40 text-xs sm:text-sm font-semibold cursor-pointer"
                    >
                      <ImageIcon className="w-4 h-4" aria-hidden="true" />
                      <span>Download PNG</span>
                    </button>

                    <button
                      type="button"
                      disabled={!isValid}
                      onClick={() => void handleDownloadSingle('svg')}
                      className="btn-studio-primary inline-flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl disabled:opacity-40 text-xs sm:text-sm font-semibold cursor-pointer"
                    >
                      <FileCode2 className="w-4 h-4" aria-hidden="true" />
                      <span>Vector SVG</span>
                    </button>
                  </div>

                  <div className="flex justify-end">
                    <ContinueToMenu
                      compact
                      currentPath="/barcode-generator"
                      disabled={!isValid}
                      onPrepareFile={async () => {
                        if (!svgRef.current || !isValid) return null;
                        const blob = await svgElementToPngBlob(svgRef.current, 3);
                        return {
                          blob,
                          fileName: `${sanitizeFileName(value.trim())}_${format.toLowerCase()}.png`,
                        };
                      }}
                    />
                  </div>
                </div>
              </>
            ) : (
              <div className="w-full flex-1 flex flex-col justify-between gap-6">
                <div className="space-y-4">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                    Bulk ZIP Export Settings
                  </p>

                  <div className="rounded-2xl bg-white border border-zinc-200/80 p-4 space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-zinc-600">File Format in ZIP</span>
                      <div className="inline-flex bg-zinc-200/70 dark:bg-zinc-800 p-0.5 rounded-xl">
                        <button
                          type="button"
                          onClick={() => setBulkFormat('png')}
                          className={`inline-flex items-center gap-1 px-3 py-1 rounded-[10px] text-xs font-semibold cursor-pointer ${
                            bulkFormat === 'png'
                              ? 'bg-white dark:bg-zinc-950 text-zinc-950 dark:text-white shadow-xs'
                              : 'text-zinc-600'
                          }`}
                        >
                          <ImageIcon className="w-3.5 h-3.5" aria-hidden="true" />
                          PNG
                        </button>
                        <button
                          type="button"
                          onClick={() => setBulkFormat('svg')}
                          className={`inline-flex items-center gap-1 px-3 py-1 rounded-[10px] text-xs font-semibold cursor-pointer ${
                            bulkFormat === 'svg'
                              ? 'bg-white dark:bg-zinc-950 text-zinc-950 dark:text-white shadow-xs'
                              : 'text-zinc-600'
                          }`}
                        >
                          <FileCode2 className="w-3.5 h-3.5" aria-hidden="true" />
                          SVG
                        </button>
                      </div>
                    </div>

                    <p className="text-xs text-zinc-500 leading-relaxed">
                      Every valid line will be exported as a crisp, print-ready {bulkFormat.toUpperCase()}{' '}
                      label named after its SKU or product number inside one ZIP archive.
                    </p>
                  </div>

                  {statusMsg && (
                    <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                      <span>{statusMsg}</span>
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  disabled={isGeneratingBulk || bulkLineCount === 0}
                  onClick={() => void handleBulkExport()}
                  className="btn-studio-accent w-full py-3 px-5 rounded-xl disabled:opacity-40 text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer tabular-nums"
                >
                  {isGeneratingBulk ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                      <span>Generating Barcodes...</span>
                    </>
                  ) : (
                    <>
                      <Archive className="w-4 h-4" aria-hidden="true" />
                      <span>
                        Generate &amp; Download ZIP ({Math.min(bulkLineCount, MAX_BULK_CODES)})
                      </span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>

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
