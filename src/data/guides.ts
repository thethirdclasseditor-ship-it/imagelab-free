import type { GuideArticle } from './guideArticles/types';
import { OPTIMIZATION_GUIDES } from './guideArticles/optimization';
import { PDF_WORKFLOW_GUIDES } from './guideArticles/pdfWorkflow';
import { PRIVACY_GUIDES } from './guideArticles/privacySecurity';
import { FORMATS_PRINT_GUIDES } from './guideArticles/formatsPrint';
import { GRAPHICS_TEXT_GUIDES } from './guideArticles/graphicsText';

export type {
  GuideArticle,
  GuideCategory,
  GuideSection,
  GuideTable,
  GuideFaq,
} from './guideArticles/types';

// Interleave categories so the /guides hub showcases Optimization, PDF, Privacy, Formats & Graphics evenly above the fold
function interleaveGuides(...groups: GuideArticle[][]): GuideArticle[] {
  const maxLen = Math.max(...groups.map((g) => g.length));
  const merged: GuideArticle[] = [];
  for (let i = 0; i < maxLen; i++) {
    for (const group of groups) {
      if (group[i]) merged.push(group[i]);
    }
  }
  return merged;
}

export const GUIDES: GuideArticle[] = interleaveGuides(
  OPTIMIZATION_GUIDES,
  PDF_WORKFLOW_GUIDES,
  PRIVACY_GUIDES,
  FORMATS_PRINT_GUIDES,
  GRAPHICS_TEXT_GUIDES
);
