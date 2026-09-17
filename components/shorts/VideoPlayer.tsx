'use client';

import React, { useEffect, useRef, useState, useMemo } from 'react';
import Hls from 'hls.js';
import { Volume2, VolumeX, Play, Pause, Heart, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useShortsStore } from '../../store/useShortsStore';

interface VideoPlayerProps {
  src: string;
  poster?: string;
  isActive: boolean;
  duration?: number;
  seekTime?: number | null;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  onDoubleTapLike?: () => void;
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
  onTimeUpdate,
  onDoubleTapLike,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  const { isMuted, volume, isPlaying, toggleMute, togglePlayPause } = useShortsStore();

  const [isLoading, setIsLoading] = useState(false);
  const [showHeartBurst, setShowHeartBurst] = useState(false);
  const [heartCoords, setHeartCoords] = useState({ x: 0, y: 0 });
  const [currentTimeState, setCurrentTimeState] = useState(0);
  const [showPosterCover, setShowPosterCover] = useState(true);
  const [isPlaybackReady, setIsPlaybackReady] = useState(false);

  // Debounced waiting handler: only show loading spinner if buffering lasts >350ms (Instagram Reels behavior)
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

  // Transient YouTube Shorts-style play/pause flash indicator state (triggered ONLY on user interaction)
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

  // Cleanup timeout and reset flash state whenever video changes active state
  useEffect(() => {
    setFlashIcon(null);
    if (flashTimeoutRef.current) {
      clearTimeout(flashTimeoutRef.current);
      flashTimeoutRef.current = null;
    }
    if (isActive) {
      activeStartTimeRef.current = Date.now();
    }
  }, [isActive]);

  useEffect(() => {
    return () => {
      if (flashTimeoutRef.current) {
        clearTimeout(flashTimeoutRef.current);
      }
      if (waitingTimerRef.current) {
        clearTimeout(waitingTimerRef.current);
      }
    };
  }, []);

  // Listen to Spacebar shortcut for the active video
  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;
      if (e.code === 'Space') {
        const currentlyPlaying = useShortsStore.getState().isPlaying;
        triggerFlash(!currentlyPlaying ? 'play' : 'pause');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isActive]);

  const youtubeId = extractYouTubeId(src);

  // Smoothly hide poster cover and enable seekbar progress once YouTube reports playing
  useEffect(() => {
    if (!youtubeId) return;

    setShowPosterCover(true);
    setIsPlaybackReady(false);

    const handleMessage = (event: MessageEvent) => {
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (!data) return;

        // Check if YouTube reports active PLAYING state
        const isPlayingNow =
          data.info === 1 ||
          data.info?.playerState === 1 ||
          data.playerState === 1 ||
          (data.event === 'onStateChange' && (data.info === 1 || data.data === 1));

        if (isPlayingNow) {
          setShowPosterCover(false);
          setIsPlaybackReady(true);
        }
      } catch (e) {}
    };

    window.addEventListener('message', handleMessage);

    // Safety fallback: only fade out after 4000ms if no postMessage is received
    const timer = setTimeout(() => {
      setShowPosterCover(false);
      setIsPlaybackReady(true);
    }, 4000);

    return () => {
      window.removeEventListener('message', handleMessage);
      clearTimeout(timer);
    };
  }, [youtubeId, src, isActive]);

  // Clean embed URL: NO playlist param, NO YouTube overlays/controls, enabled JS API
  const youtubeEmbedUrl = useMemo(() => {
    if (!youtubeId) return '';
    return `https://www.youtube-nocookie.com/embed/${youtubeId}?enablejsapi=1&autoplay=1&mute=1&controls=0&loop=1&modestbranding=1&rel=0&showinfo=0&iv_load_policy=3&disablekb=1&fs=0&playsinline=1&autohide=1&origin=http://localhost:3000`;
  }, [youtubeId]);

  // Send postMessage command to YouTube iframe API
  const sendYtCommand = (func: string, args: any[] = []) => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage(
        JSON.stringify({ event: 'command', func, args }),
        '*',
      );
    }
  };

  // Sync YouTube play/pause and reset to beginning when navigating between reels
  useEffect(() => {
    if (!youtubeId) return;

    if (isActive && isPlaying) {
      sendYtCommand('seekTo', [0, true]);
      sendYtCommand('playVideo');
    } else {
      sendYtCommand('pauseVideo');
      sendYtCommand('seekTo', [0, true]);
    }
  }, [isActive, isPlaying, youtubeId]);

  // Sync YouTube mute/unmute via postMessage in-place (DOES NOT RESTART VIDEO)
  useEffect(() => {
    if (!youtubeId) return;

    if (isMuted) {
      sendYtCommand('mute');
    } else {
      sendYtCommand('unMute');
      sendYtCommand('setVolume', [Math.round(volume * 100)]);
    }
  }, [isMuted, volume, youtubeId]);

  // Handle Seeking when seekbar position changes
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

  // Progress timer for YouTube Shorts: ONLY runs when video is ACTIVE, PLAYING, and PLAYBACK HAS COMMENCED
  useEffect(() => {
    if (!youtubeId || !isActive || !isPlaybackReady) {
      return;
    }

    const interval = setInterval(() => {
      if (isPlaying && onTimeUpdate) {
        setCurrentTimeState((prev) => {
          const next = prev >= duration ? 0 : prev + 0.25;
          onTimeUpdate(next, duration);
          return next;
        });
      }
    }, 250);

    return () => clearInterval(interval);
  }, [youtubeId, isActive, isPlaying, isPlaybackReady, duration, onTimeUpdate]);

  // Initialize HLS or native video streaming (for Cloudflare Stream / MP4)
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
        // Instagram-Style Fast Start: Start with lowest resolution rendition (240p/360p) for instant first-frame playback
        startLevel: 0,
        // Conservative initial bandwidth estimate (350kbps) so it downloads tiny chunks in <150ms
        abrEwmaDefaultEstimate: 350000,
        // Responsive ABR: step down to low-res pixel quality instead of stalling on slow connections
        abrBandWidthFactor: 0.8,
        abrBandWidthUpFactor: 0.7,
        // Lean buffer for fast switching
        maxBufferLength: 4,
        maxMaxBufferLength: 8,
        maxBufferSize: 10 * 1024 * 1024,
        backBufferLength: 4,
        enableWorker: true,
        lowLatencyMode: true,
        capLevelToPlayerSize: true,
        // Fast error recovery: retry with lower level instead of stalling
        fragLoadingMaxRetry: 4,
        fragLoadingRetryDelay: 500,
        levelLoadingMaxRetry: 3,
        levelLoadingRetryDelay: 500,
      });

      hls.loadSource(src);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        handlePlaying();
        video.currentTime = 0;
        if (isActive && isPlaying) {
          const playPromise = video.play();
          if (playPromise !== undefined) {
            playPromise
              .then(() => handlePlaying())
              .catch(() => {
                // Autoplay blocked without user gesture -> fallback to muted autoplay (Instagram standard)
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
              // Step down to lowest level (240p) on network dips instead of freezing
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
        video.currentTime = 0;
        if (isActive && isPlaying) {
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
        video.currentTime = 0;
        if (isActive && isPlaying) {
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

  // Sync HTML5 active play/pause state
  useEffect(() => {
    if (youtubeId) return;
    const video = videoRef.current;
    if (!video) return;

    if (isActive) {
      if (isPlaying) {
        video.play().catch(() => {});
      } else {
        video.pause();
      }
    } else {
      video.pause();
      video.currentTime = 0;
    }
  }, [isActive, isPlaying, youtubeId]);

  // Sync mute & volume for HTML5 video
  useEffect(() => {
    if (youtubeId) return;
    const video = videoRef.current;
    if (!video) return;
    video.muted = isMuted;
    video.volume = isMuted ? 0 : volume;
  }, [isMuted, volume, youtubeId]);

  // Click & Double click handler with swipe/drag vs click discrimination
  const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    pointerStartRef.current = { x: e.clientX, y: e.clientY, time: Date.now() };
  };

  const handleVideoClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // 1. Guard against clicks fired during scroll/swipe release transition
    if (Date.now() - activeStartTimeRef.current < 450) {
      return;
    }

    // 2. Guard against drag/swipe gestures (if mouse/pointer moved more than 8px)
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

    if (showPosterCover) {
      setShowPosterCover(false);
      setIsPlaybackReady(true);
      if (youtubeId) sendYtCommand('playVideo');
    }

    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
      setHeartCoords({ x: clickX, y: clickY });
      setShowHeartBurst(true);
      setTimeout(() => setShowHeartBurst(false), 900);
      if (onDoubleTapLike) onDoubleTapLike();
    } else {
      clickTimeoutRef.current = setTimeout(() => {
        const willPlay = !isPlaying;
        togglePlayPause();
        triggerFlash(willPlay ? 'play' : 'pause');
        clickTimeoutRef.current = null;
      }, 200);
    }
  };

  return (
    <div
      onPointerDown={handlePointerDown}
      onClick={handleVideoClick}
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
          <div className="absolute inset-0 z-10 cursor-pointer" />
        </div>
      ) : (
        /* Cloudflare Stream / HLS / HTML5 Video Player */
        <video
          ref={videoRef}
          poster={poster}
          preload="auto"
          loop
          playsInline
          muted={isMuted}
          onCanPlay={handlePlaying}
          onLoadedData={handlePlaying}
          onWaiting={handleWaiting}
          onPlaying={handlePlaying}
          onTimeUpdate={() => {
            if (videoRef.current && onTimeUpdate) {
              onTimeUpdate(videoRef.current.currentTime, videoRef.current.duration || 0);
            }
          }}
          className="w-full h-full object-cover"
        />
      )}

      {/* Modern YouTube Shorts Transient Play/Pause Flash Indicator (No Black Overlay, Auto-Disappearing) */}
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

      {/* Instagram Reels Minimalist Spinner (Subtle, never blacks out or blurs the video) */}
      <AnimatePresence>
        {isLoading && (
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

      {/* Double Tap Floating Heart Burst */}
      <AnimatePresence>
        {showHeartBurst && (
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

      {/* Quick Audio Mute Toggle Button (Top Right corner) */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          toggleMute();
        }}
        aria-label={isMuted ? 'Unmute video' : 'Mute video'}
        className="absolute top-4 right-4 z-20 p-2.5 rounded-full glass-button text-white shadow-lg cursor-pointer"
      >
        {isMuted ? <VolumeX className="w-5 h-5 text-white/90" /> : <Volume2 className="w-5 h-5 text-white/90" />}
      </button>
    </div>
  );
};
