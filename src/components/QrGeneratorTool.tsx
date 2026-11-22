import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Link as LinkIcon,
  Type,
  Wifi,
  User,
  MessageCircle,
  Mail,
  Download,
  Copy,
  Check,
  Upload,
  Trash2,
  Lock,
  AlertCircle,
  Palette,
  Sparkles,
  FileCode2,
  Image as ImageIcon,
  Eye,
  EyeOff,
} from 'lucide-react';
import ContinueToMenu from './ContinueToMenu';

type QrTemplate = 'url' | 'text' | 'wifi' | 'vcard' | 'whatsapp' | 'email';
type DotStyle = 'square' | 'rounded' | 'dots' | 'classy-rounded';
type CornerStyle = 'square' | 'extra-rounded' | 'dot';
type EcLevel = 'L' | 'M' | 'Q' | 'H';

interface QrCodeInstance {
  append: (el: HTMLElement) => void;
  update: (opts: Record<string, unknown>) => void;
  getRawData: (ext: 'png' | 'svg' | 'webp' | 'jpeg') => Promise<Blob | ArrayBuffer | null>;
}

interface QrCodeCtor {
  new (opts: Record<string, unknown>): QrCodeInstance;
}

const TEMPLATES: { id: QrTemplate; label: string; icon: React.ReactNode }[] = [
  { id: 'url', label: 'URL', icon: <LinkIcon className="w-3.5 h-3.5" aria-hidden="true" /> },
  { id: 'wifi', label: 'Wi-Fi', icon: <Wifi className="w-3.5 h-3.5" aria-hidden="true" /> },
  { id: 'whatsapp', label: 'WhatsApp', icon: <MessageCircle className="w-3.5 h-3.5" aria-hidden="true" /> },
  { id: 'vcard', label: 'Contact', icon: <User className="w-3.5 h-3.5" aria-hidden="true" /> },
  { id: 'email', label: 'Email', icon: <Mail className="w-3.5 h-3.5" aria-hidden="true" /> },
  { id: 'text', label: 'Text', icon: <Type className="w-3.5 h-3.5" aria-hidden="true" /> },
];

const DOT_STYLES: { id: DotStyle; label: string }[] = [
  { id: 'rounded', label: 'Rounded' },
  { id: 'square', label: 'Classic' },
  { id: 'dots', label: 'Dots' },
  { id: 'classy-rounded', label: 'Fluid' },
];

const CORNER_STYLES: { id: CornerStyle; label: string }[] = [
  { id: 'extra-rounded', label: 'Rounded' },
  { id: 'square', label: 'Square' },
  { id: 'dot', label: 'Circle' },
];

const FG_SWATCHES = ['#09090b', '#1d4ed8', '#0f766e', '#7c3aed', '#b91c1c', '#15803d'];

function escapeWifiField(val: string): string {
  return val.replace(/([\\;,:"])/g, '\\$1');
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

function toBlobSafe(raw: Blob | ArrayBuffer | null, mime: string): Blob | null {
  if (!raw) return null;
  if (raw instanceof Blob) return raw;
  return new Blob([raw], { type: mime });
}

export default function QrGeneratorTool() {
  const [template, setTemplate] = useState<QrTemplate>('url');

  // Template fields
  const [urlVal, setUrlVal] = useState('https://imagelab-free.pages.dev');
  const [textVal, setTextVal] = useState('');
  const [wifiSsid, setWifiSsid] = useState('');
  const [wifiPass, setWifiPass] = useState('');
  const [wifiSec, setWifiSec] = useState<'WPA' | 'WEP' | 'nopass'>('WPA');
  const [showWifiPass, setShowWifiPass] = useState(false);

  const [waPhone, setWaPhone] = useState('');
  const [waMsg, setWaMsg] = useState('');

  const [vcName, setVcName] = useState('');
  const [vcPhone, setVcPhone] = useState('');
  const [vcEmail, setVcEmail] = useState('');
  const [vcOrg, setVcOrg] = useState('');
  const [vcSite, setVcSite] = useState('');

  const [mailTo, setMailTo] = useState('');
  const [mailSubject, setMailSubject] = useState('');
  const [mailBody, setMailBody] = useState('');

  // Styling controls
  const [dotStyle, setDotStyle] = useState<DotStyle>('rounded');
  const [cornerStyle, setCornerStyle] = useState<CornerStyle>('extra-rounded');
  const [fgColor, setFgColor] = useState('#09090b');
  const [bgColor, setBgColor] = useState('#ffffff');
  const [transparentBg, setTransparentBg] = useState(false);
  const [ecLevel, setEcLevel] = useState<EcLevel>('M');
  const [pngSize, setPngSize] = useState<number>(1024);

  // Center Logo
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [logoName, setLogoName] = useState<string>('');
  const [logoScale, setLogoScale] = useState<number>(36); // 20-45%

  // Feedback
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const previewRef = useRef<HTMLDivElement>(null);
  const qrCtorRef = useRef<QrCodeCtor | null>(null);
  const qrInstanceRef = useRef<QrCodeInstance | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Build final static QR payload
  const qrPayload = useMemo(() => {
    if (template === 'url') {
      const clean = urlVal.trim();
      if (!clean) return 'https://imagelab-free.pages.dev';
      return /^https?:\/\//i.test(clean) ? clean : `https://${clean}`;
    }
    if (template === 'text') {
      return textVal.trim() || 'Hello from ImageLab';
    }
    if (template === 'wifi') {
      const ssid = escapeWifiField(wifiSsid.trim() || 'MyWiFi');
      const pass = wifiSec === 'nopass' ? '' : escapeWifiField(wifiPass);
      return `WIFI:T:${wifiSec};S:${ssid};P:${pass};;`;
    }
    if (template === 'whatsapp') {
      const digits = waPhone.replace(/[^\d]/g, '');
      const base = `https://wa.me/${digits || '8801700000000'}`;
      return waMsg.trim() ? `${base}?text=${encodeURIComponent(waMsg.trim())}` : base;
    }
    if (template === 'email') {
      const params: string[] = [];
      if (mailSubject.trim()) params.push(`subject=${encodeURIComponent(mailSubject.trim())}`);
      if (mailBody.trim()) params.push(`body=${encodeURIComponent(mailBody.trim())}`);
      const q = params.length ? `?${params.join('&')}` : '';
      return `mailto:${mailTo.trim() || 'hello@example.com'}${q}`;
    }
    // vCard 3.0
    const lines = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `FN:${(vcName.trim() || 'Alex Rahman').replace(/\n/g, ' ')}`,
    ];
    if (vcOrg.trim()) lines.push(`ORG:${vcOrg.trim().replace(/\n/g, ' ')}`);
    if (vcPhone.trim()) lines.push(`TEL;TYPE=CELL:${vcPhone.trim()}`);
    if (vcEmail.trim()) lines.push(`EMAIL:${vcEmail.trim()}`);
    if (vcSite.trim()) lines.push(`URL:${vcSite.trim()}`);
    lines.push('END:VCARD');
    return lines.join('\n');
  }, [
    template,
    urlVal,
    textVal,
    wifiSsid,
    wifiPass,
    wifiSec,
    waPhone,
    waMsg,
    vcName,
    vcPhone,
    vcEmail,
    vcOrg,
    vcSite,
    mailTo,
    mailSubject,
    mailBody,
  ]);

  const effectiveEc: EcLevel = logoDataUrl ? 'H' : ecLevel;

  const buildQrConfig = (size: number, renderType: 'svg' | 'canvas') => ({
    width: size,
    height: size,
    type: renderType,
    data: qrPayload,
    margin: Math.max(8, Math.round(size * 0.045)),
    qrOptions: {
      errorCorrectionLevel: effectiveEc,
    },
    dotsOptions: {
      color: fgColor,
      type: dotStyle,
    },
    cornersSquareOptions: {
      color: fgColor,
      type: cornerStyle,
    },
    cornersDotOptions: {
      color: fgColor,
      type: cornerStyle === 'dot' ? 'dot' : 'square',
    },
    backgroundOptions: {
      color: transparentBg ? 'transparent' : bgColor,
    },
    image: logoDataUrl || undefined,
    imageOptions: {
      hideBackgroundDots: true,
      imageSize: logoScale / 100,
      margin: Math.max(4, Math.round(size * 0.015)),
    },
  });

  // Initialize & live-update crisp SVG preview
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        if (!qrCtorRef.current) {
          const mod = await import('qr-code-styling');
          const Ctor = (mod.default ?? mod) as unknown as QrCodeCtor;
          qrCtorRef.current = Ctor;
        }
        if (cancelled || !previewRef.current) return;

        const opts = buildQrConfig(280, 'svg');
        if (!qrInstanceRef.current) {
          previewRef.current.innerHTML = '';
          const inst = new qrCtorRef.current(opts);
          inst.append(previewRef.current);
          qrInstanceRef.current = inst;
        } else {
          qrInstanceRef.current.update(opts);
        }
        setErrorMsg(null);
      } catch {
        if (!cancelled) setErrorMsg('Could not render QR code. Try shortening the content.');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [qrPayload, dotStyle, cornerStyle, fgColor, bgColor, transparentBg, effectiveEc, logoDataUrl, logoScale]);

  const handleLogoUpload = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const f = files[0];
    if (logoInputRef.current) logoInputRef.current.value = '';
    if (!f.type.startsWith('image/')) {
      setErrorMsg('Please upload a PNG, JPG, WEBP, or SVG logo.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setLogoDataUrl(reader.result);
        setLogoName(f.name);
        setErrorMsg(null);
      }
    };
    reader.readAsDataURL(f);
  };

  const generateBlob = async (kind: 'png' | 'svg'): Promise<Blob | null> => {
    if (!qrCtorRef.current) {
      const mod = await import('qr-code-styling');
      qrCtorRef.current = (mod.default ?? mod) as unknown as QrCodeCtor;
    }
    const size = kind === 'svg' ? 512 : pngSize;
    const exportInst = new qrCtorRef.current(buildQrConfig(size, kind === 'svg' ? 'svg' : 'canvas'));
    const raw = await exportInst.getRawData(kind);
    return toBlobSafe(raw, kind === 'svg' ? 'image/svg+xml' : 'image/png');
  };

  const handleDownload = async (kind: 'png' | 'svg') => {
    setErrorMsg(null);
    try {
      const blob = await generateBlob(kind);
      if (!blob) throw new Error('Export failed');
      triggerDownload(blob, `imagelab-qr-${template}.${kind}`);
    } catch {
      setErrorMsg(`Failed to download ${kind.toUpperCase()} QR code.`);
    }
  };

  const handleCopyPng = async () => {
    setErrorMsg(null);
    try {
      const blob = await generateBlob('png');
      if (!blob) throw new Error('Export failed');
      if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) {
        throw new Error('Clipboard image copy is not supported in this browser.');
      }
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Could not copy image. Click Download PNG instead.'
      );
    }
  };

  return (
    <div className="space-y-4 animate-fade-up">
      <input
        ref={logoInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleLogoUpload(e.target.files)}
      />

      <div className="studio-card rounded-3xl overflow-hidden">
        {/* Top Template Selector */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 sm:px-7 py-3.5 border-b border-zinc-200/80 bg-zinc-50/80">
          <div className="flex flex-wrap items-center gap-1.5">
            {TEMPLATES.map((t) => {
              const active = template === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTemplate(t.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                    active
                      ? 'bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 border-transparent'
                      : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-100'
                  }`}
                >
                  <span className={active ? 'opacity-95' : 'text-zinc-400'}>{t.icon}</span>
                  <span>{t.label}</span>
                </button>
              );
            })}
          </div>

          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/12 text-emerald-700 dark:text-emerald-400 text-[11px] font-semibold">
            <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
            Static · Never Expires
          </span>
        </div>

        {/* Main 2-Column Studio */}
        <div className="grid lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-zinc-200/80">
          {/* Left: Content & Design Controls */}
          <div className="lg:col-span-7 p-5 sm:p-7 space-y-6 bg-white">
            {/* Dynamic Content Inputs */}
            <div className="space-y-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                1. Content
              </p>

              {template === 'url' && (
                <div>
                  <label htmlFor="qr-url" className="block text-xs font-semibold text-zinc-700 mb-1.5">
                    Website Link
                  </label>
                  <input
                    id="qr-url"
                    type="text"
                    value={urlVal}
                    onChange={(e) => setUrlVal(e.target.value)}
                    placeholder="https://yourwebsite.com"
                    className="w-full bg-zinc-50 border border-zinc-300 rounded-xl px-3.5 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  />
                </div>
              )}

              {template === 'text' && (
                <div>
                  <label htmlFor="qr-text" className="block text-xs font-semibold text-zinc-700 mb-1.5">
                    Plain Text or Note
                  </label>
                  <textarea
                    id="qr-text"
                    rows={3}
                    value={textVal}
                    onChange={(e) => setTextVal(e.target.value)}
                    placeholder="Type any message, coupon code, or instructions..."
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 rounded-xl px-3.5 py-2.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  />
                </div>
              )}

              {template === 'wifi' && (
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="wifi-ssid" className="block text-xs font-semibold text-zinc-700 mb-1">
                      Network Name (SSID)
                    </label>
                    <input
                      id="wifi-ssid"
                      type="text"
                      value={wifiSsid}
                      onChange={(e) => setWifiSsid(e.target.value)}
                      placeholder="Cafe_Guest_5G"
                      className="w-full bg-zinc-50 border border-zinc-300 rounded-xl px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor="wifi-pass" className="block text-xs font-semibold text-zinc-700 mb-1">
                      Password
                    </label>
                    <div className="relative">
                      <input
                        id="wifi-pass"
                        type={showWifiPass ? 'text' : 'password'}
                        disabled={wifiSec === 'nopass'}
                        value={wifiPass}
                        onChange={(e) => setWifiPass(e.target.value)}
                        placeholder={wifiSec === 'nopass' ? 'Open network' : 'Enter password'}
                        className="w-full bg-zinc-50 border border-zinc-300 rounded-xl pl-3 pr-9 py-2 text-sm disabled:opacity-50"
                      />
                      <button
                        type="button"
                        onClick={() => setShowWifiPass((s) => !s)}
                        aria-label="Toggle password visibility"
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 cursor-pointer"
                      >
                        {showWifiPass ? (
                          <EyeOff className="w-4 h-4" aria-hidden="true" />
                        ) : (
                          <Eye className="w-4 h-4" aria-hidden="true" />
                        )}
                      </button>
                    </div>
                  </div>
                  <div className="sm:col-span-2">
                    <span className="block text-xs font-semibold text-zinc-700 mb-1.5">Security</span>
                    <div className="inline-flex bg-zinc-200/70 dark:bg-zinc-800 p-0.5 rounded-xl gap-0.5">
                      {(
                        [
                          { id: 'WPA', label: 'WPA / WPA2' },
                          { id: 'WEP', label: 'WEP' },
                          { id: 'nopass', label: 'No Password' },
                        ] as const
                      ).map((sec) => (
                        <button
                          key={sec.id}
                          type="button"
                          onClick={() => setWifiSec(sec.id)}
                          className={`px-3 py-1.5 rounded-[10px] text-xs font-semibold cursor-pointer ${
                            wifiSec === sec.id
                              ? 'bg-white dark:bg-zinc-950 text-zinc-950 dark:text-white shadow-xs'
                              : 'text-zinc-600'
                          }`}
                        >
                          {sec.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {template === 'whatsapp' && (
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="wa-phone" className="block text-xs font-semibold text-zinc-700 mb-1">
                      Phone Number (with country code)
                    </label>
                    <input
                      id="wa-phone"
                      type="text"
                      value={waPhone}
                      onChange={(e) => setWaPhone(e.target.value)}
                      placeholder="e.g. 8801712345678"
                      className="w-full bg-zinc-50 border border-zinc-300 rounded-xl px-3 py-2 text-sm tabular-nums"
                    />
                  </div>
                  <div>
                    <label htmlFor="wa-msg" className="block text-xs font-semibold text-zinc-700 mb-1">
                      Pre-filled Message (Optional)
                    </label>
                    <input
                      id="wa-msg"
                      type="text"
                      value={waMsg}
                      onChange={(e) => setWaMsg(e.target.value)}
                      placeholder="Hi! I'd like to place an order."
                      className="w-full bg-zinc-50 border border-zinc-300 rounded-xl px-3 py-2 text-sm"
                    />
                  </div>
                </div>
              )}

              {template === 'vcard' && (
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="vc-name" className="block text-xs font-semibold text-zinc-700 mb-1">
                      Full Name
                    </label>
                    <input
                      id="vc-name"
                      type="text"
                      value={vcName}
                      onChange={(e) => setVcName(e.target.value)}
                      placeholder="Alex Rahman"
                      className="w-full bg-zinc-50 border border-zinc-300 rounded-xl px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor="vc-phone" className="block text-xs font-semibold text-zinc-700 mb-1">
                      Phone
                    </label>
                    <input
                      id="vc-phone"
                      type="text"
                      value={vcPhone}
                      onChange={(e) => setVcPhone(e.target.value)}
                      placeholder="+880 1700 000000"
                      className="w-full bg-zinc-50 border border-zinc-300 rounded-xl px-3 py-2 text-sm tabular-nums"
                    />
                  </div>
                  <div>
                    <label htmlFor="vc-email" className="block text-xs font-semibold text-zinc-700 mb-1">
                      Email
                    </label>
                    <input
                      id="vc-email"
                      type="email"
                      value={vcEmail}
                      onChange={(e) => setVcEmail(e.target.value)}
                      placeholder="alex@company.com"
                      className="w-full bg-zinc-50 border border-zinc-300 rounded-xl px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor="vc-org" className="block text-xs font-semibold text-zinc-700 mb-1">
                      Company / Role
                    </label>
                    <input
                      id="vc-org"
                      type="text"
                      value={vcOrg}
                      onChange={(e) => setVcOrg(e.target.value)}
                      placeholder="ImageLab Studio"
                      className="w-full bg-zinc-50 border border-zinc-300 rounded-xl px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label htmlFor="vc-site" className="block text-xs font-semibold text-zinc-700 mb-1">
                      Website (Optional)
                    </label>
                    <input
                      id="vc-site"
                      type="text"
                      value={vcSite}
                      onChange={(e) => setVcSite(e.target.value)}
                      placeholder="https://company.com"
                      className="w-full bg-zinc-50 border border-zinc-300 rounded-xl px-3 py-2 text-sm"
                    />
                  </div>
                </div>
              )}

              {template === 'email' && (
                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="em-to" className="block text-xs font-semibold text-zinc-700 mb-1">
                      Recipient Email
                    </label>
                    <input
                      id="em-to"
                      type="email"
                      value={mailTo}
                      onChange={(e) => setMailTo(e.target.value)}
                      placeholder="support@company.com"
                      className="w-full bg-zinc-50 border border-zinc-300 rounded-xl px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label htmlFor="em-sub" className="block text-xs font-semibold text-zinc-700 mb-1">
                      Subject (Optional)
                    </label>
                    <input
                      id="em-sub"
                      type="text"
                      value={mailSubject}
                      onChange={(e) => setMailSubject(e.target.value)}
                      placeholder="Product Inquiry"
                      className="w-full bg-zinc-50 border border-zinc-300 rounded-xl px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label htmlFor="em-body" className="block text-xs font-semibold text-zinc-700 mb-1">
                      Message (Optional)
                    </label>
                    <input
                      id="em-body"
                      type="text"
                      value={mailBody}
                      onChange={(e) => setMailBody(e.target.value)}
                      placeholder="Hello, I scanned your QR code..."
                      className="w-full bg-zinc-50 border border-zinc-300 rounded-xl px-3 py-2 text-sm"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Design & Branding */}
            <div className="space-y-4 pt-4 border-t border-zinc-200/80">
              <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                2. Style &amp; Branding
              </p>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <span className="block text-xs font-semibold text-zinc-700 mb-1.5">Dot Pattern</span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {DOT_STYLES.map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => setDotStyle(d.id)}
                        className={`py-1.5 px-2.5 rounded-xl text-xs font-semibold border cursor-pointer transition ${
                          dotStyle === d.id
                            ? 'bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 border-transparent'
                            : 'bg-zinc-50 text-zinc-700 border-zinc-200 hover:bg-zinc-100'
                        }`}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="block text-xs font-semibold text-zinc-700 mb-1.5">Corner Frame</span>
                  <div className="grid grid-cols-3 gap-1.5">
                    {CORNER_STYLES.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setCornerStyle(c.id)}
                        className={`py-1.5 px-2 rounded-xl text-xs font-semibold border cursor-pointer transition ${
                          cornerStyle === c.id
                            ? 'bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 border-transparent'
                            : 'bg-zinc-50 text-zinc-700 border-zinc-200 hover:bg-zinc-100'
                        }`}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Colors */}
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-1.5">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-700">
                    <Palette className="w-3.5 h-3.5 text-zinc-400" aria-hidden="true" />
                    Code Color
                  </span>
                  <div className="flex items-center gap-1.5">
                    {FG_SWATCHES.map((hex) => (
                      <button
                        key={hex}
                        type="button"
                        aria-label={`Use color ${hex}`}
                        onClick={() => setFgColor(hex)}
                        className={`w-6 h-6 rounded-full border-2 cursor-pointer transition ${
                          fgColor === hex ? 'border-blue-500 scale-110' : 'border-zinc-300'
                        }`}
                        style={{ backgroundColor: hex }}
                      />
                    ))}
                    <input
                      type="color"
                      aria-label="Custom QR foreground color"
                      value={fgColor}
                      onChange={(e) => setFgColor(e.target.value)}
                      className="w-7 h-7 p-0.5 rounded-lg border border-zinc-300 bg-white cursor-pointer"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <span className="block text-xs font-semibold text-zinc-700">Background</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      aria-label="Custom QR background color"
                      disabled={transparentBg}
                      value={bgColor}
                      onChange={(e) => setBgColor(e.target.value)}
                      className="w-7 h-7 p-0.5 rounded-lg border border-zinc-300 bg-white cursor-pointer disabled:opacity-40"
                    />
                    <button
                      type="button"
                      onClick={() => setTransparentBg((v) => !v)}
                      className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold border cursor-pointer transition ${
                        transparentBg
                          ? 'bg-zinc-950 dark:bg-white text-white dark:text-zinc-950 border-transparent'
                          : 'bg-zinc-50 text-zinc-700 border-zinc-200'
                      }`}
                    >
                      Transparent
                    </button>
                  </div>
                </div>
              </div>

              {/* Center Logo Upload */}
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-zinc-700">Center Logo (Optional)</span>
                  {logoDataUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        setLogoDataUrl(null);
                        setLogoName('');
                      }}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:underline cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      Remove
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => logoInputRef.current?.click()}
                    className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-dashed border-zinc-300 hover:border-blue-500 text-xs font-semibold text-zinc-700 cursor-pointer transition"
                  >
                    <Upload className="w-3.5 h-3.5 text-blue-600" aria-hidden="true" />
                    <span className="truncate max-w-[200px]">
                      {logoName ? logoName : 'Upload Logo (PNG / SVG)'}
                    </span>
                  </button>

                  {logoDataUrl && (
                    <div className="flex items-center gap-2 text-xs text-zinc-600 tabular-nums">
                      <span>Size {logoScale}%</span>
                      <input
                        type="range"
                        aria-label="Logo size"
                        min={20}
                        max={45}
                        value={logoScale}
                        onChange={(e) => setLogoScale(Number(e.target.value))}
                        className="w-24"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* PNG Size & Error Correction */}
              <div className="grid sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <span className="block text-[11px] font-semibold text-zinc-500 mb-1.5">
                    PNG Resolution
                  </span>
                  <div className="grid grid-cols-3 bg-zinc-200/70 dark:bg-zinc-800 p-0.5 rounded-xl gap-0.5">
                    {[512, 1024, 2048].map((sz) => (
                      <button
                        key={sz}
                        type="button"
                        onClick={() => setPngSize(sz)}
                        className={`py-1.5 rounded-[10px] text-xs font-semibold tabular-nums cursor-pointer ${
                          pngSize === sz
                            ? 'bg-white dark:bg-zinc-950 text-zinc-950 dark:text-white shadow-xs'
                            : 'text-zinc-600'
                        }`}
                      >
                        {sz}px
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="block text-[11px] font-semibold text-zinc-500 mb-1.5">
                    Scan Resilience {logoDataUrl ? '(Auto High)' : ''}
                  </span>
                  <div className="grid grid-cols-4 bg-zinc-200/70 dark:bg-zinc-800 p-0.5 rounded-xl gap-0.5">
                    {(['L', 'M', 'Q', 'H'] as const).map((lvl) => (
                      <button
                        key={lvl}
                        type="button"
                        disabled={Boolean(logoDataUrl)}
                        onClick={() => setEcLevel(lvl)}
                        className={`py-1.5 rounded-[10px] text-xs font-semibold cursor-pointer disabled:opacity-60 ${
                          effectiveEc === lvl
                            ? 'bg-white dark:bg-zinc-950 text-zinc-950 dark:text-white shadow-xs'
                            : 'text-zinc-600'
                        }`}
                      >
                        {lvl}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Live Preview & Export */}
          <div className="lg:col-span-5 p-6 sm:p-7 bg-zinc-50/70 flex flex-col items-center justify-between gap-6">
            <div className="w-full flex flex-col items-center gap-4">
              <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                Live Scannable Preview
              </p>

              <div
                className="p-4 rounded-3xl border border-zinc-200/90 shadow-lg flex items-center justify-center"
                style={
                  transparentBg
                    ? {
                        backgroundImage:
                          'linear-gradient(45deg, #e4e4e7 25%, #fafafa 25%), linear-gradient(-45deg, #e4e4e7 25%, #fafafa 25%), linear-gradient(45deg, #fafafa 75%, #e4e4e7 75%), linear-gradient(-45deg, #fafafa 75%, #e4e4e7 75%)',
                        backgroundSize: '18px 18px',
                        backgroundPosition: '0 0, 0 9px, 9px -9px, -9px 0px',
                      }
                    : { backgroundColor: bgColor }
                }
              >
                <div
                  ref={previewRef}
                  className="w-[240px] h-[240px] sm:w-[280px] sm:h-[280px] flex items-center justify-center [&>svg]:w-full [&>svg]:h-full"
                />
              </div>

              <p className="text-[11.5px] text-zinc-500 text-center max-w-[260px]">
                Test with your phone camera anytime. Keep dark dots on a light background for instant scanning.
              </p>
            </div>

            <div className="w-full space-y-2.5">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => void handleDownload('png')}
                  className="btn-studio-accent inline-flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-semibold cursor-pointer"
                >
                  <ImageIcon className="w-4 h-4" aria-hidden="true" />
                  <span>PNG ({pngSize}px)</span>
                </button>

                <button
                  type="button"
                  onClick={() => void handleDownload('svg')}
                  className="btn-studio-primary inline-flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-semibold cursor-pointer"
                >
                  <FileCode2 className="w-4 h-4" aria-hidden="true" />
                  <span>Vector SVG</span>
                </button>
              </div>

              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => void handleCopyPng()}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border border-zinc-200 bg-white hover:bg-zinc-100 text-xs font-semibold text-zinc-700 transition cursor-pointer"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Copy PNG</span>
                    </>
                  )}
                </button>

                <ContinueToMenu
                  compact
                  currentPath="/qr-code-generator"
                  onPrepareFile={async () => {
                    const blob = await generateBlob('png');
                    return blob ? { blob, fileName: `imagelab-qr-${template}.png` } : null;
                  }}
                />
              </div>
            </div>
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
        <span>100% Static &amp; Private · Generated locally on your device · Zero tracking redirects</span>
      </p>
    </div>
  );
}
