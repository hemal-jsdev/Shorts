'use client';

import React, { useState, useRef, useCallback } from 'react';
import { Reel } from '../../types/reel';
import { SponsoredAd } from '../../types/ad';
import { VideoPlayer } from './VideoPlayer';
import { VideoOverlay } from './VideoOverlay';
import { ProgressBar } from './ProgressBar';
import { InVideoAdOverlay } from './InVideoAdOverlay';
import { reelsApi } from '../../lib/api';
import { useShortsStore } from '../../store/useShortsStore';

interface ShortItemProps {
  reel: Reel;
  index: number;
  activeIndex: number;
  onLikeUpdate: (reelId: string, isLiked: boolean, count: number) => void;
  onWatchProgress?: (reelId: string, fraction: number) => void;
  onEnded?: () => void;
}

function getStableRandomCuepoints(id: string): number[] {
  let hash = 0;
  const str = id || 'default_reel';
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  const abs = Math.abs(hash);

  const r1 = 0.18 + ((abs % 100) / 100) * 0.14;
  const r2 = 0.44 + ((Math.floor(abs / 100) % 100) / 100) * 0.18;
  const r3 = 0.70 + ((Math.floor(abs / 10000) % 100) / 100) * 0.16;

  return [
    Math.round(r1 * 100) / 100,
    Math.round(r2 * 100) / 100,
    Math.round(r3 * 100) / 100,
  ];
}

export const ShortItem: React.FC<ShortItemProps> = ({
  reel,
  index,
  activeIndex,
  onLikeUpdate,
  onWatchProgress,
  onEnded,
}) => {
  const distance = Math.abs(index - activeIndex);
  const isActive = distance === 0;
  const shouldMountPlayer = index >= activeIndex - 1 && index <= activeIndex + 2;

  const { ads } = useShortsStore();

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(reel.durationSeconds || 45);
  const [seekTime, setSeekTime] = useState<number | null>(null);
  const [viewLogged, setViewLogged] = useState(false);
  const [reached90Logged, setReached90Logged] = useState(false);

  const adCuepoints = React.useMemo(() => {
    if (!ads || ads.length === 0) return [];
    return getStableRandomCuepoints(reel.id);
  }, [reel.id, ads?.length]);

  const [activeMidroll, setActiveMidroll] = useState<{
    ad: SponsoredAd;
    cueIndex: number;
  } | null>(null);
  const completedCuesRef = useRef<Set<number>>(new Set());
  const isSeekingRef = useRef(false);
  const lastTimeRef = useRef(0);
  const seekCooldownTimerRef = useRef<NodeJS.Timeout | null>(null);

  React.useEffect(() => {
    setCurrentTime(0);
    setSeekTime(null);
    setViewLogged(false);
    setReached90Logged(false);
    setActiveMidroll(null);
    completedCuesRef.current.clear();
    isSeekingRef.current = false;
    lastTimeRef.current = 0;
    if (seekCooldownTimerRef.current) {
      clearTimeout(seekCooldownTimerRef.current);
      seekCooldownTimerRef.current = null;
    }
  }, [isActive, reel.id]);

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

  const handleTimeUpdate = (time: number, totalDuration: number) => {
    setCurrentTime(time);
    if (totalDuration > 0) setDuration(totalDuration);

    // Video rewind/loop detection: reset completed cues if video restarts
    if (lastTimeRef.current > 5 && time < 1) {
      completedCuesRef.current.clear();
    }
    lastTimeRef.current = time;

    if (isActive && time >= 3 && !viewLogged) {
      setViewLogged(true);
      reelsApi.recordView(reel.id, Math.round(time * 1000), false);
    }

    if (isActive && totalDuration > 0 && !reached90Logged) {
      const progressFraction = time / totalDuration;
      if (progressFraction >= 0.90) {
        setReached90Logged(true);
        onWatchProgress?.(reel.id, progressFraction);
      }
    }

    // Trigger In-Video Mid-Roll Ad when reaching or passing any uncompleted cuepoint
    if (
      isActive &&
      totalDuration >= 6 &&
      ads.length > 0 &&
      !activeMidroll &&
      !isSeekingRef.current &&
      adCuepoints.length > 0
    ) {
      for (let i = 0; i < adCuepoints.length; i++) {
        const cueTimestamp = adCuepoints[i] * totalDuration;
        if (time >= cueTimestamp && !completedCuesRef.current.has(i)) {
          // If jumped past earlier cues, mark them completed so user isn't spammed
          for (let prev = 0; prev < i; prev++) {
            completedCuesRef.current.add(prev);
          }
          completedCuesRef.current.add(i);

          const selectedAd = ads[i % ads.length];
          setActiveMidroll({
            ad: selectedAd,
            cueIndex: i,
          });
          break;
        }
      }
    }
  };

  const handleEnded = () => {
    if (!reached90Logged) {
      setReached90Logged(true);
      onWatchProgress?.(reel.id, 1.0);
    }
    onEnded?.();
  };

  const handleAdComplete = useCallback(() => {
    setActiveMidroll(null);
  }, []);

  const handleSeekStart = useCallback(() => {
    if (seekCooldownTimerRef.current) {
      clearTimeout(seekCooldownTimerRef.current);
      seekCooldownTimerRef.current = null;
    }
    isSeekingRef.current = true;
  }, []);

  const handleSeek = (newTime: number) => {
    isSeekingRef.current = true;
    setCurrentTime(newTime);
    setSeekTime(newTime);
  };

  const handleSeekEnd = useCallback(
    (finalTime: number) => {
      setCurrentTime(finalTime);
      setSeekTime(finalTime);
      isSeekingRef.current = false;

      if (seekCooldownTimerRef.current) {
        clearTimeout(seekCooldownTimerRef.current);
        seekCooldownTimerRef.current = null;
      }

      // If user scrubbed back to the beginning (< 1s), re-arm cues
      if (finalTime < 1) {
        completedCuesRef.current.clear();
      }

      // Check if the user released the scrubber at or past an unplayed cuepoint
      const currentDuration = duration > 0 ? duration : (reel.durationSeconds || 45);
      if (
        currentDuration >= 6 &&
        ads.length > 0 &&
        !activeMidroll &&
        adCuepoints.length > 0
      ) {
        for (let i = 0; i < adCuepoints.length; i++) {
          const cueTimestamp = adCuepoints[i] * currentDuration;
          if (finalTime >= cueTimestamp && !completedCuesRef.current.has(i)) {
            for (let prev = 0; prev < i; prev++) {
              completedCuesRef.current.add(prev);
            }
            completedCuesRef.current.add(i);

            const selectedAd = ads[i % ads.length];
            setActiveMidroll({
              ad: selectedAd,
              cueIndex: i,
            });
            break;
          }
        }
      }
    },
    [duration, reel.durationSeconds, ads, activeMidroll, adCuepoints],
  );

  return (
    <div
      onContextMenu={(e) => e.preventDefault()}
      className="short-slide-item w-full h-[calc(100dvh-3.5rem)] flex items-center justify-center relative px-2 py-1 md:py-1.5 snap-start select-none"
    >
      <div
        onContextMenu={(e) => e.preventDefault()}
        className="relative w-full h-full md:h-[calc(100%-0.75rem)] md:w-auto md:aspect-[9/16] bg-black rounded-none md:rounded-2xl overflow-hidden shadow-2xl border-0 md:border md:border-white/10 ambient-glow flex items-center justify-center"
      >
        {shouldMountPlayer ? (
          <VideoPlayer
            key={reel.id}
            src={reel.hlsUrl}
            poster={reel.thumbnailUrl || undefined}
            isActive={isActive}
            duration={duration}
            seekTime={seekTime}
            isPausedByAd={Boolean(activeMidroll)}
            onTimeUpdate={handleTimeUpdate}
            onDoubleTapLike={handleToggleLike}
            onEnded={handleEnded}
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

        {activeMidroll ? (
          <InVideoAdOverlay
            ad={activeMidroll.ad}
            durationSeconds={10}
            canSkipAfter={10}
            onComplete={handleAdComplete}
          />
        ) : (
          <>
            <VideoOverlay reel={reel} />

            <ProgressBar
              currentTime={currentTime}
              duration={duration}
              adCuepoints={adCuepoints.length > 0 ? adCuepoints : undefined}
              onSeek={handleSeek}
              onSeekStart={handleSeekStart}
              onSeekEnd={handleSeekEnd}
            />
          </>
        )}
      </div>
    </div>
  );
};
