import { NextResponse } from 'next/server';
import { getPayload } from 'payload';
import config from '@payload-config';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const payload = await getPayload({ config });
    const doc: any = await payload.findByID({
      collection: 'reels',
      id,
      depth: 1,
    });

    if (!doc) {
      return NextResponse.json({ error: 'Reel not found' }, { status: 404 });
    }

    const author = typeof doc.author === 'object' && doc.author !== null ? doc.author : {};

    const reel = {
      id: String(doc.id),
      userId: author.id ? String(author.id) : 'usr_default',
      streamUid: doc.streamUid || null,
      hlsUrl: doc.hlsUrl || '',
      dashUrl: doc.dashUrl || null,
      thumbnailUrl: doc.thumbnailUrl || null,
      animatedWebpUrl: doc.animatedWebpUrl || null,
      caption: doc.caption || '',
      status: doc.status || 'READY',
      createdAt: doc.createdAt,
      isLiked: false,
      user: {
        id: author.id ? String(author.id) : 'usr_default',
        username: author.username || 'creator',
        displayName: author.displayName || author.username || 'Creator',
        avatarUrl: author.avatarUrl || null,
        bio: author.bio || null,
        isVerified: !!author.isVerified,
      },
    };

    return NextResponse.json({ data: reel });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
