'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Globe, ArrowUpRight, BadgeCheck, FastForward } from 'lucide-react';
import { SponsoredAd } from '../../types/ad';
import { adsApi } from '../../lib/api';
import { useShortsStore } from '../../store/useShortsStore';

interface InVideoAdOverlayProps {
  ad: SponsoredAd;
  durationSeconds?: number;
  canSkipAfter?: number;
  onComplete: () => void;
}

export const InVideoAdOverlay: React.FC<InVideoAdOverlayProps> = ({
  ad,
  durationSeconds = 10,
  canSkipAfter = 10,
  onComplete,
}) => {
  const isImageAd = ad.mediaType === 'image' || (!ad.videoUrl && Boolean(ad.imageUrl));

  const [timeLeft, setTimeLeft] = useState(durationSeconds);
  const [canSkip, setCanSkip] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [mediaFailed, setMediaFailed] = useState(false);
  const { isMuted, volume } = useShortsStore();
  const videoRef = useRef<HTMLVideoElement>(null);
  const impressionLoggedRef = useRef(false);

  useEffect(() => {
    if (!impressionLoggedRef.current) {
      impressionLoggedRef.current = true;
      adsApi.trackEvent(ad.id, 'impression');
    }
  }, [ad.id]);

  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const hasCompletedRef = useRef(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!isImageAd && durationSeconds - timeLeft >= canSkipAfter && !canSkip) {
      setCanSkip(true);
    }
    if (isImageAd && timeLeft <= 0 && !hasCompletedRef.current) {
      hasCompletedRef.current = true;
      onCompleteRef.current();
    }
  }, [timeLeft, durationSeconds, canSkipAfter, canSkip, isImageAd]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = isMuted;
      videoRef.current.volume = isMuted ? 0 : volume;
    }
  }, [isMuted, volume]);

  const handleVideoEnded = () => {
    if (!hasCompletedRef.current) {
      hasCompletedRef.current = true;
      onCompleteRef.current();
    }
  };

  const handleSkip = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!hasCompletedRef.current) {
      hasCompletedRef.current = true;
      onCompleteRef.current();
    }
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

  const mediaUrl = isImageAd ? ad.imageUrl || ad.posterUrl : ad.videoUrl;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="absolute inset-0 z-30 bg-black flex flex-col justify-between overflow-hidden select-none"
    >
      <div
        onClick={handleRedirect}
        className="absolute inset-0 w-full h-full cursor-pointer flex items-center justify-center bg-black"
      >
        {isImageAd ? (
          <img
            src={
              mediaFailed
                ? 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=1080&auto=format&fit=crop&q=80'
                : mediaUrl || ''
            }
            alt={ad.headline}
            onError={() => setMediaFailed(true)}
            className="w-full h-full object-cover select-none pointer-events-none"
          />
        ) : (
          <video
            ref={videoRef}
            src={mediaUrl || ''}
            poster={ad.posterUrl || undefined}
            autoPlay
            playsInline
            muted={isMuted}
            onEnded={handleVideoEnded}
            className="w-full h-full object-cover select-none pointer-events-none"
          />
        )}
      </div>

      <div className="relative z-10 w-full px-3.5 pt-3.5 flex items-center justify-end pointer-events-auto bg-gradient-to-b from-black/80 via-black/40 to-transparent pb-6">
        <div className="flex items-center gap-2">
          <AnimatePresence mode="wait">
            {isImageAd ? (
              // Image Ad: 10s countdown, no skip button, auto-resumes video at 0s
              <motion.div
                key="image-countdown"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/15 text-neutral-300 text-xs font-medium"
              >
                <span>Resumes in</span>
                <span className="font-bold text-white tabular-nums w-4 text-center">{timeLeft}s</span>
              </motion.div>
            ) : canSkip ? (
              // Video Ad: Skip button visible after 10s
              <motion.button
                key="video-skip-btn"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                onClick={handleSkip}
                className="flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-md border border-white/30 text-white text-xs font-bold transition-all shadow-md active:scale-95 cursor-pointer"
              >
                <span>Skip Ad</span>
                <FastForward className="w-3.5 h-3.5 text-white fill-white" />
              </motion.button>
            ) : (
              // Video Ad: Countdown until skip button appears after 10s
              <motion.div
                key="video-countdown"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/15 text-neutral-300 text-xs font-medium"
              >
                <span>Skip in</span>
                <span className="font-bold text-white tabular-nums w-4 text-center">{timeLeft}s</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="relative z-10 w-full p-4 pb-4 bg-gradient-to-t from-black via-black/75 to-transparent pointer-events-auto flex flex-col gap-2.5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full overflow-hidden border border-white/30 shadow bg-neutral-800 flex-shrink-0 flex items-center justify-center">
            {ad.brandAvatar && !avatarFailed ? (
              <img
                src={ad.brandAvatar}
                alt=""
                onError={() => setAvatarFailed(true)}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-tr from-emerald-600 to-teal-500 font-black text-white text-xs">
                {ad.brandName.slice(0, 2).toUpperCase()}
              </div>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <span className="font-bold text-xs tracking-wide text-white drop-shadow">
              {ad.brandName}
            </span>
            <BadgeCheck className="w-3.5 h-3.5 fill-blue-500 text-white" />
          </div>
        </div>

        <p className="text-xs font-semibold text-white/95 line-clamp-1 drop-shadow">
          {ad.headline}
        </p>

        <button
          onClick={handleRedirect}
          className="w-full py-2.5 px-3.5 rounded-2xl bg-black/60 hover:bg-black/75 active:bg-black/90 backdrop-blur-xl border border-white/20 hover:border-white/35 text-white flex items-center justify-between shadow-[0_8px_32px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.15)] transition-colors duration-200 group/cta cursor-pointer select-none"
        >
          <div className="flex items-center gap-2 text-neutral-300 text-xs font-medium truncate max-w-[55%] pl-1">
            <Globe className="w-3.5 h-3.5 text-neutral-400 group-hover/cta:text-neutral-200 transition-colors flex-shrink-0" />
            <span className="truncate tracking-tight group-hover/cta:text-white transition-colors">
              {domain}
            </span>
          </div>

          <div className="flex items-center gap-1.5 px-3.5 py-1 rounded-xl bg-white/15 hover:bg-white/25 border border-white/25 font-bold text-xs text-white backdrop-blur-md shadow-sm group-hover/cta:border-white/40 transition-all">
            <span>{ad.ctaText}</span>
            <ArrowUpRight className="w-3.5 h-3.5 text-white/90 group-hover/cta:translate-x-0.5 group-hover/cta:-translate-y-0.5 transition-transform" />
          </div>
        </button>
      </div>
    </motion.div>
  );
};
