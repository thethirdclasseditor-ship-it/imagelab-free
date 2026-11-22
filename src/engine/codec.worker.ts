export type WorkerFormat = 'image/jpeg' | 'image/png' | 'image/webp';
export type EncoderName = 'MozJPEG' | 'LibWebP' | 'UPNG';

export interface EncodeWorkerRequest {
  id: number;
  rgbaBuffer: ArrayBuffer;
  width: number;
  height: number;
  format: WorkerFormat;
  quality: number; // 0.1 to 1.0
  targetBytes?: number;
}

export interface EncodeWorkerResponse {
  id: number;
  ok: boolean;
  buffer?: ArrayBuffer;
  mime?: WorkerFormat;
  encoderUsed?: EncoderName;
  targetHit?: boolean;
  error?: string;
}

const workerScope = self as unknown as {
  postMessage: (msg: EncodeWorkerResponse, transfer?: Transferable[]) => void;
  onmessage: ((event: MessageEvent<EncodeWorkerRequest>) => void) | null;
};

let jpegModPromise: Promise<typeof import('@jsquash/jpeg')> | null = null;
let webpModPromise: Promise<typeof import('@jsquash/webp')> | null = null;
let upngModPromise: Promise<typeof import('upng-js')> | null = null;

function getJpegMod() {
  if (!jpegModPromise) {
    jpegModPromise = import('@jsquash/jpeg').catch((err) => {
      jpegModPromise = null;
      throw err;
    });
  }
  return jpegModPromise;
}

function getWebpMod() {
  if (!webpModPromise) {
    webpModPromise = import('@jsquash/webp').catch((err) => {
      webpModPromise = null;
      throw err;
    });
  }
  return webpModPromise;
}

function getUpngMod() {
  if (!upngModPromise) {
    upngModPromise = import('upng-js').catch((err) => {
      upngModPromise = null;
      throw err;
    });
  }
  return upngModPromise;
}

async function encodeJpeg(
  imageData: ImageData,
  qualityPct: number,
  fastProbe = false
): Promise<ArrayBuffer> {
  const { encode } = await getJpegMod();
  const safeQ = Math.max(5, Math.min(96, Math.round(qualityPct)));
  return encode(imageData, {
    quality: safeQ,
    progressive: true,
    optimize_coding: true,
    trellis_multipass: !fastProbe,
    trellis_opt_zero: !fastProbe,
    trellis_opt_table: !fastProbe,
    auto_subsample: true,
  });
}

async function encodeWebp(
  imageData: ImageData,
  qualityPct: number,
  fastProbe = false
): Promise<ArrayBuffer> {
  const { encode } = await getWebpMod();
  const safeQ = Math.max(5, Math.min(98, Math.round(qualityPct)));
  return encode(imageData, {
    quality: safeQ,
    method: fastProbe ? 2 : 4,
  });
}

async function encodePng(
  rgbaBuffer: ArrayBuffer,
  width: number,
  height: number,
  cnum: number
): Promise<ArrayBuffer> {
  const mod = await getUpngMod();
  const UPNG = mod.default || (mod as unknown as typeof mod.default);
  return UPNG.encode([rgbaBuffer], width, height, cnum);
}

async function binarySearchCodec(
  probeFn: (qPct: number) => Promise<ArrayBuffer>,
  finalFn: (qPct: number) => Promise<ArrayBuffer>,
  targetBytes: number
): Promise<{ best: ArrayBuffer | null; smallest: ArrayBuffer }> {
  let lo = 10;
  let hi = 95;

  const minAttempt = await probeFn(lo);
  if (minAttempt.byteLength > targetBytes) {
    return { best: null, smallest: minAttempt };
  }

  let bestQ = lo;
  let bestBuf = minAttempt;
  let smallest = minAttempt;

  for (let i = 0; i < 6; i++) {
    const mid = Math.round((lo + hi) / 2);
    if (mid <= lo || mid >= hi) break;
    const attempt = await probeFn(mid);
    if (attempt.byteLength < smallest.byteLength) smallest = attempt;
    if (attempt.byteLength <= targetBytes) {
      bestQ = mid;
      bestBuf = attempt;
      lo = mid;
    } else {
      hi = mid;
    }
  }

  // Run one final studio-grade pass at the winning quality
  const finalBuf = await finalFn(bestQ);
  if (finalBuf.byteLength <= targetBytes) {
    return { best: finalBuf, smallest: finalBuf };
  }
  return { best: bestBuf, smallest };
}

workerScope.onmessage = async (event: MessageEvent<EncodeWorkerRequest>) => {
  const { id, rgbaBuffer, width, height, format, quality, targetBytes } = event.data;

  try {
    const rgba = new Uint8ClampedArray(rgbaBuffer);
    const imageData = new ImageData(rgba, width, height);

    let outBuffer: ArrayBuffer;
    let encoderUsed: EncoderName;
    let targetHit = true;

    if (format === 'image/jpeg') {
      encoderUsed = 'MozJPEG';
      if (targetBytes && targetBytes > 0) {
        const { best, smallest } = await binarySearchCodec(
          (q) => encodeJpeg(imageData, q, true),
          (q) => encodeJpeg(imageData, q, false),
          targetBytes
        );
        outBuffer = best ?? smallest;
        targetHit = best !== null;
      } else {
        outBuffer = await encodeJpeg(imageData, quality * 100, false);
      }
    } else if (format === 'image/webp') {
      encoderUsed = 'LibWebP';
      if (targetBytes && targetBytes > 0) {
        const { best, smallest } = await binarySearchCodec(
          (q) => encodeWebp(imageData, q, true),
          (q) => encodeWebp(imageData, q, false),
          targetBytes
        );
        outBuffer = best ?? smallest;
        targetHit = best !== null;
      } else {
        outBuffer = await encodeWebp(imageData, quality * 100, false);
      }
    } else {
      // Fast TinyPNG-style UPNG palette quantization with quick feasibility check
      encoderUsed = 'UPNG';
      if (targetBytes && targetBytes > 0) {
        const attempt256 = await encodePng(rgbaBuffer, width, height, 256);
        if (attempt256.byteLength <= targetBytes) {
          const attempt0 = await encodePng(rgbaBuffer, width, height, 0);
          outBuffer = attempt0.byteLength <= targetBytes ? attempt0 : attempt256;
          targetHit = true;
        } else {
          // Check smallest palette immediately before wasting passes
          const attempt16 = await encodePng(rgbaBuffer, width, height, 16);
          if (attempt16.byteLength > targetBytes) {
            outBuffer = attempt16;
            targetHit = false;
          } else {
            let best = attempt16;
            for (const cnum of [128, 64, 32]) {
              const attempt = await encodePng(rgbaBuffer, width, height, cnum);
              if (attempt.byteLength <= targetBytes) {
                best = attempt;
                break;
              }
            }
            outBuffer = best;
            targetHit = true;
          }
        }
      } else {
        const qPct = Math.round(quality * 100);
        const cnum = qPct >= 95 ? 0 : qPct >= 75 ? 256 : qPct >= 50 ? 128 : 64;
        outBuffer = await encodePng(rgbaBuffer, width, height, cnum);
      }
    }

    workerScope.postMessage(
      {
        id,
        ok: true,
        buffer: outBuffer,
        mime: format,
        encoderUsed,
        targetHit,
      },
      [outBuffer]
    );
  } catch (err) {
    workerScope.postMessage({
      id,
      ok: false,
      error: err instanceof Error ? err.message : 'WASM codec failed',
    });
  }
};
