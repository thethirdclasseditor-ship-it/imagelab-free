import type { SeoToolPage } from './types';

export const COMPRESS_PAGES: SeoToolPage[] = [
  {
    slug: 'image-compressor',
    category: 'Compress',
    toolType: 'compressor',
    shortName: 'Image Compressor',
    title: 'Free Online Image Compressor (MozJPEG, WebP & PNG — No Upload) | ImageLabKit',
    metaDescription:
      'Compress JPG, PNG, WEBP, and HEIC images up to 80% smaller locally in your browser using WebAssembly MozJPEG, LibWebP, and UPNG codecs. Batch ZIP download, zero server uploads.',
    h1: 'Free Online Image Compressor',
    subtitle:
      'Shrink JPG, PNG, WEBP & HEIC images up to 80% smaller right inside your browser with WebAssembly codecs.',
    defaults: { format: 'image/webp', quality: 0.82 },
    overview: [
      'Most browser-based compressors rely on the default HTML5 canvas encoder, which leaves 30% to 50% of avoidable file bloat behind. ImageLabKit runs studio-grade WebAssembly encoders—MozJPEG for progressive JPEGs, Google’s LibWebP for modern web graphics, and UPNG perceptual palette quantization for transparent PNGs—inside isolated background Web Workers on your own device.',
      'Every photo stays strictly inside local browser memory from start to finish. Hidden camera EXIF tags, GPS location coordinates, and oversized embedded thumbnails are stripped automatically while your original pixel dimensions remain sharp and crisp.',
    ],
    useCases: [
      {
        title: 'Faster Websites & Core Web Vitals',
        desc: 'Convert bulky blog banners and Shopify product galleries into lightweight 82% WebP files to push mobile LCP under 2.5 seconds.',
      },
      {
        title: 'Lightweight Email & Slack Sharing',
        desc: 'Batch-shrink 20 high-resolution phone shots from 60 MB down to under 8 MB so attachments send instantly without bouncing.',
      },
      {
        title: 'Transparent UI & Logo Optimization',
        desc: 'Quantize heavy 2 MB PNG screenshots and app icons down to ~200 KB while preserving full alpha transparency and razor-sharp text.',
      },
    ],
    specTable: {
      headers: ['Output Format', 'WebAssembly Engine', 'Typical Savings', 'Best For'],
      rows: [
        ['WEBP (Default)', 'LibWebP', '65% – 85% smaller', 'Websites, blogs, e-commerce, transparent UI'],
        ['JPG / JPEG', 'MozJPEG (Progressive)', '55% – 78% smaller', 'Portraits, email, print shops & strict portals'],
        ['PNG (Q < 95%)', 'UPNG (256-Color Quantized)', '60% – 82% smaller', 'Flat logos, icons, charts & crisp screenshots'],
        ['PNG (Q ≥ 95%)', 'Lossless PNG', 'Metadata strip only', 'Master design handoffs before editing'],
      ],
    },
    proTips: [
      'Quality 80%–85% is the visual sweet spot—cutting file weight in half compared to 95% with virtually zero visible difference on Retina displays.',
      'Open Options to switch from quality mode to an exact target KB cap (such as 50KB, 100KB, or 200KB) or set a maximum pixel width for web banners.',
      'Use the draggable Split Compare modal at 2× zoom to inspect fine hairlines, skin tones, and UI text before downloading.',
      'Press Ctrl+V (or Cmd+V) anywhere on the page to paste and compress clipboard screenshots instantly.',
    ],
    howToSteps: [
      'Drag and drop up to 20 JPG, PNG, WEBP, AVIF, or iPhone HEIC images anywhere on the screen (up to 25 MB each).',
      'Local WebAssembly compression starts immediately; open Options to switch between WEBP, MozJPEG JPG, or PNG and adjust quality or max KB.',
      'Check clarity with Split Compare and download individual files or save the entire batch in one ZIP archive.',
    ],
    faqs: [
      {
        q: 'Why are ImageLabKit compressed files smaller than basic browser converters?',
        a: 'Basic tools call canvas.toBlob(), which skips progressive scans and trellis quantization. ImageLabKit runs Mozilla’s MozJPEG, LibWebP, and UPNG inside local WebAssembly Web Workers, removing far more invisible data bloat at the exact same sharpness.',
      },
      {
        q: 'Can I compress transparent PNG logos without turning the background white?',
        a: 'Yes. Keep Output set to WEBP or PNG to preserve 100% alpha transparency. Transparent backgrounds are only filled with clean white if you choose JPG output.',
      },
      {
        q: 'Does ImageLabKit upload my private photos to a remote server?',
        a: 'Never. Open DevTools (F12 → Network) while compressing and you will see zero file upload requests—all encoding happens locally in your browser tab.',
      },
      {
        q: 'Is there a daily file limit or watermark?',
        a: 'No. You can compress up to 20 images per batch with unlimited batches, zero signups, and zero watermarks.',
      },
    ],
    relatedGuides: [
      { label: 'MozJPEG vs LibWebP vs UPNG Compression Guide', href: '/guides/mozjpeg-vs-libwebp-vs-png-compression-guide' },
      { label: 'Fix Slow LCP in Core Web Vitals', href: '/guides/core-web-vitals-lcp-image-optimization-guide' },
      { label: 'Verify Zero-Upload Privacy in 60 Seconds', href: '/guides/verify-zero-upload-browser-tools-and-exif-privacy' },
    ],
  },

  {
    slug: 'compress-image-to-50kb',
    category: 'Compress',
    toolType: 'compressor',
    shortName: 'Compress to 50KB',
    title: 'Compress Image to 50KB Online Free (Sharp Portraits & Forms) | ImageLabKit',
    metaDescription:
      'Reduce JPG, PNG, WEBP, or iPhone HEIC photos strictly under 50KB locally in your browser without blurring faces. Binary-search MozJPEG optimization, batch ZIP export, zero uploads.',
    h1: 'Compress Image to 50KB',
    subtitle:
      'Meet strict 50KB upload limits automatically with crisp MozJPEG quality and zero server uploads.',
    defaults: { format: 'image/jpeg', targetSizeKB: 50 },
    overview: [
      'A strict 50KB file-size cap is one of the most common upload barriers on government exam portals, university admissions systems, job application forms, and HR onboarding profiles. Because modern smartphone portraits start at 3 MB to 6 MB, dragging a basic quality slider to 10% produces heavy blocky distortion around the eyes and text.',
      'ImageLabKit solves 50KB compression with a two-stage local engine: first it strips 30 KB–60 KB of invisible EXIF camera metadata, then it runs binary-search MozJPEG optimization—and proportionally scales oversized 12MP pixel dimensions only as much as needed—so every output lands cleanly under 50KB (typically 44–49 KB) with maximum visual sharpness.',
    ],
    useCases: [
      {
        title: 'Government & Competitive Exam Forms',
        desc: 'Prepare headshots and applicant photos that strictly obey 50KB maximum upload validation on the first attempt.',
      },
      {
        title: 'Job Portals & HR Onboarding',
        desc: 'Shrink phone portraits and profile avatars privately on your own device without uploading personal photos to third-party servers.',
      },
      {
        title: 'Ultra-Fast Web Thumbnails',
        desc: 'Batch-optimize author avatars, forum icons, and product catalog thumbnails under 50KB for instantaneous mobile loading.',
      },
    ],
    specTable: {
      headers: ['Parameter', 'Preset Setting', 'Why It Works'],
      rows: [
        ['Target Ceiling', 'Strictly ≤ 50 KB', 'Aims slightly below 50 KB to prevent 1000 vs 1024 byte rejections'],
        ['Output Format', 'Progressive MozJPEG (.jpg)', 'Accepted by 100% of legacy and modern upload forms'],
        ['EXIF Metadata', 'Auto-stripped locally', 'Reclaims 30–60 KB of hidden camera/GPS overhead immediately'],
        ['Batch Capacity', 'Up to 20 images + ZIP', 'Process multiple family or applicant photos in one session'],
      ],
    },
    proTips: [
      'Crop out extra wall space or messy background clutter first using Visual Crop & Rotate—more of your 50KB budget goes directly toward keeping your face sharp.',
      'Need exact 300×300 pixel dimensions in addition to a strict KB cap? Switch to our 300×300 Photo preset.',
      'iPhone HEIC photos are decoded automatically in your browser before compressing under 50KB—no separate conversion step required.',
      'Inspect eyes and scanned text at 2× zoom using Split Compare before submitting your form.',
    ],
    howToSteps: [
      'Drop one or up to 20 JPG, PNG, WEBP, or iPhone HEIC photos anywhere on this page.',
      'The local engine automatically strips EXIF metadata and binary-searches the sharpest MozJPEG settings under 50KB.',
      'Verify exact output KB on the result card, inspect with Split Compare, and click Download or Download ZIP.',
    ],
    faqs: [
      {
        q: 'Why does my compressed photo land at 46KB–49KB instead of exactly 50.0KB?',
        a: 'Different operating systems and upload servers calculate kilobytes differently (1,000 bytes vs 1,024 bytes). Landing safely between 44KB and 49.5KB guarantees strict portals accept your upload without throwing a “file exceeds 50KB” error.',
      },
      {
        q: 'Will shrinking a 4MB iPhone portrait to 50KB make my face blurry?',
        a: 'No. Instead of crushing a massive 4032×3024 image at 5% quality, ImageLabKit proportionally scales oversized dimensions when required so facial details stay crisp and natural at ~80% MozJPEG quality.',
      },
      {
        q: 'Are my personal ID portraits uploaded to any server?',
        a: 'Never. All HEIC decoding, resizing, metadata stripping, and MozJPEG compression execute 100% offline inside your browser tab.',
      },
      {
        q: 'Can I keep WebP output under 50KB for my website instead of JPG?',
        a: 'Yes. Open Options and switch Output Format from JPG to WEBP—the 50KB target ceiling stays locked while WebP delivers even sharper edges for blogs and stores.',
      },
    ],
    relatedGuides: [
      { label: 'How to Compress Photos to 20KB, 50KB & 100KB Cleanly', href: '/guides/compress-images-to-exact-kb-limits-guide' },
      { label: 'MozJPEG vs LibWebP Compression Guide', href: '/guides/mozjpeg-vs-libwebp-vs-png-compression-guide' },
    ],
  },

  {
    slug: 'compress-image-to-100kb',
    category: 'Compress',
    toolType: 'compressor',
    shortName: 'Compress to 100KB',
    title: 'Compress Image to 100KB Online Free (Documents, IDs & Blogs) | ImageLabKit',
    metaDescription:
      'Reduce JPG, PNG, WEBP, or HEIC images cleanly under 100KB right in your browser. Crisp text readability for IDs, certificates, resumes, and fast-loading blogs. Zero uploads.',
    h1: 'Compress Image to 100KB',
    subtitle:
      'Bring multi-megabyte photos and document scans cleanly under 100KB while keeping crisp detail.',
    defaults: { format: 'image/jpeg', targetSizeKB: 100 },
    overview: [
      '100KB is the universal sweet spot across modern web publishing and official document portals—large enough to hold sharp facial detail, crisp product textures, and legible single-page ID scans, yet light enough to load instantaneously on 4G mobile networks and satisfy strict application upload rules.',
      'Using local WebAssembly MozJPEG compression, ImageLabKit strips invisible camera metadata and automatically finds the highest visual quality setting that stays safely below 100KB—processing up to 20 images at once without uploading a single byte to any cloud server.',
    ],
    useCases: [
      {
        title: 'Online Job, Exam & University Portals',
        desc: 'Meet standard 100KB caps for applicant headshots, student ID photos, and single-page scanned certificates.',
      },
      {
        title: 'Blog Featured Images & Articles',
        desc: 'Keep every article image under 100KB (switch to WEBP in Options for extra clarity) to ace Google PageSpeed audits.',
      },
      {
        title: 'E-Commerce Product Galleries',
        desc: 'Shrink 4 MB DSLR studio shots to ~90 KB so Shopify, WooCommerce, and Etsy galleries render rapidly on mobile.',
      },
    ],
    specTable: {
      headers: ['Asset Type', 'Typical Original', 'After 100KB Preset', 'Recommended Format'],
      rows: [
        ['Portrait / ID Headshot', '3.5 MB JPG', '82 – 98 KB', 'JPG (MozJPEG)'],
        ['Single-Page Scan / ID', '4.2 MB Phone Photo', '88 – 99 KB', 'JPG (MozJPEG)'],
        ['Blog Hero / Product Card', '2.8 MB PNG/JPG', '80 – 98 KB', 'Switch to WEBP in Options'],
        ['iPhone Camera Shot', '2.1 MB HEIC', '85 – 99 KB', 'JPG (Auto-decoded locally)'],
      ],
    },
    proTips: [
      'For website blogs and online stores, open Options and switch output from JPG to WEBP—100KB WebP preserves noticeably sharper typography and gradients.',
      'For scanned certificates or ID cards, crop away the desk or table border around the document first so 100% of your 100KB budget sharpens the printed text.',
      'Verify small serial numbers or fine print at 2× zoom with Split Compare before uploading to an official portal.',
    ],
    howToSteps: [
      'Drag and drop up to 20 JPG, PNG, WEBP, AVIF, or HEIC images anywhere on the page.',
      'Local compression automatically strips hidden EXIF bloat and targets strictly under 100KB.',
      'Check exact output sizes and click Download or Download ZIP.',
    ],
    faqs: [
      {
        q: 'Will a scanned ID card or certificate stay readable under 100KB?',
        a: 'Yes. Standard single-page IDs and certificates remain clearly readable under 100KB once excess margins and hidden EXIF tags are removed—especially when cropped cleanly around the document.',
      },
      {
        q: 'What if my original image is already smaller than 100KB?',
        a: 'ImageLabKit displays exact before-and-after byte sizes right on each card so you can immediately see whether the optimized version saved extra space or keep your original.',
      },
      {
        q: 'Can I batch compress 20 product photos under 100KB at once?',
        a: 'Yes. Drop up to 20 files together and download all compressed images neatly packaged inside one ZIP file.',
      },
      {
        q: 'Does ImageLabKit keep copies of my uploaded documents?',
        a: 'No. Files are never uploaded—all processing runs strictly in temporary local RAM inside your browser.',
      },
    ],
    relatedGuides: [
      { label: 'How to Compress Photos to 20KB, 50KB & 100KB Cleanly', href: '/guides/compress-images-to-exact-kb-limits-guide' },
      { label: 'Fix Slow LCP in Core Web Vitals', href: '/guides/core-web-vitals-lcp-image-optimization-guide' },
    ],
  },

  {
    slug: 'compress-image-to-20kb',
    category: 'Compress',
    toolType: 'compressor',
    shortName: 'Compress to 20KB',
    title: 'Compress Image to 20KB Online Free (Signatures, Icons & Strict Forms) | ImageLabKit',
    metaDescription:
      'Shrink JPG, PNG, or WEBP photos and handwritten signatures strictly under 20KB locally in your browser. Smart dimension scaling + MozJPEG keeps strokes sharp with zero uploads.',
    h1: 'Compress Image to 20KB',
    subtitle:
      'Fit handwritten signatures, avatars, and strict portal photos safely under 20KB without unreadable blur.',
    defaults: { format: 'image/jpeg', targetSizeKB: 20 },
    overview: [
      'Hitting a 20KB ceiling is notoriously difficult because an average smartphone photo embeds 35 KB to 60 KB of invisible EXIF metadata alone—meaning a raw photo exceeds 20KB before a single pixel is even encoded. Basic compressors fail or reduce the image into an illegible smudge.',
      'ImageLabKit strips 100% of hidden EXIF overhead immediately and pairs MozJPEG binary-search compression with proportional smart scaling, keeping signatures dark, legible, and cleanly framed under 20KB (typically 16–19.5 KB) strictly on your own device.',
    ],
    useCases: [
      {
        title: 'Digital Signature Uploads',
        desc: 'Meet strict 10KB–20KB signature caps required by banking, civil service, and university registration forms.',
      },
      {
        title: 'Strict Legacy Portal Headshots',
        desc: 'Compress small applicant portraits under 20KB while preserving recognizable facial contrast.',
      },
      {
        title: 'Tiny Forum Avatars & Email Icons',
        desc: 'Produce ultra-lightweight profile pictures and email signature badges that load instantaneously.',
      },
    ],
    specTable: {
      headers: ['Source Input', 'Smart Handling Under 20KB', 'Expected Output'],
      rows: [
        ['Handwritten Signature Photo', 'Strips EXIF + auto-scales oversized width cleanly', '12 – 19 KB crisp JPG'],
        ['Smartphone Portrait (12MP)', 'Proportionally scales down before MozJPEG encode', '16 – 19.8 KB clean JPG'],
        ['Small Avatar / Badge', 'High quality retained with metadata wiped', '8 – 19 KB JPG / WEBP'],
      ],
    },
    proTips: [
      'Always crop closely around your signature or face first using Visual Crop & Rotate—eliminating blank desk margins doubles usable clarity inside 20KB.',
      'For signatures, sign with bold black ink on bright plain white paper in even daylight so the background compresses into almost zero bytes.',
      'Need exact 300×80 pixel dimensions for your signature too? Use our dedicated 300×80 Signature preset.',
    ],
    howToSteps: [
      'Select or drop your signature, avatar, or portrait photo anywhere on this page.',
      'ImageLabKit automatically removes EXIF metadata and optimizes quality + scale strictly below 20KB.',
      'Verify crispness using Split Compare and click Download.',
    ],
    faqs: [
      {
        q: 'How can a 4MB smartphone photo fit under 20KB without turning into solid blocks?',
        a: 'ImageLabKit removes hidden camera metadata first, tests optimal MozJPEG quality, and proportionally steps down oversized pixel dimensions (for example from 4000px to ~350–500px) so remaining pixels retain sharp, readable contrast.',
      },
      {
        q: 'Will my downloaded file ever exceed 20KB on strict validation servers?',
        a: 'No. The binary-search engine intentionally targets a safe margin below 20KB (usually 16–19.8 KB) so both 1,000-byte and 1,024-byte portal validators accept it cleanly.',
      },
      {
        q: 'Is it safe to compress my handwritten signature here?',
        a: 'Yes. Your handwritten signature never leaves your computer or phone—all compression executes 100% offline in browser RAM.',
      },
      {
        q: 'Can I compress to 20KB in WEBP format instead of JPG?',
        a: 'Yes—open Options and switch Output to WEBP if your target website supports modern WebP images.',
      },
    ],
    relatedGuides: [
      { label: 'How to Compress Photos to 20KB, 50KB & 100KB Cleanly', href: '/guides/compress-images-to-exact-kb-limits-guide' },
      { label: 'Sign Sensitive PDFs Locally Without Cloud Uploads', href: '/guides/gdpr-hipaa-safe-local-pdf-signing-guide' },
    ],
  },

  {
    slug: 'compress-image-to-200kb',
    category: 'Compress',
    toolType: 'compressor',
    shortName: 'Compress to 200KB',
    title: 'Compress Image to 200KB Online Free (Visa, E-Commerce & High-Res) | ImageLabKit',
    metaDescription:
      'Compress large DSLR, iPhone HEIC, and scanned document photos cleanly under 200KB locally in your browser. Ideal for US DS-160 visas (≤240KB), Shopify hero banners, and transcripts.',
    h1: 'Compress Image to 200KB',
    subtitle:
      'Shrink heavy multi-megabyte photos and high-res scans cleanly under 200KB with sharp, print-worthy detail.',
    defaults: { format: 'image/jpeg', targetSizeKB: 200 },
    overview: [
      '200KB gives modern WebAssembly encoders plenty of headroom to preserve high-resolution texture, fine document typography, and rich photographic gradients while slashing 5 MB to 15 MB camera originals by over 95%.',
      'It is the ideal ceiling for international e-visa and digital passport submissions (including US DS-160’s 240KB cap), high-resolution scanned transcripts, merged ID sheets, and desktop website hero banners that must pass Google Core Web Vitals.',
    ],
    useCases: [
      {
        title: 'US Visa (DS-160) & E-Passport Portals',
        desc: 'Stay comfortably beneath 240KB digital visa ceilings while retaining full 600×600+ biometric facial sharpness.',
      },
      {
        title: 'Scanned Certificates & Merged A4 IDs',
        desc: 'Keep multi-field documents, stamps, and micro-print razor sharp under standard 200KB university and KYC limits.',
      },
      {
        title: 'Desktop Hero Banners & Product Zooms',
        desc: 'Switch output to WEBP in Options to produce 1600px Retina hero images under 200KB for lightning-fast LCP.',
      },
    ],
    specTable: {
      headers: ['Use Case', 'Recommended Output', 'Typical Resolution Preserved'],
      rows: [
        ['US DS-160 / Visa Portrait', 'JPG (MozJPEG ≤ 200KB)', '600×600 to 1200×1200 px'],
        ['Scanned Transcript / NID Sheet', 'JPG (MozJPEG ≤ 200KB)', 'Up to 1654×2339 px (sharp text)'],
        ['Website Desktop Hero Banner', 'WEBP (LibWebP ≤ 200KB)', '1400–1600 px wide Retina'],
      ],
    },
    proTips: [
      'For website hero banners and Shopify product galleries, switch Output from JPG to WEBP in Options—200KB WebP handles crisp UI graphics and sky gradients noticeably better.',
      'Need to combine front and back of an ID card before compressing under 200KB? Build the A4 sheet in Merge Images first, then drop the exported JPG here.',
      'Press Ctrl+V to paste screenshots directly from your clipboard for one-second optimization.',
    ],
    howToSteps: [
      'Drop up to 20 large camera photos, HEIC shots, or scanned document images anywhere on the screen.',
      'ImageLabKit runs local MozJPEG binary-search optimization to keep every output safely below 200KB.',
      'Inspect clarity with Split Compare and save individual files or a batch ZIP.',
    ],
    faqs: [
      {
        q: 'Does 200KB preserve enough clarity for US DS-160 or UK visa uploads?',
        a: 'Yes. US DS-160 caps digital visa photos at 240KB, so compressing under 200KB leaves full facial clarity with zero risk of triggering a server size rejection.',
      },
      {
        q: 'Should I pick JPG or WEBP for a 200KB website banner?',
        a: 'Pick WEBP for websites and blogs (sharper text and gradients at the same 200KB budget), and keep JPG for government portals, email attachments, and print shops.',
      },
      {
        q: 'Can I batch-compress 15 high-resolution DSLR photos under 200KB at once?',
        a: 'Yes. Drop up to 20 images (up to 25 MB each) and download the entire optimized batch in one ZIP archive locally.',
      },
      {
        q: 'Is EXIF GPS data removed when compressing to 200KB?',
        a: 'Yes. Hidden GPS coordinates and camera EXIF headers are automatically stripped during local encoding.',
      },
    ],
    relatedGuides: [
      { label: 'How to Compress Photos to 20KB, 50KB & 200KB Cleanly', href: '/guides/compress-images-to-exact-kb-limits-guide' },
      { label: 'Fix Slow LCP in Core Web Vitals', href: '/guides/core-web-vitals-lcp-image-optimization-guide' },
      { label: 'Merge ID Front & Back on A4 Privately', href: '/guides/merge-id-card-front-back-a4-print-guide' },
    ],
  },
];
