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
  { id: 'job-photo', label: 'Job Photo (300×300)', width: 300, height: 300, fitMode: 'cover', targetSizeKB: 100 },
  { id: 'job-sign', label: 'Signature (300×80)', width: 300, height: 80, fitMode: 'contain', targetSizeKB: 60 },
  { id: 'passport', label: 'Passport (600×600)', width: 600, height: 600, fitMode: 'cover', targetSizeKB: 240 },
  { id: 'ig-square', label: 'Instagram Post (1080×1080)', width: 1080, height: 1080, fitMode: 'cover' },
  { id: 'yt-thumb', label: 'YouTube Thumb (1280×720)', width: 1280, height: 720, fitMode: 'cover' },
  { id: 'fb-cover', label: 'Facebook Cover (820×312)', width: 820, height: 312, fitMode: 'cover' },
];

export const TARGET_KB_PRESETS = [20, 50, 100, 200, 500];
