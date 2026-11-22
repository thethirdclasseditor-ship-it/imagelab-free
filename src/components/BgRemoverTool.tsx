import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Upload,
  Download,
  Sparkles,
  Trash2,
  Eye,
  Lock,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Image as ImageIcon,
  Eraser,
  Paintbrush,
  Hand,
  Undo2,
  RotateCcw,
  Contrast,
  Zap,
  Cpu,
} from 'lucide-react';
import {
  encodeCanvasWithCodec,
  formatFileSize,
  validateImageFile,
  validateMagicBytes,
  normalizeImageBlob,
  MAX_SAFE_CANVAS_PIXELS,
} from '../engine/imageEngine';
import { consumeHandoffFile } from '../engine/handoff';
import type {
  BgModelMode,
  BgRemoveMessage,
  BgRemoveRequest,
} from '../engine/bgRemove.worker';
import ContinueToMenu from './ContinueToMenu';

interface BgPreset {
  id: string;
  label: string;
  color: string | null;
}

type BrushMode = 'view' | 'erase' | 'restore';

interface NormPoint {
  x: number;
  y: number;
}

interface MaskStroke {
  mode: 'erase' | 'restore';
  brushPct: number;
  points: NormPoint[];
}

interface RawMaskData {
  alpha: Uint8ClampedArray;
  width: number;
  height: number;
  backend: 'WebGPU' | 'WASM';
  modelUsed: string;
  processingMs: number;
}

const BG_PRESETS: BgPreset[] = [
  { id: 'transparent', label: 'Transparent', color: null },
  { id: 'white', label: 'White', color: '#ffffff' },
  { id: 'passport-blue', label: 'Light Blue', color: '#dbeafe' },
  { id: 'sky', label: 'Sky Blue', color: '#60a5fa' },
  { id: 'gray', label: 'Light Gray', color: '#f1f5f9' },
];

let bgWorkerSingleton: Worker | null = null;
let bgJobSeq = 1;

function getBgWorker(): Worker {
  if (!bgWorkerSingleton) {
    bgWorkerSingleton = new Worker(new URL('../engine/bgRemove.worker.ts', import.meta.url), {
      type: 'module',
    });
  }
  return bgWorkerSingleton;
}

function terminateBgWorker() {
  if (bgWorkerSingleton) {
    bgWorkerSingleton.terminate();
    bgWorkerSingleton = null;
  }
}

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

function loadImgFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not decode image file.'));
    };
    img.src = url;
  });
}

/** Fast 100% browser-safe separable alpha blur (works identically on Chrome, Firefox & iOS Safari) */
function buildProcessedMaskCanvas(
  rawAlpha: Uint8ClampedArray,
  w: number,
  h: number,
  softness: number,
  invert: boolean
): HTMLCanvasElement {
  let alpha = new Uint8ClampedArray(rawAlpha);

  if (invert) {
    for (let i = 0; i < alpha.length; i++) {
      alpha[i] = 255 - alpha[i];
    }
  }

  const radius = Math.max(0, Math.min(4, Math.round(softness)));
  if (radius > 0) {
    const temp = new Uint8ClampedArray(alpha.length);
    const out = new Uint8ClampedArray(alpha.length);
    const win = radius * 2 + 1;

    // Horizontal pass
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        let sum = 0;
        for (let k = -radius; k <= radius; k++) {
          const sx = x + k < 0 ? 0 : x + k >= w ? w - 1 : x + k;
          sum += alpha[row + sx];
        }
        temp[row + x] = Math.round(sum / win);
      }
    }

    // Vertical pass
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        let sum = 0;
        for (let k = -radius; k <= radius; k++) {
          const sy = y + k < 0 ? 0 : y + k >= h ? h - 1 : y + k;
          sum += temp[sy * w + x];
        }
        out[row + x] = Math.round(sum / win);
      }
    }
    alpha = out;
  }

  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) return c;

  const imgData = ctx.createImageData(w, h);
  const d = imgData.data;
  for (let i = 0, p = 0; i < alpha.length; i++, p += 4) {
    d[p] = 255;
    d[p + 1] = 255;
    d[p + 2] = 255;
    d[p + 3] = alpha[i];
  }
  ctx.putImageData(imgData, 0, 0);
  return c;
}

function paintMaskStrokes(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  strokes: MaskStroke[]
) {
  const baseDim = Math.min(w, h);
  for (const stroke of strokes) {
    if (stroke.points.length === 0) continue;
    const brushPx = Math.max(6, Math.round((baseDim * stroke.brushPct) / 100));

    ctx.save();
    ctx.globalCompositeOperation =
      stroke.mode === 'erase' ? 'destination-out' : 'source-over';
    ctx.strokeStyle = '#ffffff';
    ctx.fillStyle = '#ffffff';
    ctx.lineWidth = brushPx;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (stroke.points.length === 1) {
      ctx.beginPath();
      ctx.arc(
        stroke.points[0].x * w,
        stroke.points[0].y * h,
        brushPx / 2,
        0,
        Math.PI * 2
      );
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x * w, stroke.points[0].y * h);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x * w, stroke.points[i].y * h);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
}

function compositeCutoutCanvas(
  sourceImg: HTMLImageElement | HTMLCanvasElement,
  processedMask: HTMLCanvasElement,
  targetW: number,
  targetH: number,
  strokes: MaskStroke[],
  bgColor: string | null
): HTMLCanvasElement {
  // 1. Scale AI mask + apply manual touch-up strokes
  const fullMask = document.createElement('canvas');
  fullMask.width = targetW;
  fullMask.height = targetH;
  const fmCtx = fullMask.getContext('2d');
  if (fmCtx) {
    fmCtx.imageSmoothingEnabled = true;
    fmCtx.imageSmoothingQuality = 'high';
    fmCtx.drawImage(processedMask, 0, 0, targetW, targetH);
    paintMaskStrokes(fmCtx, targetW, targetH, strokes);
  }

  // 2. Apply alpha matte cleanly to original RGB pixels via destination-in
  const cutout = document.createElement('canvas');
  cutout.width = targetW;
  cutout.height = targetH;
  const cutCtx = cutout.getContext('2d');
  if (cutCtx) {
    cutCtx.imageSmoothingEnabled = true;
    cutCtx.imageSmoothingQuality = 'high';
    cutCtx.drawImage(sourceImg, 0, 0, targetW, targetH);
    cutCtx.globalCompositeOperation = 'destination-in';
    cutCtx.drawImage(fullMask, 0, 0);
    cutCtx.globalCompositeOperation = 'source-over';
  }
  fullMask.width = 0;
  fullMask.height = 0;

  if (bgColor === null) {
    return cutout;
  }

  // 3. Composite cutout over chosen solid background
  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = targetW;
  finalCanvas.height = targetH;
  const fCtx = finalCanvas.getContext('2d');
  if (fCtx) {
    fCtx.fillStyle = bgColor;
    fCtx.fillRect(0, 0, targetW, targetH);
    fCtx.drawImage(cutout, 0, 0);
  }
  cutout.width = 0;
  cutout.height = 0;
  return finalCanvas;
}

export default function BgRemoverTool() {
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [loadedImg, setLoadedImg] = useState<HTMLImageElement | null>(null);
  const [rawMask, setRawMask] = useState<RawMaskData | null>(null);

  const [modelMode, setModelMode] = useState<BgModelMode>('studio');
  const [bgColor, setBgColor] = useState<string | null>(null);
  const [customColor, setCustomColor] = useState<string>('#e0f2fe');
  const [edgeSoftness, setEdgeSoftness] = useState<number>(1);
  const [invertMask, setInvertMask] = useState<boolean>(false);
  const [showOriginal, setShowOriginal] = useState<boolean>(false);

  // Manual Touch-up Brush state
  const [brushMode, setBrushMode] = useState<BrushMode>('view');
  const [brushPct, setBrushPct] = useState<number>(6);
  const [strokes, setStrokes] = useState<MaskStroke[]>([]);
  const [activeStroke, setActiveStroke] = useState<MaskStroke | null>(null);

  const [isProcessing, setIsProcessing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isGlobalDragging, setIsGlobalDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewSourceRef = useRef<HTMLCanvasElement | null>(null);
  const processedMaskRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const dragDepthRef = useRef(0);
  const runIdRef = useRef(0);
  const selectHandlerRef = useRef<(files: FileList | File[] | null) => void>(() => {});

  useEffect(() => {
    return () => {
      runIdRef.current++;
      terminateBgWorker();
      if (previewSourceRef.current) {
        previewSourceRef.current.width = 0;
        previewSourceRef.current.height = 0;
      }
      if (processedMaskRef.current) {
        processedMaskRef.current.width = 0;
        processedMaskRef.current.height = 0;
      }
    };
  }, []);

  // Recompute small 512px processed alpha mask only when AI output, softness, or invert changes
  useEffect(() => {
    if (processedMaskRef.current) {
      processedMaskRef.current.width = 0;
      processedMaskRef.current.height = 0;
      processedMaskRef.current = null;
    }
    if (!rawMask) return;
    processedMaskRef.current = buildProcessedMaskCanvas(
      rawMask.alpha,
      rawMask.width,
      rawMask.height,
      edgeSoftness,
      invertMask
    );
  }, [rawMask, edgeSoftness, invertMask]);

  // Live 60fps preview renderer
  const redrawPreview = useCallback(() => {
    const canvas = previewCanvasRef.current;
    const src = previewSourceRef.current;
    if (!canvas || !src) return;

    canvas.width = src.width;
    canvas.height = src.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, src.width, src.height);

    if (showOriginal || !processedMaskRef.current) {
      ctx.drawImage(src, 0, 0);
      return;
    }

    const allStrokes = activeStroke ? [...strokes, activeStroke] : strokes;
    const composed = compositeCutoutCanvas(
      src,
      processedMaskRef.current,
      src.width,
      src.height,
      allStrokes,
      bgColor
    );
    ctx.drawImage(composed, 0, 0);
    composed.width = 0;
    composed.height = 0;
  }, [showOriginal, rawMask, edgeSoftness, invertMask, strokes, activeStroke, bgColor]);

  useEffect(() => {
    redrawPreview();
  }, [redrawPreview]);

  const runSegmentation = async (
    picked: File,
    img: HTMLImageElement,
    modeToRun: BgModelMode
  ) => {
    const runId = ++runIdRef.current;
    const t0 = performance.now();

    setIsProcessing(true);
    setErrorMsg(null);
    setStatusMsg(null);
    setRawMask(null);
    setStrokes([]);
    setActiveStroke(null);
    setInvertMask(false);
    setShowOriginal(false);
    setProgressPct(4);
    setProgressLabel('Preparing image for AI cutout...');

    try {
      // Send clean max-1024px RGB bitmap to worker (AI resizes to 512px internally -> fast & tiny RAM)
      const maxInf = 1024;
      const scale = Math.min(1, maxInf / Math.max(img.naturalWidth, img.naturalHeight));
      const infW = Math.max(16, Math.round(img.naturalWidth * scale));
      const infH = Math.max(16, Math.round(img.naturalHeight * scale));

      const infCanvas = document.createElement('canvas');
      infCanvas.width = infW;
      infCanvas.height = infH;
      const infCtx = infCanvas.getContext('2d', { willReadFrequently: true });
      if (!infCtx) throw new Error('Canvas unavailable.');

      infCtx.fillStyle = '#FFFFFF';
      infCtx.fillRect(0, 0, infW, infH);
      infCtx.imageSmoothingEnabled = true;
      infCtx.imageSmoothingQuality = 'high';
      infCtx.drawImage(img, 0, 0, infW, infH);

      const rgbaCopy = infCtx.getImageData(0, 0, infW, infH).data.slice().buffer;
      infCanvas.width = 0;
      infCanvas.height = 0;

      const worker = getBgWorker();
      const jobId = bgJobSeq++;

      const output = await new Promise<{
        alpha: Uint8ClampedArray;
        maskWidth: number;
        maskHeight: number;
        backend: 'WebGPU' | 'WASM';
        modelUsed: string;
      }>((resolve, reject) => {
        const onMsg = (e: MessageEvent<BgRemoveMessage>) => {
          const msg = e.data;
          if (msg.id !== jobId) return;

          if (msg.type === 'progress') {
            if (runIdRef.current === runId) {
              setProgressPct(msg.percent);
              setProgressLabel(msg.status);
            }
          } else if (msg.type === 'done') {
            worker.removeEventListener('message', onMsg);
            worker.removeEventListener('error', onErr);
            resolve({
              alpha: new Uint8ClampedArray(msg.alphaBuffer),
              maskWidth: msg.maskWidth,
              maskHeight: msg.maskHeight,
              backend: msg.backend,
              modelUsed: msg.modelUsed,
            });
          } else if (msg.type === 'error') {
            worker.removeEventListener('message', onMsg);
            worker.removeEventListener('error', onErr);
            reject(new Error(msg.error));
          }
        };

        const onErr = () => {
          worker.removeEventListener('message', onMsg);
          worker.removeEventListener('error', onErr);
          reject(new Error('AI cutout worker stopped. Try switching to Fast Lite mode.'));
        };

        worker.addEventListener('message', onMsg);
        worker.addEventListener('error', onErr);

        const req: BgRemoveRequest = {
          id: jobId,
          rgbaBuffer: rgbaCopy,
          width: infW,
          height: infH,
          mode: modeToRun,
        };
        worker.postMessage(req, [rgbaCopy]);
      });

      if (runIdRef.current !== runId) return;

      setRawMask({
        alpha: output.alpha,
        width: output.maskWidth,
        height: output.maskHeight,
        backend: output.backend,
        modelUsed: output.modelUsed,
        processingMs: Math.round(performance.now() - t0),
      });
      setProgressPct(100);
      setProgressLabel('');
    } catch (err) {
      if (runIdRef.current !== runId) return;
      setErrorMsg(
        err instanceof Error
          ? err.message
          : `Could not remove background from "${picked.name}".`
      );
    } finally {
      if (runIdRef.current === runId) {
        setIsProcessing(false);
      }
    }
  };

  const processFile = async (picked: File, overrideMode?: BgModelMode) => {
    const valErr = validateImageFile(picked);
    if (valErr) {
      setErrorMsg(valErr);
      return;
    }
    const sigErr = await validateMagicBytes(picked);
    if (sigErr) {
      setErrorMsg(sigErr);
      return;
    }

    setErrorMsg(null);
    setSourceFile(picked);
    setIsProcessing(true);
    setProgressPct(2);
    setProgressLabel('Decoding photo...');

    try {
      const normalized = await normalizeImageBlob(picked);
      const img = await loadImgFromBlob(normalized);

      // Build fast preview source canvas (max 1100px for 60fps touch-up painting)
      const pScale = Math.min(1, 1100 / Math.max(img.naturalWidth, img.naturalHeight));
      const pw = Math.max(1, Math.round(img.naturalWidth * pScale));
      const ph = Math.max(1, Math.round(img.naturalHeight * pScale));
      if (previewSourceRef.current) {
        previewSourceRef.current.width = 0;
        previewSourceRef.current.height = 0;
      }
      const pCanvas = document.createElement('canvas');
      pCanvas.width = pw;
      pCanvas.height = ph;
      pCanvas.getContext('2d')?.drawImage(img, 0, 0, pw, ph);
      previewSourceRef.current = pCanvas;

      setLoadedImg(img);
      await runSegmentation(picked, img, overrideMode ?? modelMode);
    } catch (err) {
      setIsProcessing(false);
      setErrorMsg(err instanceof Error ? err.message : 'Could not open image.');
    }
  };

  const handleFileSelect = (incoming: FileList | File[] | null) => {
    if (!incoming || incoming.length === 0) return;
    const picked = incoming[0];
    if (fileInputRef.current) fileInputRef.current.value = '';
    void processFile(picked);
  };

  selectHandlerRef.current = handleFileSelect;

  useEffect(() => {
    void consumeHandoffFile().then((handoffFile) => {
      if (handoffFile) {
        selectHandlerRef.current([handoffFile]);
      }
    });
  }, []);

  useEffect(() => {
    const hasFiles = (e: DragEvent) =>
      Boolean(e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files'));

    const onDragEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepthRef.current += 1;
      setIsGlobalDragging(true);
    };
    const onDragOver = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
    };
    const onDragLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) setIsGlobalDragging(false);
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepthRef.current = 0;
      setIsGlobalDragging(false);
      if (e.dataTransfer?.files?.length) selectHandlerRef.current(e.dataTransfer.files);
    };
    const onPaste = (e: ClipboardEvent) => {
      const files = e.clipboardData?.files;
      if (files?.length && Array.from(files).some((f) => f.type.startsWith('image/'))) {
        e.preventDefault();
        selectHandlerRef.current(files);
      }
    };

    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
      window.removeEventListener('paste', onPaste);
    };
  }, []);

  const handleModeSwitch = (nextMode: BgModelMode) => {
    setModelMode(nextMode);
    if (sourceFile && loadedImg && !isProcessing) {
      void runSegmentation(sourceFile, loadedImg, nextMode);
    }
  };

  // Manual Touch-up Brush pointer handlers
  const getNormPoint = (e: React.PointerEvent<HTMLCanvasElement>): NormPoint => {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    };
  };

  const onCanvasDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (brushMode === 'view' || showOriginal || !rawMask) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    setStatusMsg(null);
    setActiveStroke({
      mode: brushMode,
      brushPct,
      points: [getNormPoint(e)],
    });
  };

  const onCanvasMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    const pt = getNormPoint(e);
    setActiveStroke((prev) => (prev ? { ...prev, points: [...prev.points, pt] } : null));
  };

  const onCanvasUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setActiveStroke((curr) => {
      if (curr && curr.points.length > 0) {
        setStrokes((prev) => [...prev, curr]);
      }
      return null;
    });
  };

  const buildFullResComposite = async (): Promise<{
    blob: Blob;
    fileName: string;
    encoderUsed: string;
  } | null> => {
    if (!loadedImg || !sourceFile || !processedMaskRef.current) return null;

    let w = loadedImg.naturalWidth;
    let h = loadedImg.naturalHeight;
    if (w * h > MAX_SAFE_CANVAS_PIXELS) {
      const s = Math.sqrt(MAX_SAFE_CANVAS_PIXELS / (w * h));
      w = Math.max(1, Math.floor(w * s));
      h = Math.max(1, Math.floor(h * s));
    }

    const fullCanvas = compositeCutoutCanvas(
      loadedImg,
      processedMaskRef.current,
      w,
      h,
      strokes,
      bgColor
    );

    const isTransparent = bgColor === null;
    const encoded = await encodeCanvasWithCodec(
      fullCanvas,
      isTransparent ? 'image/png' : 'image/jpeg',
      isTransparent ? 1 : 0.92
    );
    fullCanvas.width = 0;
    fullCanvas.height = 0;

    const baseName = sourceFile.name.replace(/\.[^/.]+$/, '');
    return {
      blob: encoded.blob,
      fileName: isTransparent ? `${baseName}_nobg.png` : `${baseName}_bg.jpg`,
      encoderUsed: encoded.encoderUsed,
    };
  };

  const handleDownloadFull = async () => {
    setIsExporting(true);
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const out = await buildFullResComposite();
      if (!out) return;
      triggerDownload(out.blob, out.fileName);
      setStatusMsg(`Saved (${formatFileSize(out.blob.size)} · ${out.encoderUsed})`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Download failed.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleDownload300x300 = async () => {
    if (!loadedImg || !sourceFile || !processedMaskRef.current) return;
    setIsExporting(true);
    setErrorMsg(null);
    setStatusMsg(null);

    try {
      let w = loadedImg.naturalWidth;
      let h = loadedImg.naturalHeight;
      if (w * h > MAX_SAFE_CANVAS_PIXELS) {
        const s = Math.sqrt(MAX_SAFE_CANVAS_PIXELS / (w * h));
        w = Math.max(1, Math.floor(w * s));
        h = Math.max(1, Math.floor(h * s));
      }

      const fullCutout = compositeCutoutCanvas(
        loadedImg,
        processedMaskRef.current,
        w,
        h,
        strokes,
        bgColor ?? '#ffffff'
      );

      const size = 300;
      const outCanvas = document.createElement('canvas');
      outCanvas.width = size;
      outCanvas.height = size;
      const ctx = outCanvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('Canvas unavailable.');

      ctx.fillStyle = bgColor ?? '#ffffff';
      ctx.fillRect(0, 0, size, size);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      const srcRatio = w / h;
      let sx = 0;
      let sy = 0;
      let sw = w;
      let sh = h;
      if (srcRatio > 1) {
        sw = Math.round(h);
        sx = Math.round((w - sw) / 2);
      } else {
        sh = Math.round(w);
        sy = Math.round((h - sh) * 0.22);
      }

      ctx.drawImage(fullCutout, sx, sy, sw, sh, 0, 0, size, size);
      fullCutout.width = 0;
      fullCutout.height = 0;

      const encoded = await encodeCanvasWithCodec(outCanvas, 'image/jpeg', 0.92, 100 * 1024);
      outCanvas.width = 0;
      outCanvas.height = 0;

      const baseName = sourceFile.name.replace(/\.[^/.]+$/, '');
      triggerDownload(encoded.blob, `${baseName}_300x300.jpg`);
      setStatusMsg(
        `Saved 300×300 Portrait (${formatFileSize(encoded.blob.size)} · ${encoded.encoderUsed})`
      );
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '300×300 export failed.');
    } finally {
      setIsExporting(false);
    }
  };

  const resetAll = () => {
    runIdRef.current++;
    setSourceFile(null);
    setLoadedImg(null);
    setRawMask(null);
    setBgColor(null);
    setStrokes([]);
    setActiveStroke(null);
    setBrushMode('view');
    setInvertMask(false);
    setShowOriginal(false);
    setIsProcessing(false);
    setErrorMsg(null);
    setStatusMsg(null);
  };

  return (
    <div className="space-y-4 animate-fade-up">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.heic,.heif,.avif"
        className="hidden"
        onChange={(e) => handleFileSelect(e.target.files)}
      />

      {isGlobalDragging && (
        <div className="fixed inset-0 z-50 bg-zinc-950/65 backdrop-blur-md flex items-center justify-center p-6 pointer-events-none animate-scale-in">
          <div className="max-w-md w-full rounded-3xl border border-blue-400/50 bg-white/95 dark:bg-zinc-900/95 p-10 text-center shadow-2xl">
            <div className="w-16 h-16 rounded-2xl bg-blue-600 text-white flex items-center justify-center mx-auto mb-5 shadow-lg">
              <Upload className="w-7 h-7" />
            </div>
            <p className="text-xl font-bold text-zinc-950 dark:text-white">
              Release to Remove Background
            </p>
          </div>
        </div>
      )}

      <div className="studio-card rounded-3xl overflow-hidden">
        {/* Top Model Switcher Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 sm:px-7 py-3.5 border-b border-zinc-200/80 bg-zinc-50/80">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="inline-flex bg-zinc-200/70 dark:bg-zinc-800 p-0.5 rounded-xl">
              <button
                type="button"
                disabled={isProcessing}
                onClick={() => handleModeSwitch('studio')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] text-xs font-semibold transition cursor-pointer ${
                  modelMode === 'studio'
                    ? 'bg-white dark:bg-zinc-950 text-zinc-950 dark:text-white shadow-xs'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                <span>Studio HD (All Objects)</span>
              </button>
              <button
                type="button"
                disabled={isProcessing}
                onClick={() => handleModeSwitch('fast')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] text-xs font-semibold transition cursor-pointer ${
                  modelMode === 'fast'
                    ? 'bg-white dark:bg-zinc-950 text-zinc-950 dark:text-white shadow-xs'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                <Zap className="w-3.5 h-3.5" />
                <span>Fast Lite (Portraits)</span>
              </button>
            </div>
          </div>

          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-100 text-zinc-600 text-[11px] font-semibold">
            <Cpu className="w-3.5 h-3.5 text-blue-600" />
            {rawMask
              ? `${rawMask.modelUsed} · ${rawMask.backend} · ${(rawMask.processingMs / 1000).toFixed(1)}s`
              : modelMode === 'studio'
                ? 'BiRefNet_lite · MIT'
                : 'MODNet · Apache-2.0'}
          </span>
        </div>

        {!sourceFile ? (
          <div className="p-6 sm:p-10">
            <div
              role="button"
              tabIndex={0}
              aria-label="Select photo to remove background"
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              onClick={() => fileInputRef.current?.click()}
              className="group min-h-[320px] sm:min-h-[360px] flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 hover:border-blue-500/70 bg-zinc-50/60 hover:bg-blue-50/20 dark:hover:bg-blue-950/15 p-8 text-center cursor-pointer transition-all"
            >
              <div className="w-16 h-16 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 shadow-sm flex items-center justify-center mb-6 group-hover:-translate-y-1 transition-transform">
                <Sparkles className="w-7 h-7 text-zinc-900 dark:text-white group-hover:text-blue-600 transition-colors" />
              </div>

              <span className="btn-studio-accent inline-flex items-center gap-2 px-7 py-3.5 rounded-2xl font-semibold text-sm sm:text-[15px]">
                Select Photo
              </span>

              <p className="text-xs sm:text-sm text-zinc-500 mt-4">
                Drop anywhere or press{' '}
                <kbd className="px-1.5 py-0.5 text-[11px] font-semibold bg-white border border-zinc-200 rounded-md text-zinc-700">
                  Ctrl+V
                </kbd>
              </p>

              <p className="text-[11px] font-medium text-zinc-400 mt-3 uppercase tracking-wide">
                BiRefNet Studio Cutout · Edge Softness · Erase & Restore Touch-Up Brush
              </p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-zinc-200/80">
            {/* Touch-Up & Refine Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 sm:px-7 py-3 bg-zinc-50/80">
              <div className="flex flex-wrap items-center gap-2">
                {rawMask && !isProcessing ? (
                  <>
                    <div className="inline-flex bg-zinc-200/70 dark:bg-zinc-800 p-0.5 rounded-xl">
                      {(
                        [
                          { id: 'view', label: 'View', icon: <Hand className="w-3.5 h-3.5" /> },
                          { id: 'erase', label: 'Erase', icon: <Eraser className="w-3.5 h-3.5" /> },
                          { id: 'restore', label: 'Restore', icon: <Paintbrush className="w-3.5 h-3.5" /> },
                        ] as const
                      ).map((tool) => (
                        <button
                          key={tool.id}
                          type="button"
                          onClick={() => {
                            setBrushMode(tool.id);
                            if (tool.id !== 'view') setShowOriginal(false);
                          }}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-[10px] text-xs font-semibold cursor-pointer ${
                            brushMode === tool.id
                              ? 'bg-white dark:bg-zinc-950 text-zinc-950 dark:text-white shadow-xs'
                              : 'text-zinc-600'
                          }`}
                        >
                          {tool.icon}
                          <span>{tool.label}</span>
                        </button>
                      ))}
                    </div>

                    {brushMode !== 'view' && (
                      <div className="flex items-center gap-2 text-xs text-zinc-600 tabular-nums">
                        <span>Brush {brushPct}%</span>
                        <input
                          type="range"
                          aria-label="Touch-up brush size"
                          min={1}
                          max={20}
                          value={brushPct}
                          onChange={(e) => setBrushPct(Number(e.target.value))}
                          className="w-20"
                        />
                      </div>
                    )}

                    {strokes.length > 0 && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setStrokes((prev) => prev.slice(0, -1))}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-100 text-xs font-semibold text-zinc-700 cursor-pointer"
                        >
                          <Undo2 className="w-3.5 h-3.5" /> Undo
                        </button>
                        <button
                          type="button"
                          onClick={() => setStrokes([])}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-100 text-xs font-semibold text-zinc-700 cursor-pointer"
                        >
                          <RotateCcw className="w-3.5 h-3.5" /> Reset
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <span className="text-xs sm:text-sm font-semibold text-zinc-800 truncate max-w-[260px]">
                    {sourceFile.name}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                {rawMask && !isProcessing && (
                  <>
                    <button
                      type="button"
                      onClick={() => setInvertMask((v) => !v)}
                      title="Invert cutout mask"
                      className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                        invertMask
                          ? 'bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 border-transparent'
                          : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-100'
                      }`}
                    >
                      <Contrast className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Invert</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowOriginal((s) => !s)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                        showOriginal
                          ? 'bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 border-transparent'
                          : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-100'
                      }`}
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>{showOriginal ? 'Original' : 'Compare'}</span>
                    </button>
                  </>
                )}

                <button
                  type="button"
                  onClick={resetAll}
                  aria-label="Remove image"
                  className="p-2 rounded-xl border border-zinc-200 bg-white hover:text-red-600 text-zinc-500 transition cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Interactive Cutout Canvas Stage */}
            <div className="bg-zinc-950 p-4 sm:p-6 flex flex-col items-center justify-center gap-3 min-h-[320px] sm:min-h-[420px] select-none">
              {isProcessing ? (
                <div className="w-full max-w-xs text-center space-y-4">
                  <Loader2 className="w-9 h-9 animate-spin text-blue-500 mx-auto" />
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs font-semibold text-zinc-300 tabular-nums">
                      <span className="truncate">{progressLabel}</span>
                      <span>{progressPct}%</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                      <div
                        className="h-full bg-blue-500 transition-all duration-200"
                        style={{ width: `${Math.max(4, progressPct)}%` }}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {brushMode !== 'view' && (
                    <p className="text-[11px] text-zinc-400">
                      {brushMode === 'erase'
                        ? 'Paint over leftover background spots to erase them cleanly'
                        : 'Paint over missing hair, glass, or edges to restore original pixels'}
                    </p>
                  )}
                  <div
                    className="relative rounded-2xl overflow-hidden shadow-xl max-w-full flex items-center justify-center"
                    style={
                      showOriginal || bgColor === null
                        ? {
                            backgroundImage:
                              'linear-gradient(45deg, #27272a 25%, #18181b 25%), linear-gradient(-45deg, #27272a 25%, #18181b 25%), linear-gradient(45deg, #18181b 75%, #27272a 75%), linear-gradient(-45deg, #18181b 75%, #27272a 75%)',
                            backgroundSize: '20px 20px',
                            backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
                          }
                        : { backgroundColor: bgColor }
                    }
                  >
                    <canvas
                      ref={previewCanvasRef}
                      onPointerDown={onCanvasDown}
                      onPointerMove={onCanvasMove}
                      onPointerUp={onCanvasUp}
                      onPointerCancel={onCanvasUp}
                      className={`max-h-[54vh] max-w-full w-auto h-auto block ${
                        brushMode !== 'view' && !showOriginal
                          ? 'cursor-crosshair touch-none'
                          : 'cursor-default'
                      }`}
                    />
                  </div>
                </>
              )}
            </div>

            {/* Background Picker, Edge Softness & Export Controls */}
            {rawMask && !isProcessing && (
              <div className="p-5 sm:px-7 bg-zinc-50/80 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-zinc-500 mr-1">Background</span>
                    {BG_PRESETS.map((preset) => {
                      const active = bgColor === preset.color;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => {
                            setBgColor(preset.color);
                            setShowOriginal(false);
                            setStatusMsg(null);
                          }}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                            active
                              ? 'bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 border-transparent'
                              : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-100'
                          }`}
                        >
                          <span
                            className="w-3.5 h-3.5 rounded-full border border-zinc-300 shrink-0"
                            style={
                              preset.color
                                ? { backgroundColor: preset.color }
                                : {
                                    backgroundImage:
                                      'linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)',
                                    backgroundSize: '8px 8px',
                                  }
                            }
                          />
                          <span>{preset.label}</span>
                        </button>
                      );
                    })}

                    <label className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl border border-zinc-200 bg-white text-xs font-semibold text-zinc-700 cursor-pointer">
                      <input
                        type="color"
                        aria-label="Custom background color"
                        value={customColor}
                        onChange={(e) => {
                          setCustomColor(e.target.value);
                          setBgColor(e.target.value);
                          setShowOriginal(false);
                        }}
                        className="w-5 h-5 rounded border-0 p-0 bg-transparent cursor-pointer"
                      />
                      <span>Custom</span>
                    </label>
                  </div>

                  {/* Edge Softness Slider (0-4) */}
                  <div className="flex items-center gap-2.5 text-xs tabular-nums">
                    <label htmlFor="edge-softness" className="font-semibold text-zinc-600">
                      Edge Softness ({edgeSoftness})
                    </label>
                    <input
                      id="edge-softness"
                      type="range"
                      min={0}
                      max={4}
                      step={1}
                      value={edgeSoftness}
                      onChange={(e) => setEdgeSoftness(Number(e.target.value))}
                      className="w-24"
                    />
                  </div>
                </div>

                {statusMsg && (
                  <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    {statusMsg}
                  </p>
                )}

                <div className="flex flex-wrap items-center justify-end gap-2.5 pt-1">
                  <ContinueToMenu
                    currentPath="/remove-background"
                    disabled={isExporting}
                    onPrepareFile={async () => {
                      const out = await buildFullResComposite();
                      return out ? { blob: out.blob, fileName: out.fileName } : null;
                    }}
                  />

                  <button
                    type="button"
                    disabled={isExporting}
                    onClick={() => void handleDownload300x300()}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-100 disabled:opacity-40 text-xs sm:text-sm font-semibold text-zinc-800 transition cursor-pointer"
                  >
                    <ImageIcon className="w-4 h-4 text-blue-600" />
                    <span>300×300 Portrait (&lt;100KB)</span>
                  </button>

                  <button
                    type="button"
                    disabled={isExporting}
                    onClick={() => void handleDownloadFull()}
                    className="btn-studio-accent inline-flex items-center gap-2 px-6 py-2.5 rounded-xl disabled:opacity-40 text-xs sm:text-sm font-semibold cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>{bgColor === null ? 'Download HD PNG' : 'Download HD JPG'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {errorMsg && (
          <div className="mx-5 sm:mx-7 mb-5 flex items-center gap-2 p-3.5 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-700 dark:text-red-400 text-xs font-medium">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
      </div>

      <p className="flex items-center justify-center gap-1.5 text-xs text-zinc-500">
        <Lock className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
        <span>On-device WebGPU/WASM AI · Photos never leave your browser</span>
      </p>
    </div>
  );
}
