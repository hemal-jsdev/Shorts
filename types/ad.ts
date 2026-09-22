import { Reel } from './reel';

export interface SponsoredAd {
  id: string;
  brandName: string;
  brandAvatar?: string | null;
  headline: string;
  caption?: string | null;
  mediaType?: 'video' | 'image';
  videoUrl?: string | null;
  imageUrl?: string | null;
  posterUrl?: string | null;
  ctaText: string; // e.g. "Shop Now", "Install App", "Learn More", "Claim Deal"
  ctaUrl: string; // Destination URL
  displayDomain?: string; // e.g. "nike.com" or "spotify.com"
  durationSeconds?: number | null;
  displayFrequency?: number; // Show after every N reels
  status?: 'active' | 'paused';
  impressionsCount?: number;
  clicksCount?: number;
}

export type FeedItem =
  | { type: 'reel'; data: Reel }
  | { type: 'ad'; data: SponsoredAd };
