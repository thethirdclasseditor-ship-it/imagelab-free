import type { ToolMode, ToolDefaults } from '../components/ToolWorkspace';

export interface SeoToolPage {
  slug: string;
  category: 'Compress' | 'Convert' | 'Resize' | 'Enhance';
  toolType: ToolMode;
  shortName: string;
  title: string;
  metaDescription: string;
  h1: string;
  subtitle: string;
  defaults: ToolDefaults;
  proTips: string[];
  howToSteps: string[];
  faqs: { q: string; a: string }[];
}

export const SEO_PAGES: SeoToolPage[] = [
  // ================= COMPRESS (MOST POPULAR FIRST) =================
  {
    slug: 'image-compressor',
    category: 'Compress',
    toolType: 'compressor',
    shortName: 'Image Compressor',
    title: 'Free Image Compressor (No Upload) | ImageLabKit',
    metaDescription:
      'Compress JPG, PNG, and WEBP images up to 80% smaller right inside your browser with crisp clarity and zero server uploads.',
    h1: 'Free Online Image Compressor',
    subtitle: 'Shrink JPG, PNG & WEBP images up to 80% smaller right inside your browser.',
    defaults: { format: 'image/webp', quality: 0.82 },
    proTips: [
      'Quality 80%–85% is the visual sweet spot—up to 70% smaller files with virtually identical clarity.',
      'PNG files automatically use smart color optimization whenever quality is set below 95%.',
      'Open Options to switch between quality presets and exact target KB caps.',
    ],
    howToSteps: [
      'Drop up to 20 images anywhere on the screen.',
      'Adjust quality or pick a target KB cap in Options if needed.',
      'Compare quality with the draggable slider and download.',
    ],
    faqs: [
      {
        q: 'Why are ImageLabKit files smaller than basic browser converters?',
        a: 'ImageLabKit uses studio-grade local compression engines running in the background to remove invisible file bloat while preserving sharp detail.',
      },
      {
        q: 'Can this compress transparent PNG files without turning backgrounds white?',
        a: 'Yes. Choosing PNG or WEBP preserves full transparency while drastically cutting file size.',
      },
    ],
  },
  {
    slug: 'compress-image-to-50kb',
    category: 'Compress',
    toolType: 'compressor',
    shortName: 'Compress to 50KB',
    title: 'Compress Image to 50KB Free Online | ImageLabKit',
    metaDescription:
      'Compress JPG, PNG, or WEBP photos to under 50KB in seconds. 100% free browser-based photo compressor with batch ZIP download and zero uploads.',
    h1: 'Compress Image to 50KB',
    subtitle: 'Meet strict 50KB upload limits automatically without uploading private photos.',
    defaults: { format: 'image/jpeg', targetSizeKB: 50 },
    proTips: [
      '50KB is a common file-size cap for online application portals, profile avatars, and lightweight web thumbnails.',
      'Hidden camera EXIF metadata is stripped automatically, leaving more room for sharp image detail inside 50KB.',
      'Need exact 300×300 pixels too? Switch to our 300×300 Photo preset.',
    ],
    howToSteps: [
      'Select or drop your photos anywhere on the screen.',
      'The 50KB max limit and high-efficiency JPG output run automatically.',
      'Check sharpness with Split Compare and click Download.',
    ],
    faqs: [
      {
        q: 'Will compressing to 50KB make my portrait blurry?',
        a: 'Our smart compression finds the highest quality level that stays under 50KB, keeping facial details much clearer than basic online tools.',
      },
      {
        q: 'Can I compress multiple images to under 50KB at once?',
        a: 'Yes, you can batch up to 20 images (max 25MB each) and save them all together in a single ZIP archive.',
      },
      {
        q: 'Does it work with iPhone HEIC photos?',
        a: 'Yes. iPhone HEIC and HEIF images are automatically decoded in your browser before compressing under 50KB.',
      },
    ],
  },
  {
    slug: 'compress-image-to-100kb',
    category: 'Compress',
    toolType: 'compressor',
    shortName: 'Compress to 100KB',
    title: 'Compress Image to 100KB Free Online | ImageLabKit',
    metaDescription:
      'Reduce photo size to under 100KB with sharp clarity locally in your browser. Batch ZIP download, zero uploads, 100% free.',
    h1: 'Compress Image to 100KB',
    subtitle: 'Bring heavy camera photos cleanly under 100KB for fast blogs, CVs, and online portals.',
    defaults: { format: 'image/jpeg', targetSizeKB: 100 },
    proTips: [
      '100KB is the sweet spot for ID portraits, scanned documents, and fast-loading product thumbnails.',
      'For blog posts and e-commerce listings, switch Output to WEBP for extra clarity under 100KB.',
      'Use Split Compare with 2× zoom to verify text readability on scanned pages.',
    ],
    howToSteps: [
      'Drop up to 20 JPG, PNG, WEBP, or HEIC images anywhere.',
      'Target max size is pre-locked at 100KB.',
      'Download ready files instantly or grab a ZIP bundle.',
    ],
    faqs: [
      {
        q: 'Does 100KB work well for scanned documents and IDs?',
        a: 'Yes. Standard single-page photos and ID scans stay clearly readable under 100KB with smart compression.',
      },
      {
        q: 'Does ImageLabKit add watermarks or require signup?',
        a: 'Never. Processing happens locally on your device with no account and zero watermarks.',
      },
    ],
  },
  {
    slug: 'compress-image-to-20kb',
    category: 'Compress',
    toolType: 'compressor',
    shortName: 'Compress to 20KB',
    title: 'Compress Image to 20KB Free Online | ImageLabKit',
    metaDescription:
      'Reduce JPG, PNG, or WEBP photo size to under 20KB locally in your browser. Free, private, and ideal for strict web forms, icons, and signatures.',
    h1: 'Compress Image to 20KB',
    subtitle: 'Shrink photos safely under 20KB on your device with smart auto-optimization.',
    defaults: { format: 'image/jpeg', targetSizeKB: 20 },
    proTips: [
      'For crisp results under 20KB, crop extra empty background around your subject or signature first.',
      'Large 12MP camera photos are automatically scaled down just enough to keep edges and details clear.',
      'Use JPG for strict web portals; choose WEBP if your website supports modern formats.',
    ],
    howToSteps: [
      'Drop one or up to 20 images anywhere on this page.',
      'Output is preset to stay at or under 20KB with smart compression.',
      'Inspect with Compare and download individually or as a ZIP.',
    ],
    faqs: [
      {
        q: 'How does ImageLabKit fit a large phone photo under 20KB?',
        a: 'It optimizes compression quality first; if quality alone cannot reach 20KB, it gently scales down pixel dimensions until your file fits cleanly under the limit.',
      },
      {
        q: 'Will my output be exactly 20.0KB or slightly under?',
        a: 'To prevent upload rejections, the engine targets at most 20KB—usually landing between 17KB and 19.9KB with the highest visual clarity possible.',
      },
      {
        q: 'Are my photos uploaded to any server?',
        a: 'No. All compression runs locally inside your browser tab with zero server uploads.',
      },
    ],
  },
  {
    slug: 'compress-image-to-30kb',
    category: 'Compress',
    toolType: 'compressor',
    shortName: 'Compress to 30KB',
    title: 'Compress Image to 30KB Free Online | ImageLabKit',
    metaDescription:
      'Compress JPG, PNG, or WEBP photos and scanned signatures to under 30KB locally in your browser. Ideal for exam forms and government portals.',
    h1: 'Compress Image to 30KB',
    subtitle: 'Fit portraits and handwritten signatures strictly under 30KB with sharp, readable edges.',
    defaults: { format: 'image/jpeg', targetSizeKB: 30 },
    proTips: [
      '30KB is a very common upload limit for admission forms, exam registrations, and digital signature boxes.',
      'Crop excess empty margins around your face or signature first so more of the 30KB budget preserves detail.',
      'Stripping hidden EXIF tags saves several kilobytes automatically.',
    ],
    howToSteps: [
      'Drop one or up to 20 photos anywhere on this page.',
      'Smart compression automatically targets strictly under 30KB.',
      'Preview clarity with Split Compare and download immediately.',
    ],
    faqs: [
      {
        q: 'Will my compressed photo stay strictly below 30KB?',
        a: 'Yes. ImageLabKit targets just below 30KB (typically 25KB–29.5KB) so strict online forms never reject your upload.',
      },
      {
        q: 'Is it safe to compress personal ID photos and signatures here?',
        a: 'Completely safe. Every step runs offline inside your browser with zero file uploads.',
      },
    ],
  },
  {
    slug: 'compress-image-to-200kb',
    category: 'Compress',
    toolType: 'compressor',
    shortName: 'Compress to 200KB',
    title: 'Compress Image to 200KB Free Online | ImageLabKit',
    metaDescription:
      'Optimize large MB camera images down to under 200KB for websites, e-commerce, and visa portals. Fast local browser processing.',
    h1: 'Compress Image to 200KB',
    subtitle: 'Shrink multi-megabyte photos to under 200KB while keeping crisp, high-resolution detail.',
    defaults: { format: 'image/jpeg', targetSizeKB: 200 },
    proTips: [
      'Ideal for e-passport/visa uploads (often capped at 240KB) and online store product images.',
      'Switching output from JPG to WEBP typically preserves noticeably finer texture at the exact same 200KB cap.',
      'Press Ctrl+V to paste screenshots directly from your clipboard.',
    ],
    howToSteps: [
      'Select or drop your large camera or design images.',
      'Auto-compression targets under 200KB immediately.',
      'Compare original vs compressed and save.',
    ],
    faqs: [
      {
        q: 'Should I use JPG or WEBP for 200KB website banners?',
        a: 'WEBP delivers sharper text and gradients than JPG at 200KB and is supported by all modern browsers.',
      },
      {
        q: 'What if my original image is already smaller than 200KB?',
        a: 'You will see the exact before and after file sizes side by side so you can decide whether to keep your smaller original or download the optimized copy.',
      },
    ],
  },
  {
    slug: 'compress-image-to-500kb',
    category: 'Compress',
    toolType: 'compressor',
    shortName: 'Compress to 500KB',
    title: 'Compress Image to 500KB Free Online | ImageLabKit',
    metaDescription:
      'Reduce high-resolution 5MB–15MB photos and scanned certificates to under 500KB without visible quality loss. 100% private browser compression.',
    h1: 'Compress Image to 500KB',
    subtitle: 'Shrink heavy DSLR photos and high-res document scans cleanly under 500KB.',
    defaults: { format: 'image/jpeg', targetSizeKB: 500 },
    proTips: [
      '500KB is the standard cap for university admission documents, NID/passport scans, and e-commerce hero photos.',
      'High-resolution details and fine text remain razor sharp at 500KB with zero visible artifacts.',
      'Batch compress up to 20 files at once and download them in a single ZIP archive.',
    ],
    howToSteps: [
      'Drop your high-resolution JPG, PNG, WEBP, or HEIC images anywhere.',
      'Automatic target-size optimization keeps every output under 500KB.',
      'Check fine details with Compare and click Download.',
    ],
    faqs: [
      {
        q: 'Will 500KB keep scanned certificates and transcripts readable?',
        a: 'Yes. 500KB provides plenty of headroom for crisp full-page scans and high-resolution photographs.',
      },
      {
        q: 'Does ImageLabKit upload my documents to a server?',
        a: 'Never. All compression happens locally on your device.',
      },
    ],
  },

  // ================= CONVERTER (MOST POPULAR FIRST) =================
  {
    slug: 'webp-to-jpg',
    category: 'Convert',
    toolType: 'converter',
    shortName: 'WEBP to JPG',
    title: 'WEBP to JPG Converter Free Online | ImageLabKit',
    metaDescription:
      'Convert WEBP images into universally compatible JPG files locally in your browser. Fast batch conversion with zero file uploads.',
    h1: 'WEBP to JPG Converter',
    subtitle: 'Turn modern WEBP downloads into standard, lightweight JPG files that open everywhere.',
    defaults: { format: 'image/jpeg', quality: 0.88 },
    proTips: [
      'Keeps converted JPG files compact and sharp—much smaller than basic screenshot saves.',
      'Transparent areas in WEBP stickers or logos are cleanly filled with solid white.',
      'Open Options to switch between Compact (72%), Balanced (85%), or High (92%) quality.',
    ],
    howToSteps: [
      'Drag and drop your WEBP files anywhere on this page.',
      'Files convert automatically into sharp, compatible .jpg images.',
      'Click Download or grab all converted JPGs in a ZIP.',
    ],
    faqs: [
      {
        q: 'Why do some apps or upload portals reject WEBP files?',
        a: 'Many older desktop programs, print shops, and upload systems only accept standard .jpg or .png formats.',
      },
      {
        q: 'What happens if my WEBP image has a transparent background?',
        a: 'Since JPG does not support transparency, ImageLabKit automatically fills transparent regions with clean white instead of black.',
      },
    ],
  },
  {
    slug: 'png-to-jpg',
    category: 'Convert',
    toolType: 'converter',
    shortName: 'PNG to JPG',
    title: 'PNG to JPG Converter Free Online | ImageLabKit',
    metaDescription:
      'Convert heavy PNG screenshots and photos into compact JPG files directly in your browser. Clean white background fill, 100% free.',
    h1: 'PNG to JPG Converter',
    subtitle: 'Turn oversized PNG screenshots into lightweight, share-ready JPG files.',
    defaults: { format: 'image/jpeg', quality: 0.86 },
    proTips: [
      'Phone and desktop screenshots saved as PNG are often 3–5MB; converting to JPG shrinks them by 70%+.',
      'Transparent regions are automatically filled with pure white so cutouts never turn black.',
      'You can also paste a screenshot directly with Ctrl+V to convert it in one second.',
    ],
    howToSteps: [
      'Drop PNG files anywhere or press Ctrl+V to paste.',
      'Automatic conversion finishes locally in milliseconds.',
      'Download your lightweight JPG files individually or as a ZIP.',
    ],
    faqs: [
      {
        q: 'Will transparent PNG areas turn black in JPG?',
        a: 'No. ImageLabKit renders a crisp white backdrop beneath transparent pixels before saving as JPG.',
      },
      {
        q: 'Are my screenshots stored anywhere?',
        a: 'Never. Everything runs offline inside your browser memory.',
      },
    ],
  },
  {
    slug: 'jpg-to-png',
    category: 'Convert',
    toolType: 'converter',
    shortName: 'JPG to PNG',
    title: 'JPG to PNG Converter Free Online | ImageLabKit',
    metaDescription:
      'Convert JPG photos to crisp PNG format right inside your browser. Batch conversion, ZIP export, zero server uploads.',
    h1: 'JPG to PNG Converter',
    subtitle: 'Convert JPEG pictures into clean PNG format locally for editing and design tools.',
    defaults: { format: 'image/png', quality: 1 },
    proTips: [
      'At 100% quality, output is true lossless PNG—ideal before editing in Canva, Figma, or Photoshop.',
      'Want smaller PNG files? Open Options and lower Quality below 95% for smart compact PNG output.',
      'Need to resize or crop afterward? Click Send to right next to Download.',
    ],
    howToSteps: [
      'Drop up to 20 JPG or JPEG photos anywhere on the page.',
      'Lossless PNG conversion starts immediately in your browser.',
      'Download individual .png files or grab a single ZIP.',
    ],
    faqs: [
      {
        q: 'Why is a lossless PNG larger than the original JPG?',
        a: 'Lossless PNG stores exact pixel values without lossy compression, which naturally uses more bytes than JPEG.',
      },
      {
        q: 'Does converting JPG to PNG remove the background automatically?',
        a: 'Format conversion preserves the image as-is without altering the background.',
      },
    ],
  },
  {
    slug: 'heic-to-jpg',
    category: 'Convert',
    toolType: 'converter',
    shortName: 'HEIC to JPG',
    title: 'HEIC to JPG Converter Free (iPhone) | ImageLabKit',
    metaDescription:
      'Convert iPhone HEIC and HEIF photos to universally compatible JPG in bulk locally inside your browser. Supports iOS 18+, batch ZIP export, zero uploads.',
    h1: 'HEIC to JPG Converter',
    subtitle: 'Turn iPhone & iPad HEIC photos into sharp JPG files locally—works on Windows, Android & Mac.',
    defaults: { format: 'image/jpeg', quality: 0.88 },
    proTips: [
      'Supports modern iPhone 15, iPhone 16, and iOS 18+ HEIC photos seamlessly across Windows, Mac, and Android.',
      'Hidden GPS location metadata is automatically stripped during conversion for extra privacy.',
      'Convert up to 20 HEIC photos at once and download them all in a single ZIP archive.',
    ],
    howToSteps: [
      'Drag and drop your .heic or .heif photos anywhere on this page.',
      'Local decoding and high-efficiency JPG conversion start automatically.',
      'Preview with Split Compare and click Download or Download ZIP.',
    ],
    faqs: [
      {
        q: 'Why can’t Windows or online forms open iPhone HEIC files?',
        a: 'Apple saves iPhone camera shots in High Efficiency Image Container (.heic) format, which many older Windows apps and web portals still reject. Converting to standard .jpg ensures universal compatibility.',
      },
      {
        q: 'Does it work with newer iPhone 15, iPhone 16, and iOS 18 HEIC photos?',
        a: 'Yes. ImageLabKit uses an up-to-date local HEIC decoder that handles modern iOS camera photos reliably.',
      },
      {
        q: 'Are my personal iPhone photos uploaded to a cloud server?',
        a: 'Never. Decoding and JPG conversion happen 100% inside your browser tab with zero server uploads.',
      },
    ],
  },
  {
    slug: 'webp-to-png',
    category: 'Convert',
    toolType: 'converter',
    shortName: 'WEBP to PNG',
    title: 'WEBP to PNG Converter Free (Transparent) | ImageLabKit',
    metaDescription:
      'Convert WEBP images, icons, and stickers to lossless PNG while preserving transparent backgrounds. 100% browser-based, batch ZIP export.',
    h1: 'WEBP to PNG Converter',
    subtitle: 'Convert transparent WEBP icons, stickers, and graphics into crisp, lossless PNG files.',
    defaults: { format: 'image/png', quality: 1 },
    proTips: [
      'Preserves full alpha transparency—perfect for logos, web icons, and stickers downloaded from browsers.',
      'Lossless 100% PNG output opens cleanly in Photoshop, Illustrator, PowerPoint, and Canva.',
      'Batch convert up to 20 WEBP files at once and download a single ZIP.',
    ],
    howToSteps: [
      'Drop one or up to 20 .webp files anywhere on this page.',
      'Transparent PNG conversion runs instantly on your device.',
      'Download individual .png files or grab a ZIP bundle.',
    ],
    faqs: [
      {
        q: 'Does WEBP to PNG preserve transparent backgrounds?',
        a: 'Yes. Transparent regions remain 100% transparent in the exported PNG file.',
      },
      {
        q: 'Is there any quality loss when converting WEBP to PNG?',
        a: 'No. PNG uses lossless encoding so every decoded pixel from your WEBP image is preserved accurately.',
      },
    ],
  },
  {
    slug: 'jpg-to-webp',
    category: 'Convert',
    toolType: 'converter',
    shortName: 'JPG to WEBP',
    title: 'JPG to WEBP Converter Free Online | ImageLabKit',
    metaDescription:
      'Convert JPG images to lightweight WEBP in bulk locally in your browser. Faster websites, better Core Web Vitals, batch ZIP export.',
    h1: 'JPG to WEBP Converter',
    subtitle: 'Cut image weight by 25%–45% for faster websites and higher PageSpeed scores.',
    defaults: { format: 'image/webp', quality: 0.85 },
    proTips: [
      'Google PageSpeed Insights recommends WEBP over JPG to improve Largest Contentful Paint (LCP).',
      'Balanced 85% WEBP quality matches high-quality JPEG visually while saving substantial bandwidth.',
      'Convert up to 20 product or blog photos at once and grab a single ZIP.',
    ],
    howToSteps: [
      'Drop your JPG or JPEG photos anywhere on the page.',
      'Instant WEBP conversion runs locally at 85% quality.',
      'Download individual .webp files or click Download ZIP.',
    ],
    faqs: [
      {
        q: 'Does WEBP conversion work on Safari and iPhone?',
        a: 'Yes. ImageLabKit encodes WEBP consistently across iPhone, Safari, macOS, Windows, and Android.',
      },
      {
        q: 'Will converting JPG to WEBP reduce image resolution?',
        a: 'No. Your original pixel width and height stay 100% intact.',
      },
    ],
  },
  {
    slug: 'png-to-webp',
    category: 'Convert',
    toolType: 'converter',
    shortName: 'PNG to WEBP',
    title: 'PNG to WEBP Converter (Transparent) | ImageLabKit',
    metaDescription:
      'Convert heavy PNG graphics and screenshots to compact WEBP while keeping transparent backgrounds intact. 100% browser-based and free.',
    h1: 'PNG to WEBP Converter',
    subtitle: 'Shrink heavy PNG logos and UI screenshots without losing transparent backgrounds.',
    defaults: { format: 'image/webp', quality: 0.88 },
    proTips: [
      'PNG screenshots often shrink by 60%–80% when converted to WEBP with zero visible blur.',
      'Full transparency is preserved—ideal for logos, icons, and cutout product shots.',
      'Use Split Compare to inspect sharp UI text before saving.',
    ],
    howToSteps: [
      'Drop one or multiple PNG files anywhere on the screen.',
      'Conversion runs automatically while keeping transparency intact.',
      'Save individual files or download all as a ZIP.',
    ],
    faqs: [
      {
        q: 'Does PNG to WEBP keep transparent backgrounds?',
        a: 'Yes. WEBP supports full transparency just like PNG at a fraction of the file size.',
      },
      {
        q: 'Is there any limit on file size?',
        a: 'You can convert up to 20 PNG files per batch, up to 25MB per file, with unlimited batches.',
      },
    ],
  },
  {
    slug: 'avif-to-jpg',
    category: 'Convert',
    toolType: 'converter',
    shortName: 'AVIF to JPG',
    title: 'AVIF to JPG Converter Free Online | ImageLabKit',
    metaDescription:
      'Convert modern AVIF images into standard JPG files directly in your browser. Compact file size, crisp quality, batch ZIP export, zero uploads.',
    h1: 'AVIF to JPG Converter',
    subtitle: 'Convert web-downloaded .avif images into universally supported .jpg files.',
    defaults: { format: 'image/jpeg', quality: 0.88 },
    proTips: [
      'Produces compact, crisp JPG files ready for desktop editors, chat apps, and upload forms.',
      'If your AVIF image has transparency, ImageLabKit automatically fills transparent areas with clean white.',
      'Open Options to switch output to PNG or WEBP or choose Compact / Balanced / High quality.',
    ],
    howToSteps: [
      'Drop one or up to 20 .avif images anywhere on the screen.',
      'High-efficiency conversion runs immediately in the background.',
      'Download individual .jpg files or grab a single ZIP.',
    ],
    faqs: [
      {
        q: 'Why do image editors or upload portals reject AVIF files?',
        a: 'AVIF is a modern web compression format supported by browsers, but many desktop editors, social apps, and upload forms still require standard JPG or PNG files.',
      },
      {
        q: 'Will converting AVIF to JPG bloat my file size?',
        a: 'AVIF compresses more aggressively than JPG, so a JPG copy is naturally slightly larger—but our smart optimization keeps the output as compact as possible.',
      },
    ],
  },
  {
    slug: 'heic-to-png',
    category: 'Convert',
    toolType: 'converter',
    shortName: 'HEIC to PNG',
    title: 'HEIC to PNG Converter Free (iPhone Lossless) | ImageLabKit',
    metaDescription:
      'Convert iPhone HEIC and HEIF photos to lossless PNG locally inside your browser. No quality degradation, batch ZIP export, zero uploads.',
    h1: 'HEIC to PNG Converter',
    subtitle: 'Convert iPhone HEIC photos into crisp, lossless PNG images for editing and design work.',
    defaults: { format: 'image/png', quality: 1 },
    proTips: [
      'Ideal when you want zero JPEG compression artifacts before editing iPhone photos in Photoshop or Figma.',
      'Hidden GPS coordinates and camera EXIF metadata are automatically removed during conversion.',
      'Need smaller files for sharing? Switch to HEIC to JPG instead.',
    ],
    howToSteps: [
      'Drop your iPhone .heic or .heif photos anywhere on this page.',
      'Local decoding and lossless PNG export start immediately.',
      'Save individual .png files or grab a batch ZIP.',
    ],
    faqs: [
      {
        q: 'When should I pick HEIC to PNG instead of HEIC to JPG?',
        a: 'Choose PNG when you need lossless quality for graphic design or repeated editing; choose JPG when you want smaller file sizes for web forms and sharing.',
      },
      {
        q: 'Are my iPhone photos sent to any external server?',
        a: 'Never. Decoding and PNG creation happen 100% locally inside your browser.',
      },
    ],
  },

  // ================= RESIZER & PRESETS =================
  {
    slug: 'resize-photo-300x300',
    category: 'Resize',
    toolType: 'resizer',
    shortName: '300×300 Photo',
    title: 'Resize Photo to 300x300 (<100KB) | ImageLabKit',
    metaDescription:
      'Resize portraits to exact 300x300 pixels under 100KB for official online forms, job applications, and profile portals. Smart crop, 100% private.',
    h1: 'Resize Photo to 300×300 Pixels',
    subtitle: 'Exact 300×300 px JPG kept under 100KB for job applications, ID portals, and profiles.',
    defaults: {
      format: 'image/jpeg',
      width: 300,
      height: 300,
      targetSizeKB: 100,
      fitMode: 'cover',
    },
    proTips: [
      'Smart Crop automatically biases upward so the top of your head is not accidentally cut off.',
      'Many official application and HR portals ask for 300×300 px JPG under 100KB—always check your target portal requirements.',
      'Want manual framing control? Open your photo in our Visual Crop tool and pick the 300×300 preset.',
    ],
    howToSteps: [
      'Select or drop your front-facing portrait photo anywhere.',
      '300×300 px dimensions, Smart Crop, and ≤100KB JPG limit run automatically.',
      'Verify framing with Compare and click Download.',
    ],
    faqs: [
      {
        q: 'Does this keep the photo strictly under 100KB?',
        a: 'Yes. ImageLabKit automatically optimizes the 300×300 JPG so it stays safely under the 100KB cap.',
      },
      {
        q: 'Will my face get stretched or cropped badly?',
        a: 'No. Smart Crop preserves natural proportions without stretching, and you can also frame manually in our Visual Crop tool.',
      },
      {
        q: 'Is it safe to use my personal portrait photo here?',
        a: 'Yes. Your photo is processed 100% locally in your browser and never leaves your phone or computer.',
      },
    ],
  },
  {
    slug: 'resize-signature-300x80',
    category: 'Resize',
    toolType: 'resizer',
    shortName: '300×80 Signature',
    title: 'Resize Signature 300x80 (<60KB) | ImageLabKit',
    metaDescription:
      'Resize your scanned signature to 300x80 pixels under 60KB with clean white padding so nothing gets cut off. 100% private browser tool.',
    h1: 'Resize Signature to 300×80 Pixels',
    subtitle: 'Exact 300×80 px JPG under 60KB using Fit + Padding so your signature never gets cropped.',
    defaults: {
      format: 'image/jpeg',
      width: 300,
      height: 80,
      targetSizeKB: 60,
      fitMode: 'contain',
    },
    proTips: [
      'Fit + Pad mode is enabled by default so wide or tall phone photos of your signature never lose strokes.',
      'For the crispest look, sign with dark ink on plain white paper and crop close to the signature before resizing.',
      'Ideal for digital documents, HR forms, and official portals requiring 300×80 px JPG under 60KB.',
    ],
    howToSteps: [
      'Upload a clear photo of your signature on white paper.',
      'ImageLabKit fits it cleanly inside 300×80 px with white padding under 60KB.',
      'Preview with Compare and download your ready-to-upload JPG.',
    ],
    faqs: [
      {
        q: 'Why does this tool use white padding instead of cropping?',
        a: 'Phone photos usually have a 4:3 shape; cropping them directly to 300×80 cuts off the top and bottom of signatures. White padding preserves every stroke intact.',
      },
      {
        q: 'Is my personal signature uploaded to any server?',
        a: 'Never. Everything runs strictly on your own device so your handwritten signature stays completely private.',
      },
    ],
  },
  {
    slug: 'passport-photo-resizer',
    category: 'Resize',
    toolType: 'resizer',
    shortName: 'Passport 600×600',
    title: 'Passport Photo Resizer (600x600) | ImageLabKit',
    metaDescription:
      'Format photos to 600x600 pixel digital passport and visa dimensions under 240KB locally in your browser. Zero upload, 100% free.',
    h1: 'Passport Photo Resizer (600×600)',
    subtitle: 'Standard 2×2 inch (600×600 px) digital passport & visa JPG kept safely under 240KB.',
    defaults: {
      format: 'image/jpeg',
      width: 600,
      height: 600,
      targetSizeKB: 240,
      fitMode: 'cover',
    },
    proTips: [
      'Matches the common 600×600 px (2×2 inch) digital requirement used by many visa and e-passport portals.',
      'Shoot against a plain white or light wall in even daylight for clean studio-style results.',
      'Need a printable 4×6 or A4 sheet? Use our Passport Photo Print Sheet tool.',
    ],
    howToSteps: [
      'Drop a well-lit front-facing portrait anywhere on the page.',
      '600×600 px Smart Crop and ≤240KB JPG optimization run automatically.',
      'Inspect with Compare and download.',
    ],
    faqs: [
      {
        q: 'Why 600×600 pixels under 240KB?',
        a: 'Many international e-visa and digital passport systems specify a minimum 600×600 square JPEG kept at or below 240KB.',
      },
      {
        q: 'Can I customize the pixel dimensions for another country?',
        a: 'Yes—open Options to type any custom width, height, or max KB limit.',
      },
    ],
  },
  {
    slug: 'youtube-thumbnail-resizer',
    category: 'Resize',
    toolType: 'resizer',
    shortName: 'YouTube 1280×720',
    title: 'YouTube Thumbnail Resizer 1280x720 | ImageLabKit',
    metaDescription:
      'Resize images to exact 1280x720 HD (16:9) YouTube thumbnail dimensions under 2MB locally in your browser. Free & fast.',
    h1: 'YouTube Thumbnail Resizer (1280×720)',
    subtitle: 'Crisp 16:9 HD 1280×720 thumbnails optimized under YouTube Studio’s 2MB limit.',
    defaults: {
      format: 'image/jpeg',
      width: 1280,
      height: 720,
      quality: 0.9,
      fitMode: 'cover',
    },
    proTips: [
      'High 90% JPG quality keeps thumbnail text razor sharp while easily staying well under YouTube’s 2MB cap.',
      'Want exact framing around a face or title? Use our Visual Crop tool with its 16:9 YouTube preset.',
      'Batch resize up to 20 video frames at once and download as a ZIP.',
    ],
    howToSteps: [
      'Drop your design or video still anywhere on the page.',
      'Output is preset to 1280×720 px (16:9 HD) with crisp JPG export.',
      'Download immediately for YouTube Studio.',
    ],
    faqs: [
      {
        q: 'What is YouTube’s recommended thumbnail resolution?',
        a: 'YouTube recommends 1280×720 pixels (16:9 aspect ratio) in JPG, PNG, or WEBP format under 2MB.',
      },
    ],
  },
  {
    slug: 'instagram-photo-resizer',
    category: 'Resize',
    toolType: 'resizer',
    shortName: 'Instagram 1080×1080',
    title: 'Instagram Photo Resizer (1080x1080) Free | ImageLabKit',
    metaDescription:
      'Resize photos to exact 1080x1080 square HD for Instagram posts and carousels locally in your browser. Batch ZIP export, zero uploads.',
    h1: 'Instagram Photo Resizer (1080×1080)',
    subtitle: 'Sharp 1080×1080 square HD photos ready for Instagram feeds, product catalogs & carousels.',
    defaults: {
      format: 'image/jpeg',
      width: 1080,
      height: 1080,
      quality: 0.9,
      fitMode: 'cover',
    },
    proTips: [
      '1080×1080 px prevents Instagram from aggressively re-compressing or blurring oversized camera uploads.',
      'Switch Fit Mode to Contain in Options if you want clean white borders around wide landscape shots.',
      'Resize up to 20 carousel slides in one batch and download them together as a ZIP.',
    ],
    howToSteps: [
      'Drop your photos anywhere on the page.',
      '1080×1080 HD Smart Crop and crisp 90% JPG export run automatically.',
      'Preview framing with Compare and download.',
    ],
    faqs: [
      {
        q: 'Can I add white borders instead of cropping my landscape photo?',
        a: 'Yes—open Options and switch Fit Mode from Cover to Contain to preserve the entire frame with clean white padding.',
      },
      {
        q: 'Can I change dimensions to 1080×1350 for portrait Instagram posts?',
        a: 'Yes. Open Options and change Height to 1350 for standard 4:5 portrait posts.',
      },
    ],
  },

  // ================= ENHANCER =================
  {
    slug: 'auto-enhance-photo',
    category: 'Enhance',
    toolType: 'enhancer',
    shortName: 'Batch Photo Enhancer',
    title: 'Auto Photo Enhancer Free Online | ImageLabKit',
    metaDescription:
      'Batch enhance photo lighting, contrast, clarity, and natural colors directly in your browser. Split-screen compare, ZIP download, zero uploads.',
    h1: 'Auto Photo Enhancer',
    subtitle: 'Give dull product or travel photos balanced contrast, clarity, and natural color pop.',
    defaults: { brightness: 106, contrast: 114, saturate: 115, sharpness: 20, warmth: 5 },
    proTips: [
      'Great for e-commerce sellers wanting consistent lighting across 10–20 product photos in one batch.',
      'Open Options to adjust any slider individually or click Reset to start fresh.',
      'Drag the Split Compare handle to inspect color balance before downloading.',
    ],
    howToSteps: [
      'Drop up to 20 photos anywhere on the screen.',
      'Balanced Auto Enhance settings run locally in seconds.',
      'Compare results and download individually or as a ZIP.',
    ],
    faqs: [
      {
        q: 'Can I batch enhance multiple product photos with identical settings?',
        a: 'Yes. Upload up to 20 images together so every product shot shares consistent brightness, contrast, and warmth.',
      },
    ],
  },
  {
    slug: 'brighten-dark-photo',
    category: 'Enhance',
    toolType: 'enhancer',
    shortName: 'Brighten Dark Photo',
    title: 'Brighten Dark Photos Free Online | ImageLabKit',
    metaDescription:
      'Fix dark, underexposed photos in batches directly in your browser. Adjust brightness, contrast, warmth, and sharpness with split-screen preview.',
    h1: 'Brighten Dark Photos Online',
    subtitle: 'Lift dark shadows and balance exposure in batches locally with zero uploads.',
    defaults: { brightness: 118, contrast: 108, saturate: 108, sharpness: 12 },
    proTips: [
      'Open Options to fine-tune Brightness, Contrast, Saturation, Sharpness, and Warmth for multiple photos at once.',
      'Use Split Compare to verify highlights stay natural and are not overexposed.',
      'Click Send to after enhancing to crop, watermark, or convert directly into a PDF.',
    ],
    howToSteps: [
      'Drop one or up to 20 dark photos anywhere on this page.',
      'Gentle brightening (+18%) and contrast lift apply automatically.',
      'Fine-tune in Options if desired and download.',
    ],
    faqs: [
      {
        q: 'Will brightening a photo shrink its resolution?',
        a: 'No. Original pixel dimensions stay completely untouched while lighting is adjusted.',
      },
      {
        q: 'Does this work on iPhone and Safari?',
        a: 'Yes. Adjustments use pixel-accurate processing so colors and lighting look identical on iPhone, Mac, Windows, and Android.',
      },
    ],
  },
];
