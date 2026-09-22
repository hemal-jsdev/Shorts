import { NextResponse } from 'next/server';
import { getPayload } from 'payload';
import config from '@payload-config';
import axios from 'axios';

export const dynamic = 'force-dynamic';
export const maxDuration = 180; // Allow sufficient time for high-res download & upload

function extractYouTubeId(url: string): string | null {
  if (!url) return null;
  const match = url.trim().match(
    /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|shorts\/|watch\?v=|watch\?.+&v=))([\w-]{11})/
  );
  return match ? match[1] : null;
}

async function fetchOEmbedMetadata(videoId: string) {
  const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
  let title = 'YouTube Short';
  let authorName = 'YouTube Creator';
  let authorUrl = `https://www.youtube.com/@creator`;
  let thumbnailUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

  try {
    const res = await axios.get(oembedUrl, { timeout: 6000 });
    if (res.data) {
      title = res.data.title || title;
      authorName = res.data.author_name || authorName;
      authorUrl = res.data.author_url || authorUrl;
      if (res.data.thumbnail_url) {
        thumbnailUrl = res.data.thumbnail_url;
      }
    }
  } catch (err: any) {
    console.warn('[YouTube Meta] oEmbed fetch warning:', err.message);
  }

  // Try high-res thumbnail check
  const maxResUrl = `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
  try {
    const headCheck = await axios.head(maxResUrl, { timeout: 3000 });
    if (headCheck.status === 200) {
      thumbnailUrl = maxResUrl;
    }
  } catch (_) {
    // Keep standard thumbnail
  }

  return { title, authorName, authorUrl, thumbnailUrl };
}

async function readStreamToBuffer(stream: any): Promise<Buffer> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
    }
  }
  return Buffer.concat(chunks);
}

import { Innertube, Platform, ClientType } from 'youtubei.js';

// Configure JavaScript evaluator required by youtubei.js to decipher video URLs
try {
  Platform.shim.eval = (data: any, env: any = {}) => {
    return new Function(...Object.keys(env), data.output)(...Object.values(env));
  };
} catch (err: any) {
  console.warn('[YouTube Import] Platform.shim.eval setup warning:', err?.message);
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const rawUrl: string = body.url || '';
    const customCaption: string = body.caption || '';
    const directMode: boolean = Boolean(body.directMode);

    if (!rawUrl) {
      return NextResponse.json({ error: 'YouTube URL is required' }, { status: 400 });
    }

    const videoId = extractYouTubeId(rawUrl);
    if (!videoId) {
      return NextResponse.json(
        { error: 'Invalid YouTube Shorts URL. Please provide a valid YouTube Shorts or Video link.' },
        { status: 400 }
      );
    }

    // ── Direct Mode: Instant Stream Linking (Zero Server Download, 100% Reliable) ──
    if (directMode) {
      console.log(`[YouTube Import] ⚡ Instant direct mode requested for ID: ${videoId}`);
      const meta = await fetchOEmbedMetadata(videoId);
      const title = customCaption.trim() || meta.title;

      let createdDocId: string | null = null;
      if (body.createDocument) {
        const payload = await getPayload({ config });
        const users = await payload.find({ collection: 'users', limit: 1 });
        const authorId = users.docs[0]?.id || '6aab8a67467d4a0bf899e129';

        const newReel = await payload.create({
          collection: 'reels',
          data: {
            caption: title,
            videoSource: 'youtube',
            streamUid: videoId,
            hlsUrl: `https://www.youtube.com/shorts/${videoId}`,
            thumbnailUrl: meta.thumbnailUrl,
            animatedWebpUrl: meta.thumbnailUrl,
            author: authorId,
            status: 'ready',
          },
        });
        createdDocId = String(newReel.id);
      }

      return NextResponse.json({
        success: true,
        data: {
          id: createdDocId,
          caption: title,
          videoSource: 'youtube',
          streamUid: videoId,
          hlsUrl: `https://www.youtube.com/shorts/${videoId}`,
          thumbnailUrl: meta.thumbnailUrl,
          animatedWebpUrl: meta.thumbnailUrl,
          durationSeconds: 60,
          authorName: meta.authorName,
          quality: 'Direct HD Stream',
          isDirectYouTube: true,
        },
      });
    }

    // ── Transcode Mode: Attempt Cloudflare Ingestion with Graceful Fallback ────
    const streamDomain = process.env.CLOUDFLARE_STREAM_DOMAIN || 'videodelivery.net';
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const apiToken = process.env.CLOUDFLARE_STREAM_API_TOKEN;
    const hasValidCredentials = Boolean(accountId && apiToken && !accountId.includes('your_'));

    let rawTitle = customCaption.trim();
    let channelName = 'YouTube Creator';
    let durationSeconds = 60;
    let thumbnailUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    let animatedWebpUrl = thumbnailUrl;
    let streamUid: string = videoId;
    let hlsUrl: string = `https://www.youtube.com/shorts/${videoId}`;
    let detectedQuality = 'HD';
    let isDirectYouTube = false;
    let fallbackNotice: string | null = null;

    try {
      const yt = await Innertube.create({
        client_type: ClientType.ANDROID,
        generate_session_locally: true,
      });

      const info = await yt.getBasicInfo(videoId);
      const basic = info.basic_info;

      rawTitle = rawTitle || basic.title || 'YouTube Short';
      channelName = basic.author || 'YouTube Creator';
      durationSeconds = basic.duration || 60;
      thumbnailUrl = basic.thumbnail?.[0]?.url || thumbnailUrl;

      console.log(`[YouTube Import] 📥 Downloading stream for ID: ${videoId}...`);
      let videoBuffer: Buffer;
      try {
        const stream = await yt.download(videoId, {
          type: 'video+audio',
          quality: 'best',
          format: 'any',
        });
        videoBuffer = await readStreamToBuffer(stream);
      } catch (androidErr) {
        console.log('[YouTube Import] Trying MWEB client stream fallback...');
        const ytMweb = await Innertube.create({
          client_type: ClientType.MWEB,
          generate_session_locally: true,
        });
        const mwebStream = await ytMweb.download(videoId, {
          type: 'video+audio',
          quality: 'best',
          format: 'any',
        });
        videoBuffer = await readStreamToBuffer(mwebStream);
      }

      if (hasValidCredentials) {
        console.log('[YouTube Import] ☁️ Uploading to Cloudflare Stream...');
        const directUploadRes = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/direct_upload`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${apiToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              maxDurationSeconds: Math.max(durationSeconds, 60),
              meta: {
                name: rawTitle,
                source: 'youtube-shorts-import',
                youtubeId: videoId,
                channelName,
              },
              requireSignedURLs: false,
              allowedOrigins: ['*'],
            }),
          }
        );

        if (!directUploadRes.ok) {
          const errText = await directUploadRes.text();
          throw new Error(`Cloudflare Direct Upload request failed: ${errText}`);
        }

        const cfData = await directUploadRes.json();
        const uploadUrl = cfData.result.uploadURL;
        streamUid = cfData.result.uid;

        const formData = new FormData();
        const videoBlob = new Blob([new Uint8Array(videoBuffer)], { type: 'video/mp4' });
        formData.append('file', videoBlob, `${videoId}.mp4`);

        const uploadBinaryRes = await fetch(uploadUrl, {
          method: 'POST',
          body: formData,
        });

        if (!uploadBinaryRes.ok) {
          const uploadErr = await uploadBinaryRes.text();
          throw new Error(`Failed to upload video binary to Cloudflare: ${uploadErr}`);
        }

        hlsUrl = `https://${streamDomain}/${streamUid}/manifest/video.m3u8`;
        thumbnailUrl = `https://${streamDomain}/${streamUid}/thumbnails/thumbnail.jpg?time=1s&height=720`;
        animatedWebpUrl = `https://${streamDomain}/${streamUid}/thumbnails/thumbnail.gif`;
        console.log(`[YouTube Import] ✅ Successfully uploaded to Cloudflare Stream (UID: ${streamUid})`);
      } else {
        throw new Error('Cloudflare Stream credentials are missing in the server environment.');
      }
    } catch (ingestErr: any) {
      console.error('[YouTube Import] Cloudflare ingestion failed:', ingestErr);
      throw new Error(
        `Cloudflare Stream Ingestion Failed: ${ingestErr?.message || 'Failed to download or transcode YouTube video.'}`
      );
    }

    // ── Document Creation (if requested) ─────────────────────────────────────
    let createdDocId: string | null = null;
    if (body.createDocument) {
      const payload = await getPayload({ config });
      const users = await payload.find({ collection: 'users', limit: 1 });
      const authorId = users.docs[0]?.id || '6aab8a67467d4a0bf899e129';

      const newReel = await payload.create({
        collection: 'reels',
        data: {
          caption: rawTitle,
          videoSource: isDirectYouTube ? 'youtube' : 'cloudflare',
          streamUid,
          hlsUrl,
          thumbnailUrl,
          animatedWebpUrl,
          author: authorId,
          status: 'ready',
        },
      });
      createdDocId = String(newReel.id);
    }

    return NextResponse.json({
      success: true,
      fallbackToDirectEmbed: isDirectYouTube,
      notice: fallbackNotice,
      data: {
        id: createdDocId,
        caption: rawTitle,
        videoSource: isDirectYouTube ? 'youtube' : 'cloudflare',
        streamUid,
        hlsUrl,
        thumbnailUrl,
        animatedWebpUrl,
        durationSeconds,
        authorName: channelName,
        quality: detectedQuality,
        isDirectYouTube,
      },
    });
  } catch (error: any) {
    console.error('[YouTube Import Route Error]', error);
    return NextResponse.json(
      { error: error.message || 'Failed to import YouTube Shorts video' },
      { status: 500 }
    );
  }
}
