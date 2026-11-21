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
    title: 'Compress Image to 20KB Online Free (No Upload) | ImageLab',
    metaDescription:
      'Reduce JPG, PNG, or WEBP photo size to exact 20KB instantly in your browser. 100% free, private, and perfect for online application forms.',
    h1: 'Compress Image to 20KB',
    subtitle: 'Shrink photos safely under 20KB directly on your device with zero server uploads.',
    defaults: { format: 'image/jpeg', targetSizeKB: 20 },
    howToSteps: [
      'Tap the upload box and pick one or multiple photos.',
      'Target size is already locked to 20KB in JPG format.',
      'Hit Compress Images Now and download your ready-to-upload file.',
    ],
    faqs: [
      {
        q: 'How can I reduce a photo to 20KB without losing readability?',
        a: 'Our binary-search compressor tests multiple quality levels locally and picks the sharpest result that fits under 20KB.',
      },
      {
        q: 'Are my personal ID or application photos uploaded to a server?',
        a: 'No. Every step runs locally inside your browser, so your photos never leave your phone or computer.',
      },
    ],
  },
  {
    slug: 'compress-image-to-50kb',
    category: 'Compress',
    toolType: 'compressor',
    shortName: 'Compress to 50KB',
    title: 'Compress Image to 50KB Online Free — Exact KB Tool | ImageLab',
    metaDescription:
      'Compress JPG or WEBP photos to under 50KB in seconds. Free browser-based tool with no login, no watermark, and 100% privacy.',
    h1: 'Compress Image to 50KB',
    subtitle: 'Hit strict 50KB portal upload limits in one click without sending photos to any server.',
    defaults: { format: 'image/jpeg', targetSizeKB: 50 },
    howToSteps: [
      'Select your photo from mobile gallery or PC.',
      'The 50KB target limit is pre-selected for you.',
      'Click Compress Images Now, preview Before/After, and download.',
    ],
    faqs: [
      {
        q: 'Why do online forms ask for images under 50KB?',
        a: 'Exam portals, university admissions, and job sites enforce 50KB limits to keep applications fast and lightweight.',
      },
      {
        q: 'Can I compress multiple photos to 50KB at once?',
        a: 'Yes, you can upload up to 20 images in one batch and download them all together as a single ZIP file.',
      },
    ],
  },
  {
    slug: 'compress-image-to-100kb',
    category: 'Compress',
    toolType: 'compressor',
    shortName: 'Compress to 100KB',
    title: 'Compress Image to 100KB Online Free (Fast & Private) | ImageLab',
    metaDescription:
      'Reduce photo file size to 100KB cleanly with high visual clarity. 100% free local browser image compressor with batch ZIP download.',
    h1: 'Compress Image to 100KB',
    subtitle: 'Keep crisp visual detail while bringing large phone photos neatly under 100KB.',
    defaults: { format: 'image/jpeg', targetSizeKB: 100 },
    howToSteps: [
      'Upload up to 20 JPG, PNG, or WEBP files.',
      'Target size is pre-filled at 100KB.',
      'Process instantly and compare the compressed output before saving.',
    ],
    faqs: [
      {
        q: 'Will a 100KB JPG still look sharp?',
        a: 'Yes. At 100KB, standard portrait and document photos retain excellent sharpness with minimal visible compression.',
      },
      {
        q: 'Does this work on iPhone and Android?',
        a: 'Yes, it runs smoothly in Safari, Chrome, and any modern mobile browser without installing an app.',
      },
    ],
  },
  {
    slug: 'compress-image-to-200kb',
    category: 'Compress',
    toolType: 'compressor',
    shortName: 'Compress to 200KB',
    title: 'Compress Image to 200KB Online Free | ImageLab',
    metaDescription:
      'Optimize large MB photos down to 200KB for websites, blogs, and document portals. Free, unlimited, and 100% private.',
    h1: 'Compress Image to 200KB',
    subtitle: 'Shrink multi-megabyte camera images down to 200KB for fast web pages and portals.',
    defaults: { format: 'image/jpeg', targetSizeKB: 200 },
    howToSteps: [
      'Drop your large JPG or PNG images into the box.',
      'Keep the preset 200KB limit or switch output to WEBP for even better clarity.',
      'Click Compress Images Now and save your optimized files.',
    ],
    faqs: [
      {
        q: 'Should I choose JPG or WEBP for 200KB website images?',
        a: 'WEBP generally delivers noticeably sharper detail than JPG at the exact same 200KB file size.',
      },
    ],
  },
  {
    slug: 'image-compressor',
    category: 'Compress',
    toolType: 'compressor',
    shortName: 'Free Image Compressor',
    title: 'Free Online Image Compressor — Reduce Photo Size Locally | ImageLab',
    metaDescription:
      'Compress JPG, PNG, and WEBP images up to 80% smaller with custom quality or target KB controls. Zero server uploads.',
    h1: 'Free Online Image Compressor',
    subtitle: 'Reduce image file sizes dramatically using custom quality sliders or exact KB targets.',
    defaults: { format: 'image/webp', quality: 0.8 },
    howToSteps: [
      'Select one or up to 20 photos from your device.',
      'Adjust the quality slider or type a target KB limit.',
      'Download individual files or grab all compressed photos in a ZIP.',
    ],
    faqs: [
      {
        q: 'Is there any daily limit or watermark?',
        a: 'None at all. ImageLab is completely free with unlimited local processing and zero watermarks.',
      },
    ],
  },

  // ================= CONVERTER =================
  {
    slug: 'jpg-to-webp',
    category: 'Convert',
    toolType: 'converter',
    shortName: 'JPG to WEBP',
    title: 'JPG to WEBP Converter — Free Bulk Browser Tool | ImageLab',
    metaDescription:
      'Convert JPG images to lightweight WEBP format instantly in your browser. Boost website speed with batch conversion and ZIP download.',
    h1: 'JPG to WEBP Converter',
    subtitle: 'Make images 25% to 40% lighter for faster websites and better Google Core Web Vitals.',
    defaults: { format: 'image/webp', quality: 0.85 },
    howToSteps: [
      'Upload one or multiple JPG photos.',
      'Output format is automatically set to WEBP at balanced 85% quality.',
      'Click Convert Images Now and download individually or as a ZIP.',
    ],
    faqs: [
      {
        q: 'Why convert JPG to WEBP for websites?',
        a: 'WEBP provides much smaller file sizes at equivalent visual quality, directly improving page load speed and SEO.',
      },
      {
        q: 'Can I bulk convert 20 JPG files at once?',
        a: 'Yes, select up to 20 files at once and use the Download All as ZIP button when finished.',
      },
    ],
  },
  {
    slug: 'png-to-webp',
    category: 'Convert',
    toolType: 'converter',
    shortName: 'PNG to WEBP',
    title: 'PNG to WEBP Converter Online Free (Keeps Transparency) | ImageLab',
    metaDescription:
      'Convert heavy PNG graphics to compact WEBP while preserving transparent backgrounds. 100% browser-based and free.',
    h1: 'PNG to WEBP Converter',
    subtitle: 'Cut heavy PNG file sizes dramatically while keeping transparent backgrounds intact.',
    defaults: { format: 'image/webp', quality: 0.88 },
    howToSteps: [
      'Select your PNG logos, icons, or screenshots.',
      'Output is preset to WEBP with high clarity.',
      'Click Convert Images Now and save the smaller WEBP files.',
    ],
    faqs: [
      {
        q: 'Does PNG to WEBP keep transparency?',
        a: 'Yes! Unlike JPG, WEBP fully preserves transparent backgrounds while being significantly smaller than PNG.',
      },
    ],
  },
  {
    slug: 'webp-to-jpg',
    category: 'Convert',
    toolType: 'converter',
    shortName: 'WEBP to JPG',
    title: 'WEBP to JPG Converter Online Free — Instant & Private | ImageLab',
    metaDescription:
      'Turn WEBP images into universally compatible JPG files directly in your browser. Fast batch conversion with zero file uploads.',
    h1: 'WEBP to JPG Converter',
    subtitle: 'Convert modern WEBP files into standard JPG images that open everywhere.',
    defaults: { format: 'image/jpeg', quality: 0.9 },
    howToSteps: [
      'Drop your WEBP files into the uploader.',
      'JPG output is pre-selected at 90% high quality.',
      'Convert and download standard .jpg files instantly.',
    ],
    faqs: [
      {
        q: 'What happens to transparent areas when converting WEBP to JPG?',
        a: 'Because JPG does not support transparency, ImageLab automatically fills transparent areas with a clean white background.',
      },
    ],
  },
  {
    slug: 'png-to-jpg',
    category: 'Convert',
    toolType: 'converter',
    shortName: 'PNG to JPG',
    title: 'PNG to JPG Converter Online Free (Bulk & No Upload) | ImageLab',
    metaDescription:
      'Convert PNG screenshots and photos into smaller JPG files locally in your browser. Clean white background fill, 100% free.',
    h1: 'PNG to JPG Converter',
    subtitle: 'Convert large PNG screenshots into compact, share-ready JPG files in seconds.',
    defaults: { format: 'image/jpeg', quality: 0.88 },
    howToSteps: [
      'Choose one or multiple PNG images.',
      'JPG format is ready—adjust quality if desired.',
      'Click Convert Images Now and save your lightweight JPGs.',
    ],
    faqs: [
      {
        q: 'Will my PNG to JPG conversion have a black background?',
        a: 'No. Transparent pixels are automatically filled with pure white so logos and cutouts look clean.',
      },
    ],
  },
  {
    slug: 'jpg-to-png',
    category: 'Convert',
    toolType: 'converter',
    shortName: 'JPG to PNG',
    title: 'JPG to PNG Converter Online Free — Lossless Output | ImageLab',
    metaDescription:
      'Convert JPG photos to lossless PNG format right inside your browser. Fast, private, and supports batch conversion.',
    h1: 'JPG to PNG Converter',
    subtitle: 'Convert JPEG pictures into lossless PNG format with zero cloud uploads.',
    defaults: { format: 'image/png' },
    howToSteps: [
      'Upload your JPG or JPEG photos.',
      'PNG output is automatically selected.',
      'Click Convert Images Now and download your PNG files.',
    ],
    faqs: [
      {
        q: 'Why is the converted PNG larger than the original JPG?',
        a: 'PNG uses lossless compression to preserve every pixel exactly, which naturally takes more space than lossy JPG.',
      },
    ],
  },

  // ================= RESIZER & PRESETS =================
  {
    slug: 'resize-photo-300x300',
    category: 'Resize',
    toolType: 'resizer',
    shortName: '300×300 Job Photo',
    title: 'Resize Photo to 300x300 Pixels Online Free (Under 100KB) | ImageLab',
    metaDescription:
      'Resize your photo to exact 300x300 pixels and under 100KB for BD govt job applications, BCS, exams, and profiles. 100% private.',
    h1: 'Resize Photo to 300×300 Pixels',
    subtitle: 'Exact 300×300 px JPG kept safely under 100KB—built for Teletalk, BCS, and online job portals.',
    defaults: {
      format: 'image/jpeg',
      width: 300,
      height: 300,
      targetSizeKB: 100,
      fitMode: 'cover',
    },
    howToSteps: [
      'Upload your portrait photo from phone or computer.',
      '300×300 px dimensions, Smart Center-Crop, and 100KB max size are already set.',
      'Tap Resize Images Now and download your portal-ready JPG.',
    ],
    faqs: [
      {
        q: 'Does this match Teletalk and BD government job photo rules?',
        a: 'Yes. It outputs an exact 300×300 pixel JPG kept under 100KB without stretching your face.',
      },
      {
        q: 'Will my face look stretched or squished?',
        a: 'No. Smart Center-Crop is enabled by default so your photo keeps its natural proportions.',
      },
    ],
  },
  {
    slug: 'resize-signature-300x80',
    category: 'Resize',
    toolType: 'resizer',
    shortName: '300×80 Signature',
    title: 'Resize Signature to 300x80 Pixels (Under 60KB) Free | ImageLab',
    metaDescription:
      'Convert and resize your scanned signature to exact 300x80 pixels under 60KB for government job & university admission forms. 100% private.',
    h1: 'Resize Signature to 300×80 Pixels',
    subtitle: 'Prepare crisp 300×80 px signatures under 60KB instantly without uploading your signature online.',
    defaults: {
      format: 'image/jpeg',
      width: 300,
      height: 80,
      targetSizeKB: 60,
      fitMode: 'cover',
    },
    howToSteps: [
      'Take a clear horizontal photo of your signature on white paper and crop close to it.',
      'Upload it here—300×80 px and 60KB JPG limit are already configured.',
      'Tap Resize Images Now and download your ready signature.',
    ],
    faqs: [
      {
        q: 'Is it safe to resize my personal signature here?',
        a: 'Yes. Because ImageLab processes files 100% inside your browser, your signature is never uploaded to any server.',
      },
    ],
  },
  {
    slug: 'passport-photo-resizer',
    category: 'Resize',
    toolType: 'resizer',
    shortName: 'Passport Resizer',
    title: 'Free Passport Photo Resizer (600x600 px) Online | ImageLab',
    metaDescription:
      'Resize photos to standard 600x600 pixel digital passport and visa dimensions right in your browser. Zero upload, 100% free.',
    h1: 'Digital Passport Photo Resizer (600×600)',
    subtitle: 'Format square 2×2 inch (600×600 px) digital passport and visa photos locally on your device.',
    defaults: {
      format: 'image/jpeg',
      width: 600,
      height: 600,
      targetSizeKB: 240,
      fitMode: 'cover',
    },
    howToSteps: [
      'Upload a front-facing portrait with a plain background.',
      'Dimensions are preset to 600×600 px (2×2 inch at 300 DPI) under 240KB.',
      'Click Resize Images Now and verify the result with Compare.',
    ],
    faqs: [
      {
        q: 'Why 600×600 pixels for online passport or US visa photos?',
        a: 'Most digital visa and e-passport portals require a minimum 600×600 pixel square JPG under 240KB.',
      },
    ],
  },
  {
    slug: 'youtube-thumbnail-resizer',
    category: 'Resize',
    toolType: 'resizer',
    shortName: 'YouTube Thumbnail',
    title: 'YouTube Thumbnail Resizer (1280x720 px) Free Online | ImageLab',
    metaDescription:
      'Resize any image to exact 1280x720 HD YouTube thumbnail dimensions under 2MB with smart center-crop. 100% free browser tool.',
    h1: 'YouTube Thumbnail Resizer (1280×720)',
    subtitle: 'Create crisp 16:9 HD 1280×720 thumbnails optimized for fast YouTube Studio uploads.',
    defaults: {
      format: 'image/jpeg',
      width: 1280,
      height: 720,
      quality: 0.9,
      fitMode: 'cover',
    },
    howToSteps: [
      'Upload your thumbnail design or still frame.',
      '1280×720 px (16:9 ratio) is automatically applied.',
      'Click Resize Images Now and download your ready thumbnail.',
    ],
    faqs: [
      {
        q: 'What is the recommended YouTube thumbnail size?',
        a: 'YouTube recommends 1280×720 pixels (16:9 aspect ratio) in JPG, PNG, or WEBP under 2MB.',
      },
    ],
  },

  // ================= ENHANCER =================
  {
    slug: 'brighten-dark-photo',
    category: 'Enhance',
    toolType: 'enhancer',
    shortName: 'Brighten Dark Photo',
    title: 'Brighten Dark Photos Online Free — Instant Light Fix | ImageLab',
    metaDescription:
      'Fix dark, underexposed photos directly in your browser. Adjust brightness, contrast, and color with instant Before/After preview.',
    h1: 'Brighten Dark Photos Online',
    subtitle: 'Lift shadows and bring dull or low-light photos back to life with real-time sliders.',
    defaults: { brightness: 118, contrast: 108, saturate: 108 },
    howToSteps: [
      'Upload your dark or underexposed photo.',
      'A gentle brightening preset (+18% brightness) is already loaded—tweak sliders if needed.',
      'Click Apply Enhancement and inspect Before/After before downloading.',
    ],
    faqs: [
      {
        q: 'Will brightening a photo reduce its resolution?',
        a: 'No. ImageLab keeps your original pixel width and height untouched while adjusting lighting.',
      },
    ],
  },
  {
    slug: 'auto-enhance-photo',
    category: 'Enhance',
    toolType: 'enhancer',
    shortName: 'Auto Photo Enhancer',
    title: 'Free Online Photo Enhancer — Auto Color & Contrast | ImageLab',
    metaDescription:
      'Enhance photo lighting, contrast, and vibrant colors in one click right in your browser. No signup, no watermarks, 100% private.',
    h1: 'Auto Photo Enhancer',
    subtitle: 'Give flat photos balanced brightness, crisp contrast, and natural color pop in seconds.',
    defaults: { brightness: 106, contrast: 114, saturate: 116 },
    howToSteps: [
      'Select up to 20 photos to enhance.',
      'Balanced Auto Enhance settings are pre-applied—or fine-tune manually.',
      'Click Apply Enhancement and download your upgraded images.',
    ],
    faqs: [
      {
        q: 'Can I batch enhance multiple product photos with the same look?',
        a: 'Yes! Upload multiple product photos at once to apply identical brightness, contrast, and saturation across every shot.',
      },
    ],
  },
];
