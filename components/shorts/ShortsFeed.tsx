'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Reel } from '../../types/reel';
import { FeedItem, SponsoredAd } from '../../types/ad';
import { ShortItem } from './ShortItem';
import { AdItem } from './AdItem';
import { DesktopNavButtons } from './DesktopNavButtons';
import { CommentsDrawer } from './CommentsDrawer';
import { ShareModal } from './ShareModal';
import { useShortsStore } from '../../store/useShortsStore';
import { reelsApi, adsApi } from '../../lib/api';
import { Loader2 } from 'lucide-react';

interface ShortsFeedProps {
  initialReels: Reel[];
  initialCursor?: string | null;
}

export const ShortsFeed: React.FC<ShortsFeedProps> = ({ initialReels, initialCursor }) => {
  const [feedItems, setFeedItems] = useState<FeedItem[]>(() =>
    initialReels.map((r) => ({ type: 'reel' as const, data: r })),
  );
  const [nextCursor, setNextCursor] = useState<string | null>(initialCursor || null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const isLoadingMoreRef = useRef(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const isScrollingRef = useRef(false);
  const adPointerRef = useRef(0);
  const hasMountedRef = useRef(false);

  const {
    activeIndex,
    setActiveIndex,
    togglePlayPause,
    toggleMute,
    activeCommentReel,
    openComments,
    closeComments,
    ads,
    setAds,
    scrolledReelsSinceAd,
    watched90ReelsSinceAd,
    recordReelScrolled,
    recordReelWatched90,
    resetAdTrackingCounters,
  } = useShortsStore();

  useEffect(() => {
    adsApi
      .getActiveAds()
      .then((res) => {
        if (res.ads && res.ads.length > 0) {
          setAds(res.ads);
        }
      })
      .catch((err) => {
        console.warn('[ShortsFeed] Failed to load ads:', err);
      });
  }, [setAds]);

  useEffect(() => {
    if (!hasMountedRef.current && feedItems.length > 0 && feedItems[0].type === 'reel') {
      hasMountedRef.current = true;
      recordReelScrolled(feedItems[0].data.id);
    }
  }, [feedItems, recordReelScrolled]);

  useEffect(() => {
    if (!ads.length || !feedItems.length) return;

    const hasMetScrollThreshold = scrolledReelsSinceAd.length >= 4;
    const hasMetWatchThreshold = watched90ReelsSinceAd.length >= 2;

    if (hasMetScrollThreshold || hasMetWatchThreshold) {
      const targetAdIndex = activeIndex + 1;

      setFeedItems((prev) => {
        if (prev[targetAdIndex]?.type === 'ad') return prev;

        const selectedAd = ads[adPointerRef.current % ads.length];
        adPointerRef.current++;

        const updated = [...prev];
        updated.splice(targetAdIndex, 0, { type: 'ad', data: selectedAd });

        console.log(
          `[AdEngine] Injected sponsored ad "${selectedAd.headline}" at index ${targetAdIndex}. Reason: ` +
            `${hasMetScrollThreshold ? `4 reels scrolled (${scrolledReelsSinceAd.length})` : `2 reels watched >=90% (${watched90ReelsSinceAd.length})`}`,
        );

        return updated;
      });
    }
  }, [
    scrolledReelsSinceAd.length,
    watched90ReelsSinceAd.length,
    activeIndex,
    ads,
    feedItems.length,
  ]);

  const handleWatchProgress = useCallback(
    (reelId: string, fraction: number) => {
      if (fraction >= 0.90) {
        recordReelWatched90(reelId);
      }
    },
    [recordReelWatched90],
  );

  const loadMoreReels = useCallback(() => {
    if (!nextCursor || isLoadingMoreRef.current) return;
    isLoadingMoreRef.current = true;
    setIsLoadingMore(true);

    reelsApi
      .getFeed(nextCursor, 20)
      .then((data) => {
        if (data.items && data.items.length > 0) {
          setFeedItems((prev) => {
            const existingReelIds = new Set(
              prev.filter((i) => i.type === 'reel').map((i) => i.data.id),
            );
            const newReels: FeedItem[] = data.items
              .filter((r) => !existingReelIds.has(r.id))
              .map((r) => ({ type: 'reel' as const, data: r }));
            return [...prev, ...newReels];
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

  useEffect(() => {
    if (activeIndex >= feedItems.length - 3 && nextCursor) {
      loadMoreReels();
    }
  }, [activeIndex, feedItems.length, nextCursor, loadMoreReels]);

  const scrollToIndex = useCallback(
    (index: number) => {
      if (!containerRef.current) return;
      if (index >= feedItems.length - 3 && nextCursor) {
        loadMoreReels();
      }
      const targetElement = containerRef.current.children[index] as HTMLElement;
      if (targetElement) {
        isScrollingRef.current = true;
        targetElement.scrollIntoView({ behavior: 'smooth' });
        setActiveIndex(index);

        const currentItem = feedItems[index];
        if (currentItem) {
          if (currentItem.type === 'reel') {
            recordReelScrolled(currentItem.data.id);
            if (typeof window !== 'undefined') {
              window.history.replaceState(null, '', `/shorts/${currentItem.data.id}`);
            }
          } else if (currentItem.type === 'ad') {
            resetAdTrackingCounters();
          }
        }

        setTimeout(() => {
          isScrollingRef.current = false;
        }, 500);
      }
    },
    [setActiveIndex, feedItems, nextCursor, loadMoreReels, recordReelScrolled, resetAdTrackingCounters],
  );

  const handleScroll = useCallback(() => {
    if (!containerRef.current || isScrollingRef.current) return;

    const scrollTop = containerRef.current.scrollTop;
    const clientHeight = containerRef.current.clientHeight;
    const newIndex = Math.round(scrollTop / clientHeight);

    if (newIndex !== activeIndex && newIndex >= 0 && newIndex < feedItems.length) {
      setActiveIndex(newIndex);

      const currentItem = feedItems[newIndex];
      if (currentItem) {
        if (currentItem.type === 'reel') {
          recordReelScrolled(currentItem.data.id);
          if (typeof window !== 'undefined') {
            window.history.replaceState(null, '', `/shorts/${currentItem.data.id}`);
          }
        } else if (currentItem.type === 'ad') {
          resetAdTrackingCounters();
        }
      }

      if (newIndex >= feedItems.length - 3 && nextCursor) {
        loadMoreReels();
      }
    }
  }, [activeIndex, feedItems, nextCursor, loadMoreReels, setActiveIndex, recordReelScrolled, resetAdTrackingCounters]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        return;
      }

      switch (e.code) {
        case 'ArrowDown':
        case 'KeyJ':
          e.preventDefault();
          if (activeIndex < feedItems.length - 1) {
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
          } else {
            const activeItem = feedItems[activeIndex];
            if (activeItem && activeItem.type === 'reel') {
              openComments(activeItem.data);
            }
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeIndex, feedItems, nextCursor, activeCommentReel, scrollToIndex, loadMoreReels, togglePlayPause, toggleMute, openComments, closeComments]);

  const handleLikeUpdate = (reelId: string, isLiked: boolean, count: number) => {
    setFeedItems((prev) =>
      prev.map((item) =>
        item.type === 'reel' && item.data.id === reelId
          ? { ...item, data: { ...item.data, isLiked, likesCount: count } }
          : item,
      ),
    );
  };

  const handleAutoAdvance = useCallback(
    (index: number) => {
      if (index !== activeIndex) return;

      if (activeIndex < feedItems.length - 1) {
        scrollToIndex(activeIndex + 1);
      } else if (nextCursor) {
        loadMoreReels();
        setTimeout(() => {
          scrollToIndex(activeIndex + 1);
        }, 400);
      }
    },
    [activeIndex, feedItems.length, nextCursor, scrollToIndex, loadMoreReels],
  );

  return (
    <div className="relative w-full h-full flex items-center justify-center overflow-hidden bg-[#0f0f0f]">
      {/* Scrollable Feed Container */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="shorts-scroll-container w-full h-full overflow-y-scroll"
      >
        {feedItems.map((item, index) => {
          if (item.type === 'ad') {
            return (
              <AdItem
                key={`feed-ad-${item.data.id}-${index}`}
                ad={item.data}
                index={index}
                activeIndex={activeIndex}
                onEnded={() => handleAutoAdvance(index)}
              />
            );
          }

          return (
            <ShortItem
              key={item.data.id}
              reel={item.data}
              index={index}
              activeIndex={activeIndex}
              onLikeUpdate={handleLikeUpdate}
              onWatchProgress={handleWatchProgress}
              onEnded={() => handleAutoAdvance(index)}
            />
          );
        })}

        {isLoadingMore && (
          <div className="h-24 flex items-center justify-center">
            <Loader2 className="w-8 h-8 text-red-500 animate-spin" />
          </div>
        )}
      </div>

      {/* Desktop Floating Navigation Up/Down Chevrons */}
      <div className="hidden lg:block fixed right-8 top-1/2 -translate-y-1/2 z-30">
        <DesktopNavButtons
          onPrev={() => scrollToIndex(activeIndex - 1)}
          onNext={() => {
            if (activeIndex < feedItems.length - 1) {
              scrollToIndex(activeIndex + 1);
            } else if (nextCursor) {
              loadMoreReels();
            }
          }}
          hasPrev={activeIndex > 0}
          hasNext={activeIndex < feedItems.length - 1 || !!nextCursor}
        />
      </div>

      {/* Slide-in Comments Drawer */}
      <CommentsDrawer />

      {/* Share Modal */}
      <ShareModal />
    </div>
  );
};
