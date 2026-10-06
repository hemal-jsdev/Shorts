import { getPayload } from 'payload';
import config from '../payload.config';
import { downloadAndMuxYouTube } from '../lib/video-muxer';
import { isS3Configured, uploadToS3 } from '../lib/s3';
import { randomUUID } from 'crypto';

async function upgradeAll() {
  console.log('🚀 Starting batch upgrade of all Reels to 1080p Full HD...\n');

  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_STREAM_API_TOKEN;
  const streamDomain = process.env.CLOUDFLARE_STREAM_DOMAIN || 'videodelivery.net';

  if (!accountId || !apiToken) {
    throw new Error('Cloudflare credentials missing in environment.');
  }

  const payload = await getPayload({ config });
  const db = (payload.db as any)?.connection?.db;

  if (!db) {
    throw new Error('Could not access MongoDB connection.');
  }

  const reels = await db.collection('reels').find({}).toArray();
  console.log(`Found ${reels.length} total reels in database.\n`);

  let count = 0;

  for (const reel of reels) {
    count++;
    const idStr = String(reel._id);
    const caption = reel.caption || 'Untitled';
    const oldStreamUid = reel.streamUid || '';

    console.log(`[${count}/${reels.length}] 🔍 Inspecting: "${caption.slice(0, 35)}"...`);

    // Check if video already has 1080p by querying Cloudflare
    if (oldStreamUid) {
      try {
        const cfRes = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${oldStreamUid}`,
          { headers: { Authorization: `Bearer ${apiToken}` } }
        );
        if (cfRes.ok) {
          const cfData = await cfRes.json();
          const w = cfData.result?.input?.width || 0;
          const h = cfData.result?.input?.height || 0;
          if (w >= 1080 || h >= 1080) {
            console.log(`   ⏭️ Already 1080p (${w}x${h}). Skipping.\n`);
            continue;
          }
        }
      } catch (_) {}
    }

    // Determine YouTube ID
    let youtubeId: string | null = null;
    if (oldStreamUid && /^[a-zA-Z0-9_-]{11}$/.test(oldStreamUid)) {
      youtubeId = oldStreamUid;
    }

    if (!youtubeId && oldStreamUid) {
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

    if (!youtubeId && reel.hlsUrl) {
      const match = String(reel.hlsUrl).match(/(?:v=|shorts\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
      if (match) youtubeId = match[1];
    }

    if (!youtubeId) {
      console.log(`   ⚠️ No YouTube ID identified for reel. Skipping.\n`);
      continue;
    }

    try {
      console.log(`   📥 Downloading & muxing 1080p stream for ${youtubeId}...`);
      const muxResult = await downloadAndMuxYouTube(youtubeId, { targetResolution: '1080p' });
      const videoBuffer = muxResult.buffer;

      let uploadedS3Key = reel.s3Key || null;
      if (isS3Configured()) {
        try {
          const s3Key = `videos/${randomUUID()}.mp4`;
          await uploadToS3(s3Key, videoBuffer, 'video/mp4');
          uploadedS3Key = s3Key;
        } catch (_) {}
      }

      console.log(`   ☁️ Uploading 1080p master to Cloudflare Stream...`);
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
        throw new Error(`Direct upload init failed`);
      }

      const cfInit = await directUploadRes.json();
      const uploadUrl = cfInit.result.uploadURL;
      const newStreamUid = cfInit.result.uid;

      const formData = new FormData();
      const videoBlob = new Blob([new Uint8Array(videoBuffer)], { type: 'video/mp4' });
      formData.append('file', videoBlob, `${youtubeId}-1080p.mp4`);

      const uploadBinaryRes = await fetch(uploadUrl, { method: 'POST', body: formData });
      if (!uploadBinaryRes.ok) {
        throw new Error(`Binary upload failed`);
      }

      const newHlsUrl = `https://${streamDomain}/${newStreamUid}/manifest/video.m3u8`;
      const newThumbUrl = `https://${streamDomain}/${newStreamUid}/thumbnails/thumbnail.jpg?time=1s&height=720`;
      const newGifUrl = `https://${streamDomain}/${newStreamUid}/thumbnails/thumbnail.gif`;

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

      console.log(`   ✅ Upgraded! New StreamUID: ${newStreamUid}\n`);
    } catch (err: any) {
      console.error(`   ❌ Failed to upgrade:`, err?.message, '\n');
    }
  }

  console.log('🎉 All reels processed!\n');
  process.exit(0);
}

upgradeAll().catch((err) => {
  console.error('Fatal upgrade error:', err);
  process.exit(1);
});
