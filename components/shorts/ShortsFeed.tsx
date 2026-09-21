'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Reel } from '../../types/reel';
import { ShortItem } from './ShortItem';
import { DesktopNavButtons } from './DesktopNavButtons';
import { CommentsDrawer } from './CommentsDrawer';
import { ShareModal } from './ShareModal';
import { useShortsStore } from '../../store/useShortsStore';
import { reelsApi } from '../../lib/api';
import { Loader2 } from 'lucide-react';

interface ShortsFeedProps {
  initialReels: Reel[];
  initialCursor?: string | null;
}

export const ShortsFeed: React.FC<ShortsFeedProps> = ({ initialReels, initialCursor }) => {
  const [reels, setReels] = useState<Reel[]>(initialReels);
  const [nextCursor, setNextCursor] = useState<string | null>(initialCursor || null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const isLoadingMoreRef = useRef(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const isScrollingRef = useRef(false);

  const {
    activeIndex,
    setActiveIndex,
    togglePlayPause,
    toggleMute,
    activeCommentReel,
    openComments,
    closeComments,
  } = useShortsStore();

  // Robust pagination: load next batch of reels
  const loadMoreReels = useCallback(() => {
    if (!nextCursor || isLoadingMoreRef.current) return;
    isLoadingMoreRef.current = true;
    setIsLoadingMore(true);

    reelsApi
      .getFeed(nextCursor, 20)
      .then((data) => {
        if (data.items && data.items.length > 0) {
          setReels((prev) => {
            const existingIds = new Set(prev.map((r) => r.id));
            const newUnique = data.items.filter((r) => !existingIds.has(r.id));
            return [...prev, ...newUnique];
          });
        }
        setNextCursor(data.nextCursor);
      })
      .catch((err) => {
        console.warn('[ShortsFeed] Error fetching more reels:', err);
      })
      .finally(() => {
        isLoadingMoreRef.current = false;
        setIsLoadingMore(false);
      });
  }, [nextCursor]);

  // Proactively fetch more reels whenever approaching within 3 items of the end
  useEffect(() => {
    if (activeIndex >= reels.length - 3 && nextCursor) {
      loadMoreReels();
    }
  }, [activeIndex, reels.length, nextCursor, loadMoreReels]);

  // Scroll to index programmatically
  const scrollToIndex = useCallback(
    (index: number) => {
      if (!containerRef.current) return;
      if (index >= reels.length - 3 && nextCursor) {
        loadMoreReels();
      }
      const targetElement = containerRef.current.children[index] as HTMLElement;
      if (targetElement) {
        isScrollingRef.current = true;
        targetElement.scrollIntoView({ behavior: 'smooth' });
        setActiveIndex(index);
        setTimeout(() => {
          isScrollingRef.current = false;
        }, 500);
      }
    },
    [setActiveIndex, reels.length, nextCursor, loadMoreReels],
  );

  // Handle scroll events with Intersection Observer or scroll detection
  const handleScroll = useCallback(() => {
    if (!containerRef.current || isScrollingRef.current) return;

    const scrollTop = containerRef.current.scrollTop;
    const clientHeight = containerRef.current.clientHeight;
    const newIndex = Math.round(scrollTop / clientHeight);

    if (newIndex !== activeIndex && newIndex >= 0 && newIndex < reels.length) {
      setActiveIndex(newIndex);

      // Shallow update browser URL to /shorts/[id]
      const currentReel = reels[newIndex];
      if (currentReel && typeof window !== 'undefined') {
        window.history.replaceState(null, '', `/shorts/${currentReel.id}`);
      }

      // Pre-fetch next page if near bottom
      if (newIndex >= reels.length - 3 && nextCursor) {
        loadMoreReels();
      }
    }
  }, [activeIndex, reels, nextCursor, loadMoreReels, setActiveIndex]);

  // Keyboard navigation shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        return;
      }

      switch (e.code) {
        case 'ArrowDown':
        case 'KeyJ':
          e.preventDefault();
          if (activeIndex < reels.length - 1) {
            scrollToIndex(activeIndex + 1);
          } else if (nextCursor) {
            loadMoreReels();
          }
          break;
        case 'ArrowUp':
        case 'KeyK':
          e.preventDefault();
          if (activeIndex > 0) {
            scrollToIndex(activeIndex - 1);
          }
          break;
        case 'Space':
          e.preventDefault();
          togglePlayPause();
          break;
        case 'KeyM':
          e.preventDefault();
          toggleMute();
          break;
        case 'KeyC':
          e.preventDefault();
          if (activeCommentReel) {
            closeComments();
          } else if (reels[activeIndex]) {
            openComments(reels[activeIndex]);
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeIndex, reels, nextCursor, activeCommentReel, scrollToIndex, loadMoreReels, togglePlayPause, toggleMute, openComments, closeComments]);

  // Optimistic like updater
  const handleLikeUpdate = (reelId: string, isLiked: boolean, count: number) => {
    setReels((prev) =>
      prev.map((r) =>
        r.id === reelId ? { ...r, isLiked, likesCount: count } : r,
      ),
    );
  };

  const handleAutoAdvance = useCallback(
    (index: number) => {
      if (index !== activeIndex) return;

      if (activeIndex < reels.length - 1) {
        scrollToIndex(activeIndex + 1);
      } else if (nextCursor) {
        loadMoreReels();
        setTimeout(() => {
          scrollToIndex(activeIndex + 1);
        }, 400);
      }
    },
    [activeIndex, reels.length, nextCursor, scrollToIndex, loadMoreReels],
  );

  // Handle new reel created via direct upload
  const handleReelCreated = (newReel: Reel) => {
    setReels((prev) => [newReel, ...prev]);
    setTimeout(() => scrollToIndex(0), 100);
  };

  return (
    <div className="relative w-full h-full flex items-center justify-center overflow-hidden bg-[#0f0f0f]">
      {/* Scrollable Feed Container */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="shorts-scroll-container w-full h-full overflow-y-scroll"
      >
        {reels.map((reel, index) => (
          <ShortItem
            key={reel.id}
            reel={reel}
            index={index}
            activeIndex={activeIndex}
            onLikeUpdate={handleLikeUpdate}
            onEnded={() => handleAutoAdvance(index)}
          />
        ))}

        {isLoadingMore && (
          <div className="h-24 flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-red-500 animate-spin" />
          </div>
        )}
      </div>

      {/* Desktop Floating Navigation Up/Down Chevrons (Top Right on desktop) */}
      <div className="hidden lg:block fixed right-8 top-1/2 -translate-y-1/2 z-30">
        <DesktopNavButtons
          onPrev={() => scrollToIndex(activeIndex - 1)}
          onNext={() => {
            if (activeIndex < reels.length - 1) {
              scrollToIndex(activeIndex + 1);
            } else if (nextCursor) {
              loadMoreReels();
            }
          }}
          hasPrev={activeIndex > 0}
          hasNext={activeIndex < reels.length - 1 || !!nextCursor}
        />
      </div>

      {/* Slide-in Comments Drawer */}
      <CommentsDrawer />

      {/* Share Modal */}
      <ShareModal />
    </div>
  );
};
