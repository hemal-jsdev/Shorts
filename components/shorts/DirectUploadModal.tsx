'use client';

import React from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useShortsStore } from '../../store/useShortsStore';
import { AdminCreatorStudio } from '../admin/AdminCreatorStudio';

interface DirectUploadModalProps {
  onReelCreated?: (newReel: any) => void;
}

export const DirectUploadModal: React.FC<DirectUploadModalProps> = ({ onReelCreated }) => {
  const { isUploadModalOpen, closeUploadModal } = useShortsStore();

  if (!isUploadModalOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="relative w-full max-w-4xl bg-neutral-950/95 border border-neutral-800 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-pink-500/10 my-auto overflow-hidden"
        >
          {/* Close Button */}
          <button
            type="button"
            onClick={closeUploadModal}
            className="absolute top-5 right-5 p-2 rounded-full bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors z-20"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Embedded Creator Studio */}
          <AdminCreatorStudio
            standalone={false}
            onReelCreated={(reel) => {
              if (onReelCreated) onReelCreated(reel);
              setTimeout(() => {
                closeUploadModal();
              }, 1200);
            }}
          />
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
