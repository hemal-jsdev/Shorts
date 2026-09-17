import { reelsApi } from '@/lib/api';
import { ShortsFeed } from '@/components/shorts/ShortsFeed';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const feedData = await reelsApi.getFeed(undefined, 5);

  return (
    <ShortsFeed
      initialReels={feedData.items}
      initialCursor={feedData.nextCursor}
    />
  );
}
