import { create } from 'zustand';
import { Reel } from '../types/reel';

interface ShortsStore {
  // Navigation & Active item
  activeIndex: number;
  setActiveIndex: (index: number) => void;

  // Audio & Playback state
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

  // Drawers & Modals
  activeCommentReel: Reel | null;
  openComments: (reel: Reel) => void;
  closeComments: () => void;

  activeShareReel: Reel | null;
  openShare: (reel: Reel) => void;
  closeShare: () => void;

  isUploadModalOpen: boolean;
  openUploadModal: () => void;
  closeUploadModal: () => void;
}

export const useShortsStore = create<ShortsStore>((set) => ({
  activeIndex: 0,
  setActiveIndex: (index) =>
    set((state) => ({
      activeIndex: index,
      isPlaying: state.activeIndex !== index ? true : state.isPlaying,
    })),

  // Start unmuted if possible, or muted fallback for browser policy
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

  activeCommentReel: null,
  openComments: (reel) => set({ activeCommentReel: reel }),
  closeComments: () => set({ activeCommentReel: null }),

  activeShareReel: null,
  openShare: (reel) => set({ activeShareReel: reel }),
  closeShare: () => set({ activeShareReel: null }),

  isUploadModalOpen: false,
  openUploadModal: () => set({ isUploadModalOpen: true }),
  closeUploadModal: () => set({ isUploadModalOpen: false }),
}));
