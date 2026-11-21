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
  // ================= COMPRESS (TARGET KB) =================
  {
    slug: 'compress-image-to-20kb',
    category: 'Compress',
    toolType: 'compressor',
    shortName: 'Compress to 20KB',
    title: 'Compress Image to 20KB Free Online | ImageLab',
    metaDescription:
      'Reduce JPG, PNG, or WEBP photo size to under 20KB locally in your browser. Free, private, and ideal for strict online forms and signatures.',
    h1: 'Compress Image to 20KB',
    subtitle: 'Shrink photos safely under 20KB on your device with MozJPEG and auto-downscale.',
    defaults: { format: 'image/jpeg', targetSizeKB: 20 },
    proTips: [
      'For crisp results under 20KB, crop extra empty background around your face or signature first.',
      'Large 12MP camera photos are automatically scaled down just enough to keep text and edges readable.',
      'Use JPG for government portals; choose WEBP if your website allows modern formats.',
    ],
    howToSteps: [
      'Drop one or up to 20 images anywhere on this page.',
      'Output is preset to stay at or under 20KB using MozJPEG.',
      'Inspect with Compare and download individually or as a ZIP.',
    ],
    faqs: [
      {
        q: 'How does ImageLab fit a large phone photo under 20KB?',
        a: 'It runs binary-search MozJPEG compression first; if quality alone cannot reach 20KB, it gently downscales pixel dimensions until your file fits cleanly under the limit.',
      },
      {
        q: 'Will my output be exactly 20.0KB or slightly under?',
        a: 'To prevent portal rejections, the engine targets at most 20KB—usually landing between 17KB and 19.9KB with the highest visual clarity possible.',
      },
      {
        q: 'Are my application photos uploaded to any server?',
        a: 'No. All compression runs locally inside your browser tab with zero server uploads.',
      },
    ],
  },
  {
    slug: 'compress-image-to-50kb',
    category: 'Compress',
    toolType: 'compressor',
    shortName: 'Compress to 50KB',
    title: 'Compress Image to 50KB Free Online | ImageLab',
    metaDescription:
      'Compress JPG, PNG, or WEBP photos to under 50KB in seconds. 100% free browser-based MozJPEG compressor with batch ZIP download and zero uploads.',
    h1: 'Compress Image to 50KB',
    subtitle: 'Meet strict 50KB form upload limits automatically without uploading private photos.',
    defaults: { format: 'image/jpeg', targetSizeKB: 50 },
    proTips: [
      '50KB is the most common limit for university admission, exam admit cards, and scholarship portals.',
      'MozJPEG strips invisible EXIF camera metadata automatically, giving you sharper photos inside the 50KB budget.',
      'Need exact 300×300 pixels too? Switch to our 300×300 Job Photo preset.',
    ],
    howToSteps: [
      'Select or drop your photos anywhere on the screen.',
      'The 50KB max limit and MozJPEG encoder run automatically.',
      'Check sharpness with Split Compare and click Download.',
    ],
    faqs: [
      {
        q: 'Will compressing to 50KB make my portrait blurry?',
        a: 'Our MozJPEG encoder finds the highest quality setting that stays under 50KB, keeping facial details much clearer than standard browser converters.',
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
    title: 'Compress Image to 100KB Free Online | ImageLab',
    metaDescription:
      'Reduce photo size to under 100KB with sharp clarity using MozJPEG and LibWebP locally in your browser. Batch ZIP download, zero uploads.',
    h1: 'Compress Image to 100KB',
    subtitle: 'Bring heavy camera photos cleanly under 100KB for job portals, CVs, and fast blogs.',
    defaults: { format: 'image/jpeg', targetSizeKB: 100 },
    proTips: [
      '100KB is the sweet spot for passport portraits, NID scans, and fast-loading product thumbnails.',
      'For blog posts and e-commerce listings, switch Output Format to WEBP for extra clarity under 100KB.',
      'Use Split Compare with 2× zoom to verify text readability on scanned documents.',
    ],
    howToSteps: [
      'Drop up to 20 JPG, PNG, WEBP, or HEIC images anywhere.',
      'Target max size is pre-locked at 100KB.',
      'Download ready files instantly or grab a ZIP bundle.',
    ],
    faqs: [
      {
        q: 'Does 100KB work well for scanned documents and certificates?',
        a: 'Yes. Standard single-page A4 photos and ID cards stay clearly readable under 100KB when compressed with MozJPEG.',
      },
      {
        q: 'Does ImageLab add watermarks or require signup?',
        a: 'Never. Processing happens locally on your device with no account and zero watermarks.',
      },
    ],
  },
  {
    slug: 'compress-image-to-200kb',
    category: 'Compress',
    toolType: 'compressor',
    shortName: 'Compress to 200KB',
    title: 'Compress Image to 200KB Free Online | ImageLab',
    metaDescription:
      'Optimize large MB camera images down to under 200KB for websites, e-commerce, and visa portals. Fast browser processing with MozJPEG & WEBP.',
    h1: 'Compress Image to 200KB',
    subtitle: 'Shrink multi-megabyte photos to under 200KB while keeping crisp, high-resolution detail.',
    defaults: { format: 'image/jpeg', targetSizeKB: 200 },
    proTips: [
      'Ideal for e-passport/visa uploads (often capped at 240KB) and Shopify/Daraz product images.',
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
    slug: 'image-compressor',
    category: 'Compress',
    toolType: 'compressor',
    shortName: 'Image Compressor',
    title: 'Free Image Compressor (No Upload) | ImageLab',
    metaDescription:
      'Compress JPG, PNG, and WEBP images up to 80% smaller with MozJPEG, LibWebP, and UPNG right inside your browser. Zero server uploads.',
    h1: 'Free Online Image Compressor',
    subtitle: 'Studio-grade MozJPEG, LibWebP & UPNG compression directly inside your browser.',
    defaults: { format: 'image/webp', quality: 0.82 },
    proTips: [
      'Quality 80%–85% is the perceptual sweet spot—up to 70% smaller files with virtually identical visual clarity.',
      'PNG compression uses smart UPNG palette quantization (similar to TinyPNG) when quality is set below 95%.',
      'Open Options to switch between manual quality presets and exact target KB caps.',
    ],
    howToSteps: [
      'Drop up to 20 images anywhere on the screen.',
      'Adjust quality or pick a target KB cap in Options if needed.',
      'Compare quality with the draggable slider and download.',
    ],
    faqs: [
      {
        q: 'Why are ImageLab files smaller than basic browser converters?',
        a: 'Instead of basic HTML Canvas encoding, ImageLab runs real C++/WebAssembly MozJPEG, LibWebP, and UPNG codecs inside background Web Workers.',
      },
      {
        q: 'Can this compress transparent PNG files without turning backgrounds white?',
        a: 'Yes. Choosing PNG or WEBP preserves full transparency while drastically cutting file size.',
      },
    ],
  },

  // ================= CONVERTER =================
  {
    slug: 'jpg-to-webp',
    category: 'Convert',
    toolType: 'converter',
    shortName: 'JPG to WEBP',
    title: 'JPG to WEBP Converter Free Online | ImageLab',
    metaDescription:
      'Convert JPG images to lightweight WEBP in bulk using LibWebP locally in your browser. Faster websites, better Core Web Vitals, batch ZIP export.',
    h1: 'JPG to WEBP Converter',
    subtitle: 'Cut image weight by 25%–45% for faster websites and higher PageSpeed scores.',
    defaults: { format: 'image/webp', quality: 0.85 },
    proTips: [
      'Google PageSpeed Insights recommends WEBP over JPG to improve Largest Contentful Paint (LCP).',
      'Balanced 85% LibWebP quality matches 92% JPEG visually while saving substantial bandwidth.',
      'Convert up to 20 product or blog photos at once and grab a single ZIP.',
    ],
    howToSteps: [
      'Drop your JPG or JPEG photos anywhere on the page.',
      'Instant LibWebP conversion runs locally at 85% quality.',
      'Download individual .webp files or click Download ZIP.',
    ],
    faqs: [
      {
        q: 'Does WEBP conversion work on Safari and iPhone?',
        a: 'Yes! Because ImageLab uses WebAssembly LibWebP rather than Safari Canvas encoding, WEBP works reliably on iPhone and macOS too.',
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
    title: 'PNG to WEBP Converter (Transparent) | ImageLab',
    metaDescription:
      'Convert heavy PNG graphics and screenshots to compact WEBP while keeping transparent backgrounds intact. 100% browser-based and free.',
    h1: 'PNG to WEBP Converter',
    subtitle: 'Shrink heavy PNG logos and UI screenshots without losing transparent backgrounds.',
    defaults: { format: 'image/webp', quality: 0.88 },
    proTips: [
      'PNG screenshots often shrink by 60%–80% when converted to WEBP with zero visible blur.',
      'Full alpha transparency is preserved—ideal for logos, icons, and cutout product shots.',
      'Use Split Compare to inspect sharp UI text before saving.',
    ],
    howToSteps: [
      'Drop one or multiple PNG files anywhere on the screen.',
      'LibWebP converts them automatically while keeping transparency.',
      'Save individual files or download all as a ZIP.',
    ],
    faqs: [
      {
        q: 'Does PNG to WEBP keep transparent backgrounds?',
        a: 'Yes. WEBP supports full alpha transparency just like PNG at a fraction of the file size.',
      },
      {
        q: 'Is there any limit on file size?',
        a: 'You can convert up to 20 PNG files per batch, up to 25MB per file, with unlimited batches.',
      },
    ],
  },
  {
    slug: 'webp-to-jpg',
    category: 'Convert',
    toolType: 'converter',
    shortName: 'WEBP to JPG',
    title: 'WEBP to JPG Converter Free Online | ImageLab',
    metaDescription:
      'Convert WEBP images into universally compatible JPG files using MozJPEG locally in your browser. Fast batch conversion with zero file uploads.',
    h1: 'WEBP to JPG Converter',
    subtitle: 'Turn modern WEBP downloads into standard, lightweight JPG files that open everywhere.',
    defaults: { format: 'image/jpeg', quality: 0.88 },
    proTips: [
      'MozJPEG keeps converted JPGs compact (~2–3× smaller than standard browser Canvas exports).',
      'Transparent areas in WEBP stickers or logos are cleanly filled with solid white.',
      'Need to tweak file weight? Open Options and switch between Compact (72%), Balanced (85%), or Crisp (92%).',
    ],
    howToSteps: [
      'Drag and drop your WEBP files anywhere on this page.',
      'MozJPEG converts them automatically into sharp .jpg files.',
      'Click Download or grab all converted JPGs in a ZIP.',
    ],
    faqs: [
      {
        q: 'Why do some apps or government forms reject WEBP files?',
        a: 'Many older desktop programs, print shops, and application portals only accept standard .jpg or .png formats.',
      },
      {
        q: 'What happens if my WEBP image has a transparent background?',
        a: 'Since JPG does not support transparency, ImageLab automatically fills transparent regions with clean white instead of black.',
      },
    ],
  },
  {
    slug: 'png-to-jpg',
    category: 'Convert',
    toolType: 'converter',
    shortName: 'PNG to JPG',
    title: 'PNG to JPG Converter Free Online | ImageLab',
    metaDescription:
      'Convert heavy PNG screenshots and photos into compact MozJPEG JPG files directly in your browser. Clean white background fill, 100% free.',
    h1: 'PNG to JPG Converter',
    subtitle: 'Turn oversized PNG screenshots into lightweight, share-ready MozJPEG JPG files.',
    defaults: { format: 'image/jpeg', quality: 0.86 },
    proTips: [
      'Phone and desktop screenshots saved as PNG are often 3–5MB; converting to MozJPEG JPG shrinks them by 70%+.',
      'Transparent regions are automatically filled with pure white so cutouts never turn black.',
      'You can also paste a screenshot directly with Ctrl+V to convert it in one second.',
    ],
    howToSteps: [
      'Drop PNG files anywhere or press Ctrl+V to paste.',
      'Automatic MozJPEG conversion finishes locally in milliseconds.',
      'Download your lightweight JPG files individually or as a ZIP.',
    ],
    faqs: [
      {
        q: 'Will transparent PNG areas turn black in JPG?',
        a: 'No. ImageLab renders a crisp white backdrop beneath transparent pixels before encoding to JPG.',
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
    title: 'JPG to PNG Converter Free Online | ImageLab',
    metaDescription:
      'Convert JPG photos to crisp PNG format right inside your browser with UPNG. Batch conversion, ZIP export, zero server uploads.',
    h1: 'JPG to PNG Converter',
    subtitle: 'Convert JPEG pictures into clean PNG format locally for editing and design tools.',
    defaults: { format: 'image/png', quality: 1 },
    proTips: [
      'At 100% quality, output is true lossless PNG—ideal before editing in Canva, Figma, or Photoshop.',
      'Want smaller PNG files? Open Options and lower Quality below 95% to enable smart UPNG compression.',
      'Need a transparent background too? Try our free AI Background Remover tool.',
    ],
    howToSteps: [
      'Drop up to 20 JPG or JPEG photos anywhere on the page.',
      'Lossless PNG conversion starts immediately in a Web Worker.',
      'Download individual .png files or grab a single ZIP.',
    ],
    faqs: [
      {
        q: 'Why is a lossless PNG larger than the original JPG?',
        a: 'Lossless PNG stores exact pixel values without lossy compression, which naturally uses more bytes than JPEG.',
      },
      {
        q: 'Does converting JPG to PNG remove the background automatically?',
        a: 'Format conversion preserves the image as-is. To remove backgrounds cleanly, use our free AI Background Remover.',
      },
    ],
  },

  // ================= RESIZER & PRESETS =================
  {
    slug: 'resize-photo-300x300',
    category: 'Resize',
    toolType: 'resizer',
    shortName: '300×300 Job Photo',
    title: 'Resize Photo to 300x300 (<100KB) | ImageLab',
    metaDescription:
      'Resize your portrait to 300x300 pixels under 100KB for BD govt job, BCS, Teletalk, and exam portals. Smart top-biased crop, 100% private.',
    h1: 'Resize Photo to 300×300 Pixels',
    subtitle: 'Exact 300×300 px JPG kept under 100KB—ideal for BCS, Teletalk, bank & exam portals.',
    defaults: {
      format: 'image/jpeg',
      width: 300,
      height: 300,
      targetSizeKB: 100,
      fitMode: 'cover',
    },
    proTips: [
      'Smart Portrait Crop automatically biases upward so the top of your head is not accidentally cut off.',
      'Most Bangladesh government & Teletalk circulars ask for 300×300 px JPG under 100KB (always double-check your specific circular).',
      'Need a clean white or light-blue background first? Use AI Background Remover and click its 1-click 300×300 export.',
    ],
    howToSteps: [
      'Select or drop your front-facing portrait photo anywhere.',
      '300×300 px dimensions, Smart Portrait Crop, and ≤100KB JPG limit run automatically.',
      'Verify framing with Compare and click Download.',
    ],
    faqs: [
      {
        q: 'Does this match Teletalk and Bangladesh govt job photo rules?',
        a: 'Usually yes—most Teletalk, BCS, and bank job portals require 300×300 pixel JPG photos under 100KB. Always confirm the latest circular instructions before submitting.',
      },
      {
        q: 'Will my face get stretched or cropped badly?',
        a: 'No. Smart Portrait Crop preserves natural proportions without stretching, and you can also frame manually in our Visual Crop tool.',
      },
      {
        q: 'Is it safe to use my personal passport photo here?',
        a: 'Yes. Your photo is processed 100% locally in your browser and never leaves your phone or computer.',
      },
    ],
  },
  {
    slug: 'resize-signature-300x80',
    category: 'Resize',
    toolType: 'resizer',
    shortName: '300×80 Signature',
    title: 'Resize Signature 300x80 (<60KB) | ImageLab',
    metaDescription:
      'Resize your scanned signature to 300x80 pixels under 60KB with clean white padding so nothing gets cut off. 100% private browser tool.',
    h1: 'Resize Signature to 300×80 Pixels',
    subtitle: 'Exact 300×80 px JPG under 60KB using Fit + White Padding so your signature never gets cropped.',
    defaults: {
      format: 'image/jpeg',
      width: 300,
      height: 80,
      targetSizeKB: 60,
      fitMode: 'contain',
    },
    proTips: [
      'Fit + White Padding (contain mode) is enabled by default so wide or tall phone photos of your signature never lose strokes.',
      'For the crispest look, sign with dark ink on plain white paper and crop close to the signature before resizing.',
      'Most Bangladesh job and admission portals accept 300×80 px JPG under 60KB (verify your specific notice).',
    ],
    howToSteps: [
      'Upload a clear photo of your signature on white paper.',
      'ImageLab fits it cleanly inside 300×80 px with white padding under 60KB.',
      'Preview with Compare and download your portal-ready JPG.',
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
    title: 'Passport Photo Resizer (600x600) | ImageLab',
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
      'Matches the common 600×600 px (300 DPI for 2×2 inch) digital requirement used by US visa and many e-passport portals.',
      'Need a pure white background? Run your portrait through AI Background Remover first and pick White.',
      'Check exact framing with our Visual Crop tool if your subject is off-center.',
    ],
    howToSteps: [
      'Drop a well-lit front-facing portrait anywhere on the page.',
      '600×600 px Smart Portrait Crop and ≤240KB JPG optimization run automatically.',
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
    title: 'YouTube Thumbnail Resizer 1280x720 | ImageLab',
    metaDescription:
      'Resize images to exact 1280x720 HD (16:9) YouTube thumbnail dimensions under 2MB using MozJPEG locally in your browser. Free & fast.',
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
      'MozJPEG at 90% keeps thumbnail text razor sharp while easily staying well under YouTube’s 2MB cap.',
      'Want exact framing around a face or title? Use our Visual Crop tool with its 16:9 YouTube preset.',
      'Batch resize up to 20 video frames at once and download as a ZIP.',
    ],
    howToSteps: [
      'Drop your design or video still anywhere on the page.',
      'Output is preset to 1280×720 px (16:9 HD) with crisp MozJPEG.',
      'Download immediately for YouTube Studio.',
    ],
    faqs: [
      {
        q: 'What is YouTube’s recommended thumbnail resolution?',
        a: 'YouTube recommends 1280×720 pixels (16:9 aspect ratio) in JPG, PNG, or WEBP format under 2MB.',
      },
    ],
  },

  // ================= ENHANCER =================
  {
    slug: 'brighten-dark-photo',
    category: 'Enhance',
    toolType: 'enhancer',
    shortName: 'Brighten Dark Photo',
    title: 'Brighten Dark Photos Free Online | ImageLab',
    metaDescription:
      'Fix dark, underexposed photos in batches directly in your browser. Adjust brightness, contrast, warmth, and sharpness with split-screen preview.',
    h1: 'Brighten Dark Photos Online',
    subtitle: 'Lift dark shadows and balance exposure in batches locally with zero uploads.',
    defaults: { brightness: 118, contrast: 108, saturate: 108, sharpness: 12 },
    proTips: [
      'Open Options to fine-tune Brightness, Contrast, Saturation, Sharpness, and Warmth for multiple photos at once.',
      'Have a blurry or low-resolution photo? Try our dedicated AI Photo Enhancer for neural super-resolution.',
      'Use Split Compare to verify highlights are not blown out.',
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
        a: 'Yes. ImageLab uses pixel-accurate math rather than unreliable CSS canvas filters so adjustments look identical on iPhone, Mac, Windows, and Android.',
      },
    ],
  },
  {
    slug: 'auto-enhance-photo',
    category: 'Enhance',
    toolType: 'enhancer',
    shortName: 'Batch Photo Enhancer',
    title: 'Auto Photo Enhancer Free Online | ImageLab',
    metaDescription:
      'Batch enhance photo lighting, contrast, clarity, and natural colors directly in your browser. Split-screen compare, ZIP download, zero uploads.',
    h1: 'Auto Photo Enhancer',
    subtitle: 'Give dull product or travel photos balanced contrast, clarity, and natural color pop.',
    defaults: { brightness: 106, contrast: 114, saturate: 115, sharpness: 20, warmth: 5 },
    proTips: [
      'Great for e-commerce sellers wanting consistent lighting across 10–20 product photos in one batch.',
      'For blurry or pixelated photos that need true neural upscaling, use our AI Photo Enhancer page.',
      'Drag the Split Compare handle to inspect color balance before downloading.',
    ],
    howToSteps: [
      'Drop up to 20 photos anywhere on the screen.',
      'Balanced Auto Enhance settings run locally via MozJPEG.',
      'Compare results and download individually or as a ZIP.',
    ],
    faqs: [
      {
        q: 'Can I batch enhance multiple product photos with identical settings?',
        a: 'Yes. Upload up to 20 images together so every product shot shares consistent brightness, contrast, and warmth.',
      },
    ],
  },
];
