import React, { useState, useRef, useEffect } from 'react';
import {
  Upload,
  Download,
  Sparkles,
  ShieldCheck,
  AlertCircle,
  Loader2,
  Trash2,
  Eye,
  Briefcase,
} from 'lucide-react';
import {
  validateImageFile,
  formatFileSize,
  downscaleForAI,
  processImage,
} from '../engine/imageEngine';

const BG_PRESETS = [
  { id: 'transparent', label: 'Transparent', value: 'transparent' },
  { id: 'white', label: 'White', value: '#ffffff' },
  { id: 'studio-blue', label: 'Studio Blue', value: '#3b82f6' },
  { id: 'light-blue', label: 'Sky Blue', value: '#93c5fd' },
  { id: 'dark', label: 'Dark', value: '#0f172a' },
];

export default function BgRemoverTool() {
  const [file, setFile] = useState<File | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [resultBlob, setResultBlob] = useState<Blob | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [bgColor, setBgColor] = useState<string>('transparent');
  const [showOriginal, setShowOriginal] = useState(false);

  const [isProcessing, setIsProcessing] = useState(false);
  const [isExportingJob, setIsExportingJob] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [progressPercent, setProgressPercent] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (originalUrl) URL.revokeObjectURL(originalUrl);
      if (resultUrl) URL.revokeObjectURL(resultUrl);
    };
  }, [originalUrl, resultUrl]);

  const handleFileSelect = (incoming: FileList | null) => {
    if (!incoming || incoming.length === 0) return;
    const picked = incoming[0];
    const err = validateImageFile(picked);
    if (err) {
      setErrorMsg(err);
      return;
    }

    setErrorMsg(null);
    setFile(picked);
    setOriginalUrl(URL.createObjectURL(picked));
    setResultBlob(null);
    setResultUrl(null);
    setShowOriginal(false);
    setBgColor('transparent');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const resetAll = () => {
    setFile(null);
    setOriginalUrl(null);
    setResultBlob(null);
    setResultUrl(null);
    setErrorMsg(null);
    setProgressPercent(0);
    setStatusText('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleRemoveBg = async () => {
    if (!file) return;
    setIsProcessing(true);
    setErrorMsg(null);
    setProgressPercent(5);
    setStatusText('Optimizing image for mobile memory...');

    try {
      // Prevent low-RAM mobile crashes on huge 12MP–48MP photos
      const safeInput = await downscaleForAI(file, 2048);

      setStatusText('Loading compact AI model (~40MB on first use, cached afterward)...');
      const { removeBackground } = await import('@imgly/background-removal');

      const blob = await removeBackground(safeInput, {
        model: 'isnet_quint8',
        progress: (key: string, current: number, total: number) => {
          if (total <= 0) return;
          const ratio = Math.min(1, current / total);
          const isFetch = key.includes('fetch');
          const mapped = isFetch ? Math.round(10 + ratio * 55) : Math.round(65 + ratio * 33);

          // Keep progress monotonic so bar never jumps backwards across files
          setProgressPercent((prev) => Math.max(prev, Math.min(99, mapped)));
          setStatusText(
            isFetch ? 'Downloading compact AI model...' : 'Separating foreground with AI...'
          );
        },
      });

      setResultBlob(blob);
      setResultUrl(URL.createObjectURL(blob));
      setProgressPercent(100);
    } catch (err) {
      console.error(err);
      setErrorMsg(
        'AI background removal failed. Please check your internet connection (needed on first run to fetch the model) or try a smaller photo.'
      );
    } finally {
      setIsProcessing(false);
      setStatusText('');
    }
  };

  const renderCompositedBlob = (fillHex: string, mime: 'image/jpeg' | 'image/png'): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      if (!resultUrl) return reject(new Error('No cutout available.'));
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas unavailable.'));

        ctx.fillStyle = fillHex;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);

        canvas.toBlob(
          (blob) => {
            canvas.width = 0;
            canvas.height = 0;
            if (blob) resolve(blob);
            else reject(new Error('Failed to render final image.'));
          },
          mime,
          0.92
        );
      };
      img.onerror = () => reject(new Error('Failed to load cutout image for export.'));
      img.src = resultUrl;
    });
  };

  const triggerDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  };

  const handleDownload = async () => {
    if (!resultBlob || !file) return;
    setErrorMsg(null);
    const baseName = file.name.replace(/\.[^/.]+$/, '');

    if (bgColor === 'transparent') {
      triggerDownload(resultBlob, `${baseName}_no_bg.png`);
      return;
    }

    try {
      const solidBlob = await renderCompositedBlob(bgColor, 'image/jpeg');
      triggerDownload(solidBlob, `${baseName}_new_bg.jpg`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Download failed.');
    }
  };

  // One-click BD Job Photo Flow: Cutout + Solid BG -> 300x300 px -> Under 100KB JPG
  const handleDownloadJobPhoto = async () => {
    if (!resultBlob || !file) return;
    setIsExportingJob(true);
    setErrorMsg(null);

    try {
      const chosenBg = bgColor === 'transparent' ? '#ffffff' : bgColor;
      const solidBlob = await renderCompositedBlob(chosenBg, 'image/jpeg');
      const baseName = file.name.replace(/\.[^/.]+$/, '');
      const tempFile = new File([solidBlob], `${baseName}_job.jpg`, { type: 'image/jpeg' });

      const jobRes = await processImage(tempFile, {
        format: 'image/jpeg',
        width: 300,
        height: 300,
        fitMode: 'cover',
        targetSizeKB: 100,
      });

      triggerDownload(jobRes.blob, `${baseName}_300x300_job.jpg`);
      URL.revokeObjectURL(jobRes.url);
      URL.revokeObjectURL(jobRes.originalUrl);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not export 300×300 job photo.');
    } finally {
      setIsExportingJob(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 sm:p-6 space-y-6">
      {/* Upload Box */}
      {!file && (
        <div
          role="button"
          tabIndex={0}
          aria-label="Upload photo for background removal"
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            handleFileSelect(e.dataTransfer.files);
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-8 sm:p-12 text-center cursor-pointer transition-all focus:outline-none focus:ring-2 focus:ring-purple-500 ${
            isDragging
              ? 'border-purple-500 bg-purple-50/60'
              : 'border-slate-300 hover:border-purple-400 hover:bg-slate-50'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleFileSelect(e.target.files)}
          />
          <div className="w-12 h-12 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center mx-auto mb-3">
            <Upload className="w-6 h-6" />
          </div>
          <p className="font-semibold text-slate-800 text-base">
            Select a Photo to Remove Background
          </p>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Portraits, Products, Logos · Runs Locally in Your Browser
          </p>
          <p className="text-[11px] text-slate-400 mt-2">
            Note: First run downloads a compact ~40MB open-source AI model from CDN (cached after).
          </p>
        </div>
      )}

      {/* Selected File Preview & Controls */}
      {file && (
        <div className="space-y-5">
          <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm">
            <div className="min-w-0">
              <p className="font-semibold text-slate-800 truncate">{file.name}</p>
              <p className="text-xs text-slate-500">{formatFileSize(file.size)}</p>
            </div>
            <button
              type="button"
              onClick={resetAll}
              disabled={isProcessing}
              className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-700 cursor-pointer shrink-0 ml-2"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Change Photo
            </button>
          </div>

          {/* Image Preview */}
          <div
            className="rounded-2xl border border-slate-200 overflow-hidden flex items-center justify-center min-h-[240px] max-h-[420px] p-3"
            style={
              resultUrl && !showOriginal
                ? bgColor === 'transparent'
                  ? {
                      backgroundImage:
                        'linear-gradient(45deg, #e2e8f0 25%, transparent 25%), linear-gradient(-45deg, #e2e8f0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #e2e8f0 75%), linear-gradient(-45deg, transparent 75%, #e2e8f0 75%)',
                      backgroundSize: '20px 20px',
                      backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0px',
                    }
                  : { backgroundColor: bgColor }
                : { backgroundColor: '#f8fafc' }
            }
          >
            <img
              src={resultUrl && !showOriginal ? resultUrl : originalUrl!}
              alt="Preview"
              className="max-h-[380px] object-contain rounded-lg"
            />
          </div>

          {/* Smooth Progress Bar */}
          {isProcessing && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-medium text-slate-600">
                <span>{statusText}</span>
                <span>{progressPercent}%</span>
              </div>
              <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple-600 transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          )}

          {/* Action Before Result */}
          {!resultUrl && (
            <button
              type="button"
              disabled={isProcessing}
              onClick={handleRemoveBg}
              className="w-full py-3.5 px-6 rounded-xl bg-purple-600 hover:bg-purple-700 disabled:bg-slate-300 text-white font-semibold text-base shadow-sm transition flex items-center justify-center gap-2 cursor-pointer"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>AI Processing...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  <span>Remove Background Free (AI)</span>
                </>
              )}
            </button>
          )}

          {/* Background Replacement & Downloads After Result */}
          {resultUrl && (
            <div className="space-y-4 border-t border-slate-200 pt-4">
              <div>
                <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                  Replace Background Color (Optional)
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  {BG_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        setBgColor(preset.value);
                        setShowOriginal(false);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer transition ${
                        bgColor === preset.value
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-white text-slate-700 border-slate-200 hover:border-slate-400'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                  <label className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 cursor-pointer">
                    <span>Custom:</span>
                    <input
                      type="color"
                      value={bgColor === 'transparent' ? '#ffffff' : bgColor}
                      onChange={(e) => {
                        setBgColor(e.target.value);
                        setShowOriginal(false);
                      }}
                      className="w-5 h-5 border-0 cursor-pointer"
                    />
                  </label>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowOriginal((prev) => !prev)}
                  className="sm:w-auto px-4 py-3 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Eye className="w-4 h-4" />
                  {showOriginal ? 'Show Result' : 'Compare Original'}
                </button>
                <button
                  type="button"
                  onClick={handleDownload}
                  className="flex-1 py-3 px-5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 shadow-sm cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  {bgColor === 'transparent'
                    ? 'Download Transparent PNG'
                    : 'Download with Background (JPG)'}
                </button>
              </div>

              {/* Direct Shortcut for Job Seekers */}
              <button
                type="button"
                disabled={isExportingJob}
                onClick={handleDownloadJobPhoto}
                className="w-full py-2.5 px-4 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                <Briefcase className="w-4 h-4" />
                {isExportingJob
                  ? 'Exporting 300×300 Job Photo...'
                  : 'One-Click Export: 300×300 Job Photo (Under 100KB JPG)'}
              </button>
            </div>
          )}
        </div>
      )}

      {errorMsg && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <p className="flex items-center justify-center gap-1.5 text-xs text-slate-500">
        <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
        <span>100% On-Device AI: Your photo never leaves your device (only the model loads from CDN).</span>
      </p>
    </div>
  );
}
