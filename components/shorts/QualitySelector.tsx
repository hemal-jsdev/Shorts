'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Settings, Check } from 'lucide-react';
import { useShortsStore, QualityLabel } from '../../store/useShortsStore';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HlsLevel {
  height: number;
  width: number;
  bitrate: number;
  index: number; // actual HLS.js level index
}

interface QualitySelectorProps {
  /** All renditions available in the HLS manifest */
  availableLevels: HlsLevel[];
  /** Currently auto-selected HLS level index (-1 = not yet resolved) */
  autoLevelIndex: number;
  /** Whether this is a YouTube-sourced video (quality not controllable) */
  isYouTube?: boolean;
  /** Callback when user picks a quality — passes HLS level index or -1 for auto */
  onQualityChange: (levelIndex: number, label: QualityLabel) => void;
}

// ─── Standard YouTube-style quality options ──────────────────────────────────

export const STANDARD_QUALITIES: QualityLabel[] = [
  '1080p',
  '720p',
  '480p',
  '360p',
  '240p',
  '144p',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * In digital video (especially vertical Shorts / Reels 9:16),
 * the standard resolution label (1080p, 720p, etc.) refers to the short dimension:
 * e.g. 1080x1920 -> 1080p, 720x1280 -> 720p, 480x854 -> 480p, 360x640 -> 360p.
 */
export function getLevelResolution(level: { width?: number; height?: number }): number {
  const w = level.width || 0;
  const h = level.height || 0;
  if (w > 0 && h > 0) {
    return Math.min(w, h);
  }
  return h || w || 0;
}

/** Map a pixel resolution (short dimension) to the closest quality label */
export function resolutionToLabel(res: number): QualityLabel {
  if (res >= 1000) return '1080p';
  if (res >= 700) return '720p';
  if (res >= 450) return '480p';
  if (res >= 320) return '360p';
  if (res >= 200) return '240p';
  return '144p';
}

/** Legacy alias pointing to resolutionToLabel */
export function heightToLabel(height: number): QualityLabel {
  return resolutionToLabel(height);
}

/**
 * Finds the best matching HLS level index for a requested quality label.
 * If exact match exists, uses it.
 * If requested quality is higher than video source, gracefully selects highest available.
 * If requested quality is lower, selects closest without exceeding, or lowest.
 */
export function findBestLevelIndex(levels: HlsLevel[], targetLabel: QualityLabel): number {
  if (targetLabel === 'auto' || !levels || levels.length === 0) return -1;
  const targetRes = parseInt(targetLabel, 10);
  if (isNaN(targetRes)) return -1;

  // 1. Exact match
  const exact = levels.find((l) => resolutionToLabel(getLevelResolution(l)) === targetLabel);
  if (exact) return exact.index;

  // 2. Highest available level that does not exceed targetRes
  const sorted = [...levels].sort((a, b) => getLevelResolution(b) - getLevelResolution(a));
  const under = sorted.find((l) => getLevelResolution(l) <= targetRes);
  if (under) return under.index;

  // 3. Fallback to lowest available level
  return sorted[sorted.length - 1].index;
}

// ─── Component ────────────────────────────────────────────────────────────────

export const QualitySelector: React.FC<QualitySelectorProps> = ({
  availableLevels,
  autoLevelIndex,
  isYouTube = false,
  onQualityChange,
}) => {
  const { selectedQuality, setSelectedQuality } = useShortsStore();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  // Ensure portal target is only used on client
  useEffect(() => {
    setMounted(true);
  }, []);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const handleSelect = useCallback(
    (label: QualityLabel) => {
      const bestLevelIndex = findBestLevelIndex(availableLevels, label);
      setSelectedQuality(label);
      onQualityChange(bestLevelIndex, label);
      setOpen(false);
    },
    [availableLevels, setSelectedQuality, onQualityChange]
  );

  // Determine current auto-resolved label for display
  const autoResolvedLabel =
    autoLevelIndex >= 0 && availableLevels[autoLevelIndex]
      ? resolutionToLabel(getLevelResolution(availableLevels[autoLevelIndex]))
      : null;

  // What label to show on the top-right pill badge
  const badgeLabel =
    selectedQuality === 'auto'
      ? autoResolvedLabel
        ? autoResolvedLabel
        : 'Auto'
      : selectedQuality;

  if (availableLevels.length === 0 && !isYouTube) return null;

  const modalContent = (
    <AnimatePresence>
      {open && (
        <motion.div
          key="quality-modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/65 backdrop-blur-sm p-4 select-none"
          onClick={(e) => {
            e.stopPropagation();
            setOpen(false);
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
        >
          {/* Centered Modal Card with Options Only */}
          <motion.div
            key="quality-modal-card"
            ref={modalRef}
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.94 }}
            transition={{ type: 'spring', damping: 25, stiffness: 400 }}
            className="w-64 max-w-[85vw] bg-[#16171d]/95 backdrop-blur-2xl border border-white/15 rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.85)] p-2 flex flex-col gap-1 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
          >
            {/* Auto Option */}
            <button
              type="button"
              onClick={() => handleSelect('auto')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm transition-colors text-left cursor-pointer ${
                selectedQuality === 'auto'
                  ? 'bg-white/15 text-white font-semibold'
                  : 'text-white/80 hover:bg-white/10 hover:text-white'
              }`}
            >
              <span>Auto</span>
              {selectedQuality === 'auto' && (
                <Check className="w-4 h-4 text-white stroke-[2.5]" />
              )}
            </button>

            {/* Standard Resolution Options: 1080p, 720p, 480p, 360p, 240p, 144p */}
            {STANDARD_QUALITIES.map((label) => {
              const isSelected = selectedQuality === label;

              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => handleSelect(label)}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm transition-colors text-left cursor-pointer ${
                    isSelected
                      ? 'bg-white/15 text-white font-semibold'
                      : 'text-white/80 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <span>{label}</span>
                  {isSelected && (
                    <Check className="w-4 h-4 text-white stroke-[2.5]" />
                  )}
                </button>
              );
            })}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <>
      {/* ── Gear button (Pill on Reel) ── */}
      <button
        type="button"
        aria-label="Video quality settings"
        title={isYouTube ? 'Quality managed by YouTube' : 'Change video quality'}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          if (!isYouTube) {
            setOpen(true);
          }
        }}
        onPointerDown={(e) => {
          e.stopPropagation();
        }}
        onPointerUp={(e) => {
          e.stopPropagation();
        }}
        className={[
          'relative flex items-center gap-1.5 px-3 py-1.5 rounded-full shadow-lg',
          'bg-black/70 backdrop-blur-md border transition-all duration-200 select-none',
          isYouTube
            ? 'border-white/10 opacity-40 cursor-not-allowed'
            : 'border-white/20 hover:border-white/40 hover:bg-black/90 cursor-pointer active:scale-95',
        ].join(' ')}
        style={{ WebkitTouchCallout: 'none' }}
      >
        <Settings className="w-3.5 h-3.5 text-white/85" />
        <span
          className="text-white font-semibold leading-none"
          style={{ fontSize: 11 }}
        >
          {badgeLabel}
        </span>
      </button>

      {/* ── Render Popup Modal at Center of Screen ── */}
      {mounted && typeof document !== 'undefined'
        ? createPortal(modalContent, document.body)
        : null}
    </>
  );
};
