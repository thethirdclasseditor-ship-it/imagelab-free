export type SupportedFormat = 'image/jpeg' | 'image/png' | 'image/webp';
export type FitMode = 'contain' | 'cover' | 'stretch';

export interface EnhanceFilters {
  brightness: number; // 50 to 150 (default 100)
  contrast: number;   // 50 to 150 (default 100)
  saturate: number;   // 0 to 200 (default 100)
}

export interface ProcessOptions {
  format?: SupportedFormat;
  quality?: number;         // 0.1 to 1.0
  targetSizeKB?: number;    // Target max KB (JPEG/WEBP)
  width?: number;
  height?: number;
  fitMode?: FitMode;
  filters?: Partial<EnhanceFilters>;
}

export interface ProcessedImageResult {
  id: string;
  blob: Blob;
  url: string;
  originalUrl: string;
  fileName: string;
  originalName: string;
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
// Safe under iOS Safari's ~16.7M pixel canvas limit
const MAX_TOTAL_PIXELS = 16_000_000;

let cachedFilterSupport: boolean | null = null;

function supportsCanvasFilter(): boolean {
  if (cachedFilterSupport !== null) return cachedFilterSupport;
  try {
    const c = document.createElement('canvas');
    c.width = 1;
    c.height = 1;
    const ctx = c.getContext('2d');
    if (!ctx || !('filter' in ctx)) {
      cachedFilterSupport = false;
      return false;
    }
    ctx.fillStyle = '#808080';
    ctx.filter = 'brightness(200%)';
    ctx.fillRect(0, 0, 1, 1);
    const pixel = ctx.getImageData(0, 0, 1, 1).data;
    cachedFilterSupport = pixel[0] > 180;
    return cachedFilterSupport;
  } catch {
    cachedFilterSupport = false;
    return false;
  }
}

function applyPixelFilters(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  filters: Partial<EnhanceFilters>
): void {
  const b = (filters.brightness ?? 100) / 100;
  const c = (filters.contrast ?? 100) / 100;
  const s = (filters.saturate ?? 100) / 100;
  if (b === 1 && c === 1 && s === 1) return;

  const imgData = ctx.getImageData(0, 0, w, h);
  const d = imgData.data;

  for (let i = 0; i < d.length; i += 4) {
    let r = d[i] * b;
    let g = d[i + 1] * b;
    let bl = d[i + 2] * b;

    r = (r - 128) * c + 128;
    g = (g - 128) * c + 128;
    bl = (bl - 128) * c + 128;

    if (s !== 1) {
      const gray = 0.299 * r + 0.587 * g + 0.114 * bl;
      r = gray + (r - gray) * s;
      g = gray + (g - gray) * s;
      bl = gray + (bl - gray) * s;
    }

    d[i] = r < 0 ? 0 : r > 255 ? 255 : r;
    d[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
    d[i + 2] = bl < 0 ? 0 : bl > 255 ? 255 : bl;
  }
  ctx.putImageData(imgData, 0, 0);
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function validateImageFile(file: File): string | null {
  if (!file.type.startsWith('image/')) {
    return `"${file.name}" is not a supported image file.`;
  }
  if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
    return `"${file.name}" exceeds the ${MAX_FILE_SIZE_MB}MB limit.`;
  }
  return null;
}

function loadImage(file: Blob, fileName = 'image'): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`Could not decode "${fileName}". Format (like HEIC) may be unsupported or corrupt.`));
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
        else reject(new Error('Failed to encode image in this browser.'));
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

function renderToCanvas(
  img: HTMLImageElement,
  targetW: number,
  targetH: number,
  format: SupportedFormat,
  fitMode: FitMode | undefined,
  hasExplicitBothDims: boolean,
  filters?: Partial<EnhanceFilters>
): HTMLCanvasElement {
  const origW = img.naturalWidth;
  const origH = img.naturalHeight;

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Browser Canvas 2D context is unavailable.');

  // Fill white for JPEG or contain-mode signatures so transparent/padded areas look clean
  if (format === 'image/jpeg' || fitMode === 'contain') {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, targetW, targetH);
  }

  const hasFilters =
    filters &&
    ((filters.brightness ?? 100) !== 100 ||
      (filters.contrast ?? 100) !== 100 ||
      (filters.saturate ?? 100) !== 100);

  const useNativeFilter = hasFilters && supportsCanvasFilter();
  if (useNativeFilter && filters) {
    const b = filters.brightness ?? 100;
    const c = filters.contrast ?? 100;
    const s = filters.saturate ?? 100;
    ctx.filter = `brightness(${b}%) contrast(${c}%) saturate(${s}%)`;
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  if (hasExplicitBothDims && fitMode === 'contain') {
    const scale = Math.min(targetW / origW, targetH / origH);
    const dw = Math.round(origW * scale);
    const dh = Math.round(origH * scale);
    const dx = Math.round((targetW - dw) / 2);
    const dy = Math.round((targetH - dh) / 2);
    ctx.drawImage(img, dx, dy, dw, dh);
  } else if (hasExplicitBothDims && fitMode === 'cover') {
    const srcRatio = origW / origH;
    const dstRatio = targetW / targetH;
    let sx = 0;
    let sy = 0;
    let sw = origW;
    let sh = origH;

    if (srcRatio > dstRatio) {
      sw = Math.round(origH * dstRatio);
      sx = Math.round((origW - sw) / 2);
    } else {
      sh = Math.round(origW / dstRatio);
      // Slight top-bias (0.28) so heads don't get cropped on portrait/job photos
      sy = Math.round((origH - sh) * 0.28);
    }
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetW, targetH);
  } else {
    ctx.drawImage(img, 0, 0, targetW, targetH);
  }

  // Safari fallback: apply filters via pixel math if ctx.filter is ignored
  if (hasFilters && !useNativeFilter && filters) {
    applyPixelFilters(ctx, targetW, targetH, filters);
  }

  return canvas;
}

async function binarySearchQuality(
  canvas: HTMLCanvasElement,
  format: SupportedFormat,
  targetBytes: number,
  minQ = 0.08,
  maxQ = 0.95
): Promise<{ best: Blob | null; smallest: Blob }> {
  let lo = minQ;
  let hi = maxQ;
  let best: Blob | null = null;
  let smallest = await canvasToBlob(canvas, format, lo);

  if (smallest.size > targetBytes) {
    return { best: null, smallest };
  }
  best = smallest;

  for (let i = 0; i < 7; i++) {
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
  return { best, smallest };
}

/** Downscale huge camera images before running on-device AI to avoid low-RAM crashes */
export async function downscaleForAI(file: File, maxSide = 2048): Promise<Blob> {
  const img = await loadImage(file, file.name);
  const { naturalWidth: w, naturalHeight: h } = img;
  if (Math.max(w, h) <= maxSide) return file;

  const scale = maxSide / Math.max(w, h);
  const nw = Math.round(w * scale);
  const nh = Math.round(h * scale);

  const canvas = document.createElement('canvas');
  canvas.width = nw;
  canvas.height = nh;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, nw, nh);

  const blob = await canvasToBlob(canvas, 'image/jpeg', 0.92);
  canvas.width = 0;
  canvas.height = 0;
  return blob;
}

export async function processImage(
  file: File,
  options: ProcessOptions = {}
): Promise<ProcessedImageResult> {
  const error = validateImageFile(file);
  if (error) throw new Error(error);

  const img = await loadImage(file, file.name);
  const origW = img.naturalWidth;
  const origH = img.naturalHeight;

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

  // Enforce total pixel cap (safe for iOS Safari 16.7MP limit)
  if (targetW * targetH > MAX_TOTAL_PIXELS) {
    const scale = Math.sqrt(MAX_TOTAL_PIXELS / (targetW * targetH));
    targetW = Math.max(1, Math.floor(targetW * scale));
    targetH = Math.max(1, Math.floor(targetH * scale));
  }

  const format: SupportedFormat =
    options.format ||
    (file.type === 'image/png' || file.type === 'image/webp'
      ? (file.type as SupportedFormat)
      : 'image/jpeg');

  let finalBlob: Blob;
  let finalW = targetW;
  let finalH = targetH;
  let targetMissed = false;
  let warning: string | undefined;

  let canvas = renderToCanvas(
    img,
    targetW,
    targetH,
    format,
    options.fitMode,
    hasExplicitW && hasExplicitH,
    options.filters
  );

  if (options.targetSizeKB && options.targetSizeKB > 0 && format !== 'image/png') {
    const targetBytes = options.targetSizeKB * 1024;
    let { best, smallest } = await binarySearchQuality(canvas, format, targetBytes, 0.08, 0.95);

    // If quality alone couldn't hit target KB and dimensions aren't locked, progressively downscale
    if (!best && !lockDimensions) {
      let currW = targetW;
      let currH = targetH;

      for (let pass = 0; pass < 9; pass++) {
        const nextW = Math.round(currW * 0.8);
        const nextH = Math.round(currH * 0.8);
        if (Math.min(nextW, nextH) < 100) break;

        canvas.width = 0;
        canvas.height = 0;
        currW = nextW;
        currH = nextH;

        canvas = renderToCanvas(img, currW, currH, format, undefined, false, options.filters);
        const attempt = await binarySearchQuality(canvas, format, targetBytes, 0.15, 0.92);
        if (attempt.best) {
          best = attempt.best;
          finalW = currW;
          finalH = currH;
          break;
        }
        if (attempt.smallest.size < smallest.size) {
          smallest = attempt.smallest;
          finalW = currW;
          finalH = currH;
        }
      }
    }

    if (best) {
      finalBlob = best;
    } else {
      finalBlob = smallest;
      targetMissed = true;
    }
  } else {
    finalBlob = await canvasToBlob(canvas, format, options.quality ?? 0.85);
  }

  // Free canvas memory
  canvas.width = 0;
  canvas.height = 0;

  // Detect Safari WEBP silent fallback (returns image/png instead of image/webp)
  const actualMime = finalBlob.type || format;
  if (format === 'image/webp' && actualMime !== 'image/webp') {
    warning = `Your browser does not support WEBP encoding; saved as ${getExtensionFromMime(actualMime).toUpperCase()} instead.`;
  }

  const baseName = file.name.replace(/\.[^/.]+$/, '');
  const fileName = `${baseName}_imagelab.${getExtensionFromMime(actualMime)}`;
  const savedPercent = Math.round(((file.size - finalBlob.size) / file.size) * 100);

  return {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    blob: finalBlob,
    url: URL.createObjectURL(finalBlob),
    originalUrl: URL.createObjectURL(file),
    fileName,
    originalName: file.name,
    originalSize: file.size,
    newSize: finalBlob.size,
    width: finalW,
    height: finalH,
    savedPercent,
    targetMissed,
    targetSizeKB: options.targetSizeKB,
    warning,
  };
}
