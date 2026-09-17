'use client';

import React, { useState } from 'react';
import { X, Copy, Check, Share2, Send, MessageSquare, Code } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useShortsStore } from '../../store/useShortsStore';

export const ShareModal: React.FC = () => {
  const { activeShareReel, closeShare } = useShortsStore();
  const [copied, setCopied] = useState(false);

  if (!activeShareReel) return null;

  const shareUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/shorts/${activeShareReel.id}`
    : `https://instagram-shorts.app/shorts/${activeShareReel.id}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const sharePlatforms = [
    { name: 'WhatsApp', color: 'bg-emerald-600', icon: Send, url: `https://api.whatsapp.com/send?text=${encodeURIComponent(shareUrl)}` },
    { name: 'X / Twitter', color: 'bg-neutral-800', icon: MessageSquare, url: `https://twitter.com/intent/tweet?url=${encodeURIComponent(shareUrl)}` },
    { name: 'Telegram', color: 'bg-sky-500', icon: Send, url: `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}` },
    { name: 'Embed', color: 'bg-neutral-700', icon: Code, action: handleCopy },
  ];

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={closeShare}
          className="absolute inset-0 bg-black/75 backdrop-blur-md"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          className="relative w-full max-w-sm bg-[#1e1e1e] border border-white/10 rounded-3xl p-6 shadow-2xl z-10 text-white"
        >
          <div className="flex items-center justify-between pb-4 border-b border-white/10">
            <h3 className="font-bold text-lg flex items-center gap-2">
              <Share2 className="w-5 h-5 text-red-500" />
              Share Short
            </h3>
            <button
              onClick={closeShare}
              className="p-1 rounded-full hover:bg-white/10 text-neutral-400 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Quick Platform Icons */}
          <div className="grid grid-cols-4 gap-3 py-6">
            {sharePlatforms.map((p) => (
              <a
                key={p.name}
                href={p.url || '#'}
                target={p.url ? '_blank' : '_self'}
                rel="noreferrer"
                onClick={p.action}
                className="flex flex-col items-center gap-2 group cursor-pointer"
              >
                <div className={`w-12 h-12 rounded-2xl ${p.color} flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform`}>
                  <p.icon className="w-5 h-5 text-white" />
                </div>
                <span className="text-[11px] text-neutral-300 group-hover:text-white">{p.name}</span>
              </a>
            ))}
          </div>

          {/* Copy Link Input Bar */}
          <div className="flex items-center gap-2 p-2 bg-black/50 border border-white/10 rounded-2xl">
            <input
              type="text"
              readOnly
              value={shareUrl}
              className="flex-1 bg-transparent px-3 text-xs text-neutral-300 outline-none truncate"
            />
            <button
              onClick={handleCopy}
              className="px-4 py-2 rounded-xl bg-white text-black font-semibold text-xs flex items-center gap-1.5 hover:bg-neutral-200 transition-colors shadow"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
