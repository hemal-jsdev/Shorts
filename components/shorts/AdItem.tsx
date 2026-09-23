'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Globe,
  BadgeCheck,
  ArrowUpRight,
} from 'lucide-react';
import { SponsoredAd } from '../../types/ad';
import { VideoPlayer } from './VideoPlayer';
import { adsApi } from '../../lib/api';
import { AdProgressBar } from './AdProgressBar';

interface AdItemProps {
  ad: SponsoredAd;
  index: number;
  activeIndex: number;
  onEnded?: () => void;
}

export const AdItem: React.FC<AdItemProps> = ({
  ad,
  index,
  activeIndex,
  onEnded,
}) => {
  const distance = Math.abs(index - activeIndex);
  const isActive = distance === 0;
  const shouldMountPlayer = index >= activeIndex - 1 && index <= activeIndex + 2;

  const isImageAd =
    ad.mediaType === 'image' ||
    (!ad.videoUrl && Boolean(ad.imageUrl || ad.posterUrl)) ||
    Boolean(ad.imageUrl && !ad.videoUrl);

  const imageUrl = ad.imageUrl || ad.posterUrl || ad.videoUrl || '';

  const [duration, setDuration] = useState(ad.durationSeconds || 15);
  const [currentTime, setCurrentTime] = useState(0);
  const [isCaptionExpanded, setIsCaptionExpanded] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

  const impressionLoggedRef = useRef(false);

  useEffect(() => {
    if (isActive) {
      const timer = setTimeout(() => {
        if (!impressionLoggedRef.current) {
          impressionLoggedRef.current = true;
          adsApi.trackEvent(ad.id, 'impression');
        }
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [isActive, ad.id]);

  // Smooth timer for image-based in-feed ads
  useEffect(() => {
    if (!isImageAd || !isActive) {
      setCurrentTime(0);
      return;
    }

    const start = Date.now();
    const targetDuration = duration > 0 ? duration : 15;
    const interval = setInterval(() => {
      const elapsed = (Date.now() - start) / 1000;
      setCurrentTime(Math.min(targetDuration, elapsed));
      if (elapsed >= targetDuration) {
        clearInterval(interval);
        onEnded?.();
      }
    }, 100);

    return () => clearInterval(interval);
  }, [isImageAd, isActive, duration, onEnded]);

  const handleVideoTimeUpdate = (time: number, totalDuration: number) => {
    setCurrentTime(time);
    if (totalDuration > 0) setDuration(totalDuration);
  };

  const handleRedirect = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    adsApi.trackEvent(ad.id, 'click');
    if (ad.ctaUrl) {
      window.open(ad.ctaUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const domain =
    ad.displayDomain ||
    (ad.ctaUrl
      ? (() => {
          try {
            return new URL(ad.ctaUrl).hostname.replace(/^www\./, '');
          } catch {
            return 'sponsor.com';
          }
        })()
      : 'sponsor.com');

  return (
    <div
      onContextMenu={(e) => e.preventDefault()}
      className="short-slide-item w-full h-[calc(100dvh-3.5rem)] flex items-center justify-center relative px-2 py-1 md:py-1.5 snap-start select-none"
    >
      {/* Centered 9:16 Frame */}
      <div
        onContextMenu={(e) => e.preventDefault()}
        className="relative w-full h-full md:h-[calc(100%-0.75rem)] md:w-auto md:aspect-[9/16] bg-black rounded-none md:rounded-2xl overflow-hidden shadow-2xl border-0 md:border md:border-white/10 flex items-center justify-center group"
      >
        {isImageAd ? (
          /* Image-Only Ad: Click anywhere on image to redirect in new tab */
          <div
            onClick={handleRedirect}
            className="w-full h-full relative overflow-hidden cursor-pointer flex items-center justify-center bg-neutral-950"
          >
            <img
              src={
                imageFailed
                  ? 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=1080&auto=format&fit=crop&q=80'
                  : imageUrl
              }
              alt={ad.headline}
              onError={() => setImageFailed(true)}
              className="w-full h-full object-cover select-none pointer-events-none transition-transform duration-700 group-hover:scale-105"
            />
          </div>
        ) : (
          /* Video Ad Layer */
          shouldMountPlayer ? (
            <VideoPlayer
              key={`ad-${ad.id}`}
              src={ad.videoUrl || ''}
              poster={ad.posterUrl || undefined}
              isActive={isActive}
              duration={duration}
              isAd={true}
              onAdClick={handleRedirect}
              onTimeUpdate={handleVideoTimeUpdate}
              onEnded={onEnded}
            />
          ) : (
            <div className="relative w-full h-full bg-black flex items-center justify-center overflow-hidden">
              {ad.posterUrl ? (
                <img
                  src={ad.posterUrl}
                  alt={ad.headline}
                  loading="lazy"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="flex flex-col items-center gap-2 text-white/40">
                  <span className="text-xs font-semibold uppercase tracking-wider">{ad.brandName}</span>
                </div>
              )}
            </div>
          )
        )}

        {/* Bottom Content Layer: Brand Metadata + Clean Action Bar */}
        <div className="absolute inset-x-0 bottom-0 p-4 pb-6 sm:pb-7 bg-gradient-to-t from-black via-black/80 to-transparent pointer-events-none text-white z-10 flex flex-col gap-2.5">
          {/* Brand Info */}
          <div className="flex items-center gap-3 pointer-events-auto">
            <div className="relative w-10 h-10 rounded-full overflow-hidden border border-white/40 shadow bg-neutral-800 flex-shrink-0 flex items-center justify-center">
              {ad.brandAvatar && !avatarFailed ? (
                <img
                  src={ad.brandAvatar}
                  alt=""
                  onError={() => setAvatarFailed(true)}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-tr from-emerald-600 via-teal-500 to-cyan-500 font-black text-white text-xs tracking-wider shadow-inner">
                  {ad.brandName.slice(0, 2).toUpperCase()}
                </div>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <span className="font-bold text-sm tracking-wide text-white drop-shadow">
                {ad.brandName}
              </span>
              <BadgeCheck className="w-4 h-4 fill-blue-500 text-white" />
            </div>
          </div>

          {/* Headline & Expandable Description */}
          <div className="pointer-events-auto max-w-[95%]">
            <h3 className="text-sm font-bold text-white drop-shadow leading-snug">
              {ad.headline}
            </h3>
            {ad.caption && (
              <p
                className={`text-xs text-neutral-200 mt-1 leading-relaxed drop-shadow ${
                  isCaptionExpanded ? '' : 'line-clamp-2'
                }`}
              >
                {ad.caption}
              </p>
            )}
            {ad.caption && ad.caption.length > 80 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsCaptionExpanded(!isCaptionExpanded);
                }}
                className="text-[11px] font-semibold text-neutral-400 hover:text-white mt-0.5 transition-colors"
              >
                {isCaptionExpanded ? 'Show less' : '...more'}
              </button>
            )}
          </div>

          {/* Frosted Dark Glassmorphism Action Bar */}
          <button
            onClick={handleRedirect}
            className="pointer-events-auto w-full py-2.5 px-3.5 rounded-2xl bg-black/60 hover:bg-black/75 active:bg-black/90 backdrop-blur-xl border border-white/20 hover:border-white/35 text-white flex items-center justify-between shadow-[0_8px_32px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.15)] transition-colors duration-200 group/cta cursor-pointer select-none"
          >
            {/* Domain info with subtle globe icon */}
            <div className="flex items-center gap-2 text-neutral-300 text-xs font-medium truncate max-w-[55%] pl-1">
              <Globe className="w-3.5 h-3.5 text-neutral-400 group-hover/cta:text-neutral-200 transition-colors flex-shrink-0" />
              <span className="truncate tracking-tight group-hover/cta:text-white transition-colors">
                {domain}
              </span>
            </div>

            {/* Glowing Frosted Action Pill */}
            <div className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 border border-white/25 font-bold text-xs text-white backdrop-blur-md shadow-[0_2px_10px_rgba(0,0,0,0.2)] group-hover/cta:border-white/40 transition-all">
              <span>{ad.ctaText}</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-white/90 group-hover/cta:translate-x-0.5 group-hover/cta:-translate-y-0.5 transition-transform" />
            </div>
          </button>
        </div>

        {/* Non-draggable white color track seekbar */}
        <AdProgressBar
          currentTime={currentTime}
          duration={duration}
        />
      </div>
    </div>
  );
};
