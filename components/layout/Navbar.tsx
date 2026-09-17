'use client';

import React from 'react';
import Link from 'next/link';
import { Play, Plus, Film, Bell, Search, Sparkles } from 'lucide-react';
import { useShortsStore } from '../../store/useShortsStore';

export const Navbar: React.FC = () => {
  const { openUploadModal } = useShortsStore();

  return (
    <header className="fixed top-0 inset-x-0 h-14 bg-black/40 backdrop-blur-md border-b border-white/5 z-40 px-4 md:px-6 flex items-center justify-between select-none">
      {/* Brand / Logo */}
      <Link href="/" className="flex items-center gap-2 group cursor-pointer">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-red-600 to-rose-500 flex items-center justify-center shadow-lg shadow-red-600/30 group-hover:scale-105 transition-transform">
          <Play className="w-4 h-4 fill-white text-white ml-0.5" />
        </div>
        <div className="flex items-center">
          <span className="font-extrabold text-lg tracking-tight text-white">Shorts</span>
          <span className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-white/10 text-neutral-300 border border-white/10">
            Cloudflare Stream
          </span>
        </div>
      </Link>

      {/* Right Controls - Clean Viewer Profile */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full overflow-hidden border border-white/20 shadow">
          <img
            src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&auto=format&fit=crop&q=80"
            alt="User Profile"
            className="w-full h-full object-cover"
          />
        </div>
      </div>
    </header>
  );
};
