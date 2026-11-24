import type { SeoToolPage } from './seoPresets/types';
import { COMPRESS_PAGES } from './seoPresets/compress';
import { CONVERT_PAGES } from './seoPresets/convert';
import { RESIZE_ENHANCE_PAGES } from './seoPresets/resizeEnhance';

export type { SeoToolPage, SeoUseCase, SeoSpecTable } from './seoPresets/types';

export const SEO_PAGES: SeoToolPage[] = [
  ...COMPRESS_PAGES,
  ...CONVERT_PAGES,
  ...RESIZE_ENHANCE_PAGES,
];
