'use client';

import React, { useState } from 'react';
import { Reel } from '../../types/reel';
import { VideoPlayer } from './VideoPlayer';
import { VideoOverlay } from './VideoOverlay';
import { ProgressBar } from './ProgressBar';
import { reelsApi } from '../../lib/api';

interface ShortItemProps {
  reel: Reel;
  index: number;
  activeIndex: number;
  onLikeUpdate: (reelId: string, isLiked: boolean, count: number) => void;
}

export const ShortItem: React.FC<ShortItemProps> = ({
  reel,
  index,
  activeIndex,
  onLikeUpdate,
}) => {
  const distance = Math.abs(index - activeIndex);
  const isActive = distance === 0;
  // Instagram/TikTok Sliding Window: Preload 1 previous reel, active reel, and next 2 reels
  const shouldMountPlayer = index >= activeIndex - 1 && index <= activeIndex + 2;

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(reel.durationSeconds || 45);
  const [seekTime, setSeekTime] = useState<number | null>(null);
  const [viewLogged, setViewLogged] = useState(false);

  // Reset video position whenever the user returns to this reel
  React.useEffect(() => {
    if (isActive) {
      setCurrentTime(0);
      setSeekTime(null);
    } else {
      setCurrentTime(0);
      setSeekTime(null);
      setViewLogged(false);
    }
  }, [isActive]);

  // Toggle Like handler
  const handleToggleLike = async () => {
    const newIsLiked = !reel.isLiked;
    const currentLikes = reel.likesCount ?? 0;
    const newCount = newIsLiked ? currentLikes + 1 : Math.max(0, currentLikes - 1);
    onLikeUpdate(reel.id, newIsLiked, newCount);

    try {
      const res = await reelsApi.toggleLike(reel.id);
      onLikeUpdate(reel.id, res.isLiked, res.likesCount);
    } catch (err) {
      onLikeUpdate(reel.id, reel.isLiked ?? false, currentLikes);
    }
  };

  // Video progress and analytics
  const handleTimeUpdate = (time: number, totalDuration: number) => {
    setCurrentTime(time);
    if (totalDuration > 0) setDuration(totalDuration);

    if (isActive && time >= 3 && !viewLogged) {
      setViewLogged(true);
      reelsApi.recordView(reel.id, Math.round(time * 1000), false);
    }
  };

  // User dragged or clicked the seekbar
  const handleSeek = (newTime: number) => {
    setCurrentTime(newTime);
    setSeekTime(newTime);
  };

  return (
    <div className="short-slide-item w-full h-[calc(100dvh-3.5rem)] flex items-center justify-center relative px-2 py-1 md:py-1.5 snap-start select-none">
      {/* Centered 9:16 Video Frame */}
      <div className="relative w-full h-full md:h-[calc(100%-0.75rem)] md:w-auto md:aspect-[9/16] bg-black rounded-none md:rounded-2xl overflow-hidden shadow-2xl border-0 md:border md:border-white/10 ambient-glow flex items-center justify-center">
        {shouldMountPlayer ? (
          <VideoPlayer
            key={reel.id}
            src={reel.hlsUrl}
            poster={reel.thumbnailUrl || undefined}
            isActive={isActive}
            duration={duration}
            seekTime={seekTime}
            onTimeUpdate={handleTimeUpdate}
            onDoubleTapLike={handleToggleLike}
          />
        ) : (
          <div className="relative w-full h-full bg-black flex items-center justify-center overflow-hidden">
            {reel.thumbnailUrl ? (
              <img
                src={reel.thumbnailUrl}
                alt={reel.caption || 'Reel'}
                loading="lazy"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-12 h-12 rounded-full border border-white/20 flex items-center justify-center text-white/40 font-bold">
                9:16
              </div>
            )}
          </div>
        )}

        {/* Video Information Overlay */}
        <VideoOverlay reel={reel} />

        {/* Glowing Red Interactive Seekbar with Drag & Click Seeking */}
        <ProgressBar
          currentTime={currentTime}
          duration={duration}
          onSeek={handleSeek}
        />
      </div>
    </div>
  );
};
