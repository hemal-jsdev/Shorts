import { NextResponse } from 'next/server';
import { getPayload } from 'payload';
import config from '@payload-config';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    let viewsCount = 1;

    try {
      const payload = await getPayload({ config });
      await payload.findByID({
        collection: 'reels',
        id,
      });
    } catch (err: any) {
      console.warn('[View Route] Payload fallback:', err.message);
    }

    return NextResponse.json({
      data: {
        success: true,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
