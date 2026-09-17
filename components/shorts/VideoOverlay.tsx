'use client';

import React, { useState } from 'react';
import { Music, Check, BadgeCheck } from 'lucide-react';
import { Reel } from '../../types/reel';

interface VideoOverlayProps {
  reel: Reel;
}

export const VideoOverlay: React.FC<VideoOverlayProps> = ({ reel }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);

  return (
    <div className="absolute inset-x-0 bottom-0 p-4 pb-5 bg-gradient-to-t from-black/90 via-black/40 to-transparent pointer-events-none text-white z-10 flex flex-col gap-2.5">
      {/* Channel & Follow Button */}
      <div className="flex items-center gap-3 pointer-events-auto">
        <div className="relative w-10 h-10 rounded-full overflow-hidden border border-white/40 shadow">
          <img
            src={reel.user.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100'}
            alt={reel.user.displayName}
            className="w-full h-full object-cover"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <span className="font-bold text-sm tracking-wide text-white drop-shadow">
            @{reel.user.username}
          </span>
          {reel.user.isVerified && (
            <BadgeCheck className="w-4 h-4 fill-blue-500 text-white" />
          )}
        </div>

        <button
          onClick={(e) => {
            e.stopPropagation();
            setIsFollowing(!isFollowing);
          }}
          className={`ml-2 px-3.5 py-1 text-xs font-semibold rounded-full transition-all duration-200 shadow ${
            isFollowing
              ? 'bg-white/20 text-white hover:bg-white/30'
              : 'bg-white text-black hover:bg-neutral-200'
          }`}
        >
          {isFollowing ? 'Subscribed' : 'Subscribe'}
        </button>
      </div>

      {/* Caption & Hashtags */}
      <div className="pointer-events-auto max-w-[90%]">
        <p className={`text-sm text-neutral-100 font-normal leading-relaxed drop-shadow ${isExpanded ? '' : 'line-clamp-2'}`}>
          {reel.caption}
        </p>
        {reel.caption && reel.caption.length > 80 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
            className="text-xs font-semibold text-neutral-400 hover:text-white mt-0.5 transition-colors"
          >
            {isExpanded ? 'Show less' : '...more'}
          </button>
        )}
      </div>

      {/* Audio Pill */}
      {reel.audioName && (
        <div className="flex items-center gap-2 text-xs text-neutral-300 font-medium pointer-events-auto">
          <Music className="w-3.5 h-3.5 text-neutral-300 animate-pulse" />
          <span className="truncate max-w-[240px] drop-shadow">{reel.audioName}</span>
        </div>
      )}
    </div>
  );
};
