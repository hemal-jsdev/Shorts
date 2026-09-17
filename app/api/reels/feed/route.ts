import { NextResponse } from 'next/server';
import { getPayload } from 'payload';
import config from '@payload-config';
import axios from 'axios';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const cursor = searchParams.get('cursor');
    const limit = Math.min(Number(searchParams.get('limit')) || 10, 50);

    let items: any[] = [];
    let nextCursor: string | null = null;

    try {
      const payload = await getPayload({ config });
      const query: any = {
        collection: 'reels',
        where: {
          status: { in: ['ready', 'READY'] },
        },
        sort: '-createdAt',
        limit: limit + 1,
        depth: 1, // populates author
      };

      if (cursor) {
        query.where = {
          and: [
            { status: { in: ['ready', 'READY'] } },
            { id: { less_than: cursor } },
          ],
        };
      }

      let result = await payload.find(query);

      // Auto-sync from Cloudflare if no ready reels exist in DB yet
      if (result.docs.length === 0 && !cursor) {
        try {
          const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
          const apiToken = process.env.CLOUDFLARE_STREAM_API_TOKEN;

          if (accountId && apiToken) {
            const cfRes = await axios.get(
              `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream`,
              {
                headers: { Authorization: `Bearer ${apiToken}` },
                timeout: 5000,
              }
            );

            const cfVideos = cfRes.data?.result || [];
            const readyVideos = cfVideos.filter(
              (v: any) => v.readyToStream || v.status?.state === 'ready'
            );

            if (readyVideos.length > 0) {
              const users = await payload.find({ collection: 'users', limit: 1 });
              const defaultAuthorId = users.docs[0]?.id || '6aab8a67467d4a0bf899e129';

              for (const vid of readyVideos) {
                let rawTitle = vid.meta?.name || vid.meta?.filename || 'Cloudflare Reel';
                rawTitle = rawTitle.replace(/\.mp4$/i, '').replace(/720P$/i, '').trim();
                if (rawTitle.startsWith('vidssave.com ')) {
                  rawTitle = rawTitle.replace('vidssave.com ', '');
                }

                await payload.create({
                  collection: 'reels',
                  data: {
                    caption: rawTitle,
                    videoSource: 'cloudflare',
                    streamUid: vid.uid,
                    hlsUrl: `https://videodelivery.net/${vid.uid}/manifest/video.m3u8`,
                    thumbnailUrl:
                      vid.thumbnail ||
                      `https://customer-d3tadt8nvkirw68k.cloudflarestream.com/${vid.uid}/thumbnails/thumbnail.jpg?time=1s&height=720`,
                    animatedWebpUrl: `https://videodelivery.net/${vid.uid}/thumbnails/thumbnail.gif`,
                    author: defaultAuthorId,
                    status: 'ready' as any,
                  },
                });
              }

              // Re-fetch after sync
              result = await payload.find(query);
            }
          }
        } catch (syncErr) {
          console.warn('[Feed Route] Cloudflare auto-sync warning:', syncErr);
        }
      }

      if (result.docs.length > 0) {
        const docs = result.docs;
        if (docs.length > limit) {
          const nextItem = docs.pop();
          nextCursor = String(nextItem?.id || '');
        }

        items = docs.map((doc: any) => {
          const author = typeof doc.author === 'object' && doc.author !== null ? doc.author : {};

          return {
            id: String(doc.id),
            userId: author.id ? String(author.id) : '6aab8a67467d4a0bf899e129',
            streamUid: doc.streamUid || null,
            hlsUrl: doc.hlsUrl || '',
            thumbnailUrl: doc.thumbnailUrl || null,
            animatedWebpUrl: doc.animatedWebpUrl || null,
            caption: doc.caption || '',
            status: (doc.status ? String(doc.status).toUpperCase() : 'READY'),
            createdAt: doc.createdAt,
            isLiked: false,
            user: {
              id: author.id ? String(author.id) : '6aab8a67467d4a0bf899e129',
              username: author.username || 'admin',
              displayName: author.displayName || author.username || 'Administrator',
              avatarUrl:
                author.avatarUrl ||
                'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
              bio: author.bio || null,
              isVerified: author.isVerified !== undefined ? !!author.isVerified : true,
            },
          };
        });
      }
    } catch (dbErr: any) {
      console.warn('[Feed Route] Payload query failed or DB connecting:', dbErr.message);
    }

    return NextResponse.json({
      data: {
        items,
        nextCursor,
        hasMore: !!nextCursor,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
