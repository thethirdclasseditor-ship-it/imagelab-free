export type GuideCategory =
  | 'Optimization'
  | 'PDF Workflow'
  | 'Privacy'
  | 'Formats'
  | 'Graphics & Text';

export interface GuideTable {
  headers: string[];
  rows: string[][];
}

export interface GuideFaq {
  q: string;
  a: string;
}

export interface GuideSection {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
  table?: GuideTable;
  callout?: {
    title: string;
    body: string;
  };
}

export interface GuideArticle {
  slug: string;
  category: GuideCategory;
  title: string;
  metaTitle: string;
  description: string;
  readTime: string;
  updatedAt: string;
  intro: string;
  keyTakeaways?: string[];
  sections: GuideSection[];
  faqs?: GuideFaq[];
  relatedTools: { label: string; href: string; desc: string }[];
}
