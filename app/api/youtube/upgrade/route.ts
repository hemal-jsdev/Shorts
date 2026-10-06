import { NextResponse } from 'next/server';
import { getPayload } from 'payload';
import config from '@payload-config';
import { downloadAndMuxYouTube } from '@/lib/video-muxer';
import { isS3Configured, uploadToS3 } from '@/lib/s3';
import { randomUUID } from 'crypto';

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // Allow long-running batch execution

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { reelId, limit = 5 } = body;

    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const apiToken = process.env.CLOUDFLARE_STREAM_API_TOKEN;
    const streamDomain = process.env.CLOUDFLARE_STREAM_DOMAIN || 'videodelivery.net';

    if (!accountId || !apiToken) {
      return NextResponse.json(
        { error: 'Cloudflare credentials not configured' },
        { status: 500 }
      );
    }

    const payload = await getPayload({ config });
    const db = (payload.db as any)?.connection?.db;

    if (!db) {
      return NextResponse.json(
        { error: 'Database connection unavailable' },
        { status: 500 }
      );
    }

    // ── Find target reels to upgrade ──────────────────────────────────────────
    const filter: any = {};
    if (reelId) {
      filter._id = typeof reelId === 'string' ? new (require('mongodb').ObjectId)(reelId) : reelId;
    }

    const reels = await db.collection('reels').find(filter).limit(Number(limit) || 5).toArray();

    if (reels.length === 0) {
      return NextResponse.json({
        message: 'No reels found to upgrade',
        upgradedCount: 0,
      });
    }

    const results: Array<{
      id: string;
      caption: string;
      oldStreamUid: string;
      newStreamUid?: string;
      status: 'upgraded' | 'skipped' | 'failed';
      error?: string;
    }> = [];

    for (const reel of reels) {
      const idStr = String(reel._id);
      const caption = reel.caption || 'Untitled';
      const oldStreamUid = reel.streamUid || '';

      console.log(`[1080p Upgrade] 🔄 Inspecting reel: "${caption.slice(0, 30)}" (${idStr})...`);

      // ── Determine YouTube ID ───────────────────────────────────────────────
      let youtubeId: string | null = null;

      // 1. Check if streamUid is itself an 11-char YouTube ID
      if (oldStreamUid && /^[a-zA-Z0-9_-]{11}$/.test(oldStreamUid)) {
        youtubeId = oldStreamUid;
      }

      // 2. Query Cloudflare Stream meta for original youtubeId
      if (!youtubeId && oldStreamUid && accountId && apiToken) {
        try {
          const cfRes = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${oldStreamUid}`,
            { headers: { Authorization: `Bearer ${apiToken}` } }
          );
          if (cfRes.ok) {
            const cfData = await cfRes.json();
            youtubeId = cfData.result?.meta?.youtubeId || null;
          }
        } catch (_) {}
      }

      // 3. Check hlsUrl if it references YouTube
      if (!youtubeId && reel.hlsUrl) {
        const ytMatch = String(reel.hlsUrl).match(/(?:v=|shorts\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
        if (ytMatch) youtubeId = ytMatch[1];
      }

      if (!youtubeId) {
        console.log(`[1080p Upgrade] ⚠️ Skipped: No YouTube source ID found for reel ${idStr}`);
        results.push({
          id: idStr,
          caption,
          oldStreamUid,
          status: 'skipped',
          error: 'No YouTube ID found on record',
        });
        continue;
      }

      // ── Download and Mux in 1080p Full HD ───────────────────────────────────
      try {
        console.log(`[1080p Upgrade] 🎬 Downloading & muxing 1080p stream for YouTube ID: ${youtubeId}...`);
        const muxResult = await downloadAndMuxYouTube(youtubeId, { targetResolution: '1080p' });
        const videoBuffer = muxResult.buffer;

        // Optional: archive to S3
        let uploadedS3Key = reel.s3Key || null;
        if (isS3Configured()) {
          try {
            const s3Key = `videos/${randomUUID()}.mp4`;
            await uploadToS3(s3Key, videoBuffer, 'video/mp4');
            uploadedS3Key = s3Key;
          } catch (s3Err) {
            console.warn('[1080p Upgrade] S3 archive warning:', s3Err);
          }
        }

        // Upload new 1080p master to Cloudflare Stream
        console.log(`[1080p Upgrade] ☁️ Uploading 1080p master to Cloudflare Stream...`);
        const directUploadRes = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/direct_upload`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${apiToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              maxDurationSeconds: Math.max(muxResult.durationSeconds || 60, 120),
              meta: {
                name: caption,
                source: 'youtube-1080p-upgrade',
                youtubeId,
                s3Key: uploadedS3Key,
              },
              requireSignedURLs: false,
              allowedOrigins: ['*'],
            }),
          }
        );

        if (!directUploadRes.ok) {
          const errText = await directUploadRes.text();
          throw new Error(`Cloudflare Direct Upload initialization failed: ${errText}`);
        }

        const cfInit = await directUploadRes.json();
        const uploadUrl = cfInit.result.uploadURL;
        const newStreamUid = cfInit.result.uid;

        // Push binary
        const formData = new FormData();
        const videoBlob = new Blob([new Uint8Array(videoBuffer)], { type: 'video/mp4' });
        formData.append('file', videoBlob, `${youtubeId}-1080p.mp4`);

        const uploadBinaryRes = await fetch(uploadUrl, { method: 'POST', body: formData });
        if (!uploadBinaryRes.ok) {
          const uploadErr = await uploadBinaryRes.text();
          throw new Error(`Failed to upload binary to Cloudflare: ${uploadErr}`);
        }

        // Compute updated URLs
        const newHlsUrl = `https://${streamDomain}/${newStreamUid}/manifest/video.m3u8`;
        const newThumbUrl = `https://${streamDomain}/${newStreamUid}/thumbnails/thumbnail.jpg?time=1s&height=720`;
        const newGifUrl = `https://${streamDomain}/${newStreamUid}/thumbnails/thumbnail.gif`;

        // Update MongoDB
        await db.collection('reels').updateOne(
          { _id: reel._id },
          {
            $set: {
              streamUid: newStreamUid,
              hlsUrl: newHlsUrl,
              thumbnailUrl: newThumbUrl,
              animatedWebpUrl: newGifUrl,
              videoSource: 'cloudflare',
              status: 'ready',
              ...(uploadedS3Key ? { s3Key: uploadedS3Key } : {}),
              updatedAt: new Date(),
            },
          }
        );

        console.log(`[1080p Upgrade] ✅ Successfully upgraded reel ${idStr} -> New StreamUID: ${newStreamUid}`);

        results.push({
          id: idStr,
          caption,
          oldStreamUid,
          newStreamUid,
          status: 'upgraded',
        });
      } catch (upgradeErr: any) {
        console.error(`[1080p Upgrade] ❌ Failed to upgrade reel ${idStr}:`, upgradeErr?.message);
        results.push({
          id: idStr,
          caption,
          oldStreamUid,
          status: 'failed',
          error: upgradeErr?.message,
        });
      }
    }

    const upgradedCount = results.filter((r) => r.status === 'upgraded').length;

    return NextResponse.json({
      success: true,
      totalProcessed: results.length,
      upgradedCount,
      results,
    });
  } catch (error: any) {
    console.error('[1080p Upgrade] Batch upgrade error:', error);
    return NextResponse.json(
      { error: error?.message || 'Upgrade failed' },
      { status: 500 }
    );
  }
}
