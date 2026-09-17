import { NextResponse } from 'next/server';
import { getPayload } from 'payload';
import config from '@payload-config';

export async function POST(req: Request) {
  try {
    const payload = await getPayload({ config });
    const body = await req.json();

    // Cloudflare Stream webhook payload structure
    const streamUid = body.uid;
    const status = body.status?.state; // 'ready', 'inprogress', 'error'
    const duration = body.duration;
    const thumbnail = body.thumbnail;

    if (streamUid && status === 'ready') {
      const streamDomain = process.env.CLOUDFLARE_STREAM_DOMAIN || 'videodelivery.net';
      
      const found = await payload.find({
        collection: 'reels',
        where: {
          streamUid: { equals: streamUid },
        },
      });

      if (found.docs.length > 0) {
        const reelDoc = found.docs[0];
        await payload.update({
          collection: 'reels',
          id: reelDoc.id,
          data: {
            status: 'ready',
            hlsUrl: `https://${streamDomain}/${streamUid}/manifest/video.m3u8`,
            thumbnailUrl: thumbnail || `https://${streamDomain}/${streamUid}/thumbnails/thumbnail.jpg?time=1s&height=720`,
          },
        });
        console.log(`[Cloudflare Webhook] Reel ${reelDoc.id} marked as ready`);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[Cloudflare Webhook] Error processing event:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
