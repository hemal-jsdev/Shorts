import { Metadata } from 'next';
import { reelsApi } from '@/lib/api';
import { ShortsFeed } from '@/components/shorts/ShortsFeed';

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const reel = await reelsApi.getReelById(id);
    return {
      title: `${reel.user?.displayName || 'Creator'} on Shorts: "${reel.caption?.slice(0, 50) || 'Watch now'}"`,
      description: reel.caption || 'Watch this short on YouTube Shorts & Instagram Reels',
      openGraph: {
        title: reel.caption || 'Shorts Video',
        images: reel.thumbnailUrl ? [reel.thumbnailUrl] : [],
      },
    };
  } catch (_) {
    return {
      title: 'Shorts Video Player',
      description: 'Watch shorts powered by Cloudflare Stream',
    };
  }
}

export default async function ShortDetailPage({ params }: Props) {
  const { id } = await params;

  let targetReel;
  try {
    targetReel = await reelsApi.getReelById(id);
  } catch (_) {
    targetReel = null;
  }

  const feedData = await reelsApi.getFeed(undefined, 10);
  let reels = feedData.items;

  if (targetReel) {
    reels = [targetReel, ...reels.filter((r) => r.id !== targetReel.id)];
  }

  return (
    <ShortsFeed
      initialReels={reels}
      initialCursor={feedData.nextCursor}
    />
  );
}
