'use client';

import React from 'react';

interface AdProgressBarProps {
  currentTime: number;
  duration: number;
  className?: string;
}

export const AdProgressBar: React.FC<AdProgressBarProps> = ({
  currentTime,
  duration,
  className = '',
}) => {
  const safeDuration = duration > 0 ? duration : 10;
  const safeTime = Math.min(safeDuration, Math.max(0, currentTime));
  const percentage = Math.min(100, Math.max(0, (safeTime / safeDuration) * 100));

  return (
    <div
      className={`absolute bottom-0 inset-x-0 z-30 pointer-events-none select-none touch-none ${className}`}
      style={{ WebkitTouchCallout: 'none', userSelect: 'none' }}
    >
      {/* Pure White Color Track (Strictly Non-Draggable) */}
      <div className="w-full h-1 bg-white/25 relative overflow-hidden backdrop-blur-sm">
        <div
          className="h-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.95)] transition-[width] duration-100 ease-linear"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};

export default AdProgressBar;
