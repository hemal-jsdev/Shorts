'use client';

import React, { useState } from 'react';
import { Heart, MessageCircle, Share2, ThumbsDown, MoreVertical, Disc } from 'lucide-react';
import { motion } from 'framer-motion';
import { Reel } from '../../types/reel';
import { useShortsStore } from '../../store/useShortsStore';

interface ActionSidebarProps {
  reel: Reel;
  onToggleLike: () => void;
}

export const ActionSidebar: React.FC<ActionSidebarProps> = ({ reel, onToggleLike }) => {
  const { openComments, openShare } = useShortsStore();
  const [isDisliked, setIsDisliked] = useState(false);

  // Format large numbers (e.g. 14.2K, 1.2M)
  const formatCount = (count?: number) => {
    if (!count) return '0';
    if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
    if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
    return count.toString();
  };

  return (
    <div className="flex flex-col items-center gap-4 text-white select-none">
      {/* Like Button */}
      <div className="flex flex-col items-center gap-1">
        <motion.button
          whileHover={{ scale: 1.12 }}
          whileTap={{ scale: 0.88 }}
          onClick={onToggleLike}
          aria-label="Like reel"
          className={`p-3.5 rounded-full transition-all duration-200 shadow-md ${
            reel.isLiked
              ? 'bg-red-500/20 text-red-500 border border-red-500/40'
              : 'glass-button text-white'
          }`}
        >
          <Heart
            className={`w-6 h-6 transition-colors ${
              reel.isLiked ? 'fill-red-500 text-red-500' : 'text-white stroke-[2.2]'
            }`}
          />
        </motion.button>
        <span className="text-xs font-semibold tracking-wide drop-shadow">
          {reel.isLiked ? 'Liked' : 'Like'}
        </span>
      </div>

      {/* Dislike Button */}
      <div className="flex flex-col items-center gap-1">
        <motion.button
          whileHover={{ scale: 1.12 }}
          whileTap={{ scale: 0.88 }}
          onClick={() => setIsDisliked(!isDisliked)}
          aria-label="Dislike reel"
          className={`p-3.5 rounded-full transition-all duration-200 shadow-md ${
            isDisliked ? 'bg-white/25 text-white' : 'glass-button text-white'
          }`}
        >
          <ThumbsDown
            className={`w-6 h-6 stroke-[2.2] ${isDisliked ? 'fill-white text-white' : 'text-white'}`}
          />
        </motion.button>
        <span className="text-xs font-semibold tracking-wide drop-shadow">Dislike</span>
      </div>

      {/* Comments Button */}
      <div className="flex flex-col items-center gap-1">
        <motion.button
          whileHover={{ scale: 1.12 }}
          whileTap={{ scale: 0.88 }}
          onClick={() => openComments(reel)}
          aria-label="Open comments"
          className="p-3.5 rounded-full glass-button text-white shadow-md"
        >
          <MessageCircle className="w-6 h-6 stroke-[2.2]" />
        </motion.button>
        <span className="text-xs font-semibold tracking-wide drop-shadow">
          Comments
        </span>
      </div>

      {/* Share Button */}
      <div className="flex flex-col items-center gap-1">
        <motion.button
          whileHover={{ scale: 1.12 }}
          whileTap={{ scale: 0.88 }}
          onClick={() => openShare(reel)}
          aria-label="Share reel"
          className="p-3.5 rounded-full glass-button text-white shadow-md"
        >
          <Share2 className="w-6 h-6 stroke-[2.2]" />
        </motion.button>
        <span className="text-xs font-semibold tracking-wide drop-shadow">Share</span>
      </div>

      {/* Audio Pill / Spinning Vinyl Album Art */}
      <div className="mt-2 flex flex-col items-center">
        <div className="relative w-10 h-10 rounded-full bg-neutral-900 border-2 border-white/40 overflow-hidden shadow-lg animate-spin-slow">
          <img
            src={reel.user.avatarUrl || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100'}
            alt="Audio track"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 m-auto w-3 h-3 rounded-full bg-neutral-950 border border-white/60" />
        </div>
      </div>
    </div>
  );
};
