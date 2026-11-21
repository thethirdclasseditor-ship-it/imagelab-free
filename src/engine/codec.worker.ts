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

async function encodeJpeg(imageData: ImageData, qualityPct: number): Promise<ArrayBuffer> {
  if (!jpegModPromise) jpegModPromise = import('@jsquash/jpeg');
  const { encode } = await jpegModPromise;
  // Cap at 96 to prevent pointless 3x–4x file bloat with zero visible quality gain
  const safeQ = Math.max(5, Math.min(96, Math.round(qualityPct)));
  return encode(imageData, {
    quality: safeQ,
    progressive: true,
    optimize_coding: true,
    trellis_multipass: true,
    trellis_opt_zero: true,
    trellis_opt_table: true,
    auto_subsample: true,
  });
}

async function encodeWebp(imageData: ImageData, qualityPct: number): Promise<ArrayBuffer> {
  if (!webpModPromise) webpModPromise = import('@jsquash/webp');
  const { encode } = await webpModPromise;
  const safeQ = Math.max(5, Math.min(98, Math.round(qualityPct)));
  return encode(imageData, {
    quality: safeQ,
    method: 4,
  });
}

async function encodePng(
  rgbaBuffer: ArrayBuffer,
  width: number,
  height: number,
  cnum: number
): Promise<ArrayBuffer> {
  if (!upngModPromise) upngModPromise = import('upng-js');
  const mod = await upngModPromise;
  const UPNG = mod.default || (mod as unknown as typeof mod.default);
  return UPNG.encode([rgbaBuffer], width, height, cnum);
}

async function binarySearchWasm(
  encoderFn: (qPct: number) => Promise<ArrayBuffer>,
  targetBytes: number
): Promise<{ best: ArrayBuffer | null; smallest: ArrayBuffer }> {
  let lo = 10;
  let hi = 95;

  const minAttempt = await encoderFn(lo);
  if (minAttempt.byteLength > targetBytes) {
    return { best: null, smallest: minAttempt };
  }

  let best = minAttempt;
  let smallest = minAttempt;

  for (let i = 0; i < 6; i++) {
    const mid = Math.round((lo + hi) / 2);
    if (mid <= lo || mid >= hi) break;
    const attempt = await encoderFn(mid);
    if (attempt.byteLength < smallest.byteLength) smallest = attempt;
    if (attempt.byteLength <= targetBytes) {
      best = attempt;
      lo = mid;
    } else {
      hi = mid;
    }
  }

  return { best, smallest };
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
        const { best, smallest } = await binarySearchWasm(
          (q) => encodeJpeg(imageData, q),
          targetBytes
        );
        outBuffer = best ?? smallest;
        targetHit = best !== null;
      } else {
        outBuffer = await encodeJpeg(imageData, quality * 100);
      }
    } else if (format === 'image/webp') {
      encoderUsed = 'LibWebP';
      if (targetBytes && targetBytes > 0) {
        const { best, smallest } = await binarySearchWasm(
          (q) => encodeWebp(imageData, q),
          targetBytes
        );
        outBuffer = best ?? smallest;
        targetHit = best !== null;
      } else {
        outBuffer = await encodeWebp(imageData, quality * 100);
      }
    } else {
      // Smart TinyPNG-style PNG compression using UPNG palette quantization
      encoderUsed = 'UPNG';
      if (targetBytes && targetBytes > 0) {
        const paletteSteps = [0, 256, 128, 64, 32, 16];
        let best: ArrayBuffer | null = null;
        let smallest: ArrayBuffer | null = null;

        for (const cnum of paletteSteps) {
          const attempt = await encodePng(rgbaBuffer, width, height, cnum);
          if (!smallest || attempt.byteLength < smallest.byteLength) {
            smallest = attempt;
          }
          if (attempt.byteLength <= targetBytes) {
            best = attempt;
            break;
          }
        }
        outBuffer = best ?? smallest!;
        targetHit = best !== null;
      } else {
        // Quality >= 95% -> Lossless PNG (cnum=0); lower -> quantized smaller PNG
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
