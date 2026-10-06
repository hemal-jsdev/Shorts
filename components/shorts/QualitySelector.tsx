'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Settings, Check, Sliders, X } from 'lucide-react';
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
  /** Whether a quality switch is currently buffering/in progress */
  isSwitching?: boolean;
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
  isSwitching = false,
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

  // Determine current auto-resolved level for display
  const matchedAutoLevel = autoLevelIndex >= 0 ? availableLevels.find((l) => l.index === autoLevelIndex) : null;
  const autoResolvedLabel = matchedAutoLevel ? resolutionToLabel(getLevelResolution(matchedAutoLevel)) : null;

  // Effective quality currently active on this video (ensures checkmark is never on an unavailable resolution)
  const effectiveQuality = (() => {
    if (selectedQuality === 'auto') return 'auto';
    const isSupported = availableLevels.some(
      (l) => resolutionToLabel(getLevelResolution(l)) === selectedQuality
    );
    if (isSupported) return selectedQuality;
    const bestIdx = findBestLevelIndex(availableLevels, selectedQuality);
    const matched = availableLevels.find((l) => l.index === bestIdx);
    return matched ? resolutionToLabel(getLevelResolution(matched)) : 'auto';
  })();

  // What label to show on the top-right pill badge
  const badgeLabel =
    selectedQuality === 'auto'
      ? autoResolvedLabel ?? 'Auto'
      : effectiveQuality;

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
          className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/75 backdrop-blur-md p-4 select-none"
          onClick={(e) => {
            e.stopPropagation();
            setOpen(false);
          }}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
        >
          {/* Centered Modal Card */}
          <motion.div
            key="quality-modal-card"
            ref={modalRef}
            initial={{ opacity: 0, scale: 0.94, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 10 }}
            transition={{ type: 'spring', damping: 26, stiffness: 400 }}
            className="w-[280px] max-w-[88vw] bg-[#121319]/95 backdrop-blur-2xl border border-white/15 rounded-2xl shadow-[0_24px_70px_rgba(0,0,0,0.85)] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-4 pt-3.5 pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Sliders className="w-3.5 h-3.5 text-white/60" />
                <div>
                  <h3 className="text-white text-xs font-semibold tracking-wide uppercase">
                    Quality
                  </h3>
                  <p className="text-white/40 text-[10px] leading-tight">
                    {isYouTube
                      ? 'Managed by YouTube'
                      : selectedQuality === 'auto'
                      ? autoResolvedLabel
                        ? `Auto • ${autoResolvedLabel}`
                        : 'Auto'
                      : effectiveQuality}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-6 h-6 rounded-full bg-white/5 hover:bg-white/15 text-white/60 hover:text-white flex items-center justify-center transition-all cursor-pointer"
                title="Close"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Modal Options Body */}
            <div className="p-2 flex flex-col gap-0.5 max-h-[60vh] overflow-y-auto">
              {/* Auto Option */}
              <button
                type="button"
                onClick={() => handleSelect('auto')}
                disabled={isYouTube}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-all duration-150 ${
                  isYouTube
                    ? 'opacity-40 cursor-not-allowed text-white/40'
                    : selectedQuality === 'auto'
                    ? 'bg-white/15 text-white font-semibold cursor-pointer'
                    : 'text-white/80 hover:bg-white/10 hover:text-white cursor-pointer'
                }`}
              >
                <div className="flex flex-col">
                  <span className="text-sm">Auto</span>
                  <span className="text-[10px] text-white/40">
                    {autoResolvedLabel
                      ? `Adjusts to connection • Currently ${autoResolvedLabel}`
                      : 'Adjusts automatically to connection'}
                  </span>
                </div>
                {selectedQuality === 'auto' && (
                  <Check className="w-4 h-4 text-white stroke-[2.5] flex-shrink-0" />
                )}
              </button>

              {/* Subtle Divider */}
              <div className="mx-2 my-1 h-px bg-white/10" />

              {/* Standard Resolution Options */}
              {STANDARD_QUALITIES.map((label) => {
                // An option is suitable/available only if it exists in the active video's manifest
                const isSupported =
                  !isYouTube &&
                  availableLevels.some(
                    (l) => resolutionToLabel(getLevelResolution(l)) === label
                  );

                const isSelected = isSupported && effectiveQuality === label;

                return (
                  <button
                    key={label}
                    type="button"
                    onClick={() => {
                      if (isSupported) {
                        handleSelect(label);
                      }
                    }}
                    disabled={!isSupported || isYouTube}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-left transition-all duration-150 ${
                      !isSupported || isYouTube
                        ? 'opacity-25 cursor-not-allowed text-white/30'
                        : isSelected
                        ? 'bg-white/15 text-white font-semibold cursor-pointer'
                        : 'text-white/80 hover:bg-white/10 hover:text-white cursor-pointer'
                    }`}
                  >
                    <span className="text-sm">{label}</span>

                    <div className="flex items-center gap-1.5">
                      {!isSupported && !isYouTube && (
                        <span className="text-[10px] text-white/30">
                          Unavailable
                        </span>
                      )}
                      {isSelected && (
                        <Check className="w-4 h-4 text-white stroke-[2.5] flex-shrink-0" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
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
        title={isYouTube ? 'Quality managed by YouTube' : `Video quality: ${badgeLabel}`}
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
          'relative flex items-center gap-1.5 px-3 py-1.5 rounded-full shadow-[0_4px_16px_rgba(0,0,0,0.5)]',
          'bg-black/75 backdrop-blur-md border transition-all duration-200 select-none group',
          isYouTube
            ? 'border-white/10 opacity-40 cursor-not-allowed'
            : isSwitching
            ? 'border-emerald-400/60 bg-emerald-950/40 text-emerald-200 cursor-pointer'
            : 'border-white/20 hover:border-white/40 hover:bg-black/90 cursor-pointer',
        ].join(' ')}
        style={{ WebkitTouchCallout: 'none' }}
      >
        {/* Gear icon with switching spin animation */}
        <motion.div
          animate={isSwitching ? { rotate: 360 } : { rotate: 0 }}
          transition={
            isSwitching
              ? { repeat: Infinity, ease: 'linear', duration: 1.2 }
              : { duration: 0.2 }
          }
          className="flex items-center justify-center"
        >
          <Settings
            className={`w-3.5 h-3.5 transition-colors ${
              isSwitching
                ? 'text-emerald-400'
                : 'text-white/85 group-hover:text-white'
            }`}
          />
        </motion.div>

        {/* Animated label transition */}
        <AnimatePresence mode="wait">
          <motion.span
            key={badgeLabel}
            initial={{ opacity: 0, y: 2 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -2 }}
            transition={{ duration: 0.15 }}
            className={`font-semibold leading-none text-[11px] ${
              isSwitching ? 'text-emerald-300' : 'text-white'
            }`}
          >
            {badgeLabel}
          </motion.span>
        </AnimatePresence>

        {/* Subtle switching pulse dot */}
        {isSwitching && (
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping absolute -top-0.5 -right-0.5" />
        )}
      </button>

      {/* ── Render Popup Modal at Center of Screen ── */}
      {mounted && typeof document !== 'undefined'
        ? createPortal(modalContent, document.body)
        : null}
    </>
  );
};
