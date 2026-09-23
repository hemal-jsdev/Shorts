'use client';

import React, { useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ProgressBarProps {
  currentTime: number;
  duration: number;
  adCuepoints?: number[];
  onSeek?: (newTime: number) => void;
  onSeekStart?: () => void;
  onSeekEnd?: (finalTime: number) => void;
  disabled?: boolean;
  isAd?: boolean;
  showTime?: boolean;
}

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  currentTime,
  duration,
  adCuepoints,
  onSeek,
  onSeekStart,
  onSeekEnd,
  disabled = false,
  isAd = false,
  showTime = false,
}) => {
  const barRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragTime, setDragTime] = useState<number | null>(null);

  const effectiveTime = isDragging && dragTime !== null ? dragTime : currentTime;
  const percentage = duration > 0 ? Math.min(100, Math.max(0, (effectiveTime / duration) * 100)) : 0;

  const calculateTimeFromClientX = useCallback(
    (clientX: number) => {
      if (!barRef.current || duration <= 0) return 0;
      const rect = barRef.current.getBoundingClientRect();
      const pos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return pos * duration;
    },
    [duration],
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || !onSeek) return;
    e.preventDefault();
    e.stopPropagation();

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (_) {}

    setIsDragging(true);
    onSeekStart?.();
    const newTime = calculateTimeFromClientX(e.clientX);
    setDragTime(newTime);
    if (onSeek) onSeek(newTime);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    e.preventDefault();
    e.stopPropagation();

    const newTime = calculateTimeFromClientX(e.clientX);
    setDragTime(newTime);
    if (onSeek) onSeek(newTime);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    e.preventDefault();
    e.stopPropagation();

    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch (_) {}

    const finalTime = calculateTimeFromClientX(e.clientX);
    setIsDragging(false);
    setDragTime(null);
    if (onSeek) onSeek(finalTime);
    onSeekEnd?.(finalTime);
  };

  return (
    <div
      ref={barRef}
      onPointerDown={isAd ? undefined : handlePointerDown}
      onPointerMove={isAd ? undefined : handlePointerMove}
      onPointerUp={isAd ? undefined : handlePointerUp}
      onPointerCancel={isAd ? undefined : handlePointerUp}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      className={`absolute bottom-0 inset-x-0 z-30 flex flex-col justify-end pb-0 select-none touch-none ${
        isAd || disabled || !onSeek ? 'pointer-events-none cursor-default' : 'h-7 cursor-pointer group'
      }`}
      style={{ WebkitTouchCallout: 'none', userSelect: 'none' }}
    >
      <div
        className={`w-full transition-all duration-150 relative bg-white/25 backdrop-blur-sm ${
          isAd ? 'h-1' : isDragging ? 'h-2' : disabled || !onSeek ? 'h-1' : 'h-1 group-hover:h-2'
        }`}
      >
        {!isAd &&
          adCuepoints &&
          adCuepoints.map((ratio, i) => (
            <div
              key={`cue-${i}`}
              className="absolute top-0 bottom-0 w-1.5 -translate-x-1/2 bg-amber-400 rounded-sm z-10 shadow-[0_0_6px_rgba(251,191,36,0.9)] pointer-events-none"
              style={{ left: `${ratio * 100}%` }}
            />
          ))}

        <div
          className={`h-full relative transition-[width] ${
            isAd
              ? 'bg-white shadow-[0_0_8px_rgba(255,255,255,0.95)] duration-100 ease-linear'
              : 'bg-gradient-to-r from-red-600 to-red-500 duration-75 shadow-[0_0_12px_rgba(239,68,68,0.9)]'
          }`}
          style={{ width: `${percentage}%` }}
        >
          {!isAd && !disabled && onSeek && (
            <div
              className={`absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 rounded-full bg-red-600 ring-2 ring-white shadow-lg transition-transform duration-150 ${
                isDragging
                  ? 'w-4 h-4 scale-125 opacity-100'
                  : 'w-3 h-3 opacity-0 group-hover:opacity-100'
              }`}
            />
          )}
        </div>
      </div>
    </div>
  );
};
