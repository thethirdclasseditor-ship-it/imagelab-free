export type ToolStatus = 'live' | 'soon' | 'hidden';

/**
 * Founder Control Center (Git-Backed · 0ms latency · 100% offline-safe)
 * Edit any tool status below and commit to update your site in ~45 seconds:
 * - 'live'   -> active everywhere
 * - 'soon'   -> shown with "Soon" badge in navigation
 * - 'hidden' -> hidden from navigation menus
 */
export const TOOL_STATUS: Record<string, ToolStatus> = {
  // Graphics & Generators
  '/qr-code-generator': 'live',
  '/barcode-generator': 'live',
  '/svg-to-png': 'live',
  '/favicon-generator': 'live',
  '/color-picker': 'live',

  // Image & Text Studio
  '/image-to-text': 'live',
  '/word-counter': 'live',
  '/crop-image': 'live',
  '/blur-image': 'live',
  '/exif-remover': 'live',
  '/watermark-image': 'live',
  '/remove-background': 'soon',
  '/photo-enhancer': 'soon',

  // PDF Suite
  '/sign-pdf': 'live',
  '/organize-pdf': 'live',
  '/merge-pdf': 'live',
  '/split-pdf': 'live',
  '/compress-pdf': 'live',
  '/pdf-to-jpg': 'live',
  '/image-to-pdf': 'live',
};

/** Optional slim site-wide announcement banner (set enabled: true to display) */
export const SITE_BANNER = {
  enabled: false,
  text: 'New: Free Static QR Code, Barcode & PDF Signer tools are now live.',
  href: '/qr-code-generator',
  ctaLabel: 'Try QR Studio',
};

export function getToolStatus(href: string): ToolStatus {
  const clean = href.replace(/\/+$/, '') || '/';
  return TOOL_STATUS[clean] ?? 'live';
}
