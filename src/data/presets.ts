import type { FitMode } from '../engine/imageEngine';

export interface ResizePreset {
  id: string;
  label: string;
  width: number;
  height: number;
  fitMode: FitMode;
  targetSizeKB?: number;
}

export const RESIZE_PRESETS: ResizePreset[] = [
  {
    id: 'portrait-300',
    label: '300×300 Photo (<100KB)',
    width: 300,
    height: 300,
    fitMode: 'cover',
    targetSizeKB: 100,
  },
  {
    id: 'signature-300x80',
    label: '300×80 Signature (<60KB)',
    width: 300,
    height: 80,
    fitMode: 'contain',
    targetSizeKB: 60,
  },
  {
    id: 'passport-600',
    label: 'Passport 600×600 (<240KB)',
    width: 600,
    height: 600,
    fitMode: 'cover',
    targetSizeKB: 240,
  },
  {
    id: 'youtube-thumb',
    label: 'YouTube 1280×720',
    width: 1280,
    height: 720,
    fitMode: 'cover',
  },
  {
    id: 'insta-square',
    label: 'Instagram 1080×1080',
    width: 1080,
    height: 1080,
    fitMode: 'cover',
  },
  {
    id: 'insta-portrait',
    label: 'Instagram 1080×1350',
    width: 1080,
    height: 1350,
    fitMode: 'cover',
  },
];

export const TARGET_KB_PRESETS: number[] = [20, 50, 100, 200];
