export type BgModelMode = 'studio' | 'fast';

export interface BgRemoveRequest {
  id: number;
  rgbaBuffer: ArrayBuffer;
  width: number;
  height: number;
  mode: BgModelMode;
}

export type BgRemoveMessage =
  | {
      type: 'progress';
      id: number;
      percent: number;
      status: string;
    }
  | {
      type: 'done';
      id: number;
      alphaBuffer: ArrayBuffer;
      maskWidth: number;
      maskHeight: number;
      backend: 'WebGPU' | 'WASM';
      modelUsed: 'BiRefNet_lite (MIT)' | 'MODNet (Apache-2.0)';
    }
  | {
      type: 'error';
      id: number;
      error: string;
    };

interface TensorLike {
  data: ArrayLike<number>;
  dims: number[];
}

interface RawImageLike {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  channels: number;
}

interface ModelLike {
  (inputs: Record<string, unknown>): Promise<Record<string, TensorLike>>;
  dispose?: () => Promise<void> | void;
}

interface ProcessorLike {
  (image: RawImageLike): Promise<{ pixel_values: unknown }>;
}

interface TransformersModule {
  AutoModel: {
    from_pretrained: (modelId: string, opts?: Record<string, unknown>) => Promise<ModelLike>;
  };
  AutoProcessor: {
    from_pretrained: (modelId: string, opts?: Record<string, unknown>) => Promise<ProcessorLike>;
  };
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

interface LoadedSession {
  mode: BgModelMode;
  model: ModelLike;
  processor: ProcessorLike;
  backend: 'WebGPU' | 'WASM';
  modelUsed: 'BiRefNet_lite (MIT)' | 'MODNet (Apache-2.0)';
}

const MODEL_IDS: Record<BgModelMode, string> = {
  studio: 'studioludens/birefnet-lite-512',
  fast: 'Xenova/modnet',
};

const workerScope = self as unknown as {
  postMessage: (msg: BgRemoveMessage, transfer?: Transferable[]) => void;
  onmessage: ((event: MessageEvent<BgRemoveRequest>) => void) | null;
};

let cachedLib: TransformersModule | null = null;
let activeSession: LoadedSession | null = null;

async function loadTransformersLib(jobId: number): Promise<TransformersModule> {
  if (cachedLib) return cachedLib;

  workerScope.postMessage({
    type: 'progress',
    id: jobId,
    percent: 4,
    status: 'Loading on-device AI runtime...',
  });

  const cdnUrls = [
    'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0',
    'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0/+esm',
    'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.4.0',
    'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.4.0/+esm',
  ];

  let lastErr: unknown = null;
  for (const url of cdnUrls) {
    try {
      const mod = (await import(/* @vite-ignore */ url)) as TransformersModule;
      if (mod?.AutoModel && mod?.AutoProcessor && mod?.RawImage && mod?.env) {
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
      ? `Could not load AI runtime: ${lastErr.message}`
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

async function loadSession(
  jobId: number,
  lib: TransformersModule,
  mode: BgModelMode
): Promise<LoadedSession> {
  if (activeSession && activeSession.mode === mode) {
    return activeSession;
  }

  // Dispose previously active model before allocating a new one to protect mobile RAM
  if (activeSession) {
    try {
      await activeSession.model.dispose?.();
    } catch {
      // Ignore disposal errors
    }
    activeSession = null;
  }

  const modelId = MODEL_IDS[mode];
  const label = mode === 'studio' ? 'BiRefNet_lite (MIT)' : 'MODNet (Apache-2.0)';
  const shortLabel = mode === 'studio' ? 'BiRefNet Studio' : 'Fast Lite';

  const progressCb = (info: { status?: string; progress?: number }) => {
    if (info.status === 'progress' && typeof info.progress === 'number') {
      const pct = Math.min(82, Math.max(8, Math.round(8 + info.progress * 0.74)));
      workerScope.postMessage({
        type: 'progress',
        id: jobId,
        percent: pct,
        status: `Downloading ${shortLabel} (${Math.round(info.progress)}%)...`,
      });
    } else if (info.status === 'initiate') {
      workerScope.postMessage({
        type: 'progress',
        id: jobId,
        percent: 8,
        status: `Preparing ${shortLabel} (cached locally once)...`,
      });
    }
  };

  const processor = await lib.AutoProcessor.from_pretrained(modelId);
  const webgpuOk = await hasUsableWebGPU();

  const candidates: Array<{ backend: 'WebGPU' | 'WASM'; opts: Record<string, unknown> }> = [];
  if (mode === 'studio') {
    if (webgpuOk) {
      candidates.push(
        {
          backend: 'WebGPU',
          opts: { device: 'webgpu', dtype: 'fp16', progress_callback: progressCb },
        },
        {
          backend: 'WebGPU',
          opts: { device: 'webgpu', dtype: 'fp32', progress_callback: progressCb },
        }
      );
    }
    candidates.push({
      backend: 'WASM',
      opts: { device: 'wasm', dtype: 'fp32', progress_callback: progressCb },
    });
  } else {
    if (webgpuOk) {
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
  }

  let lastErr: unknown = null;
  for (const cand of candidates) {
    try {
      const model = await lib.AutoModel.from_pretrained(modelId, cand.opts);
      activeSession = {
        mode,
        model,
        processor,
        backend: cand.backend,
        modelUsed: label,
      };
      return activeSession;
    } catch (err) {
      lastErr = err;
    }
  }

  throw new Error(
    lastErr instanceof Error
      ? `Failed to initialize ${shortLabel}: ${lastErr.message}`
      : `Failed to initialize ${shortLabel}.`
  );
}

async function runInference(
  jobId: number,
  lib: TransformersModule,
  rgbData: Uint8ClampedArray,
  width: number,
  height: number,
  mode: BgModelMode
): Promise<{
  alpha: Uint8ClampedArray;
  maskWidth: number;
  maskHeight: number;
  backend: 'WebGPU' | 'WASM';
  modelUsed: 'BiRefNet_lite (MIT)' | 'MODNet (Apache-2.0)';
}> {
  const session = await loadSession(jobId, lib, mode);

  workerScope.postMessage({
    type: 'progress',
    id: jobId,
    percent: 88,
    status: `Segmenting subject · ${session.backend}...`,
  });

  const rawImg = new lib.RawImage(rgbData, width, height, 3);
  const { pixel_values } = await session.processor(rawImg);

  const output =
    mode === 'studio'
      ? await session.model({ input_image: pixel_values })
      : await session.model({ input: pixel_values });

  const outTensor =
    output.logits ?? output.output_image ?? output.output ?? Object.values(output)[0];
  if (!outTensor || !outTensor.data || !outTensor.dims) {
    throw new Error('AI model returned an empty segmentation mask.');
  }

  const dims = outTensor.dims;
  const maskH = dims[dims.length - 2] || 512;
  const maskW = dims[dims.length - 1] || 512;
  const count = maskW * maskH;
  const data = outTensor.data;
  const alpha = new Uint8ClampedArray(count);

  if (mode === 'studio') {
    // BiRefNet_lite outputs raw logits -> apply sigmoid to map into [0, 1]
    for (let i = 0; i < count; i++) {
      const prob = 1 / (1 + Math.exp(-data[i]));
      alpha[i] = Math.round(prob * 255);
    }
  } else {
    // MODNet outputs normalized probabilities in [0, 1]
    for (let i = 0; i < count; i++) {
      const v = data[i];
      alpha[i] = v <= 0 ? 0 : v >= 1 ? 255 : Math.round(v * 255);
    }
  }

  return {
    alpha,
    maskWidth: maskW,
    maskHeight: maskH,
    backend: session.backend,
    modelUsed: session.modelUsed,
  };
}

workerScope.onmessage = async (event: MessageEvent<BgRemoveRequest>) => {
  const { id, rgbaBuffer, width, height, mode } = event.data;

  try {
    const srcRgba = new Uint8ClampedArray(rgbaBuffer);
    const rgbData = new Uint8ClampedArray(width * height * 3);
    for (let p = 0, s = 0, d = 0; p < width * height; p++, s += 4, d += 3) {
      rgbData[d] = srcRgba[s];
      rgbData[d + 1] = srcRgba[s + 1];
      rgbData[d + 2] = srcRgba[s + 2];
    }

    const lib = await loadTransformersLib(id);

    let result;
    try {
      result = await runInference(id, lib, rgbData, width, height, mode);
    } catch (primaryErr) {
      // Automatic fallback to lightweight Apache-2.0 MODNet if Studio BiRefNet fails on low-RAM device
      if (mode === 'studio') {
        workerScope.postMessage({
          type: 'progress',
          id,
          percent: 15,
          status: 'Switching to Fast Lite fallback for this device...',
        });
        result = await runInference(id, lib, rgbData, width, height, 'fast');
      } else {
        throw primaryErr;
      }
    }

    workerScope.postMessage(
      {
        type: 'done',
        id,
        alphaBuffer: result.alpha.buffer,
        maskWidth: result.maskWidth,
        maskHeight: result.maskHeight,
        backend: result.backend,
        modelUsed: result.modelUsed,
      },
      [result.alpha.buffer]
    );
  } catch (err) {
    workerScope.postMessage({
      type: 'error',
      id,
      error: err instanceof Error ? err.message : 'Background removal failed.',
    });
  }
};
