const MODEL_ID = 'Xenova/swin2SR-realworld-sr-x4-64-bsrgan-psnr';
const SCALE = 4;
const TILE_SIZE = 128;
const TILE_PAD = 16;

export interface AiEnhanceRequest {
  id: number;
  rgbaBuffer: ArrayBuffer;
  width: number;
  height: number;
}

export type AiEnhanceMessage =
  | {
      type: 'progress';
      id: number;
      phase: 'loading' | 'restoring';
      percent: number;
      status: string;
    }
  | {
      type: 'done';
      id: number;
      rgbaBuffer: ArrayBuffer;
      width: number;
      height: number;
      backend: 'WebGPU' | 'WASM';
    }
  | {
      type: 'error';
      id: number;
      error: string;
    };

interface RawImageLike {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  channels: number;
}

interface TransformersModule {
  pipeline: (
    task: string,
    model: string,
    options: Record<string, unknown>
  ) => Promise<(input: RawImageLike) => Promise<RawImageLike | RawImageLike[]>>;
  RawImage: new (
    data: Uint8ClampedArray,
    width: number,
    height: number,
    channels: number
  ) => RawImageLike;
  env: {
    allowLocalModels: boolean;
    useBrowserCache: boolean;
  };
}

type UpscalerFn = (input: RawImageLike) => Promise<RawImageLike | RawImageLike[]>;

const workerScope = self as unknown as {
  postMessage: (msg: AiEnhanceMessage, transfer?: Transferable[]) => void;
  onmessage: ((event: MessageEvent<AiEnhanceRequest>) => void) | null;
};

let cachedLib: TransformersModule | null = null;
let cachedUpscaler: UpscalerFn | null = null;
let cachedBackend: 'WebGPU' | 'WASM' = 'WASM';

async function loadTransformersBrowserLib(jobId: number): Promise<TransformersModule> {
  if (cachedLib) return cachedLib;

  workerScope.postMessage({
    type: 'progress',
    id: jobId,
    phase: 'loading',
    percent: 2,
    status: 'Loading AI runtime...',
  });

  const cdnUrls = [
    'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.4.0',
    'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.4.0/+esm',
  ];

  let lastErr: unknown = null;
  for (const url of cdnUrls) {
    try {
      const mod = (await import(/* @vite-ignore */ url)) as TransformersModule;
      if (mod?.pipeline && mod?.RawImage && mod?.env) {
        mod.env.allowLocalModels = false;
        mod.env.useBrowserCache = true;
        cachedLib = mod;
        return mod;
      }
    } catch (err) {
      lastErr = err;
    }
  }

  throw new Error(
    lastErr instanceof Error
      ? `Could not load AI runtime from CDN: ${lastErr.message}`
      : 'Could not load AI runtime from CDN.'
  );
}

async function hasUsableWebGPU(): Promise<boolean> {
  try {
    const nav = navigator as unknown as {
      gpu?: { requestAdapter: () => Promise<unknown> };
    };
    if (!nav.gpu) return false;
    const adapter = await nav.gpu.requestAdapter();
    return Boolean(adapter);
  } catch {
    return false;
  }
}

async function getUpscaler(
  jobId: number,
  lib: TransformersModule
): Promise<{ fn: UpscalerFn; backend: 'WebGPU' | 'WASM' }> {
  if (cachedUpscaler) {
    return { fn: cachedUpscaler, backend: cachedBackend };
  }

  const progressCb = (info: { status?: string; progress?: number }) => {
    if (info.status === 'progress' && typeof info.progress === 'number') {
      const pct = Math.min(99, Math.max(4, Math.round(info.progress)));
      workerScope.postMessage({
        type: 'progress',
        id: jobId,
        phase: 'loading',
        percent: pct,
        status: `Downloading Real-World AI model (${pct}%)...`,
      });
    } else if (info.status === 'initiate') {
      workerScope.postMessage({
        type: 'progress',
        id: jobId,
        phase: 'loading',
        percent: 5,
        status: 'Preparing AI restoration model (cached after first use)...',
      });
    }
  };

  const candidates: Array<{ backend: 'WebGPU' | 'WASM'; opts: Record<string, unknown> }> = [];

  if (await hasUsableWebGPU()) {
    candidates.push({
      backend: 'WebGPU',
      opts: { device: 'webgpu', dtype: 'fp32', progress_callback: progressCb },
    });
  }

  candidates.push(
    {
      backend: 'WASM',
      opts: { device: 'wasm', dtype: 'q8', progress_callback: progressCb },
    },
    {
      backend: 'WASM',
      opts: { device: 'wasm', dtype: 'fp32', progress_callback: progressCb },
    }
  );

  let lastError: unknown = null;
  for (const cand of candidates) {
    try {
      const pipe = await lib.pipeline('image-to-image', MODEL_ID, cand.opts);
      cachedUpscaler = pipe;
      cachedBackend = cand.backend;
      return { fn: pipe, backend: cand.backend };
    } catch (err) {
      lastError = err;
    }
  }

  throw new Error(
    lastError instanceof Error
      ? `Failed to initialize AI model: ${lastError.message}`
      : 'Failed to load AI model in this browser.'
  );
}

workerScope.onmessage = async (event: MessageEvent<AiEnhanceRequest>) => {
  const { id, rgbaBuffer, width: srcW, height: srcH } = event.data;

  try {
    const srcRgba = new Uint8ClampedArray(rgbaBuffer);
    const lib = await loadTransformersBrowserLib(id);
    const { fn: upscaler, backend } = await getUpscaler(id, lib);

    const outW = srcW * SCALE;
    const outH = srcH * SCALE;
    const totalOutPixels = outW * outH;

    const accR = new Float32Array(totalOutPixels);
    const accG = new Float32Array(totalOutPixels);
    const accB = new Float32Array(totalOutPixels);
    const accW = new Float32Array(totalOutPixels);

    const cols = Math.ceil(srcW / TILE_SIZE);
    const rows = Math.ceil(srcH / TILE_SIZE);
    const totalTiles = cols * rows;
    let doneTiles = 0;

    const featherPx = TILE_PAD * SCALE;

    for (let row = 0; row < rows; row++) {
      const y0 = row * TILE_SIZE;
      const y1 = Math.min(srcH, y0 + TILE_SIZE);

      for (let col = 0; col < cols; col++) {
        const x0 = col * TILE_SIZE;
        const x1 = Math.min(srcW, x0 + TILE_SIZE);

        workerScope.postMessage({
          type: 'progress',
          id,
          phase: 'restoring',
          percent: Math.round((doneTiles / totalTiles) * 100),
          status: `Restoring details (${doneTiles + 1}/${totalTiles}) · ${backend}`,
        });

        const ix0 = Math.max(0, x0 - TILE_PAD);
        const iy0 = Math.max(0, y0 - TILE_PAD);
        const ix1 = Math.min(srcW, x1 + TILE_PAD);
        const iy1 = Math.min(srcH, y1 + TILE_PAD);

        const tw = ix1 - ix0;
        const th = iy1 - iy0;
        const pw = Math.ceil(tw / 8) * 8;
        const ph = Math.ceil(th / 8) * 8;

        const tileRgb = new Uint8ClampedArray(pw * ph * 3);
        for (let dy = 0; dy < ph; dy++) {
          const sy = Math.min(srcH - 1, iy0 + Math.min(dy, th - 1));
          const srcRow = sy * srcW;
          const dstRow = dy * pw;
          for (let dx = 0; dx < pw; dx++) {
            const sx = Math.min(srcW - 1, ix0 + Math.min(dx, tw - 1));
            const sIdx = (srcRow + sx) * 4;
            const dIdx = (dstRow + dx) * 3;
            tileRgb[dIdx] = srcRgba[sIdx];
            tileRgb[dIdx + 1] = srcRgba[sIdx + 1];
            tileRgb[dIdx + 2] = srcRgba[sIdx + 2];
          }
        }

        const rawIn = new lib.RawImage(tileRgb, pw, ph, 3);
        const rawResult = await upscaler(rawIn);
        const rawOut = Array.isArray(rawResult) ? rawResult[0] : rawResult;

        const outData = rawOut.data;
        const outTileW = rawOut.width;
        const outCh = rawOut.channels;
        const validW = Math.min(tw * SCALE, outTileW);
        const validH = Math.min(th * SCALE, rawOut.height);

        const hasLeft = ix0 > 0;
        const hasRight = ix1 < srcW;
        const hasTop = iy0 > 0;
        const hasBottom = iy1 < srcH;

        const dstBaseX = ix0 * SCALE;
        const dstBaseY = iy0 * SCALE;

        for (let dy = 0; dy < validH; dy++) {
          let wy = 1;
          if (hasTop && dy < featherPx) wy = Math.min(wy, (dy + 1) / featherPx);
          if (hasBottom && validH - 1 - dy < featherPx) {
            wy = Math.min(wy, (validH - dy) / featherPx);
          }

          const gy = dstBaseY + dy;
          const gRow = gy * outW;
          const tRow = dy * outTileW;

          for (let dx = 0; dx < validW; dx++) {
            let wx = 1;
            if (hasLeft && dx < featherPx) wx = Math.min(wx, (dx + 1) / featherPx);
            if (hasRight && validW - 1 - dx < featherPx) {
              wx = Math.min(wx, (validW - dx) / featherPx);
            }

            const w = Math.max(0.01, wx * wy);
            const tIdx = (tRow + dx) * outCh;
            const gIdx = gRow + dstBaseX + dx;

            accR[gIdx] += outData[tIdx] * w;
            accG[gIdx] += outData[tIdx + 1] * w;
            accB[gIdx] += outData[tIdx + 2] * w;
            accW[gIdx] += w;
          }
        }

        doneTiles++;
      }
    }

    const finalRgba = new Uint8ClampedArray(totalOutPixels * 4);
    for (let p = 0, i = 0; p < totalOutPixels; p++, i += 4) {
      const invW = accW[p] > 0 ? 1 / accW[p] : 1;
      const r = accR[p] * invW;
      const g = accG[p] * invW;
      const b = accB[p] * invW;
      finalRgba[i] = r < 0 ? 0 : r > 255 ? 255 : r;
      finalRgba[i + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
      finalRgba[i + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
      finalRgba[i + 3] = 255;
    }

    workerScope.postMessage(
      {
        type: 'done',
        id,
        rgbaBuffer: finalRgba.buffer,
        width: outW,
        height: outH,
        backend,
      },
      [finalRgba.buffer]
    );
  } catch (err) {
    workerScope.postMessage({
      type: 'error',
      id,
      error: err instanceof Error ? err.message : 'AI photo restoration failed.',
    });
  }
};
