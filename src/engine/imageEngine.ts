export type SupportedFormat = 'image/jpeg' | 'image/png' | 'image/webp';

export interface EnhanceFilters {
  brightness: number; // 50 to 150 (default 100)
  contrast: number;   // 50 to 150 (default 100)
  saturate: number;   // 0 to 200 (default 100)
}

export interface ProcessOptions {
  format?: SupportedFormat;
  quality?: number;               // 0.1 to 1.0
  targetSizeKB?: number;          // নির্দিষ্ট KB (যেমন: 50KB বা 100KB)
  width?: number;
  height?: number;
  fitMode?: 'contain' | 'cover' | 'stretch';
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
}

const MAX_FILE_SIZE_MB = 25;
const MAX_DIMENSION = 6000;

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function validateImageFile(file: File): string | null {
  if (!file.type.startsWith('image/')) {
    return `"${file.name}" একটি সঠিক ইমেজ ফাইল নয়।`;
  }
  if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
    return `"${file.name}" এর সাইজ ${MAX_FILE_SIZE_MB}MB এর বেশি।`;
  }
  return null;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`"${file.name}" লোড করা যায়নি। ফাইলটি করাপ্টেড হতে পারে।`));
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
        else reject(new Error('ইমেজ প্রসেস করতে সমস্যা হয়েছে।'));
      },
      format,
      quality
    );
  });
}

function getExtension(format: SupportedFormat): string {
  if (format === 'image/jpeg') return 'jpg';
  if (format === 'image/png') return 'png';
  return 'webp';
}

export async function processImage(
  file: File,
  options: ProcessOptions = {}
): Promise<ProcessedImageResult> {
  const error = validateImageFile(file);
  if (error) throw new Error(error);

  const img = await loadImage(file);
  const origW = img.naturalWidth;
  const origH = img.naturalHeight;

  // টার্গেট প্রস্থ ও উচ্চতা হিসাব
  let targetW = options.width || origW;
  let targetH = options.height || origH;

  if (options.width && !options.height) {
    targetH = Math.round((options.width * origH) / origW);
  } else if (options.height && !options.width) {
    targetW = Math.round((options.height * origW) / origH);
  }

  // ফোনের RAM বাঁচাতে সর্বোচ্চ রেজোলিউশন লিমিট
  if (targetW > MAX_DIMENSION || targetH > MAX_DIMENSION) {
    const scale = MAX_DIMENSION / Math.max(targetW, targetH);
    targetW = Math.round(targetW * scale);
    targetH = Math.round(targetH * scale);
  }

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('আপনার ব্রাউজার Canvas সাপোর্ট করছে না।');

  const format: SupportedFormat =
    options.format ||
    (file.type === 'image/png' || file.type === 'image/webp'
      ? (file.type as SupportedFormat)
      : 'image/jpeg');

  // JPEG-এ ট্রান্সপারেন্ট অংশ কালো না হয়ে সাদা হবে
  if (format === 'image/jpeg') {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, targetW, targetH);
  }

  // Enhancer ফিল্টার প্রয়োগ
  if (options.filters) {
    const brightness = options.filters.brightness ?? 100;
    const contrast = options.filters.contrast ?? 100;
    const saturate = options.filters.saturate ?? 100;
    ctx.filter = `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturate}%)`;
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Smart Center-Crop (ছবি চ্যাপ্টা না করে সুন্দরভাবে নির্দিষ্ট সাইজে ফিট করা)
  if (options.fitMode === 'cover' && options.width && options.height) {
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
      sy = Math.round((origH - sh) / 2);
    }
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetW, targetH);
  } else {
    ctx.drawImage(img, 0, 0, targetW, targetH);
  }

  // Target KB কম্প্রেশন (Binary Search লজিক)
  let finalBlob: Blob;
  if (options.targetSizeKB && options.targetSizeKB > 0 && format !== 'image/png') {
    const targetBytes = options.targetSizeKB * 1024;
    let minQ = 0.05;
    let maxQ = 0.95;
    let bestBlob: Blob | null = null;
    let smallestBlob: Blob | null = null;

    for (let i = 0; i < 8; i++) {
      const midQ = (minQ + maxQ) / 2;
      const attempt = await canvasToBlob(canvas, format, midQ);
      if (!smallestBlob || attempt.size < smallestBlob.size) {
        smallestBlob = attempt;
      }
      if (attempt.size <= targetBytes) {
        bestBlob = attempt;
        minQ = midQ;
      } else {
        maxQ = midQ;
      }
    }
    finalBlob = bestBlob ?? smallestBlob!;
  } else {
    finalBlob = await canvasToBlob(canvas, format, options.quality ?? 0.85);
  }

  // ফোনের মেমোরি খালি করা
  canvas.width = 0;
  canvas.height = 0;

  const baseName = file.name.replace(/\.[^/.]+$/, '');
  const fileName = `${baseName}_imagelab.${getExtension(format)}`;
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
    width: targetW,
    height: targetH,
    savedPercent,
  };
}
