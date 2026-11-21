import {
  validateImageFile,
  type SupportedFormat,
} from './imageEngine';
import type {
  EnhanceWorkerRequest,
  EnhanceWorkerResponse,
} from './enhance.worker';
import type {
  EncodeWorkerRequest,
  EncodeWorkerResponse,
  EncoderName,
} from './codec.worker';

export type UpscaleFactor = 1 | 2 | 4;

export interface PhotoEnhanceOptions {
  upscale: UpscaleFactor;
  deblur: number;   // 0 to 100
  denoise: number;  // 0 to 100
  clarity: number;  // 0 to 100
  autoTone: boolean;
  format: SupportedFormat;
  quality: number;  // 0.1 to 1.0
}

export interface EnhancedPhotoResult {
  blob: Blob;
  url: string;
  originalUrl: string;
  fileName: string;
  originalSize: number;
  newSize: number;
  originalWidth: number;
  originalHeight: number;
  width: number;
  height: number;
  upscaleApplied: number;
  encoderUsed: EncoderName | 'Canvas';
  processingMs: number;
  cappedByMemory?: boolean;
}

// Safe cap for mobile + desktop RAM (~12MP max enhanced output)
const MAX_ENHANCE_PIXELS = 12_000_000;
const MAX_ENHANCE_SIDE = 4096;

let enhanceWorker: Worker | null = null;
let codecWorker: Worker | null = null;
let jobIdCounter = 1;

const pendingEnhance = new Map<
  number,
  { resolve: (res: EnhanceWorkerResponse) => void; reject: (err: Error) => void }
>();
const pendingCodec = new Map<
  number,
  { resolve: (res: EncodeWorkerResponse) => void; reject: (err: Error) => void }
>();

function getEnhanceWorker(): Worker {
  if (!enhanceWorker) {
    enhanceWorker = new Worker(new URL('./enhance.worker.ts', import.meta.url), {
      type: 'module',
    });
    enhanceWorker.onmessage = (e: MessageEvent<EnhanceWorkerResponse>) => {
      const job = pendingEnhance.get(e.data.id);
      if (!job) return;
      pendingEnhance.delete(e.data.id);
      job.resolve(e.data);
    };
    enhanceWorker.onerror = () => {
      enhanceWorker = null;
      pendingEnhance.forEach((j) => j.reject(new Error('Enhancement worker failed to start.')));
      pendingEnhance.clear();
    };
  }
  return enhanceWorker;
}

function getCodecWorker(): Worker | null {
  if (typeof window === 'undefined' || typeof Worker === 'undefined') return null;
  if (!codecWorker) {
    try {
      codecWorker = new Worker(new URL('./codec.worker.ts', import.meta.url), {
        type: 'module',
      });
      codecWorker.onmessage = (e: MessageEvent<EncodeWorkerResponse>) => {
        const job = pendingCodec.get(e.data.id);
        if (!job) return;
        pendingCodec.delete(e.data.id);
        job.resolve(e.data);
      };
      codecWorker.onerror = () => {
        codecWorker = null;
        pendingCodec.forEach((j) => j.reject(new Error('Codec worker unavailable')));
        pendingCodec.clear();
      };
    } catch {
      return null;
    }
  }
  return codecWorker;
}

async function normalizeHeicIfNeeded(file: File): Promise<Blob> {
  const isHeic =
    /\.(heic|heif)$/i.test(file.name) ||
    file.type === 'image/heic' ||
    file.type === 'image/heif';
  if (!isHeic) return file;

  const { default: heic2any } = await import('heic2any');
  const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.96 });
  return Array.isArray(converted) ? converted[0] : converted;
}

function loadImage(blob: Blob, name: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Could not decode "${name}".`));
    };
    img.src = url;
  });
}

/** Progressive multi-step upscale preserves much cleaner edges than a single jump */
function progressiveScaleToCanvas(
  img: HTMLImageElement,
  targetW: number,
  targetH: number,
  fillWhite: boolean
): HTMLCanvasElement {
  let currW = img.naturalWidth;
  let currH = img.naturalHeight;

  let currCanvas = document.createElement('canvas');
  currCanvas.width = currW;
  currCanvas.height = currH;
  const initCtx = currCanvas.getContext('2d', { willReadFrequently: true });
  if (!initCtx) throw new Error('Canvas unavailable.');

  if (fillWhite) {
    initCtx.fillStyle = '#FFFFFF';
    initCtx.fillRect(0, 0, currW, currH);
  }
  initCtx.drawImage(img, 0, 0);

  if (targetW === currW && targetH === currH) {
    return currCanvas;
  }

  // Step upwards by max 1.5x per pass for cleaner interpolation
  while (currW < targetW || currH < targetH) {
    const nextW = currW < targetW ? Math.min(targetW, Math.round(currW * 1.5)) : targetW;
    const nextH = currH < targetH ? Math.min(targetH, Math.round(currH * 1.5)) : targetH;

    const nextCanvas = document.createElement('canvas');
    nextCanvas.width = nextW;
    nextCanvas.height = nextH;
    const nextCtx = nextCanvas.getContext('2d', { willReadFrequently: true });
    if (!nextCtx) throw new Error('Canvas unavailable.');

    if (fillWhite) {
      nextCtx.fillStyle = '#FFFFFF';
      nextCtx.fillRect(0, 0, nextW, nextH);
    }
    nextCtx.imageSmoothingEnabled = true;
    nextCtx.imageSmoothingQuality = 'high';
    nextCtx.drawImage(currCanvas, 0, 0, nextW, nextH);

    currCanvas.width = 0;
    currCanvas.height = 0;
    currCanvas = nextCanvas;
    currW = nextW;
    currH = nextH;
  }

  // Handle downscale if original exceeded memory cap
  if (currW > targetW || currH > targetH) {
    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = targetW;
    finalCanvas.height = targetH;
    const fCtx = finalCanvas.getContext('2d', { willReadFrequently: true });
    if (!fCtx) throw new Error('Canvas unavailable.');

    if (fillWhite) {
      fCtx.fillStyle = '#FFFFFF';
      fCtx.fillRect(0, 0, targetW, targetH);
    }
    fCtx.imageSmoothingEnabled = true;
    fCtx.imageSmoothingQuality = 'high';
    fCtx.drawImage(currCanvas, 0, 0, targetW, targetH);

    currCanvas.width = 0;
    currCanvas.height = 0;
    currCanvas = finalCanvas;
  }

  return currCanvas;
}

function getExt(mime: string): string {
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/png') return 'png';
  return 'webp';
}

export async function enhancePhoto(
  file: File,
  options: PhotoEnhanceOptions
): Promise<EnhancedPhotoResult> {
  const startTime = performance.now();
  const validationErr = validateImageFile(file);
  if (validationErr) throw new Error(validationErr);

  const normalizedBlob = await normalizeHeicIfNeeded(file);
  const img = await loadImage(normalizedBlob, file.name);
  const origW = img.naturalWidth;
  const origH = img.naturalHeight;

  // Compute safe target dimensions
  let targetW = Math.round(origW * options.upscale);
  let targetH = Math.round(origH * options.upscale);
  let cappedByMemory = false;

  if (Math.max(targetW, targetH) > MAX_ENHANCE_SIDE) {
    const s = MAX_ENHANCE_SIDE / Math.max(targetW, targetH);
    targetW = Math.max(1, Math.round(targetW * s));
    targetH = Math.max(1, Math.round(targetH * s));
    cappedByMemory = true;
  }
  if (targetW * targetH > MAX_ENHANCE_PIXELS) {
    const s = Math.sqrt(MAX_ENHANCE_PIXELS / (targetW * targetH));
    targetW = Math.max(1, Math.floor(targetW * s));
    targetH = Math.max(1, Math.floor(targetH * s));
    cappedByMemory = true;
  }

  const canvas = progressiveScaleToCanvas(img, targetW, targetH, options.format === 'image/jpeg');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Canvas 2D context unavailable.');

  const rawData = ctx.getImageData(0, 0, targetW, targetH);
  const transferBuf = rawData.data.slice().buffer;

  // Boost subtle extra deblur automatically when upscaling so edges stay crisp
  const effectiveDeblur =
    options.upscale > 1
      ? Math.min(100, Math.round(options.deblur + (options.upscale === 4 ? 14 : 8)))
      : options.deblur;

  // 1. Run pixel restoration inside dedicated background Web Worker
  const worker = getEnhanceWorker();
  const enhId = jobIdCounter++;
  const enhReq: EnhanceWorkerRequest = {
    id: enhId,
    rgbaBuffer: transferBuf,
    width: targetW,
    height: targetH,
    deblur: effectiveDeblur,
    denoise: options.denoise,
    clarity: options.clarity,
    autoTone: options.autoTone,
  };

  const enhRes = await new Promise<EnhanceWorkerResponse>((resolve, reject) => {
    pendingEnhance.set(enhId, { resolve, reject });
    worker.postMessage(enhReq, [transferBuf]);
  });

  if (!enhRes.ok || !enhRes.rgbaBuffer) {
    canvas.width = 0;
    canvas.height = 0;
    throw new Error(enhRes.error || 'Image enhancement failed.');
  }

  // 2. Encode enhanced pixels via MozJPEG / LibWebP / UPNG codec worker (with Canvas fallback)
  let finalBlob: Blob | null = null;
  let encoderUsed: EncoderName | 'Canvas' = 'Canvas';

  const cWorker = getCodecWorker();
  if (cWorker) {
    try {
      const codecId = jobIdCounter++;
      const codecBuf = enhRes.rgbaBuffer.slice(0);
      const codecReq: EncodeWorkerRequest = {
        id: codecId,
        rgbaBuffer: codecBuf,
        width: targetW,
        height: targetH,
        format: options.format,
        quality: options.quality,
      };
      const cRes = await new Promise<EncodeWorkerResponse>((resolve, reject) => {
        pendingCodec.set(codecId, { resolve, reject });
        cWorker.postMessage(codecReq, [codecBuf]);
      });
      if (cRes.ok && cRes.buffer && cRes.mime && cRes.encoderUsed) {
        finalBlob = new Blob([cRes.buffer], { type: cRes.mime });
        encoderUsed = cRes.encoderUsed;
      }
    } catch {
      finalBlob = null;
    }
  }

  if (!finalBlob) {
    const outImgData = new ImageData(new Uint8ClampedArray(enhRes.rgbaBuffer), targetW, targetH);
    ctx.putImageData(outImgData, 0, 0);
    finalBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Failed to encode enhanced image.'))),
        options.format,
        options.quality
      );
    });
  }

  canvas.width = 0;
  canvas.height = 0;

  const actualMime = finalBlob.type || options.format;
  const ext = getExt(actualMime);
  const baseName = file.name.replace(/\.[^/.]+$/, '');
  const upscaleTag = options.upscale > 1 ? `_${options.upscale}x` : '';
  const fileName = `${baseName}_enhanced${upscaleTag}.${ext}`;

  return {
    blob: finalBlob,
    url: URL.createObjectURL(finalBlob),
    originalUrl: URL.createObjectURL(normalizedBlob),
    fileName,
    originalSize: file.size,
    newSize: finalBlob.size,
    originalWidth: origW,
    originalHeight: origH,
    width: targetW,
    height: targetH,
    upscaleApplied: Number((targetW / origW).toFixed(1)),
    encoderUsed,
    processingMs: Math.round(performance.now() - startTime),
    cappedByMemory,
  };
}
