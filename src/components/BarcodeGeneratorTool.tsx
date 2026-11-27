import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Barcode, Layers, Download, Archive, FileCode2, Image as ImageIcon,
  Lock, AlertCircle, CheckCircle2, Loader2, Palette, Type, Sparkles, Upload, Trash2,
} from 'lucide-react';
import ContinueToMenu from './ContinueToMenu';

type BarcodeFormat = 'CODE128' | 'EAN13' | 'UPC' | 'CODE39' | 'ITF14';
type GeneratorMode = 'single' | 'bulk';

interface FormatMeta {
  id: BarcodeFormat;
  label: string;
  sample: string;
  bulkSamples: string[];
  rule: string;
}

interface BulkPreviewItem {
  index: number;
  code: string;
  valid: boolean;
  svgMarkup: string;
}

const BARCODE_FORMATS: FormatMeta[] = [
  {
    id: 'CODE128',
    label: 'Code 128',
    sample: 'SKU-2026-0048',
    bulkSamples: ['SKU-2026-001', 'SKU-2026-002', 'SKU-2026-003'],
    rule: 'Any letters, numbers & symbols (ideal for inventory & shipping)',
  },
  {
    id: 'EAN13',
    label: 'EAN-13',
    sample: '890123456789',
    bulkSamples: ['890123456789', '400638133393', '590123412345'],
    rule: '12 digits (auto check digit) or 13 valid digits (global retail)',
  },
  {
    id: 'UPC',
    label: 'UPC-A',
    sample: '01234567890',
    bulkSamples: ['01234567890', '03600029145', '04210000526'],
    rule: '11 digits (auto check digit) or 12 valid digits (North America retail)',
  },
  {
    id: 'CODE39',
    label: 'Code 39',
    sample: 'ITEM-4092',
    bulkSamples: ['ITEM-4091', 'ITEM-4092', 'ITEM-4093'],
    rule: 'Uppercase A–Z, digits 0–9, and - . $ / + % space',
  },
  {
    id: 'ITF14',
    label: 'ITF-14',
    sample: '1001234567890',
    bulkSamples: ['1001234567890', '1001234567891', '1001234567892'],
    rule: '13 digits (auto check digit) or 14 valid digits (shipping cartons)',
  },
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

function sanitizeFileName(val: string): string {
  return val.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40) || 'barcode';
}

function svgStringToPngBlob(svgStr: string, scale = 3): Promise<Blob> {
  return new Promise((resolve, reject) => {
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
      if (!ctx) { reject(new Error('Could not export PNG.')); return; }
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob((blob) => {
        canvas.width = 0;
        canvas.height = 0;
        if (blob) resolve(blob);
        else reject(new Error('Failed to encode barcode PNG.'));
      }, 'image/png');
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to render barcode image.')); };
    img.src = url;
  });
}

function svgElementToPngBlob(svgEl: SVGSVGElement, scale = 3): Promise<Blob> {
  return svgStringToPngBlob(new XMLSerializer().serializeToString(svgEl), scale);
}

export default function BarcodeGeneratorTool() {
  const [mode, setMode] = useState<GeneratorMode>('single');
  const [format, setFormat] = useState<BarcodeFormat>('CODE128');
  const [value, setValue] = useState<string>('');
  const [bulkInput, setBulkInput] = useState<string>('');
  const [bulkFormat, setBulkFormat] = useState<'png' | 'svg'>('png');

  const [barWidth, setBarWidth] = useState<number>(2);
  const [barHeight, setBarHeight] = useState<number>(85);
  const [showText, setShowText] = useState<boolean>(true);
  const [lineColor, setLineColor] = useState<string>('#09090b');
  const [bgColor, setBgColor] = useState<string>('#ffffff');
  const [transparentBg, setTransparentBg] = useState<boolean>(false);

  const [isValid, setIsValid] = useState<boolean>(false);
  const [bulkPreviews, setBulkPreviews] = useState<BulkPreviewItem[]>([]);
  const [isDraggingBulk, setIsDraggingBulk] = useState<boolean>(false);
  const [isGeneratingBulk, setIsGeneratingBulk] = useState<boolean>(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);
  const bulkFileInputRef = useRef<HTMLInputElement>(null);

  const activeMeta = BARCODE_FORMATS.find((f) => f.id === format) ?? BARCODE_FORMATS[0];

  const bulkLines = useMemo(
    () => bulkInput.split(/\r?\n/).map((l) => l.trim()).filter(Boolean),
    [bulkInput]
  );

  const validBulkCount = useMemo(
    () => bulkPreviews.filter((item) => item.valid).length,
    [bulkPreviews]
  );

  const handleBulkFileLoad = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const f = files[0];
    try {
      const raw = await f.text();
      const parsed = raw
        .split(/\r?\n/)
        .map((line) => line.split(',')[0].replace(/^["']|["']$/g, '').trim())
        .filter(Boolean)
        .join('\n');
      setBulkInput(parsed);
      setErrorMsg(null);
      setStatusMsg(null);
    } catch {
      setErrorMsg('Could not read the dropped file.');
    }
  };

  // Live SVG rendering — Single Mode
  useEffect(() => {
    if (mode !== 'single') return;
    let cancelled = false;
    (async () => {
      const svgEl = svgRef.current;
      if (!svgEl) return;
      const trimmed = value.trim();
      if (!trimmed) {
        svgEl.innerHTML = '';
        setIsValid(false);
        setErrorMsg(null);
        return;
      }
      try {
        const mod = await import('jsbarcode');
        const JsBarcode = (mod.default ?? mod) as unknown as (
          el: SVGSVGElement, data: string, opts: Record<string, unknown>
        ) => void;
        if (cancelled) return;
        let ok = true;
        JsBarcode(svgEl, trimmed, {
          format, width: barWidth, height: barHeight, displayValue: showText,
          lineColor, background: transparentBg ? 'transparent' : bgColor,
          margin: 14, fontSize: 16, font: 'Inter, system-ui, sans-serif',
          valid: (v: boolean) => { ok = v; },
        });
        setIsValid(ok);
        setErrorMsg(ok ? null : `"${trimmed}" is not valid for ${activeMeta.label}. ${activeMeta.rule}.`);
      } catch {
        if (!cancelled) {
          setIsValid(false);
          setErrorMsg(`Invalid input for ${activeMeta.label}. ${activeMeta.rule}.`);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [mode, value, format, barWidth, barHeight, showText, lineColor, bgColor, transparentBg, activeMeta]);

  // Live SVG rendering — Bulk Mode (Preview EVERY entered code!)
  useEffect(() => {
    if (mode !== 'bulk') return;
    if (bulkLines.length === 0) { setBulkPreviews([]); return; }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const mod = await import('jsbarcode');
        const JsBarcode = (mod.default ?? mod) as unknown as (
          el: SVGSVGElement, data: string, opts: Record<string, unknown>
        ) => void;
        if (cancelled) return;
        const serializer = new XMLSerializer();
        const items: BulkPreviewItem[] = bulkLines.map((code, index) => {
          const tempSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          let ok = true;
          try {
            JsBarcode(tempSvg, code, {
              format, width: barWidth, height: barHeight, displayValue: showText,
              lineColor, background: transparentBg ? 'transparent' : bgColor,
              margin: 12, fontSize: 15, font: 'Inter, system-ui, sans-serif',
              valid: (v: boolean) => { ok = v; },
            });
          } catch { ok = false; }
          if (ok) tempSvg.setAttribute('style', 'max-width:100%;height:auto;display:block;margin:0 auto;');
          return { index, code, valid: ok, svgMarkup: ok ? serializer.serializeToString(tempSvg) : '' };
        });
        if (!cancelled) setBulkPreviews(items);
      } catch {
        if (!cancelled) setBulkPreviews([]);
      }
    }, 90);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [mode, bulkLines, format, barWidth, barHeight, showText, lineColor, bgColor, transparentBg]);

  const handleDownloadSingle = async (ext: 'svg' | 'png') => {
    const svgEl = svgRef.current;
    if (!svgEl || !isValid) return;
    setErrorMsg(null);
    try {
      const clean = sanitizeFileName(value.trim());
      if (ext === 'svg') {
        const blob = new Blob([new XMLSerializer().serializeToString(svgEl)], { type: 'image/svg+xml;charset=utf-8' });
        triggerDownload(blob, `${clean}_${format.toLowerCase()}.svg`);
      } else {
        triggerDownload(await svgElementToPngBlob(svgEl, 3), `${clean}_${format.toLowerCase()}.png`);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Download failed.');
    }
  };

  const handleDownloadBulkItem = async (item: BulkPreviewItem, ext: 'svg' | 'png') => {
    if (!item.valid || !item.svgMarkup) return;
    try {
      const clean = sanitizeFileName(item.code);
      if (ext === 'svg') {
        triggerDownload(new Blob([item.svgMarkup], { type: 'image/svg+xml;charset=utf-8' }), `${clean}_${format.toLowerCase()}.svg`);
      } else {
        triggerDownload(await svgStringToPngBlob(item.svgMarkup, 3), `${clean}_${format.toLowerCase()}.png`);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Download failed.');
    }
  };

  const handleBulkExport = async () => {
    if (bulkLines.length === 0) { setErrorMsg('Enter at least one barcode value (one per line).'); return; }
    setIsGeneratingBulk(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const [{ default: JSZip }, barcodeMod] = await Promise.all([import('jszip'), import('jsbarcode')]);
      const JsBarcode = (barcodeMod.default ?? barcodeMod) as unknown as (
        el: SVGSVGElement, data: string, opts: Record<string, unknown>
      ) => void;
      const zip = new JSZip();
      let successCount = 0;
      let skippedCount = 0;
      const padLen = Math.max(2, String(bulkLines.length).length);

      for (let i = 0; i < bulkLines.length; i++) {
        const code = bulkLines[i];
        const tempSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        let ok = true;
        try {
          JsBarcode(tempSvg, code, {
            format, width: barWidth, height: barHeight, displayValue: showText,
            lineColor, background: transparentBg ? 'transparent' : bgColor,
            margin: 14, fontSize: 16, font: 'Inter, system-ui, sans-serif',
            valid: (v: boolean) => { ok = v; },
          });
        } catch { ok = false; }
        if (!ok) { skippedCount++; continue; }
        const safeName = `${String(i + 1).padStart(padLen, '0')}_${sanitizeFileName(code)}`;
        if (bulkFormat === 'svg') {
          zip.file(`${safeName}.svg`, new XMLSerializer().serializeToString(tempSvg));
        } else {
          zip.file(`${safeName}.png`, await svgElementToPngBlob(tempSvg, 3));
        }
        successCount++;
      }

      if (successCount === 0) throw new Error(`None of the entered lines matched ${activeMeta.label}. ${activeMeta.rule}.`);
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      triggerDownload(zipBlob, `imagelabkit-barcodes-${format.toLowerCase()}.zip`);
      setStatusMsg(
        skippedCount > 0
          ? `Downloaded ${successCount} barcodes as ZIP (${skippedCount} invalid skipped)`
          : `Downloaded ${successCount} barcodes as ZIP`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Bulk export failed.');
    } finally {
      setIsGeneratingBulk(false);
    }
  };

  const checkerStyle = {
    backgroundImage:
      'linear-gradient(45deg, #e4e4e7 25%, #fafafa 25%), linear-gradient(-45deg, #e4e4e7 25%, #fafafa 25%), linear-gradient(45deg, #fafafa 75%, #e4e4e7 75%), linear-gradient(-45deg, #fafafa 75%, #e4e4e7 75%)',
    backgroundSize: '18px 18px',
    backgroundPosition: '0 0, 0 9px, 9px -9px, -9px 0px',
  };

  return (
    <div className="space-y-4 animate-fade-up">
      <input
        ref={bulkFileInputRef}
        type="file"
        accept=".txt,.csv,text/plain,text/csv"
        className="hidden"
        onChange={(e) => { void handleBulkFileLoad(e.target.files); e.target.value = ''; }}
      />

      <div className="studio-card rounded-3xl overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 sm:px-7 py-3.5 border-b border-zinc-200/80 bg-zinc-50/80">
          <div className="inline-flex bg-zinc-200/70 dark:bg-zinc-800 p-0.5 rounded-xl gap-0.5">
            <button
              type="button"
              onClick={() => { setMode('single'); setStatusMsg(null); setErrorMsg(null); }}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-[10px] text-xs font-semibold transition cursor-pointer ${
                mode === 'single' ? 'bg-white dark:bg-zinc-950 text-zinc-950 dark:text-white shadow-xs' : 'text-zinc-600'
              }`}
            >
              <Barcode className="w-3.5 h-3.5 text-blue-600" aria-hidden="true" />
              <span>Single Barcode</span>
            </button>
            <button
              type="button"
              onClick={() => { setMode('bulk'); setErrorMsg(null); }}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-[10px] text-xs font-semibold transition cursor-pointer ${
                mode === 'bulk' ? 'bg-white dark:bg-zinc-950 text-zinc-950 dark:text-white shadow-xs' : 'text-zinc-600'
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
                onClick={() => { setFormat(fmt.id); setErrorMsg(null); setStatusMsg(null); }}
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

        <div className="grid lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-zinc-200/80">
          {/* Left Input & Style */}
          <div className="lg:col-span-6 p-5 sm:p-7 space-y-5 bg-white">
            {mode === 'single' ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label htmlFor="bc-val" className="text-xs font-semibold text-zinc-700">
                    Barcode Value ({activeMeta.label})
                  </label>
                  <div className="flex items-center gap-2.5">
                    {value && (
                      <button type="button" onClick={() => setValue('')} className="inline-flex items-center gap-1 text-[11px] font-semibold text-zinc-500 hover:text-red-600 cursor-pointer">
                        <Trash2 className="w-3 h-3" aria-hidden="true" /> Clear
                      </button>
                    )}
                    <button type="button" onClick={() => setValue(activeMeta.sample)} className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:underline cursor-pointer">
                      <Sparkles className="w-3 h-3" aria-hidden="true" /> Use Example
                    </button>
                  </div>
                </div>
                <input
                  id="bc-val"
                  type="text"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={`Type or paste ${activeMeta.label} value (e.g. ${activeMeta.sample})`}
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-xl px-3.5 py-2.5 text-sm font-medium tabular-nums placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                />
                <p className="text-[11.5px] text-zinc-500">{activeMeta.rule}</p>
              </div>
            ) : (
              <div
                className={`space-y-2 rounded-2xl transition ${isDraggingBulk ? 'ring-2 ring-blue-500/60 bg-blue-50/40 dark:bg-blue-950/20 p-2 -m-2' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setIsDraggingBulk(true); }}
                onDragLeave={() => setIsDraggingBulk(false)}
                onDrop={(e) => { e.preventDefault(); setIsDraggingBulk(false); void handleBulkFileLoad(e.dataTransfer.files); }}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label htmlFor="bc-bulk" className="text-xs font-semibold text-zinc-700">
                    Enter One Code Per Line (Unlimited)
                  </label>
                  <div className="flex items-center gap-2.5">
                    <span className="text-[11px] font-semibold text-zinc-500 tabular-nums">{bulkLines.length} {bulkLines.length === 1 ? 'code' : 'codes'}</span>
                    <button type="button" onClick={() => bulkFileInputRef.current?.click()} className="inline-flex items-center gap-1 text-[11px] font-semibold text-zinc-600 hover:text-blue-600 cursor-pointer">
                      <Upload className="w-3 h-3" aria-hidden="true" /> Import .TXT/.CSV
                    </button>
                    <button type="button" onClick={() => setBulkInput(activeMeta.bulkSamples.join('\n'))} className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:underline cursor-pointer">
                      <Sparkles className="w-3 h-3" aria-hidden="true" /> Use Examples
                    </button>
                    {bulkInput && (
                      <button type="button" onClick={() => { setBulkInput(''); setStatusMsg(null); setErrorMsg(null); }} className="text-[11px] font-semibold text-zinc-500 hover:text-red-600 cursor-pointer">
                        Clear
                      </button>
                    )}
                  </div>
                </div>
                <textarea
                  id="bc-bulk"
                  rows={6}
                  value={bulkInput}
                  onChange={(e) => { setBulkInput(e.target.value); setStatusMsg(null); }}
                  placeholder={`Type, paste, or drop a .TXT/.CSV list here (one per line):\n${activeMeta.bulkSamples.join('\n')}`}
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-xl p-3.5 text-sm font-mono tabular-nums placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                />
                <p className="text-[11.5px] text-zinc-500">{activeMeta.rule}</p>
              </div>
            )}

            <div className="space-y-3.5 pt-3 border-t border-zinc-200/80">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <div className="flex justify-between text-xs text-zinc-600 mb-1 tabular-nums">
                    <label htmlFor="bc-width">Bar Thickness</label>
                    <span className="font-semibold text-zinc-900">{barWidth}×</span>
                  </div>
                  <input id="bc-width" type="range" min={1} max={4} step={0.5} value={barWidth} onChange={(e) => setBarWidth(Number(e.target.value))} className="w-full" />
                </div>
                <div>
                  <div className="flex justify-between text-xs text-zinc-600 mb-1 tabular-nums">
                    <label htmlFor="bc-height">Bar Height</label>
                    <span className="font-semibold text-zinc-900">{barHeight} px</span>
                  </div>
                  <input id="bc-height" type="range" min={40} max={150} step={5} value={barHeight} onChange={(e) => setBarHeight(Number(e.target.value))} className="w-full" />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <div className="flex items-center gap-3">
                  <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-700 cursor-pointer">
                    <Palette className="w-3.5 h-3.5 text-zinc-400" aria-hidden="true" />
                    <span>Bars</span>
                    <input type="color" aria-label="Barcode bar color" value={lineColor} onChange={(e) => setLineColor(e.target.value)} className="w-6 h-6 p-0.5 rounded-lg border border-zinc-300 bg-white cursor-pointer" />
                  </label>
                  <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-700 cursor-pointer">
                    <span>BG</span>
                    <input type="color" aria-label="Barcode background color" disabled={transparentBg} value={bgColor} onChange={(e) => setBgColor(e.target.value)} className="w-6 h-6 p-0.5 rounded-lg border border-zinc-300 bg-white cursor-pointer disabled:opacity-40" />
                  </label>
                  <button type="button" onClick={() => setTransparentBg((v) => !v)} className={`px-2.5 py-1 rounded-lg text-xs font-semibold border cursor-pointer ${transparentBg ? 'bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 border-transparent' : 'bg-zinc-50 text-zinc-700 border-zinc-200'}`}>
                    Transparent
                  </button>
                </div>

                <button type="button" onClick={() => setShowText((s) => !s)} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border cursor-pointer ${showText ? 'bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 border-transparent' : 'bg-zinc-50 text-zinc-700 border-zinc-200'}`}>
                  <Type className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Show Text</span>
                </button>
              </div>
            </div>
          </div>

          {/* Right Live Preview / Bulk Live Preview Grid */}
          <div className="lg:col-span-6 p-6 sm:p-7 bg-zinc-50/70 flex flex-col justify-between gap-5">
            {mode === 'single' ? (
              <>
                <div className="w-full flex-1 flex flex-col items-center justify-center gap-4">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Print-Ready Preview</p>
                  <div
                    className="w-full min-h-[190px] rounded-2xl border border-zinc-200/90 shadow-sm p-5 flex items-center justify-center overflow-x-auto"
                    style={!value.trim() ? { backgroundColor: '#ffffff' } : transparentBg ? checkerStyle : { backgroundColor: bgColor }}
                  >
                    <svg ref={svgRef} className={`max-w-full h-auto ${!value.trim() ? 'hidden' : !isValid ? 'opacity-20' : ''}`} />
                    {!value.trim() && (
                      <div className="text-center space-y-2 py-4">
                        <div className="w-11 h-11 rounded-2xl bg-zinc-100 text-zinc-400 flex items-center justify-center mx-auto">
                          <Barcode className="w-5 h-5" aria-hidden="true" />
                        </div>
                        <p className="text-xs font-semibold text-zinc-600">Type a {activeMeta.label} code on the left to preview live</p>
                        <button type="button" onClick={() => setValue(activeMeta.sample)} className="text-xs font-semibold text-blue-600 hover:underline cursor-pointer">
                          Or try example ({activeMeta.sample}) →
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="w-full space-y-2.5">
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" disabled={!isValid} onClick={() => void handleDownloadSingle('png')} className="btn-studio-accent inline-flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl disabled:opacity-40 text-xs sm:text-sm font-semibold cursor-pointer">
                      <ImageIcon className="w-4 h-4" aria-hidden="true" /> <span>Download PNG</span>
                    </button>
                    <button type="button" disabled={!isValid} onClick={() => void handleDownloadSingle('svg')} className="btn-studio-primary inline-flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl disabled:opacity-40 text-xs sm:text-sm font-semibold cursor-pointer">
                      <FileCode2 className="w-4 h-4" aria-hidden="true" /> <span>Vector SVG</span>
                    </button>
                  </div>
                  <div className="flex justify-end">
                    <ContinueToMenu
                      compact
                      currentPath="/barcode-generator"
                      disabled={!isValid}
                      onPrepareFile={async () => {
                        if (!svgRef.current || !isValid) return null;
                        return { blob: await svgElementToPngBlob(svgRef.current, 3), fileName: `${sanitizeFileName(value.trim())}_${format.toLowerCase()}.png` };
                      }}
                    />
                  </div>
                </div>
              </>
            ) : (
              <div className="w-full flex-1 flex flex-col justify-between gap-4">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                      Live Bulk Preview ({validBulkCount}/{bulkLines.length} valid)
                    </p>
                    <div className="inline-flex bg-zinc-200/70 dark:bg-zinc-800 p-0.5 rounded-xl">
                      <button type="button" onClick={() => setBulkFormat('png')} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-[10px] text-[11px] font-semibold cursor-pointer ${bulkFormat === 'png' ? 'bg-white dark:bg-zinc-950 text-zinc-950 dark:text-white shadow-xs' : 'text-zinc-600'}`}>
                        <ImageIcon className="w-3 h-3" aria-hidden="true" /> PNG
                      </button>
                      <button type="button" onClick={() => setBulkFormat('svg')} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-[10px] text-[11px] font-semibold cursor-pointer ${bulkFormat === 'svg' ? 'bg-white dark:bg-zinc-950 text-zinc-950 dark:text-white shadow-xs' : 'text-zinc-600'}`}>
                        <FileCode2 className="w-3 h-3" aria-hidden="true" /> SVG
                      </button>
                    </div>
                  </div>

                  {bulkPreviews.length === 0 ? (
                    <div className="rounded-2xl bg-white dark:bg-zinc-900 border border-dashed border-zinc-300 dark:border-zinc-700 p-7 text-center space-y-2">
                      <div className="w-10 h-10 rounded-2xl bg-zinc-100 text-zinc-400 flex items-center justify-center mx-auto">
                        <Layers className="w-5 h-5" aria-hidden="true" />
                      </div>
                      <p className="text-xs font-semibold text-zinc-700">Enter codes on the left to preview every barcode live</p>
                      <button type="button" onClick={() => setBulkInput(activeMeta.bulkSamples.join('\n'))} className="text-xs font-semibold text-blue-600 hover:underline cursor-pointer">
                        Load 3 example {activeMeta.label} codes →
                      </button>
                    </div>
                  ) : (
                    <div className="max-h-[340px] overflow-y-auto pr-1 space-y-2.5">
                      {bulkPreviews.map((item) => (
                        <div key={`${item.index}-${item.code}`} className={`rounded-2xl border p-3 space-y-2 ${item.valid ? 'bg-white dark:bg-zinc-900 border-zinc-200/90 dark:border-zinc-800' : 'bg-red-50/60 dark:bg-red-950/20 border-red-200 dark:border-red-900/50'}`}>
                          <div className="flex items-center justify-between gap-2 text-[11px]">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 font-mono font-bold text-zinc-500 shrink-0">#{item.index + 1}</span>
                              <span className="font-mono font-semibold text-zinc-800 dark:text-zinc-200 truncate">{item.code}</span>
                            </div>
                            {item.valid ? (
                              <div className="flex items-center gap-1 shrink-0">
                                <button type="button" onClick={() => void handleDownloadBulkItem(item, 'png')} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 hover:border-blue-500 text-[10.5px] font-semibold text-zinc-700 dark:text-zinc-200 cursor-pointer">
                                  <Download className="w-3 h-3" aria-hidden="true" /> PNG
                                </button>
                                <button type="button" onClick={() => void handleDownloadBulkItem(item, 'svg')} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 hover:border-blue-500 text-[10.5px] font-semibold text-zinc-700 dark:text-zinc-200 cursor-pointer">
                                  SVG
                                </button>
                              </div>
                            ) : (
                              <span className="px-2 py-0.5 rounded-md bg-red-500/15 text-red-700 dark:text-red-300 font-bold shrink-0">Invalid {activeMeta.label}</span>
                            )}
                          </div>
                          {item.valid ? (
                            <div
                              className="rounded-xl border border-zinc-200/70 p-2.5 flex items-center justify-center overflow-x-auto"
                              style={transparentBg ? checkerStyle : { backgroundColor: bgColor }}
                              dangerouslySetInnerHTML={{ __html: item.svgMarkup }}
                            />
                          ) : (
                            <p className="text-[11px] text-red-600 dark:text-red-400">Skipped on export — {activeMeta.rule}.</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {statusMsg && (
                    <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                      <span>{statusMsg}</span>
                    </p>
                  )}
                </div>

                <button type="button" disabled={isGeneratingBulk || validBulkCount === 0} onClick={() => void handleBulkExport()} className="btn-studio-accent w-full py-3 px-5 rounded-xl disabled:opacity-40 text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer tabular-nums">
                  {isGeneratingBulk ? (
                    <><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> <span>Generating Barcodes...</span></>
                  ) : (
                    <><Archive className="w-4 h-4" aria-hidden="true" /> <span>Download All as {bulkFormat.toUpperCase()} ZIP ({validBulkCount})</span></>
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
