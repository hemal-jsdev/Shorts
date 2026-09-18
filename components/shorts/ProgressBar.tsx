'use client';

import React, { useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface ProgressBarProps {
  currentTime: number;
  duration: number;
  onSeek?: (newTime: number) => void;
}

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ currentTime, duration, onSeek }) => {
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
    e.preventDefault();
    e.stopPropagation();

    // Lock all pointer movements to this element even if finger moves outside bounds
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (_) {}

    setIsDragging(true);
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
  };

  return (
    <div
      ref={barRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      className="absolute bottom-0 inset-x-0 z-30 h-7 flex items-end pb-0 cursor-pointer select-none touch-none group"
      style={{ WebkitTouchCallout: 'none', userSelect: 'none' }}
    >
      {/* Floating Scrubber Time Tooltip (YouTube Shorts Style) */}
      <AnimatePresence>
        {isDragging && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.85 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.85 }}
            transition={{ duration: 0.15 }}
            style={{ left: `${percentage}%` }}
            className="absolute bottom-6 -translate-x-1/2 pointer-events-none z-40"
          >
            <div className="px-2.5 py-1 rounded-full bg-black/90 backdrop-blur-md border border-white/20 shadow-2xl flex items-center gap-1 text-[11px] font-bold text-white whitespace-nowrap">
              <span className="text-red-400">{formatTime(effectiveTime)}</span>
              <span className="text-white/40">/</span>
              <span className="text-white/80">{formatTime(duration)}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Progress Track Background */}
      <div
        className={`w-full transition-all duration-150 relative bg-white/25 backdrop-blur-sm ${
          isDragging ? 'h-2' : 'h-1 group-hover:h-2'
        }`}
      >
        {/* Active Red Fill Bar */}
        <div
          className="h-full bg-gradient-to-r from-red-600 to-red-500 relative transition-[width] duration-75 shadow-[0_0_12px_rgba(239,68,68,0.9)]"
          style={{ width: `${percentage}%` }}
        >
          {/* Scrubber Knob Thumb */}
          <div
            className={`absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 rounded-full bg-red-600 ring-2 ring-white shadow-lg transition-transform duration-150 ${
              isDragging
                ? 'w-4 h-4 scale-125 opacity-100'
                : 'w-3 h-3 opacity-0 group-hover:opacity-100'
            }`}
          />
        </div>
      </div>
    </div>
  );
};
