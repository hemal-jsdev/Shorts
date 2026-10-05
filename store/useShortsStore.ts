import { create } from 'zustand';
import { Reel } from '../types/reel';

// ── Quality label type ──────────────────────────────────────────────────────
export type QualityLabel = 'auto' | '144p' | '240p' | '360p' | '480p' | '720p' | '1080p';

const QUALITY_KEY = 'shorts_preferred_quality';
function loadSavedQuality(): QualityLabel {
  if (typeof window === 'undefined') return 'auto';
  try {
    const v = localStorage.getItem(QUALITY_KEY);
    if (v && ['auto', '144p', '240p', '360p', '480p', '720p', '1080p'].includes(v)) {
      return v as QualityLabel;
    }
  } catch {}
  return 'auto';
}

interface ShortsStore {
  activeIndex: number;
  setActiveIndex: (index: number) => void;

  isMuted: boolean;
  volume: number;
  isPlaying: boolean;
  isAutoScroll: boolean;
  toggleMute: () => void;
  setMuted: (muted: boolean) => void;
  setVolume: (volume: number) => void;
  togglePlayPause: () => void;
  setIsPlaying: (playing: boolean) => void;
  toggleAutoScroll: () => void;
  setAutoScroll: (autoScroll: boolean) => void;

  selectedQuality: QualityLabel;
  setSelectedQuality: (quality: QualityLabel) => void;

  activeCommentReel: Reel | null;
  openComments: (reel: Reel) => void;
  closeComments: () => void;

  activeShareReel: Reel | null;
  openShare: (reel: Reel) => void;
  closeShare: () => void;

  isUploadModalOpen: boolean;
  openUploadModal: () => void;
  closeUploadModal: () => void;

  ads: import('../types/ad').SponsoredAd[];
  setAds: (ads: import('../types/ad').SponsoredAd[]) => void;
  adCadence: number;
  setAdCadence: (cadence: number) => void;

  scrolledReelsSinceAd: string[];
  watched90ReelsSinceAd: string[];
  recordReelScrolled: (reelId: string) => void;
  recordReelWatched90: (reelId: string) => void;
  resetAdTrackingCounters: () => void;
}

export const useShortsStore = create<ShortsStore>((set) => ({
  activeIndex: 0,
  setActiveIndex: (index) =>
    set((state) => ({
      activeIndex: index,
      isPlaying: state.activeIndex !== index ? true : state.isPlaying,
    })),

  isMuted: true,
  volume: 1,
  isPlaying: true,
  isAutoScroll: true,
  toggleMute: () => set((state) => ({ isMuted: !state.isMuted })),
  setMuted: (muted) => set({ isMuted: muted }),
  setVolume: (volume) => set({ volume, isMuted: volume === 0 }),
  togglePlayPause: () => set((state) => ({ isPlaying: !state.isPlaying })),
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  toggleAutoScroll: () => set((state) => ({ isAutoScroll: !state.isAutoScroll })),
  setAutoScroll: (autoScroll) => set({ isAutoScroll: autoScroll }),

  selectedQuality: loadSavedQuality(),
  setSelectedQuality: (quality) => {
    try { localStorage.setItem(QUALITY_KEY, quality); } catch {}
    set({ selectedQuality: quality });
  },

  activeCommentReel: null,
  openComments: (reel) => set({ activeCommentReel: reel }),
  closeComments: () => set({ activeCommentReel: null }),

  activeShareReel: null,
  openShare: (reel) => set({ activeShareReel: reel }),
  closeShare: () => set({ activeShareReel: null }),

  isUploadModalOpen: false,
  openUploadModal: () => set({ isUploadModalOpen: true }),
  closeUploadModal: () => set({ isUploadModalOpen: false }),

  ads: [],
  setAds: (ads) => set({ ads }),
  adCadence: 4,
  setAdCadence: (adCadence) => set({ adCadence }),

  scrolledReelsSinceAd: [],
  watched90ReelsSinceAd: [],
  recordReelScrolled: (reelId: string) =>
    set((state) => {
      if (state.scrolledReelsSinceAd.includes(reelId)) return state;
      return { scrolledReelsSinceAd: [...state.scrolledReelsSinceAd, reelId] };
    }),
  recordReelWatched90: (reelId: string) =>
    set((state) => {
      if (state.watched90ReelsSinceAd.includes(reelId)) return state;
      return { watched90ReelsSinceAd: [...state.watched90ReelsSinceAd, reelId] };
    }),
  resetAdTrackingCounters: () =>
    set({ scrolledReelsSinceAd: [], watched90ReelsSinceAd: [] }),
}));
