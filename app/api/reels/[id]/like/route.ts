import { NextResponse } from 'next/server';
import { getPayload } from 'payload';
import config from '@payload-config';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    let isLiked = true;
    let likesCount = 1;

    try {
      const payload = await getPayload({ config });
      const reel = await payload.findByID({
        collection: 'reels',
        id,
      });

      if (reel) {
        isLiked = true;
      }
    } catch (err: any) {
      console.warn('[Like Route] Payload query fallback:', err.message);
    }

    return NextResponse.json({
      data: {
        isLiked,
        likesCount,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
