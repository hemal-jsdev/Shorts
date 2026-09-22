'use client';

import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import Hls from 'hls.js';
import { Volume2, VolumeX, Play, Pause, Heart, Loader2, RotateCcw, RotateCw, FastForward, Rewind } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useShortsStore } from '../../store/useShortsStore';

interface VideoPlayerProps {
  src: string;
  poster?: string;
  isActive: boolean;
  duration?: number;
  seekTime?: number | null;
  isAd?: boolean;
  isPausedByAd?: boolean;
  onAdClick?: () => void;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  onDoubleTapLike?: () => void;
  onEnded?: () => void;
}

function extractYouTubeId(url: string): string | null {
  if (!url) return null;
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|shorts\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
  return match ? match[1] : null;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  src,
  poster,
  isActive,
  duration = 45,
  seekTime,
  isAd = false,
  isPausedByAd = false,
  onAdClick,
  onTimeUpdate,
  onDoubleTapLike,
  onEnded,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  const { isMuted, volume, isPlaying, isAutoScroll, toggleMute, togglePlayPause } = useShortsStore();

  const [isLoading, setIsLoading] = useState(false);
  const [showHeartBurst, setShowHeartBurst] = useState(false);
  const [heartCoords, setHeartCoords] = useState({ x: 0, y: 0 });
  const [currentTimeState, setCurrentTimeState] = useState(0);
  const [showPosterCover, setShowPosterCover] = useState(true);
  const [isPlaybackReady, setIsPlaybackReady] = useState(false);
  const hasEndedRef = useRef(false);

  const [seekRipple, setSeekRipple] = useState<{
    direction: 'left' | 'right';
    seconds: number;
    id: number;
  } | null>(null);

  const [holdingState, setHoldingState] = useState<{
    active: boolean;
    direction: 'forward' | 'backward';
    text: string;
  } | null>(null);

  const seekAccumulatorRef = useRef<{
    direction: 'left' | 'right';
    seconds: number;
    timer: NodeJS.Timeout | null;
  }>({ direction: 'right', seconds: 0, timer: null });

  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isHoldingRef = useRef(false);
  const wasHoldingRef = useRef(false);
  const rewindIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastTapRef = useRef<{
    time: number;
    zone: 'left' | 'center' | 'right';
    x: number;
    y: number;
  } | null>(null);

  const waitingTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleWaiting = () => {
    if (!waitingTimerRef.current) {
      waitingTimerRef.current = setTimeout(() => {
        setIsLoading(true);
      }, 350);
    }
  };

  const handlePlaying = () => {
    if (waitingTimerRef.current) {
      clearTimeout(waitingTimerRef.current);
      waitingTimerRef.current = null;
    }
    setIsLoading(false);
  };

  const [flashIcon, setFlashIcon] = useState<'play' | 'pause' | null>(null);
  const flashTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pointerStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const activeStartTimeRef = useRef<number>(Date.now());

  const triggerFlash = (action: 'play' | 'pause') => {
    if (flashTimeoutRef.current) {
      clearTimeout(flashTimeoutRef.current);
    }
    setFlashIcon(action);
    flashTimeoutRef.current = setTimeout(() => {
      setFlashIcon(null);
      flashTimeoutRef.current = null;
    }, 500);
  };

  useEffect(() => {
    setFlashIcon(null);
    if (flashTimeoutRef.current) {
      clearTimeout(flashTimeoutRef.current);
      flashTimeoutRef.current = null;
    }
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (rewindIntervalRef.current) {
      clearInterval(rewindIntervalRef.current);
      rewindIntervalRef.current = null;
    }
    if (seekAccumulatorRef.current.timer) {
      clearTimeout(seekAccumulatorRef.current.timer);
      seekAccumulatorRef.current.timer = null;
    }
    if (videoRef.current) {
      videoRef.current.playbackRate = 1.0;
    }
    isHoldingRef.current = false;
    wasHoldingRef.current = false;
    setHoldingState(null);
    setSeekRipple(null);

    if (isActive) {
      activeStartTimeRef.current = Date.now();
      hasEndedRef.current = false;
    }
  }, [isActive]);

  const triggerAutoAdvance = useCallback(() => {
    if (!isActive || !isAutoScroll || isHoldingRef.current || hasEndedRef.current) return;
    hasEndedRef.current = true;
    if (onEnded) {
      onEnded();
    }
  }, [isActive, isAutoScroll, onEnded]);

  useEffect(() => {
    return () => {
      if (flashTimeoutRef.current) {
        clearTimeout(flashTimeoutRef.current);
      }
      if (waitingTimerRef.current) {
        clearTimeout(waitingTimerRef.current);
      }
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
      if (rewindIntervalRef.current) {
        clearInterval(rewindIntervalRef.current);
      }
      if (seekAccumulatorRef.current.timer) {
        clearTimeout(seekAccumulatorRef.current.timer);
      }
    };
  }, []);

  const youtubeId = extractYouTubeId(src);

  useEffect(() => {
    if (!youtubeId) return;

    setShowPosterCover(true);
    setIsPlaybackReady(false);

    const handleMessage = (event: MessageEvent) => {
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (!data) return;

        const isPlayingNow =
          data.info === 1 ||
          data.info?.playerState === 1 ||
          data.playerState === 1 ||
          (data.event === 'onStateChange' && (data.info === 1 || data.data === 1));

        if (isPlayingNow) {
          setShowPosterCover(false);
          setIsPlaybackReady(true);
        }

        const isEnded =
          data.info === 0 ||
          data.info?.playerState === 0 ||
          data.playerState === 0 ||
          (data.event === 'onStateChange' && (data.info === 0 || data.data === 0));

        if (isEnded && isActive && isAutoScroll) {
          triggerAutoAdvance();
        }
      } catch (e) {}
    };

    window.addEventListener('message', handleMessage);

    const timer = setTimeout(() => {
      setShowPosterCover(false);
      setIsPlaybackReady(true);
    }, 4000);

    return () => {
      window.removeEventListener('message', handleMessage);
      clearTimeout(timer);
    };
  }, [youtubeId, src, isActive]);

  const youtubeEmbedUrl = useMemo(() => {
    if (!youtubeId) return '';
    const originParam =
      typeof window !== 'undefined' && window.location.origin
        ? `&origin=${encodeURIComponent(window.location.origin)}`
        : '';
    return `https://www.youtube-nocookie.com/embed/${youtubeId}?enablejsapi=1&autoplay=1&mute=1&controls=0&loop=1&modestbranding=1&rel=0&showinfo=0&iv_load_policy=3&disablekb=1&fs=0&playsinline=1&autohide=1${originParam}`;
  }, [youtubeId]);

  const sendYtCommand = (func: string, args: any[] = []) => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage(
        JSON.stringify({ event: 'command', func, args }),
        '*',
      );
    }
  };

  useEffect(() => {
    if (!youtubeId) return;

    if (isActive && isPlaying && !isPausedByAd) {
      sendYtCommand('playVideo');
    } else {
      sendYtCommand('pauseVideo');
      if (!isActive) {
        sendYtCommand('seekTo', [0, true]);
      }
    }
  }, [isActive, isPlaying, isPausedByAd, youtubeId]);

  useEffect(() => {
    if (!youtubeId) return;

    if (isMuted) {
      sendYtCommand('mute');
    } else {
      sendYtCommand('unMute');
      sendYtCommand('setVolume', [Math.round(volume * 100)]);
    }
  }, [isMuted, volume, youtubeId]);

  useEffect(() => {
    if (seekTime !== null && seekTime !== undefined) {
      if (youtubeId) {
        sendYtCommand('seekTo', [seekTime, true]);
        if (isPlaying) sendYtCommand('playVideo');
      } else if (videoRef.current) {
        videoRef.current.currentTime = seekTime;
        if (isPlaying) videoRef.current.play().catch(() => {});
      }
      setCurrentTimeState(seekTime);
    }
  }, [seekTime, youtubeId, isPlaying]);

  useEffect(() => {
    if (!youtubeId || !isActive || !isPlaybackReady) {
      return;
    }

    const interval = setInterval(() => {
      if (isPlaying && !isPausedByAd && onTimeUpdate) {
        setCurrentTimeState((prev) => {
          const next = prev >= duration ? 0 : prev + 0.25;
          onTimeUpdate(next, duration);
          return next;
        });
      }
    }, 250);

    return () => clearInterval(interval);
  }, [youtubeId, isActive, isPlaying, isPlaybackReady, isPausedByAd, duration, onTimeUpdate]);

  const isActiveRef = useRef(isActive);
  isActiveRef.current = isActive;
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;
  const wasActiveRef = useRef(isActive);

  useEffect(() => {
    if (youtubeId) {
      setIsLoading(false);
      return;
    }

    const video = videoRef.current;
    if (!video || !src) return;

    if (Hls.isSupported() && src.includes('.m3u8')) {
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }

      const hls = new Hls({
        startLevel: 0,
        autoStartLoad: true,
        abrEwmaDefaultEstimate: 400000,
        abrBandWidthFactor: 0.8,
        abrBandWidthUpFactor: 0.7,
        maxBufferLength: 4,
        maxMaxBufferLength: 8,
        maxBufferSize: 8 * 1024 * 1024,
        backBufferLength: 2,
        enableWorker: true,
        lowLatencyMode: true,
        capLevelToPlayerSize: true,
        fragLoadingMaxRetry: 4,
        fragLoadingRetryDelay: 500,
        levelLoadingMaxRetry: 3,
        levelLoadingRetryDelay: 500,
      });

      hls.loadSource(src);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        handlePlaying();
        if (isActiveRef.current && isPlayingRef.current) {
          const playPromise = video.play();
          if (playPromise !== undefined) {
            playPromise
              .then(() => handlePlaying())
              .catch(() => {
                video.muted = true;
                video.play().catch(() => {});
                handlePlaying();
              });
          }
        }
      });

      hls.on(Hls.Events.FRAG_LOADED, () => {
        handlePlaying();
      });

      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              if (hls.currentLevel > 0) {
                hls.currentLevel = 0;
              }
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              break;
            default:
              hls.destroy();
              break;
          }
        }
      });

      hlsRef.current = hls;
    } else if (video.canPlayType('application/vnd.apple.mpegurl') && src.includes('.m3u8')) {
      video.src = src;
      video.onloadedmetadata = () => {
        handlePlaying();
        if (isActiveRef.current && isPlayingRef.current) {
          video.play().catch(() => {
            video.muted = true;
            video.play().catch(() => {});
          });
        }
      };
    } else {
      video.src = src;
      video.onloadedmetadata = () => {
        handlePlaying();
        if (isActiveRef.current && isPlayingRef.current) {
          video.play().catch(() => {
            video.muted = true;
            video.play().catch(() => {});
          });
        }
      };
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [src, youtubeId]);

  useEffect(() => {
    if (youtubeId) return;
    const video = videoRef.current;
    if (!video) return;

    if (isActive) {
      video.muted = isMuted;
      video.volume = isMuted ? 0 : volume;
      if (isPlaying && !isPausedByAd) {
        const playPromise = video.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => handlePlaying())
            .catch(() => {
              video.muted = true;
              video.play().catch(() => {});
              handlePlaying();
            });
        }
      } else {
        video.pause();
      }
    } else {
      video.pause();
      video.muted = true;
      if (wasActiveRef.current) {
        video.currentTime = 0;
      }
    }
    wasActiveRef.current = isActive;
  }, [isActive, isPlaying, isPausedByAd, isMuted, volume, youtubeId]);

  useEffect(() => {
    if (youtubeId || !isActive) return;
    const video = videoRef.current;
    if (!video) return;
    video.muted = isMuted;
    video.volume = isMuted ? 0 : volume;
  }, [isActive, isMuted, volume, youtubeId]);

  const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const performSeek = (direction: 'left' | 'right', delta: number) => {
    const dur = videoRef.current?.duration || duration || 60;
    const current = videoRef.current ? videoRef.current.currentTime : currentTimeState;
    const newTime = direction === 'left' ? Math.max(0, current - delta) : Math.min(dur, current + delta);

    if (videoRef.current) {
      videoRef.current.currentTime = newTime;
      if (onTimeUpdate && isActive) onTimeUpdate(newTime, dur);
    } else if (youtubeId) {
      sendYtCommand('seekTo', [newTime, true]);
      if (onTimeUpdate && isActive) onTimeUpdate(newTime, dur);
    }
    setCurrentTimeState(newTime);

    if (seekAccumulatorRef.current.timer && seekAccumulatorRef.current.direction === direction) {
      clearTimeout(seekAccumulatorRef.current.timer);
      seekAccumulatorRef.current.seconds += delta;
    } else {
      if (seekAccumulatorRef.current.timer) clearTimeout(seekAccumulatorRef.current.timer);
      seekAccumulatorRef.current = { direction, seconds: delta, timer: null };
    }

    const currentAccumulated = seekAccumulatorRef.current.seconds;
    setSeekRipple({ direction, seconds: currentAccumulated, id: Date.now() });

    seekAccumulatorRef.current.timer = setTimeout(() => {
      setSeekRipple(null);
      seekAccumulatorRef.current = { direction, seconds: 0, timer: null };
    }, 650);
  };

  const startHolding = (direction: 'forward' | 'backward') => {
    if (isHoldingRef.current) return;
    isHoldingRef.current = true;

    if (direction === 'forward') {
      setHoldingState({ active: true, direction: 'forward', text: '2X Speed' });
      if (videoRef.current) {
        videoRef.current.playbackRate = 2.0;
        videoRef.current.preservesPitch = true;
      } else if (youtubeId) {
        sendYtCommand('setPlaybackRate', [2]);
      }
    } else {
      setHoldingState({ active: true, direction: 'backward', text: '2X Rewind' });
      if (rewindIntervalRef.current) clearInterval(rewindIntervalRef.current);
      rewindIntervalRef.current = setInterval(() => {
        if (videoRef.current) {
          const next = Math.max(0, videoRef.current.currentTime - 0.2);
          videoRef.current.currentTime = next;
          setCurrentTimeState(next);
          if (onTimeUpdate && isActive) onTimeUpdate(next, videoRef.current.duration || duration);
        } else if (youtubeId) {
          setCurrentTimeState((prev) => {
            const next = Math.max(0, prev - 0.2);
            sendYtCommand('seekTo', [next, true]);
            if (onTimeUpdate && isActive) onTimeUpdate(next, duration);
            return next;
          });
        }
      }, 80);
    }
  };

  const stopHolding = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (rewindIntervalRef.current) {
      clearInterval(rewindIntervalRef.current);
      rewindIntervalRef.current = null;
    }

    if (isHoldingRef.current) {
      isHoldingRef.current = false;
      wasHoldingRef.current = true;
      setTimeout(() => {
        wasHoldingRef.current = false;
      }, 250);

      if (videoRef.current) {
        videoRef.current.playbackRate = 1.0;
      } else if (youtubeId) {
        sendYtCommand('setPlaybackRate', [1]);
      }
      setHoldingState(null);
    }
  };

  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;
      if (e.code === 'Space') {
        e.preventDefault();
        const currentlyPlaying = useShortsStore.getState().isPlaying;
        togglePlayPause();
        triggerFlash(!currentlyPlaying ? 'play' : 'pause');
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        performSeek('left', 5);
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        performSeek('right', 5);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isActive, duration, currentTimeState, isPlaying]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = clickX / rect.width;
    pointerStartRef.current = { x: e.clientX, y: e.clientY, time: Date.now() };

    if (!isActive || isAd) return;

    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
    }

    longPressTimerRef.current = setTimeout(() => {
      if (ratio > 0.55) {
        startHolding('forward');
      } else if (ratio < 0.45) {
        startHolding('backward');
      } else {
        startHolding('forward');
      }
    }, 320);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (pointerStartRef.current) {
      const dist = Math.hypot(
        e.clientX - pointerStartRef.current.x,
        e.clientY - pointerStartRef.current.y,
      );
      if (dist > 10) {
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
        if (isHoldingRef.current) {
          stopHolding();
        }
      }
    }
  };

  const handlePointerUp = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (isHoldingRef.current) {
      stopHolding();
    }
  };

  const handleVideoClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isAd) {
      if (onAdClick) {
        onAdClick();
      }
      return;
    }
    if (wasHoldingRef.current) {
      return;
    }

    if (Date.now() - activeStartTimeRef.current < 450) {
      return;
    }

    if (pointerStartRef.current) {
      const dist = Math.hypot(
        e.clientX - pointerStartRef.current.x,
        e.clientY - pointerStartRef.current.y,
      );
      if (dist > 8) {
        return;
      }
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const ratio = clickX / rect.width;
    const zone: 'left' | 'center' | 'right' = ratio < 0.35 ? 'left' : ratio > 0.65 ? 'right' : 'center';
    const now = Date.now();

    if (showPosterCover) {
      setShowPosterCover(false);
      setIsPlaybackReady(true);
      if (youtubeId) sendYtCommand('playVideo');
    }

    const isDoubleTap =
      lastTapRef.current &&
      now - lastTapRef.current.time < 280 &&
      lastTapRef.current.zone === zone;

    if (isDoubleTap) {
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
        clickTimeoutRef.current = null;
      }
      lastTapRef.current = null;

      if (zone === 'left') {
        performSeek('left', 5);
      } else if (zone === 'right') {
        performSeek('right', 5);
      } else {
        setHeartCoords({ x: clickX, y: clickY });
        setShowHeartBurst(true);
        setTimeout(() => setShowHeartBurst(false), 900);
        if (onDoubleTapLike) onDoubleTapLike();
      }
    } else {
      lastTapRef.current = { time: now, zone, x: clickX, y: clickY };
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
      }
      clickTimeoutRef.current = setTimeout(() => {
        const willPlay = !isPlaying;
        togglePlayPause();
        triggerFlash(willPlay ? 'play' : 'pause');
        clickTimeoutRef.current = null;
        lastTapRef.current = null;
      }, 220);
    }
  };

  return (
    <div
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onClick={handleVideoClick}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      style={{ WebkitTouchCallout: 'none', userSelect: 'none' }}
      className="relative w-full h-full cursor-pointer bg-black flex items-center justify-center overflow-hidden select-none"
    >
      {/* YouTube Shorts Clean Embed Player */}
      {youtubeId ? (
        <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
          <iframe
            ref={iframeRef}
            src={youtubeEmbedUrl}
            title="YouTube Shorts"
            onLoad={() => {
              if (iframeRef.current?.contentWindow) {
                iframeRef.current.contentWindow.postMessage(
                  JSON.stringify({ event: 'listening' }),
                  '*',
                );
                if (isActive && isPlaying) {
                  iframeRef.current.contentWindow.postMessage(
                    JSON.stringify({ event: 'command', func: 'playVideo', args: [] }),
                    '*',
                  );
                }
              }
            }}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            className="w-full h-full object-cover scale-[1.35] pointer-events-none"
            style={{ border: 'none' }}
          />

          {/* Smooth Poster Cover to hide YouTube initial native play button on load */}
          <AnimatePresence>
            {showPosterCover && (
              <motion.div
                initial={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
                className="absolute inset-0 z-20 bg-black pointer-events-none overflow-hidden flex items-center justify-center"
              >
                {poster ? (
                  <img
                    src={poster}
                    alt="Short Cover"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-neutral-950 flex items-center justify-center">
                    <Loader2 className="w-10 h-10 text-white/40 animate-spin" />
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Transparent full-bleed click shield to capture play/pause clicks */}
          <div
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            className="absolute inset-0 z-10 cursor-pointer"
          />
        </div>
      ) : (
        <video
          ref={videoRef}
          poster={poster}
          preload="auto"
          loop={!isAutoScroll}
          playsInline
          muted={!isActive || isMuted}
          disablePictureInPicture
          controlsList="nodownload noplaybackrate nofullscreen"
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onCanPlay={handlePlaying}
          onLoadedData={handlePlaying}
          onWaiting={handleWaiting}
          onPlaying={handlePlaying}
          onEnded={triggerAutoAdvance}
          onTimeUpdate={() => {
            if (videoRef.current && isActive && !isPausedByAd) {
              const cur = videoRef.current.currentTime;
              const dur = videoRef.current.duration || 0;
              if (onTimeUpdate) {
                onTimeUpdate(cur, dur);
              }
              if (isAutoScroll && dur > 1 && cur >= dur - 0.25 && !hasEndedRef.current) {
                triggerAutoAdvance();
              }
            }
          }}
          className="w-full h-full object-cover pointer-events-none select-none"
          style={{ WebkitTouchCallout: 'none', userSelect: 'none' }}
        />
      )}

      <AnimatePresence mode="wait">
        {isActive && flashIcon && (
          <motion.div
            key={`flash-${flashIcon}`}
            initial={{ scale: 0.6, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 1.3, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none select-none"
          >
            <div className="w-20 h-20 rounded-full bg-black/60 backdrop-blur-md border border-white/20 flex items-center justify-center shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
              {flashIcon === 'play' ? (
                <Play className="w-10 h-10 fill-white text-white ml-1 drop-shadow-md" />
              ) : (
                <Pause className="w-10 h-10 fill-white text-white drop-shadow-md" />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!isAd && isActive && holdingState && holdingState.direction === 'forward' && (
          <React.Fragment key="hud-hold-forward">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute right-0 top-0 bottom-0 w-2/5 pointer-events-none z-10 bg-gradient-to-l from-amber-500/15 via-amber-500/5 to-transparent flex items-center justify-end pr-5"
            >
              <div className="flex flex-col items-center gap-6 opacity-30">
                <FastForward className="w-8 h-8 text-amber-400 animate-pulse" />
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 30, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 30, scale: 0.9 }}
              transition={{ type: 'spring', damping: 22, stiffness: 350 }}
              className="absolute top-20 right-4 z-30 pointer-events-none flex flex-col items-end gap-1 select-none"
            >
              <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-black/85 backdrop-blur-xl border border-amber-400/40 shadow-[0_8px_32px_rgba(245,158,11,0.35)]">
                <span className="text-white text-xs font-black tracking-wider uppercase drop-shadow">
                  2X SPEED
                </span>
                <FastForward className="w-4 h-4 text-amber-400 fill-amber-400 animate-pulse" />
              </div>
            </motion.div>
          </React.Fragment>
        )}

        {!isAd && isActive && holdingState && holdingState.direction === 'backward' && (
          <React.Fragment key="hud-hold-backward">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute left-0 top-0 bottom-0 w-2/5 pointer-events-none z-10 bg-gradient-to-r from-cyan-500/15 via-cyan-500/5 to-transparent flex items-center justify-start pl-5"
            >
              <div className="flex flex-col items-center gap-6 opacity-30">
                <Rewind className="w-8 h-8 text-cyan-400 animate-pulse" />
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: -30, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: -30, scale: 0.9 }}
              transition={{ type: 'spring', damping: 22, stiffness: 350 }}
              className="absolute top-20 left-4 z-30 pointer-events-none flex flex-col items-start gap-1 select-none"
            >
              <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-black/85 backdrop-blur-xl border border-cyan-400/40 shadow-[0_8px_32px_rgba(6,182,212,0.35)]">
                <Rewind className="w-4 h-4 text-cyan-400 fill-cyan-400 animate-pulse" />
                <span className="text-white text-xs font-black tracking-wider uppercase drop-shadow">
                  2X REWIND
                </span>
              </div>
            </motion.div>
          </React.Fragment>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!isAd && isActive && seekRipple && seekRipple.direction === 'left' && (
          <motion.div
            key={`seek-left-${seekRipple.id}`}
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.15 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className="absolute left-0 top-0 bottom-0 w-2/5 z-20 pointer-events-none flex flex-col items-center justify-center bg-gradient-to-r from-white/20 via-white/5 to-transparent rounded-r-[120px]"
          >
            <div className="flex flex-col items-center gap-1.5 -translate-x-3">
              <div className="w-14 h-14 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center border border-white/20 shadow-xl">
                <RotateCcw className="w-7 h-7 text-white animate-pulse" />
              </div>
              <span className="text-white text-sm font-black tracking-wider drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
                -{seekRipple.seconds}s
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!isAd && isActive && seekRipple && seekRipple.direction === 'right' && (
          <motion.div
            key={`seek-right-${seekRipple.id}`}
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.15 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className="absolute right-0 top-0 bottom-0 w-2/5 z-20 pointer-events-none flex flex-col items-center justify-center bg-gradient-to-l from-white/20 via-white/5 to-transparent rounded-l-[120px]"
          >
            <div className="flex flex-col items-center gap-1.5 translate-x-3">
              <div className="w-14 h-14 rounded-full bg-black/50 backdrop-blur-md flex items-center justify-center border border-white/20 shadow-xl">
                <RotateCw className="w-7 h-7 text-white animate-pulse" />
              </div>
              <span className="text-white text-sm font-black tracking-wider drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
                +{seekRipple.seconds}s
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isActive && isLoading && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 flex items-center justify-center pointer-events-none z-20"
          >
            <div className="w-12 h-12 rounded-full bg-black/50 backdrop-blur-sm border border-white/20 flex items-center justify-center shadow-[0_4px_24px_rgba(0,0,0,0.5)]">
              <Loader2 className="w-6 h-6 text-white animate-spin" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!isAd && showHeartBurst && (
          <motion.div
            style={{ left: heartCoords.x - 40, top: heartCoords.y - 40 }}
            initial={{ scale: 0.2, opacity: 0, rotate: -15 }}
            animate={{ scale: [0.2, 1.4, 1.1], opacity: [0, 1, 0.9], rotate: [0, 15, 0] }}
            exit={{ scale: 1.6, opacity: 0 }}
            transition={{ duration: 0.85, ease: 'easeOut' }}
            className="absolute z-30 pointer-events-none"
          >
            <Heart className="w-20 h-20 fill-red-500 text-red-500 drop-shadow-[0_4px_16px_rgba(239,68,68,0.7)]" />
          </motion.div>
        )}
      </AnimatePresence>

      {isActive && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleMute();
          }}
          aria-label={isMuted ? 'Unmute video' : 'Mute video'}
          title={isMuted ? 'Unmute' : 'Mute'}
          className="absolute top-4 right-4 z-20 p-2.5 rounded-full glass-button text-white shadow-lg cursor-pointer transition-transform duration-150 active:scale-95 hover:bg-white/20"
        >
          {isMuted ? <VolumeX className="w-5 h-5 text-white/90" /> : <Volume2 className="w-5 h-5 text-white/90" />}
        </button>
      )}
    </div>
  );
};
