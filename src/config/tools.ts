export type ToolStatus = 'live' | 'soon' | 'hidden';

/**
 * Founder Control Center (Git-Backed · 0ms latency · 100% offline-safe)
 * Edit any tool status below and commit to update your site in ~45 seconds:
 * - 'live'   -> active everywhere (Navbar + Homepage)
 * - 'soon'   -> shown with "Soon" badge
 * - 'hidden' -> hidden from navigation menus and homepage grids
 */
export const TOOL_STATUS: Record<string, ToolStatus> = {
  // PDF Suite
  '/merge-pdf': 'live',
  '/compress-pdf': 'live',
  '/image-to-pdf': 'live',
  '/pdf-to-jpg': 'live',
  '/split-pdf': 'live',
  '/add-page-numbers-pdf': 'live',
  '/pdf-to-text': 'live',
  '/sign-pdf': 'live',
  '/organize-pdf': 'live',

  // Image & Text Studio
  '/image-to-text': 'live',
  '/merge-images': 'live',
  '/passport-photo-sheet': 'live',
  '/crop-image': 'live',
  '/word-counter': 'live',
  '/text-compare': 'live',
  '/watermark-image': 'live',
  '/blur-image': 'live',
  '/exif-remover': 'live',
  '/remove-background': 'hidden',
  '/photo-enhancer': 'hidden',

  // Graphics & Generators
  '/qr-code-generator': 'live',
  '/qr-code-reader': 'live',
  '/color-picker': 'live',
  '/barcode-generator': 'live',
  '/svg-to-png': 'live',
  '/favicon-generator': 'live',
};

/** Optional slim site-wide announcement banner (set enabled: true to display) */
export const SITE_BANNER = {
  enabled: false,
  text: 'New: QR Code Reader & Verified Static QR Generator are now live.',
  href: '/qr-code-reader',
  ctaLabel: 'Try QR Reader',
};

export function getToolStatus(href: string): ToolStatus {
  const clean = href.replace(/\/+$/, '') || '/';
  return TOOL_STATUS[clean] ?? 'live';
}
