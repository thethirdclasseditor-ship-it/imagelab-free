import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Camera, Upload, Copy, Check, ExternalLink, Wifi, User, Mail,
  Phone, Type, Link as LinkIcon, QrCode, ScanLine, Trash2,
  RefreshCw, Lock, AlertCircle, Eye, EyeOff, ShieldCheck,
  Download, SwitchCamera, X,
} from 'lucide-react';

type ReaderTab = 'upload' | 'camera';

interface Point {
  x: number;
  y: number;
}

interface JsQrResult {
  data: string;
  location?: {
    topLeftCorner: Point;
    topRightCorner: Point;
    bottomRightCorner: Point;
    bottomLeftCorner: Point;
  };
}

type JsQrFn = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
  options?: { inversionAttempts?: 'dontInvert' | 'onlyInvert' | 'attemptBoth' | 'invertFirst' }
) => JsQrResult | null;

type ParsedKind = 'url' | 'wifi' | 'vcard' | 'email' | 'phone' | 'text';

interface ParsedQr {
  kind: ParsedKind;
  raw: string;
  url?: string;
  domain?: string;
  isWhatsapp?: boolean;
  wifi?: { ssid: string; password: string; security: string; hidden: boolean };
  vcard?: { name: string; phone: string; email: string; org: string; url: string };
  email?: { to: string; subject: string; body: string };
  phone?: string;
}

interface ScanHistoryItem {
  id: number;
  raw: string;
  kind: ParsedKind;
  time: string;
}

function unescapeWifi(val: string): string {
  return val.replace(/\\([\\;,:"])/g, '$1');
}

function parseQrContent(raw: string): ParsedQr {
  const trimmed = raw.trim();

  // Wi-Fi payload: WIFI:T:WPA;S:MyNet;P:secret;H:false;;
  if (/^WIFI:/i.test(trimmed)) {
    const body = trimmed.slice(5);
    const getField = (key: string) => {
      const re = new RegExp(`(?:^|;)${key}:((?:\\\\.|[^;])*)`, 'i');
      const m = body.match(re);
      return m ? unescapeWifi(m[1]) : '';
    };
    return {
      kind: 'wifi',
      raw: trimmed,
      wifi: {
        ssid: getField('S') || 'Unknown Network',
        password: getField('P'),
        security: (getField('T') || 'Open').toUpperCase(),
        hidden: getField('H').toLowerCase() === 'true',
      },
    };
  }

  // vCard payload
  if (/^BEGIN:VCARD/i.test(trimmed)) {
    const lines = trimmed.split(/\r?\n/);
    let name = '';
    let phone = '';
    let email = '';
    let org = '';
    let url = '';
    for (const line of lines) {
      const idx = line.indexOf(':');
      if (idx === -1) continue;
      const key = line.slice(0, idx).toUpperCase();
      const val = line.slice(idx + 1).trim();
      if (key === 'FN' || key.startsWith('FN;')) name = val;
      else if (!name && (key === 'N' || key.startsWith('N;'))) {
        name = val.split(';').filter(Boolean).reverse().join(' ');
      } else if (key === 'TEL' || key.startsWith('TEL;')) {
        if (!phone) phone = val;
      } else if (key === 'EMAIL' || key.startsWith('EMAIL;')) {
        if (!email) email = val;
      } else if (key === 'ORG' || key.startsWith('ORG;')) {
        org = val.replace(/;/g, ' · ');
      } else if (key === 'URL' || key.startsWith('URL;')) {
        url = val;
      }
    }
    return {
      kind: 'vcard',
      raw: trimmed,
      vcard: { name: name || 'Contact', phone, email, org, url },
    };
  }

  // Email (mailto:)
  if (/^mailto:/i.test(trimmed)) {
    const withoutScheme = trimmed.slice(7);
    const [addr, query = ''] = withoutScheme.split('?');
    const params = new URLSearchParams(query);
    return {
      kind: 'email',
      raw: trimmed,
      email: {
        to: decodeURIComponent(addr || ''),
        subject: params.get('subject') || '',
        body: params.get('body') || '',
      },
    };
  }

  // Phone (tel:)
  if (/^tel:/i.test(trimmed)) {
    return {
      kind: 'phone',
      raw: trimmed,
      phone: trimmed.slice(4).trim(),
    };
  }

  // Safe HTTP/HTTPS URL
  if (/^https?:\/\/\S+$/i.test(trimmed)) {
    try {
      const u = new URL(trimmed);
      if (u.protocol === 'http:' || u.protocol === 'https:') {
        const host = u.hostname.replace(/^www\./i, '');
        return {
          kind: 'url',
          raw: trimmed,
          url: u.toString(),
          domain: host,
          isWhatsapp: host === 'wa.me' || host.endsWith('whatsapp.com'),
        };
      }
    } catch {
      // Fallback to text
    }
  }

  return { kind: 'text', raw: trimmed };
}

function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
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

function triggerTextDownload(content: string, fileName: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export default function QrReaderTool() {
  const [tab, setTab] = useState<ReaderTab>('upload');
  const [isDragging, setIsDragging] = useState(false);
  const [isDecoding, setIsDecoding] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Decoded output state
  const [result, setResult] = useState<ParsedQr | null>(null);
  const [previewDataUrl, setPreviewDataUrl] = useState<string | null>(null);
  const [sourceName, setSourceName] = useState<string>('');
  const [history, setHistory] = useState<ScanHistoryItem[]>([]);

  // Copy & password visibility states
  const [copiedKey, setCopiedKey] = useState<string>('');
  const [showWifiPass, setShowWifiPass] = useState(false);

  // Camera state
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const jsQrRef = useRef<JsQrFn | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimerRef = useRef<number | null>(null);
  const dragDepthRef = useRef(0);

  const ensureJsQr = async (): Promise<JsQrFn> => {
    if (!jsQrRef.current) {
      const mod = await import('jsqr');
      jsQrRef.current = (mod.default ?? mod) as unknown as JsQrFn;
    }
    return jsQrRef.current;
  };

  const recordResult = useCallback((rawText: string) => {
    const parsed = parseQrContent(rawText);
    setResult(parsed);
    setErrorMsg(null);
    setShowWifiPass(false);
    setHistory((prev) => {
      const next: ScanHistoryItem = {
        id: Date.now(),
        raw: parsed.raw,
        kind: parsed.kind,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      const filtered = prev.filter((item) => item.raw !== parsed.raw);
      return [next, ...filtered].slice(0, 8);
    });
  }, []);

  // Multi-pass QR decoder for maximum accuracy on screenshots, photos & inverted codes
  const decodeImageElement = useCallback(
    async (img: HTMLImageElement): Promise<{ raw: string; annotatedPreview: string } | null> => {
      const jsQR = await ensureJsQr();
      const natW = img.naturalWidth || img.width;
      const natH = img.naturalHeight || img.height;
      if (!natW || !natH) return null;

      const buildPreview = (
        canvas: HTMLCanvasElement,
        loc?: JsQrResult['location']
      ): string => {
        const out = document.createElement('canvas');
        const maxSide = 640;
        const ratio = Math.min(1, maxSide / Math.max(canvas.width, canvas.height));
        out.width = Math.max(1, Math.round(canvas.width * ratio));
        out.height = Math.max(1, Math.round(canvas.height * ratio));
        const oCtx = out.getContext('2d');
        if (oCtx) {
          oCtx.fillStyle = '#ffffff';
          oCtx.fillRect(0, 0, out.width, out.height);
          oCtx.drawImage(canvas, 0, 0, out.width, out.height);
          if (loc) {
            oCtx.strokeStyle = '#10b981';
            oCtx.lineWidth = Math.max(3, Math.round(out.width * 0.01));
            oCtx.lineJoin = 'round';
            oCtx.beginPath();
            oCtx.moveTo(loc.topLeftCorner.x * ratio, loc.topLeftCorner.y * ratio);
            oCtx.lineTo(loc.topRightCorner.x * ratio, loc.topRightCorner.y * ratio);
            oCtx.lineTo(loc.bottomRightCorner.x * ratio, loc.bottomRightCorner.y * ratio);
            oCtx.lineTo(loc.bottomLeftCorner.x * ratio, loc.bottomLeftCorner.y * ratio);
            oCtx.closePath();
            oCtx.stroke();
          }
        }
        const url = out.toDataURL('image/png');
        out.width = 0;
        out.height = 0;
        return url;
      };

      const maxDim = Math.max(natW, natH);
      const targetWidths = Array.from(
        new Set(
          [Math.min(maxDim, 1600), 1100, 750, 480].filter((w) => w <= maxDim || w === Math.min(maxDim, 1600))
        )
      );

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return null;

      // Pass 1: jsQR across multiple scales (handles white/transparent backgrounds + inverted codes)
      for (const maxSide of targetWidths) {
        const scale = maxDim > maxSide ? maxSide / maxDim : 1;
        const w = Math.max(1, Math.round(natW * scale));
        const h = Math.max(1, Math.round(natH * scale));
        const pad = Math.round(Math.min(w, h) * 0.06); // add safe white border in case image has no quiet zone
        canvas.width = w + pad * 2;
        canvas.height = h + pad * 2;

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, pad, pad, w, h);

        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const found = jsQR(imgData.data, canvas.width, canvas.height, {
          inversionAttempts: 'attemptBoth',
        });
        if (found && found.data) {
          const preview = buildPreview(canvas, found.location);
          canvas.width = 0;
          canvas.height = 0;
          return { raw: found.data, annotatedPreview: preview };
        }

        // High-contrast grayscale fallback for dim/low-contrast photos
        const data = imgData.data;
        for (let i = 0; i < data.length; i += 4) {
          const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          const boosted = lum < 128 ? Math.max(0, (lum - 128) * 1.8 + 128) : Math.min(255, (lum - 128) * 1.8 + 128);
          data[i] = boosted;
          data[i + 1] = boosted;
          data[i + 2] = boosted;
        }
        const boostedFound = jsQR(data, canvas.width, canvas.height, {
          inversionAttempts: 'attemptBoth',
        });
        if (boostedFound && boostedFound.data) {
          // Redraw original clean pixels for preview
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, pad, pad, w, h);
          const preview = buildPreview(canvas, boostedFound.location);
          canvas.width = 0;
          canvas.height = 0;
          return { raw: boostedFound.data, annotatedPreview: preview };
        }
      }

      // Pass 2: Native BarcodeDetector fallback (if browser supports it, great for skewed shots)
      const WinAny = window as unknown as {
        BarcodeDetector?: new (opts: { formats: string[] }) => {
          detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]>;
        };
      };
      if (typeof WinAny.BarcodeDetector === 'function') {
        try {
          const detector = new WinAny.BarcodeDetector({ formats: ['qr_code'] });
          const hits = await detector.detect(img);
          if (hits.length > 0 && hits[0].rawValue) {
            const scale = maxDim > 1000 ? 1000 / maxDim : 1;
            canvas.width = Math.max(1, Math.round(natW * scale));
            canvas.height = Math.max(1, Math.round(natH * scale));
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            const preview = buildPreview(canvas);
            canvas.width = 0;
            canvas.height = 0;
            return { raw: hits[0].rawValue, annotatedPreview: preview };
          }
        } catch {
          // Ignore unsupported BarcodeDetector errors
        }
      }

      canvas.width = 0;
      canvas.height = 0;
      return null;
    },
    []
  );

  const handleFile = useCallback(
    async (file: File) => {
      setErrorMsg(null);
      setIsDecoding(true);
      setSourceName(file.name || 'Pasted Image');

      try {
        let decodeBlob: Blob = file;
        const lower = (file.name || '').toLowerCase();
        if (
          lower.endsWith('.heic') ||
          lower.endsWith('.heif') ||
          file.type === 'image/heic' ||
          file.type === 'image/heif'
        ) {
          const { heicTo } = await import('heic-to');
          decodeBlob = await heicTo({ blob: file, type: 'image/jpeg', quality: 0.92 });
        }

        const img = await loadImageFromBlob(decodeBlob);
        const decoded = await decodeImageElement(img);

        if (decoded) {
          setPreviewDataUrl(decoded.annotatedPreview);
          recordResult(decoded.raw);
        } else {
          // Still show image preview so user sees what they uploaded
          const fallbackCanvas = document.createElement('canvas');
          const scale = Math.min(1, 520 / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
          fallbackCanvas.width = Math.max(1, Math.round((img.naturalWidth || 300) * scale));
          fallbackCanvas.height = Math.max(1, Math.round((img.naturalHeight || 300) * scale));
          const fCtx = fallbackCanvas.getContext('2d');
          if (fCtx) fCtx.drawImage(img, 0, 0, fallbackCanvas.width, fallbackCanvas.height);
          setPreviewDataUrl(fallbackCanvas.toDataURL('image/png'));
          fallbackCanvas.width = 0;
          fallbackCanvas.height = 0;
          setResult(null);
          setErrorMsg(
            'No QR code was detected in this image. Make sure the entire QR square (including all 3 corner boxes) is visible, sharp, and well-lit.'
          );
        }
      } catch {
        setResult(null);
        setPreviewDataUrl(null);
        setErrorMsg('Could not read that image file. Try a PNG, JPG, WEBP, SVG, or HEIC photo.');
      } finally {
        setIsDecoding(false);
      }
    },
    [decodeImageElement, recordResult]
  );

  // Stop live camera cleanly
  const stopCamera = useCallback(() => {
    if (scanTimerRef.current !== null) {
      window.clearInterval(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
    setCameraStarting(false);
  }, []);

  // Start live camera scanning
  const startCamera = useCallback(
    async (mode: 'environment' | 'user' = facingMode) => {
      stopCamera();
      setErrorMsg(null);

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setErrorMsg(
          'Live camera scanning is not supported in this browser. Switch to the Upload Image tab to scan from a photo or screenshot.'
        );
        return;
      }

      setCameraStarting(true);
      try {
        const jsQR = await ensureJsQr();
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: mode },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });

        streamRef.current = stream;
        setCameraActive(true);
        setCameraStarting(false);

        // Wait a tick for video element to mount
        window.requestAnimationFrame(() => {
          const video = videoRef.current;
          if (!video || !streamRef.current) return;
          video.srcObject = streamRef.current;
          void video.play().catch(() => {});

          const frameCanvas = document.createElement('canvas');
          const frameCtx = frameCanvas.getContext('2d', { willReadFrequently: true });

          scanTimerRef.current = window.setInterval(() => {
            if (!videoRef.current || !frameCtx) return;
            const v = videoRef.current;
            if (v.readyState < 2 || !v.videoWidth || !v.videoHeight) return;

            const maxW = 720;
            const scale = v.videoWidth > maxW ? maxW / v.videoWidth : 1;
            const w = Math.round(v.videoWidth * scale);
            const h = Math.round(v.videoHeight * scale);
            if (frameCanvas.width !== w || frameCanvas.height !== h) {
              frameCanvas.width = w;
              frameCanvas.height = h;
            }
            frameCtx.drawImage(v, 0, 0, w, h);
            const frameData = frameCtx.getImageData(0, 0, w, h);
            const found = jsQR(frameData.data, w, h, { inversionAttempts: 'attemptBoth' });

            if (found && found.data) {
              // Capture snapshot with green box around QR
              if (found.location) {
                frameCtx.strokeStyle = '#10b981';
                frameCtx.lineWidth = 4;
                frameCtx.beginPath();
                frameCtx.moveTo(found.location.topLeftCorner.x, found.location.topLeftCorner.y);
                frameCtx.lineTo(found.location.topRightCorner.x, found.location.topRightCorner.y);
                frameCtx.lineTo(found.location.bottomRightCorner.x, found.location.bottomRightCorner.y);
                frameCtx.lineTo(found.location.bottomLeftCorner.x, found.location.bottomLeftCorner.y);
                frameCtx.closePath();
                frameCtx.stroke();
              }
              setPreviewDataUrl(frameCanvas.toDataURL('image/jpeg', 0.88));
              setSourceName('Live Camera Capture');
              recordResult(found.data);
              frameCanvas.width = 0;
              frameCanvas.height = 0;
              stopCamera();
            }
          }, 160);
        });
      } catch (err) {
        stopCamera();
        const name = err instanceof DOMException ? err.name : '';
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
          setErrorMsg(
            'Camera permission was denied. Allow camera access in your browser address bar, or use the Upload Image tab instead.'
          );
        } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
          setErrorMsg('No camera was detected on this device. Use the Upload Image tab or press Ctrl+V to scan screenshots.');
        } else {
          setErrorMsg('Could not access the camera. Make sure no other app is using it, or upload an image instead.');
        }
      }
    },
    [facingMode, recordResult, stopCamera]
  );

  // Clean up camera on unmount or tab switch
  useEffect(() => {
    if (tab !== 'camera') stopCamera();
  }, [tab, stopCamera]);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  // Global drag-and-drop + Ctrl+V paste support in Upload mode
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const f = item.getAsFile();
          if (f) {
            e.preventDefault();
            setTab('upload');
            void handleFile(f);
            return;
          }
        }
      }
    };

    const onDragEnter = (e: DragEvent) => {
      if (e.dataTransfer?.types?.includes('Files')) {
        e.preventDefault();
        dragDepthRef.current += 1;
        setIsDragging(true);
      }
    };
    const onDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types?.includes('Files')) e.preventDefault();
    };
    const onDragLeave = () => {
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) setIsDragging(false);
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      dragDepthRef.current = 0;
      setIsDragging(false);
      const f = e.dataTransfer?.files?.[0];
      if (f) {
        setTab('upload');
        void handleFile(f);
      }
    };

    window.addEventListener('paste', onPaste);
    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('paste', onPaste);
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, [handleFile]);

  const copyValue = async (val: string, key: string) => {
    try {
      await navigator.clipboard.writeText(val);
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey((k) => (k === key ? '' : k)), 1800);
    } catch {
      // Clipboard blocked
    }
  };

  const toggleFacing = () => {
    const next = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(next);
    if (cameraActive) void startCamera(next);
  };

  const resetAll = () => {
    setResult(null);
    setPreviewDataUrl(null);
    setSourceName('');
    setErrorMsg(null);
  };

  const kindMeta: Record<ParsedKind, { label: string; icon: React.ReactNode }> = {
    url: { label: 'Website Link', icon: <LinkIcon className="w-4 h-4 text-blue-600" aria-hidden="true" /> },
    wifi: { label: 'Wi-Fi Network', icon: <Wifi className="w-4 h-4 text-blue-600" aria-hidden="true" /> },
    vcard: { label: 'Contact Card (vCard)', icon: <User className="w-4 h-4 text-blue-600" aria-hidden="true" /> },
    email: { label: 'Email Message', icon: <Mail className="w-4 h-4 text-blue-600" aria-hidden="true" /> },
    phone: { label: 'Phone Number', icon: <Phone className="w-4 h-4 text-blue-600" aria-hidden="true" /> },
    text: { label: 'Plain Text', icon: <Type className="w-4 h-4 text-blue-600" aria-hidden="true" /> },
  };

  return (
    <div className="space-y-4 animate-fade-up">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.heic,.heif,.svg"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
          e.target.value = '';
        }}
      />

      {/* Full-Screen Frosted Drag Overlay */}
      {isDragging && (
        <div className="fixed inset-0 z-50 bg-zinc-950/65 backdrop-blur-md flex items-center justify-center p-6 pointer-events-none animate-scale-in">
          <div className="max-w-md w-full rounded-3xl border border-blue-400/50 bg-white/95 dark:bg-zinc-900/95 p-10 text-center shadow-2xl">
            <div className="w-14 h-14 rounded-2xl bg-blue-600/12 text-blue-600 flex items-center justify-center mx-auto mb-4">
              <ScanLine className="w-7 h-7" aria-hidden="true" />
            </div>
            <p className="text-lg font-extrabold text-zinc-950">Drop QR image to scan</p>
            <p className="text-xs text-zinc-500 mt-1.5">Decoded 100% locally inside your browser</p>
          </div>
        </div>
      )}

      {/* Quick Mode Switcher: Generator vs Reader */}
      <div className="flex justify-center">
        <div className="inline-flex items-center p-1 rounded-2xl bg-zinc-200/70 dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 gap-1">
          <a
            href="/qr-code-generator"
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-zinc-600 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white text-xs font-semibold transition"
          >
            <QrCode className="w-3.5 h-3.5 text-blue-600" aria-hidden="true" />
            Create QR Code
          </a>
          <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-white dark:bg-zinc-950 text-zinc-950 dark:text-white text-xs font-bold shadow-xs">
            <ScanLine className="w-3.5 h-3.5 text-blue-600" aria-hidden="true" />
            Scan / Read QR
          </span>
        </div>
      </div>

      {/* Main Scanner Card */}
      <div className="studio-card rounded-3xl overflow-hidden">
        {/* Top Method Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 sm:px-7 py-3.5 border-b border-zinc-200/80 bg-zinc-50/80">
          <div className="inline-flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setTab('upload')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                tab === 'upload'
                  ? 'bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 border-transparent'
                  : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-100'
              }`}
            >
              <Upload className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Upload / Paste Image</span>
            </button>

            <button
              type="button"
              onClick={() => setTab('camera')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                tab === 'camera'
                  ? 'bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 border-transparent'
                  : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-100'
              }`}
            >
              <Camera className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Live Camera</span>
            </button>
          </div>

          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/12 text-emerald-700 dark:text-emerald-400 text-[11px] font-semibold">
            <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
            Safe Preview · No Auto-Redirect
          </span>
        </div>

        {/* 2-Column Body */}
        <div className="grid lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-zinc-200/80">
          {/* Left: Upload Dropzone or Camera Viewfinder */}
          <div className="lg:col-span-6 p-5 sm:p-7 bg-white flex flex-col justify-between gap-4">
            {tab === 'upload' ? (
              <div className="space-y-4">
                <div
                  onClick={() => fileInputRef.current?.click()}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      fileInputRef.current?.click();
                    }
                  }}
                  className="rounded-2xl border-2 border-dashed border-zinc-300 hover:border-blue-500 bg-zinc-50/70 p-7 sm:p-9 text-center cursor-pointer transition group"
                >
                  <div className="w-12 h-12 rounded-2xl bg-blue-600/10 text-blue-600 flex items-center justify-center mx-auto mb-3 group-hover:scale-105 transition-transform">
                    <Upload className="w-6 h-6" aria-hidden="true" />
                  </div>
                  <p className="text-sm font-bold text-zinc-950">
                    {isDecoding ? 'Scanning QR code...' : 'Select QR Image or Drop Anywhere'}
                  </p>
                  <p className="text-xs text-zinc-500 mt-1.5">
                    Press <kbd className="px-1.5 py-0.5 rounded bg-zinc-200/80 dark:bg-zinc-800 text-[10px] font-bold">Ctrl+V</kbd> to paste a screenshot · PNG, JPG, WEBP, SVG, HEIC
                  </p>
                  <span className="btn-studio-accent inline-flex items-center gap-1.5 mt-4 px-5 py-2 rounded-xl text-xs font-semibold">
                    <ScanLine className="w-3.5 h-3.5" aria-hidden="true" />
                    Choose QR Image
                  </span>
                </div>

                {previewDataUrl && (
                  <div className="rounded-2xl border border-zinc-200/80 bg-zinc-50/70 p-3.5 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-zinc-700 truncate max-w-[220px]">
                        {sourceName || 'Scanned image'}
                      </span>
                      <button
                        type="button"
                        onClick={resetAll}
                        className="inline-flex items-center gap-1 text-zinc-500 hover:text-red-600 font-semibold cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" aria-hidden="true" />
                        Clear
                      </button>
                    </div>
                    <div className="rounded-xl bg-white border border-zinc-200/70 p-2 flex items-center justify-center max-h-[240px] overflow-hidden">
                      <img
                        src={previewDataUrl}
                        alt="Scanned QR preview"
                        className="max-h-[220px] w-auto object-contain rounded-lg"
                      />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="relative rounded-2xl overflow-hidden bg-zinc-950 aspect-[4/3] flex items-center justify-center border border-zinc-200/80">
                  {cameraActive ? (
                    <>
                      <video
                        ref={videoRef}
                        playsInline
                        muted
                        className="w-full h-full object-cover"
                      />
                      {/* Framing Guide Overlay */}
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                        <div className="w-48 h-48 sm:w-56 sm:h-56 rounded-2xl border-2 border-emerald-400/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.38)]" />
                      </div>
                      <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-950/75 text-white text-[11px] font-semibold">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        Scanning live...
                      </span>
                    </>
                  ) : (
                    <div className="p-6 text-center space-y-3">
                      <div className="w-12 h-12 rounded-2xl bg-white/10 text-white flex items-center justify-center mx-auto">
                        <Camera className="w-6 h-6" aria-hidden="true" />
                      </div>
                      <p className="text-sm font-bold text-white">
                        {cameraStarting ? 'Requesting camera access...' : 'Point your camera at any QR code'}
                      </p>
                      <p className="text-xs text-zinc-400 max-w-xs mx-auto">
                        Video stays 100% inside your device RAM and stops automatically the moment a code is read.
                      </p>
                      <button
                        type="button"
                        disabled={cameraStarting}
                        onClick={() => void startCamera(facingMode)}
                        className="btn-studio-accent inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-semibold cursor-pointer disabled:opacity-50"
                      >
                        <Camera className="w-4 h-4" aria-hidden="true" />
                        <span>{result ? 'Scan Another QR' : 'Start Camera Scanner'}</span>
                      </button>
                    </div>
                  )}
                </div>

                {cameraActive && (
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={toggleFacing}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-100 text-xs font-semibold text-zinc-700 cursor-pointer"
                    >
                      <SwitchCamera className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Switch Camera</span>
                    </button>

                    <button
                      type="button"
                      onClick={stopCamera}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-red-200 bg-red-50 text-red-700 text-xs font-semibold cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Stop Camera</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right: Decoded Result & Smart Actions */}
          <div className="lg:col-span-6 p-5 sm:p-7 bg-zinc-50/70 flex flex-col justify-between gap-5">
            {result ? (
              <div className="space-y-4 animate-scale-in">
                <div className="flex items-center justify-between gap-2">
                  <div className="inline-flex items-center gap-2">
                    <span className="w-8 h-8 rounded-xl bg-blue-600/10 flex items-center justify-center">
                      {kindMeta[result.kind].icon}
                    </span>
                    <div>
                      <p className="text-[10.5px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                        Decoded Successfully
                      </p>
                      <p className="text-sm font-bold text-zinc-950">{kindMeta[result.kind].label}</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => void copyValue(result.raw, 'raw')}
                    className="btn-studio-primary inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold cursor-pointer"
                  >
                    {copiedKey === 'raw' ? (
                      <><Check className="w-3.5 h-3.5" aria-hidden="true" /><span>Copied!</span></>
                    ) : (
                      <><Copy className="w-3.5 h-3.5" aria-hidden="true" /><span>Copy Raw</span></>
                    )}
                  </button>
                </div>

                {/* Smart Structured View by Type */}
                {result.kind === 'url' && result.url && (
                  <div className="rounded-2xl border border-zinc-200/90 bg-white p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                        Destination Domain
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-700 dark:text-blue-400 text-[11px] font-bold">
                        {result.isWhatsapp ? 'WhatsApp Link' : result.domain}
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm font-mono break-all text-zinc-900 bg-zinc-50 border border-zinc-200/70 rounded-xl p-3">
                      {result.url}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <a
                        href={result.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-studio-accent inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold"
                      >
                        <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Open Link Safely</span>
                      </a>
                      <button
                        type="button"
                        onClick={() => void copyValue(result.url!, 'url')}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-100 text-xs font-semibold text-zinc-700 cursor-pointer"
                      >
                        {copiedKey === 'url' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedKey === 'url' ? 'Copied' : 'Copy URL'}</span>
                      </button>
                    </div>
                  </div>
                )}

                {result.kind === 'wifi' && result.wifi && (
                  <div className="rounded-2xl border border-zinc-200/90 bg-white p-4 space-y-3 text-xs">
                    <div className="flex items-center justify-between gap-2 py-1 border-b border-zinc-100">
                      <span className="text-zinc-500 font-medium">Network (SSID)</span>
                      <span className="font-bold text-zinc-950">{result.wifi.ssid}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 py-1 border-b border-zinc-100">
                      <span className="text-zinc-500 font-medium">Security</span>
                      <span className="font-semibold text-zinc-800">{result.wifi.security}</span>
                    </div>
                    {result.wifi.password && (
                      <div className="flex items-center justify-between gap-2 py-1">
                        <span className="text-zinc-500 font-medium">Password</span>
                        <div className="flex items-center gap-1.5">
                          <code className="px-2 py-0.5 rounded bg-zinc-100 font-mono text-zinc-900">
                            {showWifiPass ? result.wifi.password : '••••••••••'}
                          </code>
                          <button
                            type="button"
                            onClick={() => setShowWifiPass((s) => !s)}
                            aria-label="Toggle password"
                            className="p-1 text-zinc-500 hover:text-zinc-900 cursor-pointer"
                          >
                            {showWifiPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => void copyValue(result.wifi!.password, 'wifipass')}
                            className="px-2 py-1 rounded-lg bg-blue-600/10 text-blue-700 dark:text-blue-400 font-semibold cursor-pointer"
                          >
                            {copiedKey === 'wifipass' ? 'Copied' : 'Copy'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {result.kind === 'vcard' && result.vcard && (
                  <div className="rounded-2xl border border-zinc-200/90 bg-white p-4 space-y-3 text-xs">
                    <p className="text-sm font-bold text-zinc-950">{result.vcard.name}</p>
                    {result.vcard.org && <p className="text-zinc-500">{result.vcard.org}</p>}
                    <div className="space-y-1.5 pt-1">
                      {result.vcard.phone && <p><strong className="text-zinc-700">Phone:</strong> {result.vcard.phone}</p>}
                      {result.vcard.email && <p><strong className="text-zinc-700">Email:</strong> {result.vcard.email}</p>}
                      {result.vcard.url && <p className="break-all"><strong className="text-zinc-700">Website:</strong> {result.vcard.url}</p>}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        triggerTextDownload(
                          result.raw,
                          `${(result.vcard?.name || 'contact').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.vcf`,
                          'text/vcard;charset=utf-8'
                        )
                      }
                      className="btn-studio-accent inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Save Contact (.VCF)</span>
                    </button>
                  </div>
                )}

                {result.kind === 'email' && result.email && (
                  <div className="rounded-2xl border border-zinc-200/90 bg-white p-4 space-y-2.5 text-xs">
                    <p><strong className="text-zinc-700">To:</strong> {result.email.to}</p>
                    {result.email.subject && <p><strong className="text-zinc-700">Subject:</strong> {result.email.subject}</p>}
                    {result.email.body && <p className="text-zinc-600 whitespace-pre-wrap">{result.email.body}</p>}
                    <a
                      href={result.raw}
                      className="btn-studio-accent inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold mt-1"
                    >
                      <Mail className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Open Email App</span>
                    </a>
                  </div>
                )}

                {result.kind === 'phone' && result.phone && (
                  <div className="rounded-2xl border border-zinc-200/90 bg-white p-4 space-y-3">
                    <p className="text-base font-bold font-mono text-zinc-950">{result.phone}</p>
                    <a
                      href={`tel:${result.phone}`}
                      className="btn-studio-accent inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold"
                    >
                      <Phone className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Call Number</span>
                    </a>
                  </div>
                )}

                {result.kind === 'text' && (
                  <div className="rounded-2xl border border-zinc-200/90 bg-white p-4">
                    <pre className="text-xs sm:text-sm font-mono whitespace-pre-wrap break-words text-zinc-900 max-h-[240px] overflow-y-auto">
                      {result.raw}
                    </pre>
                  </div>
                )}

                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    onClick={() =>
                      triggerTextDownload(result.raw, 'imagelabkit-qr-decoded.txt', 'text/plain;charset=utf-8')
                    }
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-600 hover:text-zinc-950 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Download .TXT</span>
                  </button>

                  {tab === 'camera' && (
                    <button
                      type="button"
                      onClick={() => void startCamera(facingMode)}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:underline cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Scan Next</span>
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center py-10 px-4 space-y-2.5">
                <div className="w-12 h-12 rounded-2xl bg-zinc-200/70 dark:bg-zinc-800 text-zinc-400 flex items-center justify-center">
                  <QrCode className="w-6 h-6" aria-hidden="true" />
                </div>
                <p className="text-sm font-bold text-zinc-800">Decoded result appears here</p>
                <p className="text-xs text-zinc-500 max-w-[260px] leading-relaxed">
                  Upload any QR code screenshot, paste with Ctrl+V, or use your live camera to inspect links, Wi-Fi passwords, and contacts safely.
                </p>
              </div>
            )}

            {/* Session-only Recent Scans */}
            {history.length > 0 && (
              <div className="pt-4 border-t border-zinc-200/80 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                    Recent Scans (This Session)
                  </span>
                  <button
                    type="button"
                    onClick={() => setHistory([])}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-zinc-400 hover:text-red-600 cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" aria-hidden="true" />
                    Clear
                  </button>
                </div>
                <div className="space-y-1.5 max-h-[150px] overflow-y-auto">
                  {history.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-white border border-zinc-200/80 text-xs"
                    >
                      <button
                        type="button"
                        onClick={() => setResult(parseQrContent(item.raw))}
                        className="truncate text-left font-medium text-zinc-800 hover:text-blue-600 flex-1 cursor-pointer"
                      >
                        {item.raw}
                      </button>
                      <span className="text-[10.5px] text-zinc-400 shrink-0 tabular-nums">{item.time}</span>
                      <button
                        type="button"
                        onClick={() => void copyValue(item.raw, `hist-${item.id}`)}
                        aria-label="Copy scan"
                        className="p-1 text-zinc-400 hover:text-blue-600 cursor-pointer shrink-0"
                      >
                        {copiedKey === `hist-${item.id}` ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {errorMsg && (
          <div className="mx-5 sm:mx-7 mb-5 flex items-center gap-2 p-3.5 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-700 dark:text-red-400 text-xs font-medium">
            <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{errorMsg}</span>
          </div>
        )}
      </div>

      <p className="flex items-center justify-center gap-1.5 text-xs text-zinc-500">
        <Lock className="w-3.5 h-3.5 text-emerald-600 shrink-0" aria-hidden="true" />
        <span>100% Local &amp; Private · Images and camera frames never leave your device</span>
      </p>
    </div>
  );
}
