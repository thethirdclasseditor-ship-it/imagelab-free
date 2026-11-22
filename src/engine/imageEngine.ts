import type {
  EncodeWorkerRequest,
  EncodeWorkerResponse,
  EncoderName,
} from './codec.worker';

export type SupportedFormat = 'image/jpeg' | 'image/png' | 'image/webp';
export type FitMode = 'contain' | 'cover' | 'stretch';

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface EnhanceFilters {
  brightness: number; // 50 to 150 (default 100)
  contrast: number;   // 50 to 150 (default 100)
  saturate: number;   // 0 to 200 (default 100)
  sharpness?: number; // 0 to 100 (default 0)
  warmth?: number;    // -50 to 50 (default 0)
  grayscale?: number; // 0 to 100 (default 0)
}

export interface ProcessOptions {
  format?: SupportedFormat;
  quality?: number;               // 0.1 to 1.0
  targetSizeKB?: number;          // Max target KB (works for JPG, WEBP & PNG)
  width?: number;
  height?: number;
  maxSide?: number;               // Optional max longest-side cap (e.g. 2000 for PDFs)
  fitMode?: FitMode;
  cropRect?: CropRect;
  rotation?: 0 | 90 | 180 | 270;
  flipH?: boolean;
  flipV?: boolean;
  filters?: Partial<EnhanceFilters>;
}

export interface ProcessedImageResult {
  id: string;
  blob: Blob;
  url: string;
  originalUrl: string;
  fileName: string;
  originalName: string;
  sourceFormat: string;
  outputFormat: string;
  encoderUsed: EncoderName | 'Canvas';
  originalSize: number;
  newSize: number;
  width: number;
  height: number;
  savedPercent: number;
  targetMissed?: boolean;
  targetSizeKB?: number;
  warning?: string;
}

const MAX_FILE_SIZE_MB = 25;
// Safe under iOS Safari's ~16.7M pixel canvas cap
export const MAX_SAFE_CANVAS_PIXELS = 16_000_000;
// Blocks malicious decompression bombs (e.g. 30,000x30,000 PNG) while allowing 48-64MP phones
const MAX_DECODE_PIXELS = 100_000_000;
const IMAGE_EXT_REGEX = /\.(jpe?g|png|webp|avif|gif|bmp|heic|heif)$/i;

// ================= LAZY WEB WORKER BRIDGE =================
let codecWorker: Worker | null = null;
let workerDisabled = false;
let jobCounter = 1;
const pendingJobs = new Map<
  number,
  {
    resolve: (res: EncodeWorkerResponse) => void;
    reject: (err: Error) => void;
  }
>();

function getCodecWorker(): Worker | null {
  if (workerDisabled || typeof window === 'undefined' || typeof Worker === 'undefined') {
    return null;
  }
  if (!codecWorker) {
    try {
      codecWorker = new Worker(new URL('./codec.worker.ts', import.meta.url), {
        type: 'module',
      });
      codecWorker.onmessage = (e: MessageEvent<EncodeWorkerResponse>) => {
        const res = e.data;
        const job = pendingJobs.get(res.id);
        if (!job) return;
        pendingJobs.delete(res.id);
        job.resolve(res);
      };
      codecWorker.onerror = () => {
        workerDisabled = true;
        codecWorker = null;
        pendingJobs.forEach((job) => job.reject(new Error('Worker unavailable')));
        pendingJobs.clear();
      };
    } catch {
      workerDisabled = true;
      return null;
    }
  }
  return codecWorker;
}

export async function encodeCanvasWithCodec(
  canvas: HTMLCanvasElement,
  format: SupportedFormat,
  quality: number,
  targetBytes?: number
): Promise<{ blob: Blob; encoderUsed: EncoderName | 'Canvas'; targetHit: boolean }> {
  const worker = getCodecWorker();
  if (worker) {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (ctx) {
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const rgbaCopy = imgData.data.slice().buffer;
      const id = jobCounter++;

      const req: EncodeWorkerRequest = {
        id,
        rgbaBuffer: rgbaCopy,
        width: canvas.width,
        height: canvas.height,
        format,
        quality,
        targetBytes,
      };

      try {
        const res = await new Promise<EncodeWorkerResponse>((resolve, reject) => {
          pendingJobs.set(id, { resolve, reject });
          worker.postMessage(req, [rgbaCopy]);
        });

        if (res.ok && res.buffer && res.mime && res.encoderUsed) {
          return {
            blob: new Blob([res.buffer], { type: res.mime }),
            encoderUsed: res.encoderUsed,
            targetHit: res.targetHit ?? true,
          };
        }
      } catch {
        // Fall through to native Canvas fallback
      }
    }
  }

  const fallback = await nativeCanvasFallback(canvas, format, quality, targetBytes);
  return { ...fallback, encoderUsed: 'Canvas' };
}

// ================= HELPERS & SECURITY VALIDATION =================
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function detectSourceFormat(file: File): string {
  const name = file.name.toLowerCase();
  if (name.endsWith('.heic') || name.endsWith('.heif') || file.type.includes('heic')) return 'HEIC';
  if (file.type === 'image/avif' || name.endsWith('.avif')) return 'AVIF';
  if (file.type === 'image/webp' || name.endsWith('.webp')) return 'WEBP';
  if (file.type === 'image/png' || name.endsWith('.png')) return 'PNG';
  if (file.type === 'image/jpeg' || name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'JPG';
  if (file.type === 'image/gif' || name.endsWith('.gif')) return 'GIF';
  if (file.type === 'image/bmp' || name.endsWith('.bmp')) return 'BMP';
  return 'IMG';
}

export function validateImageFile(file: File): string | null {
  const isSvg =
    file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg');
  if (isSvg) {
    return `"${file.name}" is an SVG vector file. Please upload a raster image (JPG, PNG, WEBP, AVIF, or HEIC).`;
  }
  const isImageMime = file.type.startsWith('image/');
  const isImageExt = IMAGE_EXT_REGEX.test(file.name);
  if (!isImageMime && !isImageExt) {
    return `"${file.name}" is not a supported image file.`;
  }
  if (file.size === 0) {
    return `"${file.name}" is empty.`;
  }
  if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
    return `"${file.name}" exceeds the ${MAX_FILE_SIZE_MB}MB limit.`;
  }
  return null;
}

/** Verifies actual magic-byte file headers and guards against PNG pixel-flood bombs */
export async function validateMagicBytes(file: File): Promise<string | null> {
  try {
    const headerBuf = await file.slice(0, 24).arrayBuffer();
    const b = new Uint8Array(headerBuf);
    if (b.length < 4) return `"${file.name}" is not a valid image file.`;

    const isJpeg = b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    const isPng =
      b.length >= 8 &&
      b[0] === 0x89 &&
      b[1] === 0x50 &&
      b[2] === 0x4e &&
      b[3] === 0x47 &&
      b[4] === 0x0d &&
      b[5] === 0x0a &&
      b[6] === 0x1a &&
      b[7] === 0x0a;
    const isGif =
      b.length >= 6 &&
      b[0] === 0x47 &&
      b[1] === 0x49 &&
      b[2] === 0x46 &&
      b[3] === 0x38 &&
      (b[4] === 0x37 || b[4] === 0x39) &&
      b[5] === 0x61;
    const isBmp = b[0] === 0x42 && b[1] === 0x4d;
    const isWebp =
      b.length >= 12 &&
      b[0] === 0x52 &&
      b[1] === 0x49 &&
      b[2] === 0x46 &&
      b[3] === 0x46 &&
      b[8] === 0x57 &&
      b[9] === 0x45 &&
      b[10] === 0x42 &&
      b[11] === 0x50;
    const isIsoBmff =
      b.length >= 12 &&
      b[4] === 0x66 &&
      b[5] === 0x74 &&
      b[6] === 0x79 &&
      b[7] === 0x70;

    if (!isJpeg && !isPng && !isGif && !isBmp && !isWebp && !isIsoBmff) {
      return `"${file.name}" does not match a valid image signature (renamed or unsupported file).`;
    }

    // Pre-decode PNG IHDR dimension check (prevents decompression bombs)
    if (isPng && b.length >= 24) {
      const view = new DataView(headerBuf);
      const pngW = view.getUint32(16, false);
      const pngH = view.getUint32(20, false);
      if (pngW === 0 || pngH === 0 || pngW * pngH > MAX_DECODE_PIXELS) {
        return `"${file.name}" dimensions (${pngW}×${pngH}) exceed the safe browser decode limit.`;
      }
    }

    return null;
  } catch {
    return null;
  }
}

/** Decodes HEIC/HEIF using native browser fast-path first, falling back to modern heic-to/csp */
export async function normalizeImageBlob(file: File): Promise<Blob> {
  const isHeic =
    /\.(heic|heif)$/i.test(file.name) ||
    file.type === 'image/heic' ||
    file.type === 'image/heif';

  if (!isHeic) return file;

  // Native fast-path (works directly on Safari/iOS/macOS with zero extra WASM download)
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      bitmap.close();
      return file;
    } catch {
      // Fall through to libheif WASM decoder
    }
  }

  const { heicTo } = await import('heic-to/csp');
  return heicTo({
    blob: file,
    type: 'image/jpeg',
    quality: 0.95,
  });
}

function loadImage(blob: Blob, fileName = 'image'): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      if (img.naturalWidth * img.naturalHeight > MAX_DECODE_PIXELS) {
        reject(
          new Error(
            `"${fileName}" (${img.naturalWidth}×${img.naturalHeight}) exceeds safe browser memory limits.`
          )
        );
        return;
      }
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`Could not decode "${fileName}". File may be corrupt or unsupported.`));
    };
    img.src = objectUrl;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  format: SupportedFormat,
  quality: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Failed to encode image in browser Canvas.'));
      },
      format,
      quality
    );
  });
}

function getExtensionFromMime(mime: string): string {
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  return 'jpg';
}

// ================= PIXEL-ACCURATE FILTERS (WORKS ON ALL BROWSERS + SAFARI) =================
function applyPixelAdjustments(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  filters: Partial<EnhanceFilters>
): void {
  const b = (filters.brightness ?? 100) / 100;
  const c = (filters.contrast ?? 100) / 100;
  const s = (filters.saturate ?? 100) / 100;
  const warmth = filters.warmth ?? 0;
  const grayAmt = (filters.grayscale ?? 0) / 100;
  const sharpness = (filters.sharpness ?? 0) / 100;

  const needsColorPass =
    b !== 1 || c !== 1 || s !== 1 || warmth !== 0 || grayAmt !== 0;

  if (!needsColorPass && sharpness <= 0) return;

  const imgData = ctx.getImageData(0, 0, w, h);
  const d = imgData.data;

  if (needsColorPass) {
    const warmShift = warmth * 0.6;
    for (let i = 0; i < d.length; i += 4) {
      let r = d[i] * b + warmShift;
      let g = d[i + 1] * b;
      let bl = d[i + 2] * b - warmShift;

      r = (r - 128) * c + 128;
      g = (g - 128) * c + 128;
      bl = (bl - 128) * c + 128;

      if (s !== 1 || grayAmt > 0) {
        const gray = 0.299 * r + 0.587 * g + 0.114 * bl;
        if (s !== 1) {
          r = gray + (r - gray) * s;
          g = gray + (g - gray) * s;
          bl = gray + (bl - gray) * s;
        }
        if (grayAmt > 0) {
          r = r + (gray - r) * grayAmt;
          g = g + (gray - g) * grayAmt;
          bl = bl + (gray - bl) * grayAmt;
        }
      }

      d[i] = r < 0 ? 0 : r > 255 ? 255 : r;
      d[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
      d[i + 2] = bl < 0 ? 0 : bl > 255 ? 255 : bl;
    }
  }

  if (sharpness > 0 && w > 2 && h > 2) {
    const src = new Uint8ClampedArray(d);
    const amt = sharpness * 0.85;
    const stride = w * 4;

    for (let y = 1; y < h - 1; y++) {
      const row = y * stride;
      for (let x = 1; x < w - 1; x++) {
        const idx = row + x * 4;
        for (let ch = 0; ch < 3; ch++) {
          const center = src[idx + ch];
          const neighbors =
            (src[idx - 4 + ch] +
              src[idx + 4 + ch] +
              src[idx - stride + ch] +
              src[idx + stride + ch]) *
            0.25;
          const val = center + (center - neighbors) * amt;
          d[idx + ch] = val < 0 ? 0 : val > 255 ? 255 : val;
        }
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
}

function renderToCanvas(
  img: HTMLImageElement,
  targetW: number,
  targetH: number,
  format: SupportedFormat,
  options: {
    fitMode?: FitMode;
    hasExplicitBothDims: boolean;
    cropRect?: CropRect;
    rotation?: 0 | 90 | 180 | 270;
    flipH?: boolean;
    flipV?: boolean;
    filters?: Partial<EnhanceFilters>;
  }
): HTMLCanvasElement {
  const sxBase = options.cropRect ? Math.max(0, Math.round(options.cropRect.x)) : 0;
  const syBase = options.cropRect ? Math.max(0, Math.round(options.cropRect.y)) : 0;
  const swBase = options.cropRect
    ? Math.min(img.naturalWidth - sxBase, Math.round(options.cropRect.width))
    : img.naturalWidth;
  const shBase = options.cropRect
    ? Math.min(img.naturalHeight - syBase, Math.round(options.cropRect.height))
    : img.naturalHeight;

  const rot = options.rotation ?? 0;
  const isRotated90 = rot === 90 || rot === 270;
  const canvasW = isRotated90 ? targetH : targetW;
  const canvasH = isRotated90 ? targetW : targetH;

  const canvas = document.createElement('canvas');
  canvas.width = canvasW;
  canvas.height = canvasH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Browser Canvas 2D context is unavailable.');

  if (format === 'image/jpeg' || options.fitMode === 'contain') {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvasW, canvasH);
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  ctx.save();
  ctx.translate(canvasW / 2, canvasH / 2);
  if (rot) ctx.rotate((rot * Math.PI) / 180);
  ctx.scale(options.flipH ? -1 : 1, options.flipV ? -1 : 1);
  ctx.translate(-targetW / 2, -targetH / 2);

  if (options.hasExplicitBothDims && options.fitMode === 'contain') {
    const scale = Math.min(targetW / swBase, targetH / shBase);
    const dw = Math.round(swBase * scale);
    const dh = Math.round(shBase * scale);
    const dx = Math.round((targetW - dw) / 2);
    const dy = Math.round((targetH - dh) / 2);
    ctx.drawImage(img, sxBase, syBase, swBase, shBase, dx, dy, dw, dh);
  } else if (options.hasExplicitBothDims && options.fitMode === 'cover') {
    const srcRatio = swBase / shBase;
    const dstRatio = targetW / targetH;
    let sx = sxBase;
    let sy = syBase;
    let sw = swBase;
    let sh = shBase;

    if (srcRatio > dstRatio) {
      sw = Math.round(shBase * dstRatio);
      sx = sxBase + Math.round((swBase - sw) / 2);
    } else {
      sh = Math.round(swBase / dstRatio);
      // Slight top-bias (0.28) to protect faces/heads in portraits
      sy = syBase + Math.round((shBase - sh) * 0.28);
    }
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetW, targetH);
  } else {
    ctx.drawImage(img, sxBase, syBase, swBase, shBase, 0, 0, targetW, targetH);
  }

  ctx.restore();

  if (options.filters) {
    applyPixelAdjustments(ctx, canvasW, canvasH, options.filters);
  }

  return canvas;
}

async function nativeCanvasFallback(
  canvas: HTMLCanvasElement,
  format: SupportedFormat,
  quality: number,
  targetBytes?: number
): Promise<{ blob: Blob; targetHit: boolean }> {
  if (targetBytes && targetBytes > 0 && format !== 'image/png') {
    let lo = 0.08;
    let hi = 0.95;
    let smallest = await canvasToBlob(canvas, format, lo);
    if (smallest.size > targetBytes) return { blob: smallest, targetHit: false };

    let best = smallest;
    for (let i = 0; i < 6; i++) {
      const mid = (lo + hi) / 2;
      const attempt = await canvasToBlob(canvas, format, mid);
      if (attempt.size < smallest.size) smallest = attempt;
      if (attempt.size <= targetBytes) {
        best = attempt;
        lo = mid;
      } else {
        hi = mid;
      }
    }
    return { blob: best, targetHit: true };
  }

  const blob = await canvasToBlob(canvas, format, quality);
  return { blob, targetHit: true };
}

/** Downscale large photos before on-device AI without turning transparent PNG backgrounds black */
export async function downscaleForAI(file: File, maxSide = 2048): Promise<Blob> {
  const sigErr = await validateMagicBytes(file);
  if (sigErr) throw new Error(sigErr);

  const normalized = await normalizeImageBlob(file);
  const img = await loadImage(normalized, file.name);
  const { naturalWidth: w, naturalHeight: h } = img;
  if (Math.max(w, h) <= maxSide) return normalized;

  const scale = maxSide / Math.max(w, h);
  const nw = Math.round(w * scale);
  const nh = Math.round(h * scale);

  const canvas = document.createElement('canvas');
  canvas.width = nw;
  canvas.height = nh;
  const ctx = canvas.getContext('2d');
  if (!ctx) return normalized;

  const mayHaveAlpha =
    normalized.type === 'image/png' ||
    normalized.type === 'image/webp' ||
    normalized.type === 'image/gif' ||
    /\.(png|webp|gif)$/i.test(file.name);

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, nw, nh);

  const blob = await canvasToBlob(
    canvas,
    mayHaveAlpha ? 'image/png' : 'image/jpeg',
    mayHaveAlpha ? 1 : 0.92
  );
  canvas.width = 0;
  canvas.height = 0;
  return blob;
}

// ================= MAIN PROCESSING PIPELINE =================
export async function processImage(
  file: File,
  options: ProcessOptions = {}
): Promise<ProcessedImageResult> {
  const error = validateImageFile(file);
  if (error) throw new Error(error);

  const sigErr = await validateMagicBytes(file);
  if (sigErr) throw new Error(sigErr);

  const sourceFormat = detectSourceFormat(file);
  const normalizedBlob = await normalizeImageBlob(file);
  const img = await loadImage(normalizedBlob, file.name);

  const origW = options.cropRect ? Math.round(options.cropRect.width) : img.naturalWidth;
  const origH = options.cropRect ? Math.round(options.cropRect.height) : img.naturalHeight;

  const hasExplicitW = Boolean(options.width && options.width > 0);
  const hasExplicitH = Boolean(options.height && options.height > 0);
  const lockDimensions = hasExplicitW || hasExplicitH;

  let targetW = options.width || origW;
  let targetH = options.height || origH;

  if (hasExplicitW && !hasExplicitH) {
    targetH = Math.round((targetW * origH) / origW);
  } else if (hasExplicitH && !hasExplicitW) {
    targetW = Math.round((targetH * origW) / origH);
  }

  // Optional longest-side cap (used by Image to PDF to prevent 12MP mobile OOM)
  if (!lockDimensions && options.maxSide && options.maxSide > 0) {
    const longest = Math.max(targetW, targetH);
    if (longest > options.maxSide) {
      const s = options.maxSide / longest;
      targetW = Math.max(1, Math.round(targetW * s));
      targetH = Math.max(1, Math.round(targetH * s));
    }
  }

  // Enforce safe pixel cap (iOS Safari 16.7MP limit)
  if (targetW * targetH > MAX_SAFE_CANVAS_PIXELS) {
    const scale = Math.sqrt(MAX_SAFE_CANVAS_PIXELS / (targetW * targetH));
    targetW = Math.max(1, Math.floor(targetW * scale));
    targetH = Math.max(1, Math.floor(targetH * scale));
  }

  const format: SupportedFormat =
    options.format ||
    (file.type === 'image/png' || file.type === 'image/webp'
      ? (file.type as SupportedFormat)
      : 'image/jpeg');

  const quality = options.quality ?? 0.85;
  const targetBytes =
    options.targetSizeKB && options.targetSizeKB > 0 ? options.targetSizeKB * 1024 : undefined;

  let canvas = renderToCanvas(img, targetW, targetH, format, {
    fitMode: options.fitMode,
    hasExplicitBothDims: hasExplicitW && hasExplicitH,
    cropRect: options.cropRect,
    rotation: options.rotation,
    flipH: options.flipH,
    flipV: options.flipV,
    filters: options.filters,
  });

  let encoded = await encodeCanvasWithCodec(canvas, format, quality, targetBytes);
  let finalW = canvas.width;
  let finalH = canvas.height;
  let targetMissed = false;

  // Smart proportional downscale estimator (converges in 1–3 passes instead of 9 blind loops)
  if (targetBytes && !encoded.targetHit && !lockDimensions) {
    let currW = targetW;
    let currH = targetH;
    let smallestSoFar = encoded;

    for (let pass = 0; pass < 6; pass++) {
      const ratio = Math.sqrt(targetBytes / Math.max(1, smallestSoFar.blob.size)) * 0.92;
      const stepScale = Math.max(0.45, Math.min(0.86, ratio));
      const nextW = Math.round(currW * stepScale);
      const nextH = Math.round(currH * stepScale);
      if (Math.min(nextW, nextH) < 96) break;

      canvas.width = 0;
      canvas.height = 0;
      currW = nextW;
      currH = nextH;

      canvas = renderToCanvas(img, currW, currH, format, {
        cropRect: options.cropRect,
        rotation: options.rotation,
        flipH: options.flipH,
        flipV: options.flipV,
        filters: options.filters,
      });

      const attempt = await encodeCanvasWithCodec(canvas, format, quality, targetBytes);
      if (attempt.blob.size < smallestSoFar.blob.size) {
        smallestSoFar = attempt;
        finalW = canvas.width;
        finalH = canvas.height;
      }
      if (attempt.targetHit) {
        smallestSoFar = attempt;
        finalW = canvas.width;
        finalH = canvas.height;
        break;
      }
    }
    encoded = smallestSoFar;
  }

  if (targetBytes && !encoded.targetHit) {
    targetMissed = true;
  }

  canvas.width = 0;
  canvas.height = 0;

  const actualMime = encoded.blob.type || format;
  let warning: string | undefined;
  if (format === 'image/webp' && actualMime !== 'image/webp') {
    warning = `Browser fallback saved as ${getExtensionFromMime(actualMime).toUpperCase()}.`;
  }

  const ext = getExtensionFromMime(actualMime);
  const baseName = file.name.replace(/\.[^/.]+$/, '');
  const fileName = `${baseName}_imagelab.${ext}`;
  const savedPercent = Math.round(((file.size - encoded.blob.size) / file.size) * 100);

  return {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    blob: encoded.blob,
    url: URL.createObjectURL(encoded.blob),
    originalUrl: URL.createObjectURL(normalizedBlob),
    fileName,
    originalName: file.name,
    sourceFormat,
    outputFormat: ext.toUpperCase(),
    encoderUsed: encoded.encoderUsed,
    originalSize: file.size,
    newSize: encoded.blob.size,
    width: finalW,
    height: finalH,
    savedPercent,
    targetMissed,
    targetSizeKB: options.targetSizeKB,
    warning,
  };
}
