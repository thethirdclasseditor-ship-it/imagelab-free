import type { ToolMode, ToolDefaults } from '../../components/ToolWorkspace';

export interface SeoUseCase {
  title: string;
  desc: string;
}

export interface SeoSpecTable {
  headers: string[];
  rows: string[][];
}

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
  overview: string[];
  useCases: SeoUseCase[];
  specTable: SeoSpecTable;
  proTips: string[];
  howToSteps: string[];
  faqs: { q: string; a: string }[];
  relatedGuides: { label: string; href: string }[];
}
