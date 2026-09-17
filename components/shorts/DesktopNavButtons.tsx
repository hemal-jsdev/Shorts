'use client';

import React from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { motion } from 'framer-motion';

interface DesktopNavButtonsProps {
  onPrev: () => void;
  onNext: () => void;
  hasPrev: boolean;
  hasNext: boolean;
}

export const DesktopNavButtons: React.FC<DesktopNavButtonsProps> = ({
  onPrev,
  onNext,
  hasPrev,
  hasNext,
}) => {
  return (
    <div className="hidden md:flex flex-col items-center gap-3 select-none">
      {/* Up Button */}
      <motion.button
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={onPrev}
        disabled={!hasPrev}
        aria-label="Previous Short (Up Arrow or K)"
        title="Previous Short (Up Arrow / K)"
        className={`p-3 rounded-full transition-all duration-200 shadow-xl ${
          hasPrev
            ? 'glass-button text-white hover:bg-white/25 cursor-pointer'
            : 'bg-white/5 text-white/20 cursor-not-allowed border border-white/5'
        }`}
      >
        <ChevronUp className="w-6 h-6 stroke-[2.5]" />
      </motion.button>

      {/* Down Button */}
      <motion.button
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={onNext}
        disabled={!hasNext}
        aria-label="Next Short (Down Arrow or J)"
        title="Next Short (Down Arrow / J)"
        className={`p-3 rounded-full transition-all duration-200 shadow-xl ${
          hasNext
            ? 'glass-button text-white hover:bg-white/25 cursor-pointer'
            : 'bg-white/5 text-white/20 cursor-not-allowed border border-white/5'
        }`}
      >
        <ChevronDown className="w-6 h-6 stroke-[2.5]" />
      </motion.button>
    </div>
  );
};
