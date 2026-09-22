import { NextResponse } from 'next/server';
import { getPayload } from 'payload';
import config from '@payload-config';
import { SponsoredAd } from '@/types/ad';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    let ads: SponsoredAd[] = [];

    const payload = await getPayload({ config });
    const res = await payload.find({
      collection: 'ads',
      where: {
        status: { equals: 'active' },
      },
      limit: 20,
      sort: '-createdAt',
    });

    if (res.docs && res.docs.length > 0) {
      ads = res.docs.map((doc: any) => ({
        id: String(doc.id),
        brandName: doc.brandName || 'Sponsored Partner',
        brandAvatar: doc.brandAvatar || null,
        headline: doc.headline || '',
        caption: doc.caption || null,
        mediaType: doc.mediaType || (doc.imageUrl && !doc.videoUrl ? 'image' : 'video'),
        videoUrl: doc.videoUrl || null,
        imageUrl: doc.imageUrl || null,
        posterUrl: doc.posterUrl || doc.imageUrl || null,
        ctaText: doc.ctaText || 'Learn More',
        ctaUrl: doc.ctaUrl || '#',
        displayDomain: doc.ctaUrl ? new URL(doc.ctaUrl).hostname.replace(/^www\./, '') : undefined,
        durationSeconds: doc.durationSeconds || (doc.mediaType === 'image' ? null : 15),
        displayFrequency: doc.displayFrequency || 4,
        status: 'active',
        impressionsCount: doc.impressionsCount || 0,
        clicksCount: doc.clicksCount || 0,
      }));
    }

    return NextResponse.json({
      success: true,
      data: {
        ads,
        defaultCadence: ads[0]?.displayFrequency || 4,
      },
    });
  } catch (err: any) {
    console.error('[Ads API] Error fetching active ads from database:', err.message);
    return NextResponse.json(
      { success: false, error: err.message, data: { ads: [], defaultCadence: 4 } },
      { status: 500 },
    );
  }
}
