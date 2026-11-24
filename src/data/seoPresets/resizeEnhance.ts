import type { SeoToolPage } from './types';

export const RESIZE_ENHANCE_PAGES: SeoToolPage[] = [
  // ================= RESIZE PRESETS =================
  {
    slug: 'resize-photo-300x300',
    category: 'Resize',
    toolType: 'resizer',
    shortName: '300×300 Photo',
    title: 'Resize Photo to 300×300 Pixels (<100KB JPG — No Upload) | ImageLabKit',
    metaDescription:
      'Resize portraits to exact 300×300 pixels under 100KB JPG locally in your browser for government jobs, admission portals, and HR profiles. Head-safe Smart Crop, zero uploads.',
    h1: 'Resize Photo to 300×300 Pixels',
    subtitle:
      'Exact 300×300 px JPG kept strictly under 100KB with head-safe Smart Crop — 100% private on your device.',
    defaults: {
      format: 'image/jpeg',
      width: 300,
      height: 300,
      targetSizeKB: 100,
      fitMode: 'cover',
    },
    overview: [
      'Online job applications, competitive exam forms (including Teletalk, BCS, bank recruitments, and university admission portals), and corporate HR systems frequently enforce two simultaneous rules: exact 300×300 pixel square dimensions and a strict 100KB maximum JPG file size. Stretching a 4:3 smartphone photo distorts your face, while naive center-cropping often slices off the top of your head.',
      'ImageLabKit automates both rules locally inside your browser: Smart Crop biases framing slightly upward to protect hairlines and faces without stretching proportions, EXIF metadata is stripped automatically, and WebAssembly MozJPEG keeps your 300×300 JPG crisp and safely under 100KB with zero server uploads.',
    ],
    useCases: [
      {
        title: 'Government & Bank Job Applications',
        desc: 'Meet strict 300×300 px JPG (<100KB) validation rules on Teletalk, public service, and university admission portals on the first try.',
      },
      {
        title: 'Corporate HR & ID Badge Portals',
        desc: 'Format employee directory headshots and student portal avatars privately without uploading personal portraits online.',
      },
      {
        title: 'Consistent Square Profile Avatars',
        desc: 'Batch-resize up to 20 team member photos into uniform 300×300 px square thumbnails packaged in one ZIP.',
      },
    ],
    specTable: {
      headers: ['Specification', 'Locked Preset Value', 'Benefit'],
      rows: [
        ['Exact Dimensions', '300 × 300 pixels (1:1)', 'Passes strict automated pixel checks'],
        ['Max File Size', 'Strictly ≤ 100 KB (MozJPEG)', 'Zero “file too large” portal rejections'],
        ['Crop Behavior', 'Smart Cover (Upper-bias)', 'Protects head & hairline; never stretches faces'],
        ['Privacy', '100% local browser processing', 'Personal portrait never leaves your device'],
      ],
    },
    proTips: [
      'Need to tighten your exact headroom or move off-center framing manually? Open your photo in Visual Crop & Rotate first, choose the 1:1 square preset, then pass it here via Send to.',
      'Shoot against a plain white or light-blue wall in soft natural daylight so facial edges stay crisp inside 300×300 px.',
      'Also preparing your handwritten signature for the same application? Switch directly to our 300×80 Signature preset next.',
    ],
    howToSteps: [
      'Select or drop your front-facing portrait photo (JPG, PNG, WEBP, or iPhone HEIC) anywhere on this page.',
      'Exact 300×300 pixel Smart Crop, EXIF stripping, and ≤100KB MozJPEG compression run automatically.',
      'Verify framing and exact KB size with Split Compare, then click Download.',
    ],
    faqs: [
      {
        q: 'Does this keep my 300×300 photo strictly under 100KB?',
        a: 'Yes. ImageLabKit strips invisible camera metadata and runs MozJPEG optimization so the exported 300×300 JPG stays safely under 100KB (typically 18KB–65KB at razor-sharp quality).',
      },
      {
        q: 'Will my face get stretched or squished if my original photo is vertical?',
        a: 'Never. Smart Cover mode preserves natural 1:1 proportions by cleanly trimming excess vertical background rather than distorting your face.',
      },
      {
        q: 'Can I change the max size to 50KB if my portal is stricter?',
        a: 'Yes. Open Options and change Target Max KB from 100 to 50 while keeping Width and Height locked at 300×300.',
      },
      {
        q: 'Are my personal portraits stored anywhere?',
        a: 'No. Everything executes locally in your browser RAM with zero server uploads.',
      },
    ],
    relatedGuides: [
      { label: 'Compress Photos to 20KB, 50KB & 100KB Cleanly', href: '/guides/compress-images-to-exact-kb-limits-guide' },
      { label: 'US, UK & Global Passport 300 DPI Guide', href: '/guides/passport-photo-300-dpi-print-sheet-guide' },
    ],
  },

  {
    slug: 'resize-signature-300x80',
    category: 'Resize',
    toolType: 'resizer',
    shortName: '300×80 Signature',
    title: 'Resize Signature to 300×80 Pixels (<60KB JPG — No Crop Loss) | ImageLabKit',
    metaDescription:
      'Resize your scanned or photographed handwritten signature to exact 300×80 pixels under 60KB JPG with clean white padding so no strokes get cut off. 100% offline in your browser.',
    h1: 'Resize Signature to 300×80 Pixels',
    subtitle:
      'Exact 300×80 px JPG under 60KB using Fit + White Padding so no part of your signature ever gets clipped.',
    defaults: {
      format: 'image/jpeg',
      width: 300,
      height: 80,
      targetSizeKB: 60,
      fitMode: 'contain',
    },
    overview: [
      'A handwritten signature is a permanent personal identifier that should never be uploaded to unknown cloud converters. At the same time, formatting a phone photo of your signature to the ultra-wide 300×80 pixel strip required by job, banking, and exam portals is tricky—standard square or cover resizers chop off the top loops and bottom tails of your handwriting.',
      'ImageLabKit defaults to Contain (Fit + White Padding) mode on a pure white backdrop, preserving every single stroke proportionally inside exact 300×80 pixels while keeping file weight crisp and safely below 60KB strictly on your own device.',
    ],
    useCases: [
      {
        title: 'Government, Bank & Admission Forms',
        desc: 'Instantly match strict 300×80 px (<60KB JPG) signature upload fields without clipping ascenders or descenders.',
      },
      {
        title: 'HR Onboarding & Digital Agreements',
        desc: 'Prepare a clean, dark-ink horizontal signature strip privately on your own computer before submitting HR forms.',
      },
      {
        title: 'Clean Email & Document Footers',
        desc: 'Standardize handwritten sign-offs into lightweight, consistently sized JPGs for proposals and letters.',
      },
    ],
    specTable: {
      headers: ['Setting', 'Locked Preset Value', 'Why It Matters'],
      rows: [
        ['Exact Output Size', '300 × 80 pixels (3.75:1)', 'Matches standard horizontal signature boxes'],
        ['Fit Mode', 'Contain (Fit + White Padding)', 'Never crops or stretches signature strokes'],
        ['Max File Weight', 'Strictly ≤ 60 KB JPG', 'Meets strict 20KB–60KB portal validation'],
        ['Security', '100% offline in browser RAM', 'Handwritten signature never touches a server'],
      ],
    },
    proTips: [
      'Sign with a bold black or dark-blue gel pen on bright, unlined white printer paper in even daylight (avoid camera flash shadows).',
      'Crop closely around the signature in Visual Crop & Rotate before resizing so your signature fills the 300×80 strip boldly instead of looking tiny in the middle.',
      'Need an even stricter 20KB ceiling? Open Options and lower Target Max KB from 60 to 20.',
    ],
    howToSteps: [
      'Upload or drop a clear photo or scan of your handwritten signature on white paper.',
      'ImageLabKit fits every stroke inside exact 300×80 px with clean white padding under 60KB.',
      'Inspect clarity with Split Compare and download your ready-to-upload JPG.',
    ],
    faqs: [
      {
        q: 'Why does this preset use white padding instead of cropping to fill 300×80?',
        a: 'Smartphone photos are typically 4:3 or 16:9. Force-cropping them into a wide 3.75:1 strip cuts off the top and bottom of signatures, while stretching makes handwriting look distorted. Contain + White Padding preserves every stroke intact.',
      },
      {
        q: 'My paper background looks slightly gray—how can I make it brighter?',
        a: 'Run your signature photo quickly through Brighten Dark Photo first (boosting brightness and contrast slightly), then pass it to 300×80 Signature via the Send to button.',
      },
      {
        q: 'Is my handwritten signature uploaded to any external server?',
        a: 'Never. All resizing, padding, and MozJPEG encoding run strictly inside your browser tab.',
      },
      {
        q: 'Can I also use my signature to sign a multi-page PDF locally?',
        a: 'Yes—open our Sign PDF tool to draw, type, or stamp your signature and date directly onto any PDF offline.',
      },
    ],
    relatedGuides: [
      { label: 'Sign Sensitive PDFs Locally Without Cloud Uploads', href: '/guides/gdpr-hipaa-safe-local-pdf-signing-guide' },
      { label: 'Compress Photos to 20KB, 50KB & 100KB Cleanly', href: '/guides/compress-images-to-exact-kb-limits-guide' },
    ],
  },

  {
    slug: 'passport-photo-resizer',
    category: 'Resize',
    toolType: 'resizer',
    shortName: 'Passport 600×600',
    title: 'Passport Photo Resizer 600×600 px (<240KB Digital Visa & US DS-160) | ImageLabKit',
    metaDescription:
      'Resize portraits to exact 600×600 pixels (2×2 inch at 300 DPI) under 240KB JPG locally in your browser. Ideal for US DS-160 visa, DV Lottery, and digital passport portals.',
    h1: 'Passport Photo Resizer (600×600)',
    subtitle:
      'Standard 2×2 inch (600×600 px) digital passport & US visa JPG kept strictly under 240KB locally.',
    defaults: {
      format: 'image/jpeg',
      width: 600,
      height: 600,
      targetSizeKB: 240,
      fitMode: 'cover',
    },
    overview: [
      'Digital immigration and passport systems—including the US Department of State DS-160 nonimmigrant visa portal, US Diversity Visa (DV Lottery), Indian e-Visa, and numerous international e-passport portals—strictly require a square 600×600 pixel (2×2 inch at 300 DPI) sRGB JPEG file weighing no more than 240KB.',
      'ImageLabKit formats your smartphone or studio portrait to exact 600×600 pixels locally inside your browser using head-safe Smart Crop, strips hidden EXIF/GPS metadata, and optimizes MozJPEG quality safely below 240KB so sensitive biometric photos never leave your device.',
    ],
    useCases: [
      {
        title: 'US DS-160 Visa & DV Lottery Uploads',
        desc: 'Match the official 600×600 px minimum square JPEG specification and ≤240KB file-size cap automatically.',
      },
      {
        title: 'Global E-Visa & E-Passport Portals',
        desc: 'Prepare crisp sRGB biometric portraits for digital travel authorizations, student visas, and residency renewals.',
      },
      {
        title: 'Online Exam & Licensing IDs',
        desc: 'Generate clean 2×2 inch digital portraits for medical, engineering, and international testing registrations.',
      },
    ],
    specTable: {
      headers: ['Requirement', 'Preset Output', 'Official Portal Alignment'],
      rows: [
        ['Dimensions', '600 × 600 pixels (1:1)', 'Matches 2×2 inch @ 300 DPI digital standard'],
        ['File Format & Color', 'sRGB Progressive JPG', 'Required by US DS-160 & global visa validators'],
        ['Max File Size', 'Strictly ≤ 240 KB', 'Prevents oversized upload rejections'],
        ['Need Physical Paper Prints?', 'Use Passport Photo Print Sheet', 'Arranges 6 copies on 4×6" or 20+ on A4'],
      ],
    },
    proTips: [
      'Remove eyeglasses, stand 1.5–2 meters from the camera against a plain white or off-white wall facing natural window light, and keep a neutral expression with both eyes clearly open.',
      'Need to print physical copies on 4×6 inch lab paper or an A4 home printer? Open our dedicated Passport Photo Print Sheet tool instead.',
      'Want manual control over exact eye-height framing? Frame your square crop in Visual Crop & Rotate first, then resize to 600×600 here.',
    ],
    howToSteps: [
      'Drop a well-lit, front-facing portrait (JPG, PNG, WEBP, or iPhone HEIC) anywhere on this page.',
      'Smart Crop frames to exact 600×600 px and MozJPEG optimizes cleanly under 240KB with EXIF stripped.',
      'Inspect sharpness with Split Compare and download your submission-ready JPG.',
    ],
    faqs: [
      {
        q: 'Why 600×600 pixels and 240KB maximum?',
        a: '600×600 pixels equals exactly 2×2 inches at 300 DPI, and 240KB is the official ceiling used by major digital visa platforms including the US DS-160 and DV Lottery portals.',
      },
      {
        q: 'Should I upload a 4×6 multi-copy sheet or this 600×600 single photo to a visa website?',
        a: 'Always upload a single 600×600 portrait to online portals. Only use a multi-copy 4×6 or A4 print sheet when you need physical paper photos trimmed with scissors.',
      },
      {
        q: 'Can I customize the pixels to 413×531 (UK/Schengen 35×45 mm) instead?',
        a: 'Yes—open Options, uncheck square lock if needed, and type any exact width, height, and max KB required by your country’s embassy.',
      },
      {
        q: 'Is my passport portrait uploaded to any server?',
        a: 'Never. Cropping, resizing, and MozJPEG optimization run 100% locally inside your browser.',
      },
    ],
    relatedGuides: [
      { label: 'US, UK, Schengen & Global Passport 300 DPI Guide', href: '/guides/passport-photo-300-dpi-print-sheet-guide' },
      { label: 'Compress Photos to Exact KB Limits Cleanly', href: '/guides/compress-images-to-exact-kb-limits-guide' },
    ],
  },

  {
    slug: 'youtube-thumbnail-resizer',
    category: 'Resize',
    toolType: 'resizer',
    shortName: 'YouTube 1280×720',
    title: 'YouTube Thumbnail Resizer 1280×720 HD (<2MB JPG — No Upload) | ImageLabKit',
    metaDescription:
      'Resize images and video stills to exact 1280×720 HD (16:9) YouTube thumbnail dimensions under YouTube Studio’s 2MB cap locally in your browser. Crisp 90% MozJPEG quality.',
    h1: 'YouTube Thumbnail Resizer (1280×720)',
    subtitle:
      'Crisp 16:9 HD 1280×720 thumbnails optimized safely under YouTube Studio’s 2MB limit locally.',
    defaults: {
      format: 'image/jpeg',
      width: 1280,
      height: 720,
      quality: 0.9,
      fitMode: 'cover',
    },
    overview: [
      'YouTube Studio strictly rejects custom thumbnails exceeding 2 MB—a frustrating surprise when exporting uncompressed 4K Photoshop, Premiere Pro, or Canva PNG frames that routinely weigh 3.5 MB to 8 MB. Scaling them carelessly blurs headline text and dulls high-contrast facial expressions that drive click-through rate (CTR).',
      'ImageLabKit locks output to YouTube’s official 1280×720 (16:9 HD) specification at crisp 90% WebAssembly MozJPEG quality—keeping bold thumbnail typography sharp while dropping heavy 4K exports down to roughly 180 KB–450 KB in milliseconds.',
    ],
    useCases: [
      {
        title: 'Fixing “File Too Large (>2MB)” in YouTube Studio',
        desc: 'Instantly bring 4K Premiere Pro, DaVinci Resolve, or Canva PNG thumbnail exports down to crisp ~250 KB HD JPGs.',
      },
      {
        title: 'A/B Testing Multiple Thumbnail Variants',
        desc: 'Batch-resize up to 20 candidate frames in one pass and download a clean ZIP ready for YouTube’s Test & Compare tool.',
      },
      {
        title: '16:9 Blog, Course & Podcast Covers',
        desc: 'Produce uniform 1280×720 widescreen headers for Substack, Udemy, Teachable, and Open Graph video previews.',
      },
    ],
    specTable: {
      headers: ['YouTube Studio Spec', 'Preset Output', 'Notes'],
      rows: [
        ['Resolution', '1280 × 720 px (16:9 HD)', 'Official YouTube recommended minimum width'],
        ['Format & Quality', 'MozJPEG JPG at 90%', 'Keeps bold overlay text razor sharp'],
        ['File Weight', 'Typically 150 – 450 KB', 'Comfortably below YouTube’s strict 2 MB ceiling'],
        ['Batch Support', 'Up to 20 thumbnails + ZIP', 'Ideal for A/B thumbnail testing'],
      ],
    },
    proTips: [
      'Need to frame a specific face or headline carefully from a vertical or square source image? Use Visual Crop & Rotate with its 16:9 preset first, then send it here.',
      'Keep key text and faces away from the bottom-right corner where YouTube overlays the video duration timestamp badge.',
      'Pairing your thumbnail with a punchy title? Audit YouTube’s 60–70 character mobile title sweet spot inside our Word & Character Counter.',
    ],
    howToSteps: [
      'Drag and drop your Canva export, Photoshop PNG, or 4K video still anywhere on this page.',
      'Output automatically resizes to 1280×720 HD (16:9) and encodes at crisp 90% MozJPEG under 2MB.',
      'Verify headline text clarity with Split Compare and download immediately for YouTube Studio.',
    ],
    faqs: [
      {
        q: 'What are YouTube’s official thumbnail dimensions and file-size limit?',
        a: 'YouTube recommends 1280×720 pixels (16:9 aspect ratio, minimum width 640px) in JPG, PNG, or GIF format strictly under 2 MB.',
      },
      {
        q: 'Will 90% MozJPEG blur the bold text on my thumbnail?',
        a: 'No. At 90% MozJPEG quality on a 1280×720 canvas, bold typography, outlines, and vibrant colors stay razor sharp while file weight stays roughly 5×–10× below YouTube’s 2 MB cap.',
      },
      {
        q: 'Can I keep a PNG thumbnail instead of JPG if my design is mostly flat vector graphics?',
        a: 'Yes—open Options and switch Output to PNG (or lower quality slightly to 88% for smart UPNG optimization) to stay well under 2 MB with crisp vector edges.',
      },
      {
        q: 'Are my unreleased video thumbnails uploaded to any server?',
        a: 'Never. Everything processes 100% locally in your browser so upcoming launches and client videos stay confidential.',
      },
    ],
    relatedGuides: [
      { label: '2026 SEO & YouTube Title Character Limits Guide', href: '/guides/seo-title-meta-description-character-word-limits-guide' },
      { label: 'MozJPEG vs LibWebP Compression Guide', href: '/guides/mozjpeg-vs-libwebp-vs-png-compression-guide' },
    ],
  },

  {
    slug: 'instagram-photo-resizer',
    category: 'Resize',
    toolType: 'resizer',
    shortName: 'Instagram 1080×1080',
    title: 'Instagram Photo Resizer 1080×1080 HD (Square & 4:5 Carousels) | ImageLabKit',
    metaDescription:
      'Resize photos to exact 1080×1080 square HD (or 1080×1350 portrait) for Instagram feeds and carousels locally in your browser. Prevent blurry Instagram re-compression, batch ZIP export.',
    h1: 'Instagram Photo Resizer (1080×1080)',
    subtitle:
      'Sharp 1080×1080 HD square photos optimized locally so Instagram’s upload compressor keeps details crisp.',
    defaults: {
      format: 'image/jpeg',
      width: 1080,
      height: 1080,
      quality: 0.9,
      fitMode: 'cover',
    },
    overview: [
      'When you upload a raw 4032×3024 smartphone photo directly to Instagram, Instagram’s servers aggressively downscale and re-compress it—frequently turning crisp textures, fine typography, and product edges noticeably soft. Pre-sizing photos to Instagram’s exact native 1080px display width gives you full control over downsampling sharpness and color fidelity.',
      'ImageLabKit batch-resizes up to 20 carousel slides or product shots locally to exact 1080×1080 HD at 90% MozJPEG quality—and lets you switch effortlessly to Contain mode for clean white gallery borders or change height to 1350px for taller 4:5 portrait feed posts.',
    ],
    useCases: [
      {
        title: 'Multi-Slide Instagram Carousels',
        desc: 'Resize up to 20 slides to identical 1080×1080 px dimensions in one batch so swipe transitions never jump or clip.',
      },
      {
        title: 'E-Commerce & Boutique Product Grids',
        desc: 'Prepare crisp square 1080px catalog photos that work seamlessly across Instagram Shop, Shopify, and Etsy.',
      },
      {
        title: 'No-Crop Photography Borders',
        desc: 'Switch Fit Mode to Contain in Options to place wide landscape shots inside clean white square frames without cropping.',
      },
    ],
    specTable: {
      headers: ['Instagram Format', 'Recommended Pixels', 'How to Set Here'],
      rows: [
        ['Square Post / Carousel (1:1)', '1080 × 1080 px', 'Pre-loaded default preset'],
        ['Portrait Feed Post (4:5)', '1080 × 1350 px', 'Open Options → change Height to 1350'],
        ['Landscape Post (1.91:1)', '1080 × 566 px', 'Open Options → change Height to 566'],
        ['No-Crop White Border Look', '1080 × 1080 px (Contain)', 'Open Options → set Fit Mode to Contain'],
      ],
    },
    proTips: [
      'Want maximum vertical screen space in the Instagram feed? Open Options and change Height from 1080 to 1350 for crisp 4:5 portrait posts.',
      'Shooting wide travel or architectural scenes you do not want cropped? Switch Fit Mode to Contain in Options to add clean white studio borders automatically.',
      'Want to protect original photography or brand visuals before posting? Click Send to → Batch Watermark right after resizing.',
    ],
    howToSteps: [
      'Drop up to 20 photos (JPG, PNG, WEBP, or iPhone HEIC) anywhere on this page.',
      'Exact 1080×1080 HD Smart Crop and crisp 90% MozJPEG encoding run locally (adjust to 1080×1350 or Contain in Options if desired).',
      'Inspect with Split Compare and download individual files or grab all carousel slides in a ZIP.',
    ],
    faqs: [
      {
        q: 'Why does resizing to 1080px wide before uploading make Instagram photos look sharper?',
        a: 'Instagram caps feed photos at 1080 pixels wide. Uploading a massive 4000px image forces Instagram’s fast server scaler to crush it unpredictably; resizing locally with high-quality resampling and 90% MozJPEG preserves crisper edges.',
      },
      {
        q: 'Can I make 1080×1350 portrait Instagram posts with this tool?',
        a: 'Yes. Open Options and change Height to 1350 while keeping Width at 1080.',
      },
      {
        q: 'How do I add white borders instead of cropping my horizontal photo?',
        a: 'Open Options and change Fit Mode from Cover to Contain—your entire landscape photo fits cleanly inside the 1080×1080 square with balanced pure white padding.',
      },
      {
        q: 'Are my photos or GPS locations uploaded anywhere?',
        a: 'No. Resizing runs 100% locally in your browser and automatically strips hidden GPS/EXIF metadata.',
      },
    ],
    relatedGuides: [
      { label: 'iPhone HEIC to JPG & Display P3 Color Guide', href: '/guides/iphone-heic-and-display-p3-color-guide' },
      { label: '2026 Social Media & Caption Character Limits Guide', href: '/guides/seo-title-meta-description-character-word-limits-guide' },
    ],
  },

  // ================= ENHANCE PRESETS =================
  {
    slug: 'auto-enhance-photo',
    category: 'Enhance',
    toolType: 'enhancer',
    shortName: 'Batch Photo Enhancer',
    title: 'Free Batch Auto Photo Enhancer Online (Lighting, Contrast & Clarity) | ImageLabKit',
    metaDescription:
      'Enhance dull product, travel, and indoor photos in batches locally inside your browser. Balanced brightness, contrast, natural warmth, and crispness with split-screen compare and ZIP export.',
    h1: 'Auto Photo Enhancer',
    subtitle:
      'Give flat product, real-estate, and travel photos balanced contrast, clarity, and natural color pop locally.',
    defaults: { brightness: 106, contrast: 114, saturate: 115, sharpness: 20, warmth: 5 },
    overview: [
      'Raw smartphone snapshots taken under overcast skies or flat indoor LEDs often look slightly washed out and gray—hurting conversion rates on eBay, Vinted, Etsy, Shopify, and Airbnb listings. Opening twenty individual photos in desktop editing software just to nudge exposure, contrast, and micro-sharpness wastes an hour.',
      'ImageLabKit’s Batch Auto Photo Enhancer applies a balanced, natural studio lift (subtle +6% exposure, +14% contrast, +15% natural vibrance, gentle +20 sharpening, and +5 warmth) across up to 20 photos at once—strictly inside your browser using pixel-accurate canvas processing that renders identically on Safari, iPhone, Windows, and Android.',
    ],
    useCases: [
      {
        title: 'Consistent E-Commerce & Marketplace Galleries',
        desc: 'Give 10–20 clothing, gadget, or handmade product photos matching brightness, crispness, and color warmth in one batch.',
      },
      {
        title: 'Travel & Overcast Outdoor Photography',
        desc: 'Revive flat cloudy-day landscapes and food shots without cartoonish oversaturation or fake AI faces.',
      },
      {
        title: 'Quick Real-Estate & Listing Polish',
        desc: 'Brighten and sharpen interior room photos locally before listing on Airbnb, Rightmove, or Zillow—stripping GPS EXIF automatically.',
      },
    ],
    specTable: {
      headers: ['Adjustment Parameter', 'Auto-Enhance Default', 'Editable in Options?'],
      rows: [
        ['Brightness', '106% (Gentle exposure lift)', 'Yes — full live slider'],
        ['Contrast', '114% (Richer tonal depth)', 'Yes — full live slider'],
        ['Saturation', '115% (Natural color pop)', 'Yes — full live slider'],
        ['Sharpness & Warmth', '+20 Crispness · +5 Warmth', 'Yes — fine-tune or Reset anytime'],
      ],
    },
    proTips: [
      'Open Options to dial back Saturation or Warmth if your photos were shot under warm yellow indoor bulbs.',
      'Drag the Split Compare slider across your image to confirm white clothing, skies, and skin tones stay natural and never clip highlights.',
      'Click Send to after enhancing to convert directly to lightweight WebP, resize for Instagram, or add a brand watermark.',
    ],
    howToSteps: [
      'Drop up to 20 flat or dull JPG, PNG, WEBP, or iPhone HEIC photos anywhere on this page.',
      'Balanced Auto Enhance settings run locally in seconds; fine-tune any slider inside Options if desired.',
      'Verify before-and-after balance using Split Compare and download individual files or one batch ZIP.',
    ],
    faqs: [
      {
        q: 'Does Auto Photo Enhancer use generative AI that alters faces or invents fake details?',
        a: 'No. It uses clean, pixel-accurate exposure, contrast, color, warmth, and unsharp-mask clarity filters—so faces, text, and product details remain 100% authentic and faithful to your real photo.',
      },
      {
        q: 'Will enhancing my photos shrink their original resolution?',
        a: 'No. Your original pixel width and height stay completely intact unless you explicitly set custom dimensions in Options.',
      },
      {
        q: 'Can I enhance 15 product photos with identical settings at once?',
        a: 'Yes. Upload up to 20 images together so every angle in your store listing shares consistent lighting and color tone, then export all of them in one ZIP.',
      },
      {
        q: 'Does it work consistently on iPhone and Safari?',
        a: 'Yes. Pixel-level processing ensures brightness, warmth, and sharpening look identical across iOS Safari, macOS, Windows, and Android.',
      },
    ],
    relatedGuides: [
      { label: 'Remove GPS & Polish Photos Before Selling on eBay & Vinted', href: '/guides/remove-iphone-android-gps-exif-before-selling-online' },
      { label: 'iPhone HEIC & Display P3 Color Guide', href: '/guides/iphone-heic-and-display-p3-color-guide' },
    ],
  },

  {
    slug: 'brighten-dark-photo',
    category: 'Enhance',
    toolType: 'enhancer',
    shortName: 'Brighten Dark Photo',
    title: 'Brighten Dark & Underexposed Photos Online Free (Batch — No Upload) | ImageLabKit',
    metaDescription:
      'Fix dark, dim, or backlit indoor photos and shadowy document scans in batches locally inside your browser. Adjustable brightness, contrast & sharpness with split-screen compare.',
    h1: 'Brighten Dark Photos Online',
    subtitle:
      'Lift dim shadows and rescue underexposed indoor photos or shadowy document scans locally with zero uploads.',
    defaults: { brightness: 118, contrast: 108, saturate: 108, sharpness: 12 },
    overview: [
      'Backlit portraits standing in front of a bright window, evening dinner snapshots, dim apartment interiors, and phone-captured paper receipts under desk lamps often come out several stops too dark. Sending dim images to clients, marketplaces, or OCR text tools makes details hard to read and looks unprofessional.',
      'ImageLabKit’s Brighten Dark Photo preset applies a clean +18% exposure boost balanced with gentle +8% contrast, +8% color recovery, and +12 crispness across up to 20 images locally—rescuing shadow detail without washing blacks out into murky gray.',
    ],
    useCases: [
      {
        title: 'Rescuing Backlit & Indoor Snapshots',
        desc: 'Brighten dim portraits, evening events, and shaded faces quickly with live before-and-after Split Compare.',
      },
      {
        title: 'Cleaning Shadowy Document & Signature Photos',
        desc: 'Lighten dim paper backgrounds on receipts, notes, or handwritten signatures before running OCR or resizing.',
      },
      {
        title: 'Dim Apartment & Product Listings',
        desc: 'Batch-brighten up to 20 indoor room or item photos privately on your device while automatically stripping GPS metadata.',
      },
    ],
    specTable: {
      headers: ['Filter Control', 'Brighten Preset Default', 'Purpose'],
      rows: [
        ['Brightness', '118% (+18% lift)', 'Opens dark shadows cleanly'],
        ['Contrast', '108%', 'Prevents lifted shadows from looking flat or hazy'],
        ['Saturation', '108%', 'Restores color richness lost in underexposure'],
        ['Sharpness', '+12', 'Keeps edges and text crisp after brightening'],
      ],
    },
    proTips: [
      'For severely underexposed night shots, open Options and push Brightness to 125%–135% while nudging Contrast up slightly so dark areas keep natural depth.',
      'For dim photos of white documents or signatures, pair a Brightness lift with higher Contrast (120%–130%) to turn gray paper clean white.',
      'Use Split Compare to verify bright windows, lamps, or light clothing do not blow out while shadows brighten.',
    ],
    howToSteps: [
      'Drag and drop up to 20 dark or underexposed photos anywhere on this page.',
      'Balanced +18% brightening, contrast, and clarity recovery run immediately inside your browser.',
      'Fine-tune sliders in Options if needed, compare with the draggable divider, and download.',
    ],
    faqs: [
      {
        q: 'Will brightening a dark photo lower its pixel resolution?',
        a: 'No. Original pixel dimensions stay 100% preserved while lighting and tonal contrast are enhanced.',
      },
      {
        q: 'Can brightening a shadowy receipt or textbook page improve OCR accuracy?',
        a: 'Yes. Lifting dim shadows and boosting contrast makes dark ink stand out cleanly from gray paper—after brightening, click Send to → Image to Text (OCR) for cleaner text extraction.',
      },
      {
        q: 'Does Brighten Dark Photo work on iPhone HEIC images?',
        a: 'Yes. iPhone HEIC and HEIF photos are automatically decoded locally in your browser before brightening.',
      },
      {
        q: 'Are my private family or document photos sent to any server?',
        a: 'Never. All pixel adjustments run strictly offline inside your browser tab.',
      },
    ],
    relatedGuides: [
      { label: 'Remove GPS & Polish Photos Before Selling Online', href: '/guides/remove-iphone-android-gps-exif-before-selling-online' },
      { label: 'PDF to Text vs AI OCR Extraction Guide', href: '/guides/pdf-to-text-vs-ai-ocr-extraction-guide' },
    ],
  },
];
