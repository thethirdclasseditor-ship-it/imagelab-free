export interface GuideTable {
  headers: string[];
  rows: string[][];
}

export interface GuideSection {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
  table?: GuideTable;
}

export interface GuideArticle {
  slug: string;
  category: 'Optimization' | 'Privacy' | 'Formats' | 'PDF Workflow';
  title: string;
  metaTitle: string;
  description: string;
  readTime: string;
  updatedAt: string;
  intro: string;
  sections: GuideSection[];
  relatedTools: { label: string; href: string; desc: string }[];
}

export const GUIDES: GuideArticle[] = [
  {
    slug: 'mozjpeg-vs-libwebp-vs-png-compression-guide',
    category: 'Optimization',
    title: 'MozJPEG vs LibWebP vs UPNG: How to Shrink Images Up to 80% Without Visible Blur',
    metaTitle: 'MozJPEG vs LibWebP vs UPNG Compression Guide | ImageLab',
    description:
      'Learn how WebAssembly MozJPEG, LibWebP, and UPNG codecs compare, which quality level hits the visual sweet spot, and how to meet strict 50KB or 100KB upload caps.',
    readTime: '6 min read',
    updatedAt: '2026-11-22',
    intro:
      'Most free online converters simply draw your photo onto a basic HTML canvas and call canvas.toBlob(). That shortcut leaves 30% to 60% of unnecessary file weight behind—or forces you to drop quality so low that faces and text turn blocky. Choosing the right codec and perceptual quality threshold lets you cut file sizes dramatically while keeping every edge crisp.',
    sections: [
      {
        heading: 'Why the Encoder Matters More Than the Quality Slider',
        paragraphs: [
          'Two JPG files both saved at "85% quality" can differ dramatically in size and clarity depending on the encoder that created them. Default browser JPEG encoders prioritize raw encoding speed over compression efficiency, skipping progressive scans and trellis quantization.',
          'Mozilla’s MozJPEG (running via WebAssembly inside a background Web Worker) analyzes frequency blocks carefully and optimizes Huffman tables. At the same visual sharpness, MozJPEG files are typically 15% to 35% smaller than standard browser Canvas exports—and it strips bulky camera EXIF headers automatically.',
        ],
      },
      {
        heading: 'Format & Codec Comparison at a Glance',
        paragraphs: [
          'Picking the right output format before adjusting quality saves far more bytes than aggressive compression alone. Use this reference table to match your image type to the ideal WebAssembly codec:',
        ],
        table: {
          headers: ['Format / Codec', 'Best For', 'Transparency', 'Typical Sweet Spot'],
          rows: [
            ['JPG · MozJPEG', 'Portraits, camera photos, portal uploads', 'No (white fill)', 'Quality 80%–88%'],
            ['WEBP · LibWebP', 'Websites, blogs, e-commerce, UI screenshots', 'Yes (full alpha)', 'Quality 80%–86%'],
            ['PNG · UPNG (Quantized)', 'Logos, flat icons, crisp graphics with text', 'Yes (full alpha)', 'Quality 75%–90% (256 colors)'],
            ['PNG · Lossless', 'Master design files before editing', 'Yes (full alpha)', 'Quality 95%–100%'],
          ],
        },
      },
      {
        heading: 'How to Hit Strict 20KB, 50KB, or 100KB Portal Limits Cleanly',
        paragraphs: [
          'Online application portals, ID systems, and HR forms frequently enforce hard ceilings such as 50KB or 100KB. Dropping quality all the way to 10% on a 12-megapixel phone photo produces severe compression artifacts without even solving the file size.',
          'The smarter approach combines two stages: first run binary-search compression down to a safe visual floor, and if the file is still over budget, proportionally reduce pixel dimensions. A crisp 600×600 portrait at 82% MozJPEG always looks sharper than a 3000×3000 portrait crushed at 12% quality.',
        ],
        bullets: [
          'Crop excess empty background around your subject or signature before compressing.',
          'Strip invisible EXIF metadata—a single smartphone photo can carry 30KB to 60KB of hidden thumbnails and camera tags alone.',
          'Always inspect eyes, hairlines, and small text at 2× zoom using Split Compare before submitting.',
        ],
      },
      {
        heading: 'Core Web Vitals: Choosing WEBP for Faster Websites',
        paragraphs: [
          'For blogs, portfolios, and online stores, hero banners and product cards directly control Largest Contentful Paint (LCP). Converting standard JPGs to LibWebP typically saves an additional 25% to 35% bandwidth, while converting heavy PNG screenshots to WEBP routinely cuts weight by 65% to 80% with alpha transparency intact.',
          'Because ImageLab executes LibWebP in WebAssembly rather than relying on native browser Canvas encoders, WEBP export works consistently even on Safari and iPhone.',
        ],
      },
    ],
    relatedTools: [
      { label: 'Image Compressor', href: '/image-compressor', desc: 'MozJPEG, LibWebP & UPNG studio' },
      { label: 'Compress to 50KB', href: '/compress-image-to-50kb', desc: 'Auto-fit strict 50KB limits' },
      { label: 'JPG to WEBP', href: '/jpg-to-webp', desc: 'Faster images for websites' },
    ],
  },
  {
    slug: 'verify-zero-upload-browser-tools-and-exif-privacy',
    category: 'Privacy',
    title: 'Zero-Upload Privacy Explained: How to Verify Local Tools & Strip Hidden Photo EXIF Data',
    metaTitle: 'How to Verify Zero-Upload Tools & Strip EXIF | ImageLab',
    description:
      'Learn how to audit any online image or PDF tool in Chrome DevTools Network tab, what GPS and camera data photos hide, and why solid blackout beats light blur.',
    readTime: '5 min read',
    updatedAt: '2026-11-22',
    intro:
      'Almost every online converter claims "your files are safe and deleted after 1 hour." Yet uploading personal IDs, handwritten signatures, financial statements, or private family photos to a remote cloud server still exposes them in transit, server memory, and temporary storage. True browser-native tools never upload your files in the first place—and you can prove it yourself in thirty seconds.',
    sections: [
      {
        heading: 'How to Verify Zero Uploads Using Browser DevTools',
        paragraphs: [
          'You should never have to take a website’s privacy badge on faith. Every desktop browser includes a built-in Network inspector that records every byte leaving your device:',
        ],
        bullets: [
          'Open the tool page (for example, Image Compressor, Crop, EXIF Remover, or Merge PDF).',
          'Press F12 (or Ctrl+Shift+I / Cmd+Option+I) and click the Network tab.',
          'Click the Clear icon (⊘), or even toggle "Offline" mode after the page finishes loading.',
          'Drop a private photo or PDF and run the conversion or export.',
          'Watch the Network log: you will see zero POST/PUT requests carrying your file bytes. Only local memory and Web Workers execute.',
        ],
      },
      {
        heading: 'What Hidden EXIF & GPS Data Smartphone Photos Expose',
        paragraphs: [
          'Modern smartphones embed rich metadata blocks (EXIF, GPS, IPTC, and XMP) into every camera shot by default. While many mainstream social networks strip EXIF during upload, direct email attachments, marketplace listings, forums, and cloud folder shares often preserve every tag untouched.',
        ],
        table: {
          headers: ['Metadata Field', 'Example Embedded Value', 'Privacy Risk'],
          rows: [
            ['GPS Latitude / Longitude', '23.78088, 90.27923', 'Pinpoints home, school, or workplace within meters'],
            ['DateTimeOriginal', '2026-11-18 08:14:22', 'Reveals exact daily routine and travel absence'],
            ['Make / Model / Lens', 'iPhone 16 Pro · 24mm f/1.78', 'Device fingerprinting and hardware profiling'],
            ['Embedded Thumbnail', '160×120 uncropped preview', 'Can leak original areas cropped out by older editors'],
          ],
        },
      },
      {
        heading: 'Redacting Sensitive Details: Blackout vs Pixelate vs Blur',
        paragraphs: [
          'When sharing screenshots of receipts, tracking labels, license plates, or identity documents, how you hide sensitive regions matters just as much as stripping EXIF headers.',
          'Light Gaussian blur can sometimes be partially reversed or guessed on fixed-width numbers and standard fonts. Whenever you redact account numbers, email addresses, or personal IDs, always choose Solid Blackout (which overwrites pixels permanently with #09090B) or high-strength Mosaic Pixelate.',
        ],
      },
    ],
    relatedTools: [
      { label: 'EXIF Metadata Remover', href: '/exif-remover', desc: 'Inspect & wipe GPS/camera tags' },
      { label: 'Privacy Blur & Redact', href: '/blur-image', desc: 'Blackout or pixelate faces & IDs' },
      { label: 'Merge PDF', href: '/merge-pdf', desc: 'Combine private PDFs offline' },
    ],
  },
  {
    slug: 'iphone-heic-and-display-p3-color-guide',
    category: 'Formats',
    title: 'iPhone HEIC to JPG & Washed-Out Colors: Understanding Display P3 and Browser Decoding',
    metaTitle: 'iPhone HEIC to JPG & Display P3 Color Guide | ImageLab',
    description:
      'Why Windows apps and upload forms reject iPhone HEIC files, how modern libheif browser decoding handles iOS 18+ photos, and why wide-gamut Display P3 colors can look dull.',
    readTime: '5 min read',
    updatedAt: '2026-11-22',
    intro:
      'Since iOS 11, Apple cameras have captured photos in HEIC (High Efficiency Image Container) by default because it stores sharp 12MP and 48MP images in roughly half the storage space of JPEG. The trade-off appears the moment you transfer those photos to Windows, upload them to a portal, or embed them on the web.',
    sections: [
      {
        heading: 'Why Many Portals & Older Apps Reject .HEIC Files',
        paragraphs: [
          'HEIC relies on HEVC (H.265) compression, which involves patent licensing that kept native decoding out of Chrome, Firefox, and older Windows installations for years. As a result, HR portals, government forms, print kiosks, and legacy CMS platforms still require universal .jpg or .png uploads.',
          'Older web converters built on unmaintained libraries frequently throw "format not supported" errors on newer iPhone 15, iPhone 16, and iOS 18+ captures. ImageLab uses a two-stage strategy: native zero-overhead decoding on Apple Safari, and an updated libheif WebAssembly decoder (heic-to) on Windows, Android, and Linux.',
        ],
      },
      {
        heading: 'Why Converted Photos Sometimes Look Slightly Less Vibrant (Display P3 vs sRGB)',
        paragraphs: [
          'Modern iPhones and flagship Android phones capture in the wide-gamut Display P3 color space, which holds roughly 25% more saturated reds and greens than standard web sRGB.',
          'When an image is decoded to a standard sRGB canvas without proper gamut mapping—or viewed in an app that ignores ICC profiles—deep reds and bright foliage can lose noticeable chroma and appear slightly flatter. Keeping output quality at 88% to 92% MozJPEG and avoiding repeated re-saves preserves smooth skin tones and natural contrast.',
        ],
      },
      {
        heading: 'Choosing the Right Target Format for iPhone Photos',
        paragraphs: [
          'Before batch-converting a folder of iPhone captures, pick the format that fits your destination:',
        ],
        bullets: [
          'Use JPG (MozJPEG 88%) for universal sharing, printing, email, and strict upload portals.',
          'Use WEBP (LibWebP 85%) if you are uploading directly to a modern blog, portfolio, or e-commerce store.',
          'Avoid converting camera photos to lossless PNG—a 2MB HEIC photo can easily balloon into an 18MB PNG with zero visual benefit.',
        ],
      },
    ],
    relatedTools: [
      { label: 'HEIC to JPG', href: '/heic-to-jpg', desc: 'Convert iPhone HEIC locally' },
      { label: 'AVIF to JPG', href: '/avif-to-jpg', desc: 'Turn web AVIF into universal JPG' },
      { label: 'Visual Crop & Rotate', href: '/crop-image', desc: 'Frame HEIC photos directly' },
    ],
  },
  {
    slug: 'browser-native-pdf-workflow-guide',
    category: 'PDF Workflow',
    title: 'The Zero-Upload PDF Workflow: Merge, Split, Compress & Convert PDFs Safely Offline',
    metaTitle: 'Zero-Upload Browser PDF Workflow Guide | ImageLab',
    description:
      'Understand when to use lossless PDF stream compression versus MozJPEG 144 DPI scan compression, how to avoid oversized Fit-to-Image pages, and how to chain image-to-PDF tasks.',
    readTime: '5 min read',
    updatedAt: '2026-11-22',
    intro:
      'PDF files often contain our most confidential information: signed contracts, tax records, bank statements, invoices, and identity scans. Cloud PDF utilities usually lock free users behind 2-task daily limits while uploading your documents to third-party servers. Modern WebAssembly and pure JavaScript PDF engines let you handle the entire workflow locally with zero daily caps.',
    sections: [
      {
        heading: 'Lossless Stream Optimization vs MozJPEG Scan Compression',
        paragraphs: [
          'Not all PDFs are built the same way, which is why a single compression slider rarely works for every document. Picking the right mode inside Compress PDF makes a massive difference:',
        ],
        table: {
          headers: ['Compression Mode', 'How It Works', 'Best Document Type', 'Expected Savings'],
          rows: [
            ['Lossless Streams', 'Repacks object streams & strips metadata; keeps vector text selectable', 'Word/Docs exports, invoices, digital reports', '5%–25% (100% lossless)'],
            ['Balanced (144 DPI)', 'Re-renders pages at crisp 144 DPI with MozJPEG 72%', 'Phone-scanned pages, photo portfolios, receipts', '60%–85% smaller'],
            ['Strong (108 DPI)', 'Compact 108 DPI with MozJPEG 52%', 'Strict 1MB–2MB email or portal upload caps', '75%–92% smaller'],
          ],
        },
      },
      {
        heading: 'Avoiding Oversized Pages When Converting Photos to PDF',
        paragraphs: [
          'A classic mistake in browser-based Image-to-PDF tools is mapping raw 4000×3000 smartphone pixels directly to millimeters at 96 DPI—producing bizarre PDF pages over a meter wide that print terribly.',
          'ImageLab caps photo pages to print-grade resolution (2000px longest side) and keeps Fit-to-Image pages within standard A4 maximum bounds (297mm), while streaming each page as compact binary JPEG bytes so even 30-page documents build smoothly on phones.',
        ],
      },
      {
        heading: 'Chaining Image & PDF Tasks Without Re-Uploading',
        paragraphs: [
          'When preparing a document pack, you rarely need just one tool. For example, you might redact an ID number on a receipt, crop the margins neatly, and then bundle it into an A4 PDF.',
          'Use the "Continue to" button at the bottom of ImageLab’s tools to pass your edited image straight into the next tool through local browser memory (IndexedDB)—no cluttering your Downloads folder with temporary files.',
        ],
      },
    ],
    relatedTools: [
      { label: 'Merge PDF', href: '/merge-pdf', desc: 'Combine up to 25 PDFs losslessly' },
      { label: 'Compress PDF', href: '/compress-pdf', desc: 'Balanced, Strong & Lossless modes' },
      { label: 'Split & Extract PDF', href: '/split-pdf', desc: 'Extract ranges or separate pages' },
      { label: 'Image to PDF', href: '/image-to-pdf', desc: 'Turn photos into clean A4 PDFs' },
    ],
  },
];
