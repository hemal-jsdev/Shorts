import { NextResponse } from 'next/server';
import { getPayload } from 'payload';
import config from '@/payload.config';
import axios from 'axios';

export const dynamic = 'force-dynamic';

interface CloudflareVideoItem {
  uid: string;
  creator?: string | null;
  thumbnail?: string;
  readyToStream?: boolean;
  status?: {
    state?: string;
    pctComplete?: string;
    errorReasonText?: string;
  };
  meta?: {
    filename?: string;
    name?: string;
  };
  duration?: number;
  input?: {
    width?: number;
    height?: number;
  };
  playback?: {
    hls?: string;
    dash?: string;
  };
  created?: string;
}

export async function GET() {
  return handleSync();
}

export async function POST() {
  return handleSync();
}

async function handleSync() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_STREAM_API_TOKEN;

  if (!accountId || !apiToken) {
    return NextResponse.json(
      { error: 'Cloudflare credentials not configured in environment variables' },
      { status: 500 }
    );
  }

  try {
    // 1. Fetch live videos from Cloudflare Stream API
    const cfRes = await axios.get(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream`,
      {
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      }
    );

    const cfVideos: CloudflareVideoItem[] = cfRes.data?.result || [];
    const payload = await getPayload({ config });

    // Find the default admin user for author assignment
    const users = await payload.find({
      collection: 'users',
      limit: 1,
    });
    const defaultAuthorId = users.docs[0]?.id || '6aab8a67467d4a0bf899e129';

    // 2. Remove legacy non-cloudflare test entries or dummy streamUids
    try {
      const db = (payload.db as any)?.connection?.db;
      if (db) {
        await db.collection('reels').deleteMany({
          $or: [
            { videoSource: 'youtube' },
            { streamUid: { $in: ['123', '5111cb8d6241104f051b8bf1bf541470'] } },
          ],
        });
      }
    } catch (cleanupErr) {
      console.warn('DB cleanup warning:', cleanupErr);
    }

    const syncedReels = [];

    for (const vid of cfVideos) {
      if (!vid.uid) continue;

      const isReady = vid.readyToStream || vid.status?.state === 'ready';
      const statusValue = isReady ? 'ready' : (vid.status?.state === 'error' ? 'failed' : 'processing');

      // Clean video title / caption
      let rawTitle = vid.meta?.name || vid.meta?.filename || 'Cloudflare Stream Reel';
      rawTitle = rawTitle.replace(/\.mp4$/i, '').replace(/720P$/i, '').trim();
      if (rawTitle.startsWith('vidssave.com ')) {
        rawTitle = rawTitle.replace('vidssave.com ', '');
      }

      const hlsUrl =
        vid.playback?.hls ||
        `https://customer-d3tadt8nvkirw68k.cloudflarestream.com/${vid.uid}/manifest/video.m3u8`;
      const dashUrl =
        vid.playback?.dash ||
        `https://customer-d3tadt8nvkirw68k.cloudflarestream.com/${vid.uid}/manifest/video.mpd`;
      const thumbnailUrl =
        vid.thumbnail ||
        `https://customer-d3tadt8nvkirw68k.cloudflarestream.com/${vid.uid}/thumbnails/thumbnail.jpg?time=1s&height=720`;
      const animatedWebpUrl = `https://videodelivery.net/${vid.uid}/thumbnails/thumbnail.gif`;
      const durationSeconds = Math.round(vid.duration || 0) || 45;

      // Check if this streamUid already exists in Payload
      const existing = await payload.find({
        collection: 'reels',
        where: {
          streamUid: { equals: vid.uid },
        },
        limit: 1,
      });

      if (existing.docs.length > 0) {
        const docId = existing.docs[0].id;
        const updated = await payload.update({
          collection: 'reels',
          id: docId,
          data: {
            caption: existing.docs[0].caption || rawTitle,
            status: statusValue as any,
            hlsUrl,
            thumbnailUrl,
            animatedWebpUrl,
            videoSource: 'cloudflare',
          },
        });
        syncedReels.push(updated);
      } else {
        const created = await payload.create({
          collection: 'reels',
          data: {
            caption: rawTitle,
            videoSource: 'cloudflare',
            streamUid: vid.uid,
            hlsUrl,
            thumbnailUrl,
            animatedWebpUrl,
            author: defaultAuthorId,
            status: statusValue as any,
          },
        });
        syncedReels.push(created);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Successfully synced ${syncedReels.length} video(s) from Cloudflare Stream`,
      totalVideosInCloudflare: cfVideos.length,
      syncedCount: syncedReels.length,
      reels: syncedReels,
    });
  } catch (error: any) {
    console.error('[Cloudflare Sync Error]:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.response?.data?.errors?.[0]?.message || error.message || 'Failed to sync Cloudflare videos',
      },
      { status: 500 }
    );
  }
}
