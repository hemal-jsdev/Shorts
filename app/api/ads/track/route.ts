import { NextResponse } from 'next/server';
import { getPayload } from 'payload';
import config from '@payload-config';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { adId, event } = await req.json();

    if (!adId || !event || !['impression', 'click'].includes(event)) {
      return NextResponse.json({ success: false, error: 'Invalid payload' }, { status: 400 });
    }

    if (String(adId).startsWith('ad-')) {
      return NextResponse.json({ success: true, mocked: true });
    }

    try {
      const payload = await getPayload({ config });
      const currentAd = await payload.findByID({ collection: 'ads', id: adId });

      if (currentAd) {
        if (event === 'impression') {
          await payload.update({
            collection: 'ads',
            id: adId,
            data: {
              impressionsCount: ((currentAd as any).impressionsCount || 0) + 1,
            },
          });
        } else if (event === 'click') {
          await payload.update({
            collection: 'ads',
            id: adId,
            data: {
              clicksCount: ((currentAd as any).clicksCount || 0) + 1,
            },
          });
        }
      }
    } catch (dbErr: any) {
      console.warn('[Ads Track] Metric update error:', dbErr.message);
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
