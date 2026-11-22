import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowRight,
  ChevronDown,
  Loader2,
  CornerDownRight,
  Crop,
  ScanText,
  EyeOff,
  Minimize2,
  Gauge,
  User,
  FileText,
} from 'lucide-react';
import { sendFileToTool } from '../engine/handoff';

interface HandoffTarget {
  path: string;
  label: string;
  desc: string;
  icon: React.ReactNode;
}

const HANDOFF_TARGETS: HandoffTarget[] = [
  {
    path: '/crop-image',
    label: 'Crop & Rotate',
    desc: 'Frame or lock aspect ratio',
    icon: <Crop className="w-3.5 h-3.5" aria-hidden="true" />,
  },
  {
    path: '/image-to-text',
    label: 'Image to Text (OCR)',
    desc: 'Extract English & বাংলা text',
    icon: <ScanText className="w-3.5 h-3.5" aria-hidden="true" />,
  },
  {
    path: '/blur-image',
    label: 'Privacy Blur & Redact',
    desc: 'Pixelate or blackout sensitive areas',
    icon: <EyeOff className="w-3.5 h-3.5" aria-hidden="true" />,
  },
  {
    path: '/image-compressor',
    label: 'Compress / Convert',
    desc: 'Optimize JPG, WEBP or PNG',
    icon: <Minimize2 className="w-3.5 h-3.5" aria-hidden="true" />,
  },
  {
    path: '/compress-image-to-50kb',
    label: 'Compress to 50KB',
    desc: 'Fit strict portal limits',
    icon: <Gauge className="w-3.5 h-3.5" aria-hidden="true" />,
  },
  {
    path: '/resize-photo-300x300',
    label: '300×300 Photo',
    desc: 'Square portrait under 100KB',
    icon: <User className="w-3.5 h-3.5" aria-hidden="true" />,
  },
  {
    path: '/image-to-pdf',
    label: 'Image to PDF',
    desc: 'Add directly to an A4 PDF',
    icon: <FileText className="w-3.5 h-3.5" aria-hidden="true" />,
  },
];

interface ContinueToMenuProps {
  onPrepareFile: () =>
    | Promise<{ blob: Blob; fileName: string } | null>
    | { blob: Blob; fileName: string }
    | null;
  currentPath?: string;
  label?: string;
  disabled?: boolean;
  compact?: boolean;
}

export default function ContinueToMenu({
  onPrepareFile,
  currentPath,
  label = 'Send to',
  disabled = false,
  compact = false,
}: ContinueToMenuProps) {
  const [open, setOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; openUp: boolean }>({
    top: 0,
    left: 0,
    openUp: false,
  });

  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const displayLabel = label === 'Next' ? 'Send to' : label;

  const activePath =
    currentPath ??
    (typeof window !== 'undefined' ? window.location.pathname.replace(/\/+$/, '') || '/' : '');

  const targets = HANDOFF_TARGETS.filter((t) => t.path !== activePath);

  const toggleMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled || isSending) return;
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const menuWidth = 268;
      const estHeight = Math.min(window.innerHeight * 0.65, targets.length * 54 + 32);
      const openUp = window.innerHeight - rect.bottom < estHeight + 16 && rect.top > estHeight;
      const left = Math.max(
        12,
        Math.min(window.innerWidth - menuWidth - 12, rect.right - menuWidth)
      );
      setCoords({
        top: openUp ? rect.top - 8 : rect.bottom + 8,
        left,
        openUp,
      });
    }
    setOpen((o) => !o);
  };

  useEffect(() => {
    if (!open) return;

    const onDocDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (btnRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onScroll = () => setOpen(false);

    document.addEventListener('mousedown', onDocDown);
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open]);

  const handleSelectTarget = async (targetPath: string) => {
    setIsSending(true);
    setOpen(false);
    try {
      const payload = await onPrepareFile();
      if (!payload) {
        setIsSending(false);
        return;
      }
      await sendFileToTool(payload.blob, payload.fileName, targetPath);
    } catch {
      setIsSending(false);
    }
  };

  const portalMenu =
    open && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{
              position: 'fixed',
              left: `${coords.left}px`,
              top: `${coords.top}px`,
              width: '268px',
              zIndex: 9999,
              transform: coords.openUp ? 'translateY(-100%)' : 'none',
            }}
            className="studio-card rounded-2xl p-1.5 shadow-2xl max-h-[65vh] overflow-y-auto animate-scale-in"
          >
            <p className="px-3 pt-1.5 pb-1 text-[10.5px] font-bold uppercase tracking-wider text-zinc-400">
              Send directly to another tool
            </p>
            {targets.map((t) => (
              <button
                key={t.path}
                type="button"
                role="menuitem"
                onClick={() => void handleSelectTarget(t.path)}
                className="w-full text-left px-2.5 py-2 rounded-xl hover:bg-zinc-100 transition flex items-center gap-2.5 group cursor-pointer"
              >
                <span className="w-7 h-7 rounded-lg bg-zinc-100 border border-zinc-200/80 text-zinc-600 group-hover:bg-blue-600 group-hover:text-white group-hover:border-blue-600 flex items-center justify-center shrink-0 transition-colors">
                  {t.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-zinc-900 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition truncate">
                    {t.label}
                  </div>
                  <div className="text-[11px] text-zinc-500 truncate">{t.desc}</div>
                </div>
                <ArrowRight
                  className="w-3.5 h-3.5 text-zinc-400 group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all shrink-0"
                  aria-hidden="true"
                />
              </button>
            ))}
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        disabled={disabled || isSending}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Send this file directly to Crop, OCR, Blur, Compress, or PDF without downloading"
        onClick={toggleMenu}
        className={`inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-100 disabled:opacity-40 font-semibold text-zinc-700 transition active:scale-[0.98] cursor-pointer ${
          compact ? 'px-3 py-2 text-xs' : 'px-4 py-2.5 text-xs sm:text-sm'
        }`}
      >
        {isSending ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" aria-hidden="true" />
            <span>Opening...</span>
          </>
        ) : (
          <>
            <CornerDownRight className="w-3.5 h-3.5 text-blue-600" aria-hidden="true" />
            <span>{displayLabel}</span>
            <ChevronDown
              className={`w-3.5 h-3.5 opacity-60 transition-transform ${open ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
          </>
        )}
      </button>

      {portalMenu}
    </>
  );
}
