import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  encodeCanvasWithCodec,
  MAX_SAFE_CANVAS_PIXELS,
  type SupportedFormat,
} from './imageEngine';

export type PdfCompressLevel = 'balanced' | 'strong' | 'lossless';

export interface PdfRenderedPage {
  pageNumber: number;
  blob: Blob;
  url: string;
  fileName: string;
  width: number;
  height: number;
  size: number;
  encoderUsed: string;
}

export interface PdfCompressResult {
  blob: Blob;
  fileName: string;
  originalSize: number;
  newSize: number;
  pageCount: number;
  savedPercent: number;
}

function ensurePromiseWithResolvers() {
  const P = Promise as unknown as {
    withResolvers?: <T>() => {
      promise: Promise<T>;
      resolve: (value: T | PromiseLike<T>) => void;
      reject: (reason?: unknown) => void;
    };
  };
  if (typeof P.withResolvers !== 'function') {
    P.withResolvers = function <T>() {
      let resolve!: (value: T | PromiseLike<T>) => void;
      let reject!: (reason?: unknown) => void;
      const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    };
  }
}

async function getPdfJs() {
  ensurePromiseWithResolvers();
  const pdfjs = await import('pdfjs-dist');
  if (pdfjs.GlobalWorkerOptions.workerSrc !== pdfWorkerUrl) {
    pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  }
  return pdfjs;
}

export function validatePdfFileSync(file: File): string | null {
  const isPdfMime = file.type === 'application/pdf';
  const isPdfExt = /\.pdf$/i.test(file.name);
  if (!isPdfMime && !isPdfExt) {
    return `"${file.name}" is not a PDF file.`;
  }
  if (file.size === 0) {
    return `"${file.name}" is empty.`;
  }
  return null;
}

/** Verifies the actual %PDF- signature inside the first 1KB */
export async function validatePdfMagicBytes(file: File): Promise<string | null> {
  try {
    const headerBytes = new Uint8Array(await file.slice(0, 1024).arrayBuffer());
    const text = new TextDecoder('ascii').decode(headerBytes);
    if (!text.includes('%PDF-')) {
      return `"${file.name}" does not have a valid PDF header.`;
    }
    return null;
  } catch {
    return null;
  }
}

export async function inspectPdfPageCount(file: File): Promise<number> {
  const syncErr = validatePdfFileSync(file);
  if (syncErr) throw new Error(syncErr);
  const sigErr = await validatePdfMagicBytes(file);
  if (sigErr) throw new Error(sigErr);

  const { PDFDocument } = await import('pdf-lib');
  const bytes = await file.arrayBuffer();
  try {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: false });
    return doc.getPageCount();
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (/encrypt/i.test(msg)) {
      throw new Error(`"${file.name}" is password-protected. Unlock it before processing.`);
    }
    throw new Error(`Could not read "${file.name}". The PDF may be corrupted.`);
  }
}

/** Parses human page expressions like "1-3, 5, 8-10" into 0-based indices */
export function parsePageRangeExpression(
  expr: string,
  totalPages: number
): { indices: number[]; error?: string } {
  const clean = expr.trim();
  if (!clean) {
    return { indices: Array.from({ length: totalPages }, (_, i) => i) };
  }

  const parts = clean.split(',').map((p) => p.trim()).filter(Boolean);
  const seen = new Set<number>();
  const result: number[] = [];

  for (const part of parts) {
    const rangeMatch = /^(\d+)\s*-\s*(\d+)$/.exec(part);
    if (rangeMatch) {
      const start = Number(rangeMatch[1]);
      const end = Number(rangeMatch[2]);
      if (start < 1 || end < 1 || start > totalPages || end > totalPages) {
        return {
          indices: [],
          error: `Page range "${part}" is out of bounds (PDF has ${totalPages} pages).`,
        };
      }
      const step = start <= end ? 1 : -1;
      for (let p = start; step > 0 ? p <= end : p >= end; p += step) {
        const idx = p - 1;
        if (!seen.has(idx)) {
          seen.add(idx);
          result.push(idx);
        }
      }
    } else if (/^\d+$/.test(part)) {
      const p = Number(part);
      if (p < 1 || p > totalPages) {
        return {
          indices: [],
          error: `Page "${p}" is out of bounds (PDF has ${totalPages} pages).`,
        };
      }
      const idx = p - 1;
      if (!seen.has(idx)) {
        seen.add(idx);
        result.push(idx);
      }
    } else {
      return {
        indices: [],
        error: `Invalid page syntax "${part}". Use numbers and ranges like "1-3, 5".`,
      };
    }
  }

  if (result.length === 0) {
    return { indices: [], error: 'Select at least one valid page.' };
  }
  return { indices: result };
}

/** 1. Merge multiple PDFs losslessly */
export async function mergePdfFiles(
  files: File[],
  onProgress?: (text: string) => void
): Promise<{ blob: Blob; totalPages: number }> {
  const { PDFDocument } = await import('pdf-lib');
  const merged = await PDFDocument.create();

  for (let i = 0; i < files.length; i++) {
    onProgress?.(`Merging PDF ${i + 1} of ${files.length}...`);
    const file = files[i];
    const sigErr = await validatePdfMagicBytes(file);
    if (sigErr) throw new Error(sigErr);

    const bytes = await file.arrayBuffer();
    let src: Awaited<ReturnType<typeof PDFDocument.load>>;
    try {
      src = await PDFDocument.load(bytes, { ignoreEncryption: false });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (/encrypt/i.test(msg)) {
        throw new Error(`"${file.name}" is password-protected and cannot be merged.`);
      }
      throw new Error(`Could not read "${file.name}".`);
    }

    const copiedPages = await merged.copyPages(src, src.getPageIndices());
    copiedPages.forEach((p) => merged.addPage(p));
  }

  onProgress?.('Finalizing merged PDF...');
  const saved = await merged.save({ useObjectStreams: true });
  return {
    blob: new Blob([saved.slice().buffer], { type: 'application/pdf' }),
    totalPages: merged.getPageCount(),
  };
}

/** 2. Split or Extract selected pages from a PDF */
export async function splitPdfPages(
  file: File,
  pageIndices: number[],
  outputMode: 'combined' | 'individual',
  onProgress?: (text: string) => void
): Promise<{ files: { name: string; blob: Blob }[] }> {
  const { PDFDocument } = await import('pdf-lib');
  const bytes = await file.arrayBuffer();
  const src = await PDFDocument.load(bytes, { ignoreEncryption: false });
  const baseName = file.name.replace(/\.pdf$/i, '');

  if (outputMode === 'combined') {
    onProgress?.(`Extracting ${pageIndices.length} pages...`);
    const outDoc = await PDFDocument.create();
    const pages = await outDoc.copyPages(src, pageIndices);
    pages.forEach((p) => outDoc.addPage(p));
    const saved = await outDoc.save({ useObjectStreams: true });
    return {
      files: [
        {
          name: `${baseName}_extracted.pdf`,
          blob: new Blob([saved.slice().buffer], { type: 'application/pdf' }),
        },
      ],
    };
  }

  const outFiles: { name: string; blob: Blob }[] = [];
  for (let i = 0; i < pageIndices.length; i++) {
    const pageIdx = pageIndices[i];
    onProgress?.(`Splitting page ${i + 1} of ${pageIndices.length}...`);
    const single = await PDFDocument.create();
    const [copied] = await single.copyPages(src, [pageIdx]);
    single.addPage(copied);
    const saved = await single.save({ useObjectStreams: true });
    outFiles.push({
      name: `${baseName}_page_${pageIdx + 1}.pdf`,
      blob: new Blob([saved.slice().buffer], { type: 'application/pdf' }),
    });
  }

  return { files: outFiles };
}

/** 3. Compress PDF (Lossless structure repack OR MozJPEG page optimization) */
export async function compressPdfFile(
  file: File,
  level: PdfCompressLevel,
  onProgress?: (text: string) => void
): Promise<PdfCompressResult> {
  const sigErr = await validatePdfMagicBytes(file);
  if (sigErr) throw new Error(sigErr);

  const { PDFDocument } = await import('pdf-lib');
  const baseName = file.name.replace(/\.pdf$/i, '');
  const origBytes = await file.arrayBuffer();

  if (level === 'lossless') {
    onProgress?.('Optimizing PDF streams & stripping unused objects...');
    const src = await PDFDocument.load(origBytes, { ignoreEncryption: false });
    const out = await PDFDocument.create();
    const copied = await out.copyPages(src, src.getPageIndices());
    copied.forEach((p) => out.addPage(p));
    out.setTitle('');
    out.setAuthor('');
    out.setSubject('');
    out.setKeywords([]);
    out.setProducer('');
    out.setCreator('');

    const saved = await out.save({ useObjectStreams: true, addDefaultPage: false });
    const blob = new Blob([saved.slice().buffer], { type: 'application/pdf' });
    const savedPercent = Math.round(((file.size - blob.size) / file.size) * 100);
    return {
      blob,
      fileName: `${baseName}_compressed.pdf`,
      originalSize: file.size,
      newSize: blob.size,
      pageCount: out.getPageCount(),
      savedPercent,
    };
  }

  // Balanced (144 DPI / Q72) or Strong (108 DPI / Q52) MozJPEG re-compression
  const targetScale = level === 'strong' ? 1.5 : 2.0; // 1.0 = 72 DPI -> 1.5 = 108 DPI, 2.0 = 144 DPI
  const jpegQuality = level === 'strong' ? 0.52 : 0.72;

  const pdfjs = await getPdfJs();
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(origBytes.slice(0)) });
  const pdfDoc = await loadingTask.promise;

  try {
    const outDoc = await PDFDocument.create();
    const numPages = pdfDoc.numPages;

    for (let pNum = 1; pNum <= numPages; pNum++) {
      onProgress?.(`Compressing page ${pNum} of ${numPages}...`);
      const page = await pdfDoc.getPage(pNum);
      const vp1x = page.getViewport({ scale: 1 });

      let renderScale = targetScale;
      const estPixels = vp1x.width * renderScale * vp1x.height * renderScale;
      if (estPixels > MAX_SAFE_CANVAS_PIXELS) {
        renderScale = Math.sqrt(MAX_SAFE_CANVAS_PIXELS / (vp1x.width * vp1x.height));
      }

      const vp = page.getViewport({ scale: renderScale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(vp.width));
      canvas.height = Math.max(1, Math.round(vp.height));
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('Canvas unavailable.');

      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      page.cleanup();

      const encoded = await encodeCanvasWithCodec(canvas, 'image/jpeg', jpegQuality);
      canvas.width = 0;
      canvas.height = 0;

      const jpgBytes = new Uint8Array(await encoded.blob.arrayBuffer());
      const embeddedImg = await outDoc.embedJpg(jpgBytes);
      const newPage = outDoc.addPage([vp1x.width, vp1x.height]);
      newPage.drawImage(embeddedImg, {
        x: 0,
        y: 0,
        width: vp1x.width,
        height: vp1x.height,
      });
    }

    onProgress?.('Building compressed PDF...');
    const saved = await outDoc.save({ useObjectStreams: true });
    const blob = new Blob([saved.slice().buffer], { type: 'application/pdf' });
    const savedPercent = Math.round(((file.size - blob.size) / file.size) * 100);

    return {
      blob,
      fileName: `${baseName}_compressed.pdf`,
      originalSize: file.size,
      newSize: blob.size,
      pageCount: numPages,
      savedPercent,
    };
  } finally {
    await pdfDoc.destroy();
  }
}

/** 4. Convert PDF pages to crisp JPG / PNG / WEBP images */
export async function renderPdfToImages(
  file: File,
  options: {
    format: SupportedFormat;
    quality: number; // 0.1 to 1.0
    scale: number;   // 1.5, 2.0, or 3.0
    pageIndices: number[];
  },
  onProgress?: (text: string) => void
): Promise<PdfRenderedPage[]> {
  const sigErr = await validatePdfMagicBytes(file);
  if (sigErr) throw new Error(sigErr);

  const origBytes = await file.arrayBuffer();
  const pdfjs = await getPdfJs();
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(origBytes.slice(0)) });
  const pdfDoc = await loadingTask.promise;

  const baseName = file.name.replace(/\.pdf$/i, '');
  const ext =
    options.format === 'image/png' ? 'png' : options.format === 'image/webp' ? 'webp' : 'jpg';
  const results: PdfRenderedPage[] = [];

  try {
    for (let i = 0; i < options.pageIndices.length; i++) {
      const pNum = options.pageIndices[i] + 1;
      onProgress?.(`Rendering page ${i + 1} of ${options.pageIndices.length}...`);

      const page = await pdfDoc.getPage(pNum);
      const vp1x = page.getViewport({ scale: 1 });
      let renderScale = options.scale;
      const estPixels = vp1x.width * renderScale * vp1x.height * renderScale;
      if (estPixels > MAX_SAFE_CANVAS_PIXELS) {
        renderScale = Math.sqrt(MAX_SAFE_CANVAS_PIXELS / (vp1x.width * vp1x.height));
      }

      const vp = page.getViewport({ scale: renderScale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(vp.width));
      canvas.height = Math.max(1, Math.round(vp.height));
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('Canvas unavailable.');

      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      page.cleanup();

      const outW = canvas.width;
      const outH = canvas.height;
      const encoded = await encodeCanvasWithCodec(canvas, options.format, options.quality);
      canvas.width = 0;
      canvas.height = 0;

      results.push({
        pageNumber: pNum,
        blob: encoded.blob,
        url: URL.createObjectURL(encoded.blob),
        fileName: `${baseName}_page_${pNum}.${ext}`,
        width: outW,
        height: outH,
        size: encoded.blob.size,
        encoderUsed: encoded.encoderUsed,
      });
    }
    return results;
  } finally {
    await pdfDoc.destroy();
  }
}
