import { NextResponse } from 'next/server';
import { getPayload } from 'payload';
import config from '@payload-config';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    let comments: any[] = [];

    try {
      const payload = await getPayload({ config });
      const result = await payload.find({
        collection: 'comments',
        where: {
          reel: { equals: id },
        },
        sort: '-createdAt',
        depth: 1,
      });

      comments = result.docs.map((c: any) => {
        const user = typeof c.user === 'object' && c.user !== null ? c.user : {};
        return {
          id: String(c.id),
          reelId: id,
          userId: user.id ? String(user.id) : 'usr_anon',
          text: c.content || c.text || '',
          likesCount: c.likesCount || 0,
          createdAt: c.createdAt,
          user: {
            id: user.id ? String(user.id) : 'usr_anon',
            username: user.username || 'user',
            displayName: user.displayName || user.username || 'User',
            avatarUrl: user.avatarUrl || null,
          },
        };
      });
    } catch (err: any) {
      console.warn('[Comments GET] Payload query fallback:', err.message);
    }

    if (comments.length === 0) {
      comments = [
        {
          id: 'demo_c1',
          reelId: id,
          userId: 'usr_standup',
          text: 'This standup routine is hilarious! 😂🔥',
          likesCount: 28,
          createdAt: new Date(Date.now() - 3600000).toISOString(),
          user: {
            id: 'usr_standup',
            username: 'onlystandup',
            displayName: 'Only Stand-Up 🔥',
            avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
          },
        },
        {
          id: 'demo_c2',
          reelId: id,
          userId: 'usr_pranav',
          text: 'Thanks everyone for the love on this short! More coming this week! 🙏✨',
          likesCount: 19,
          createdAt: new Date(Date.now() - 1800000).toISOString(),
          user: {
            id: 'usr_pranav',
            username: 'pranavsharma_comedy',
            displayName: 'Pranav Sharma 🎤',
            avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
          },
        },
      ];
    }

    return NextResponse.json({ data: comments });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const text = body.text || '';

    const newComment = {
      id: `c_${Date.now()}`,
      reelId: id,
      userId: 'usr_current',
      text,
      likesCount: 0,
      createdAt: new Date().toISOString(),
      user: {
        id: 'usr_current',
        username: 'you',
        displayName: 'You',
        avatarUrl: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
      },
    };

    try {
      const payload = await getPayload({ config });
      // Create comment in Payload if DB connected
      const firstUser = await payload.find({ collection: 'users', limit: 1 });
      const userId = firstUser.docs[0]?.id;

      if (userId) {
        await payload.create({
          collection: 'comments',
          data: {
            reel: id as any,
            user: userId,
            content: text,
          },
        });
      }
    } catch (err: any) {
      console.warn('[Comments POST] Payload insert fallback:', err.message);
    }

    return NextResponse.json({ data: newComment });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
