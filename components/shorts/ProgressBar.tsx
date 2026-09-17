'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';

interface ProgressBarProps {
  currentTime: number;
  duration: number;
  onSeek?: (newTime: number) => void;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ currentTime, duration, onSeek }) => {
  const barRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragTime, setDragTime] = useState<number | null>(null);

  const effectiveTime = isDragging && dragTime !== null ? dragTime : currentTime;
  const percentage = duration > 0 ? (effectiveTime / duration) * 100 : 0;

  const calculateTimeFromEvent = useCallback(
    (clientX: number) => {
      if (!barRef.current || duration <= 0) return 0;
      const rect = barRef.current.getBoundingClientRect();
      const clickPos = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return clickPos * duration;
    },
    [duration],
  );

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    setIsDragging(true);
    const time = calculateTimeFromEvent(e.clientX);
    setDragTime(time);
    if (onSeek) onSeek(time);
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const time = calculateTimeFromEvent(e.clientX);
      setDragTime(time);
    };

    const handleMouseUp = (e: MouseEvent) => {
      setIsDragging(false);
      const finalTime = calculateTimeFromEvent(e.clientX);
      setDragTime(null);
      if (onSeek) onSeek(finalTime);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, calculateTimeFromEvent, onSeek]);

  return (
    <div
      ref={barRef}
      onMouseDown={handleMouseDown}
      className={`absolute bottom-0 inset-x-0 group z-30 cursor-pointer transition-all duration-150 ${
        isDragging ? 'h-3' : 'h-1.5 hover:h-2.5'
      } bg-white/20 backdrop-blur-sm`}
    >
      {/* Red Active Seekbar Fill */}
      <div
        className="h-full bg-red-600 relative transition-all duration-75 shadow-[0_0_10px_rgba(239,68,68,0.9)]"
        style={{ width: `${Math.min(100, Math.max(0, percentage))}%` }}
      >
        {/* Scrubber Dot Knob */}
        <div
          className={`absolute right-0 top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-red-600 shadow-md ring-2 ring-white transition-opacity ${
            isDragging ? 'opacity-100 scale-110' : 'opacity-0 group-hover:opacity-100'
          }`}
        />
      </div>
    </div>
  );
};
