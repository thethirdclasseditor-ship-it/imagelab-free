export interface EnhanceWorkerRequest {
  id: number;
  rgbaBuffer: ArrayBuffer;
  width: number;
  height: number;
  deblur: number;    // 0 to 100
  denoise: number;   // 0 to 100
  clarity: number;   // 0 to 100
  autoTone: boolean;
}

export interface EnhanceWorkerResponse {
  id: number;
  ok: boolean;
  rgbaBuffer?: ArrayBuffer;
  error?: string;
}

const workerScope = self as unknown as {
  postMessage: (msg: EnhanceWorkerResponse, transfer?: Transferable[]) => void;
  onmessage: ((event: MessageEvent<EnhanceWorkerRequest>) => void) | null;
};

function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

/** 1. Edge-Preserving 3x3 Bilateral Denoise (smooths noise/JPEG blocks, keeps edges sharp) */
function applyEdgePreservingDenoise(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  strength: number
): void {
  if (strength <= 0 || w < 3 || h < 3) return;

  const src = new Uint8ClampedArray(data);
  const blend = Math.min(1, strength / 75);
  const sigmaColor = 20 + (strength / 100) * 58;
  const invTwoSigmaSq = 1 / (2 * sigmaColor * sigmaColor);
  const stride = w * 4;

  for (let y = 1; y < h - 1; y++) {
    const row = y * stride;
    for (let x = 1; x < w - 1; x++) {
      const idx = row + x * 4;
      const cr = src[idx];
      const cg = src[idx + 1];
      const cb = src[idx + 2];

      let sumR = cr * 1.4;
      let sumG = cg * 1.4;
      let sumB = cb * 1.4;
      let sumW = 1.4;

      for (let dy = -1; dy <= 1; dy++) {
        const nRow = (y + dy) * stride;
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nIdx = nRow + (x + dx) * 4;
          const nr = src[nIdx];
          const ng = src[nIdx + 1];
          const nb = src[nIdx + 2];

          const dr = nr - cr;
          const dg = ng - cg;
          const db = nb - cb;
          const distSq = dr * dr + dg * dg + db * db;
          const spatialW = dx === 0 || dy === 0 ? 0.85 : 0.55;
          const weight = spatialW * Math.exp(-distSq * invTwoSigmaSq);

          sumR += nr * weight;
          sumG += ng * weight;
          sumB += nb * weight;
          sumW += weight;
        }
      }

      const invW = 1 / sumW;
      data[idx] = clampByte(cr + (sumR * invW - cr) * blend);
      data[idx + 1] = clampByte(cg + (sumG * invW - cg) * blend);
      data[idx + 2] = clampByte(cb + (sumB * invW - cb) * blend);
    }
  }
}

/** 2. Gentle Auto-Tone & Haze Removal (recovers washed-out contrast safely without clipping) */
function applyAutoToneRecovery(data: Uint8ClampedArray): void {
  const hist = new Uint32Array(256);
  const pixelCount = data.length / 4;
  if (pixelCount === 0) return;

  let avgR = 0;
  let avgG = 0;
  let avgB = 0;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    avgR += r;
    avgG += g;
    avgB += b;
    const lum = Math.min(255, Math.round(0.299 * r + 0.587 * g + 0.114 * b));
    hist[lum]++;
  }

  // Find 1.5% shadow & 98.5% highlight percentiles
  const lowTarget = pixelCount * 0.015;
  const highTarget = pixelCount * 0.985;
  let cum = 0;
  let pLow = 0;
  let pHigh = 255;

  for (let i = 0; i < 256; i++) {
    cum += hist[i];
    if (cum >= lowTarget) {
      pLow = i;
      break;
    }
  }
  cum = 0;
  for (let i = 0; i < 256; i++) {
    cum += hist[i];
    if (cum >= highTarget) {
      pHigh = i;
      break;
    }
  }

  const span = pHigh - pLow;
  const shouldStretch = span > 24 && span < 235;
  const rawGain = shouldStretch ? Math.min(1.42, 242 / span) : 1;
  const stretchBlend = 0.55;

  // Gentle 18% white balance normalization
  avgR /= pixelCount;
  avgG /= pixelCount;
  avgB /= pixelCount;
  const avgGray = (avgR + avgG + avgB) / 3;
  const wbR = avgR > 10 ? 1 + (Math.max(0.88, Math.min(1.12, avgGray / avgR)) - 1) * 0.2 : 1;
  const wbG = avgG > 10 ? 1 + (Math.max(0.88, Math.min(1.12, avgGray / avgG)) - 1) * 0.2 : 1;
  const wbB = avgB > 10 ? 1 + (Math.max(0.88, Math.min(1.12, avgGray / avgB)) - 1) * 0.2 : 1;

  for (let i = 0; i < data.length; i += 4) {
    let r = data[i] * wbR;
    let g = data[i + 1] * wbG;
    let b = data[i + 2] * wbB;

    if (shouldStretch) {
      const sr = (r - pLow) * rawGain + 4;
      const sg = (g - pLow) * rawGain + 4;
      const sb = (b - pLow) * rawGain + 4;
      r = r + (sr - r) * stretchBlend;
      g = g + (sg - g) * stretchBlend;
      b = b + (sb - b) * stretchBlend;
    }

    data[i] = clampByte(r);
    data[i + 1] = clampByte(g);
    data[i + 2] = clampByte(b);
  }
}

/** Fast O(N) separable sliding-window box blur on single-channel Float32Array */
function separableBoxBlur(
  src: Float32Array,
  w: number,
  h: number,
  radius: number
): Float32Array {
  const temp = new Float32Array(w * h);
  const dst = new Float32Array(w * h);
  const windowSize = radius * 2 + 1;
  const invWindow = 1 / windowSize;

  // Horizontal pass
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let sum = src[row] * (radius + 1);
    for (let i = 1; i <= radius; i++) {
      sum += src[row + Math.min(w - 1, i)];
    }
    for (let x = 0; x < w; x++) {
      temp[row + x] = sum * invWindow;
      const removeIdx = Math.max(0, x - radius);
      const addIdx = Math.min(w - 1, x + radius + 1);
      sum += src[row + addIdx] - src[row + removeIdx];
    }
  }

  // Vertical pass
  for (let x = 0; x < w; x++) {
    let sum = temp[x] * (radius + 1);
    for (let i = 1; i <= radius; i++) {
      sum += temp[Math.min(h - 1, i) * w + x];
    }
    for (let y = 0; y < h; y++) {
      dst[y * w + x] = sum * invWindow;
      const removeY = Math.max(0, y - radius);
      const addY = Math.min(h - 1, y + radius + 1);
      sum += temp[addY * w + x] - temp[removeY * w + x];
    }
  }

  return dst;
}

/** Fast 1-pass [1, 2, 1]/4 Gaussian blur on Float32Array */
function gaussianPass121(src: Float32Array, w: number, h: number): Float32Array {
  const temp = new Float32Array(w * h);
  const dst = new Float32Array(w * h);

  for (let y = 0; y < h; y++) {
    const row = y * w;
    temp[row] = src[row];
    temp[row + w - 1] = src[row + w - 1];
    for (let x = 1; x < w - 1; x++) {
      temp[row + x] = (src[row + x - 1] + src[row + x] * 2 + src[row + x + 1]) * 0.25;
    }
  }

  for (let x = 0; x < w; x++) {
    dst[x] = temp[x];
    dst[(h - 1) * w + x] = temp[(h - 1) * w + x];
  }
  for (let y = 1; y < h - 1; y++) {
    const row = y * w;
    const prev = row - w;
    const next = row + w;
    for (let x = 0; x < w; x++) {
      dst[row + x] = (temp[prev + x] + temp[row + x] * 2 + temp[next + x]) * 0.25;
    }
  }

  return dst;
}

/** 3. Luminance-only Local Clarity + Multi-Scale Halo-Free Deblur */
function applyClarityAndDeblur(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  clarity: number,
  deblur: number
): void {
  if ((clarity <= 0 && deblur <= 0) || w < 4 || h < 4) return;

  const pixelCount = w * h;
  const lum = new Float32Array(pixelCount);

  for (let p = 0, i = 0; p < pixelCount; p++, i += 4) {
    lum[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }

  let clarityBlur: Float32Array | null = null;
  if (clarity > 0) {
    const clarityRadius = Math.max(4, Math.min(18, Math.round(Math.min(w, h) * 0.015)));
    clarityBlur = separableBoxBlur(lum, w, h, clarityRadius);
  }

  let fineBlur: Float32Array | null = null;
  let medBlur: Float32Array | null = null;
  if (deblur > 0) {
    fineBlur = gaussianPass121(lum, w, h);
    const pass2 = gaussianPass121(fineBlur, w, h);
    medBlur = gaussianPass121(pass2, w, h);
  }

  const clarityAmt = (clarity / 100) * 0.68;
  const deblurAmt = (deblur / 100) * 1.65;
  const noiseFloor = 2.2;

  for (let p = 0, i = 0; p < pixelCount; p++, i += 4) {
    const yVal = lum[p];
    let deltaY = 0;

    // Local micro-contrast (protects pure blacks and blown highlights)
    if (clarityBlur) {
      const norm = (yVal - 128) / 128;
      const midWeight = Math.max(0.15, 1 - norm * norm);
      deltaY += (yVal - clarityBlur[p]) * clarityAmt * midWeight;
    }

    // Multi-scale unsharp deblur with soft noise threshold & halo suppression
    if (fineBlur && medBlur) {
      const hf = yVal - fineBlur[p];
      const mf = yVal - medBlur[p];
      let sharp = hf * 1.15 + mf * 0.85;

      const absSharp = Math.abs(sharp);
      if (absSharp > noiseFloor) {
        const sign = sharp < 0 ? -1 : 1;
        const effective = (absSharp - noiseFloor) * deblurAmt;
        // Soft-clamp overshoot via tanh to prevent white halos around edges
        sharp = sign * Math.tanh(effective / 42) * 42;
        deltaY += sharp;
      }
    }

    if (deltaY !== 0) {
      data[i] = clampByte(data[i] + deltaY);
      data[i + 1] = clampByte(data[i + 1] + deltaY);
      data[i + 2] = clampByte(data[i + 2] + deltaY);
    }
  }
}

workerScope.onmessage = (event: MessageEvent<EnhanceWorkerRequest>) => {
  const { id, rgbaBuffer, width, height, deblur, denoise, clarity, autoTone } = event.data;

  try {
    const data = new Uint8ClampedArray(rgbaBuffer);

    // Order matters: denoise first so deblurring sharpens real details instead of grain
    if (denoise > 0) {
      applyEdgePreservingDenoise(data, width, height, denoise);
    }
    if (autoTone) {
      applyAutoToneRecovery(data);
    }
    if (clarity > 0 || deblur > 0) {
      applyClarityAndDeblur(data, width, height, clarity, deblur);
    }

    workerScope.postMessage({ id, ok: true, rgbaBuffer: data.buffer }, [data.buffer]);
  } catch (err) {
    workerScope.postMessage({
      id,
      ok: false,
      error: err instanceof Error ? err.message : 'Enhancement worker failed.',
    });
  }
};
