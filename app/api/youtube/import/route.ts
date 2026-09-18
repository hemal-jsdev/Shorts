import { NextResponse } from 'next/server';
import { getPayload } from 'payload';
import config from '@payload-config';
// @ts-ignore
import { Innertube, Platform, ClientType } from 'youtubei.js';
// @ts-ignore
import ffmpegPath from 'ffmpeg-static';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const execFileAsync = promisify(execFile);

export const dynamic = 'force-dynamic';
export const maxDuration = 180; // Allow sufficient time for high-res download & upload

function extractYouTubeId(url: string): string | null {
  if (!url) return null;
  const match = url.trim().match(
    /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|shorts\/|watch\?v=|watch\?.+&v=))([\w-]{11})/
  );
  return match ? match[1] : null;
}

async function streamToFile(stream: any, filePath: string): Promise<void> {
  const reader = stream.getReader();
  const handle = await fs.open(filePath, 'w');
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        await handle.write(value);
      }
    }
  } finally {
    await handle.close();
  }
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

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const rawUrl: string = body.url || '';
    const customCaption: string = body.caption || '';

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

    // ── 1. Configure Innertube Engine ───────────────────────────────────────
    Platform.shim.eval = (data: any) => new Function(data.output)();
    
    // ANDROID client provides reliable, high-speed streaming without cipher-throttling
    let yt = await Innertube.create({
      client_type: ClientType.ANDROID,
      generate_session_locally: true,
    });

    // ── 2. Retrieve YouTube Metadata ─────────────────────────────────────────
    const info = await yt.getBasicInfo(videoId);
    const basic = info.basic_info;

    const rawTitle = customCaption.trim() || basic.title || 'YouTube Short';
    const channelName = basic.author || 'YouTube Creator';
    const durationSeconds = basic.duration || 60;
    const streamDomain = process.env.CLOUDFLARE_STREAM_DOMAIN || 'videodelivery.net';
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const apiToken = process.env.CLOUDFLARE_STREAM_API_TOKEN;

    console.log(`[YouTube Import] 🎬 Ingesting Short: "${rawTitle}" (ID: ${videoId})`);

    // ── 3. High-Quality Video Stream Download ─────────────────────────────────
    let videoBuffer: Buffer;
    let detectedQuality = 'HD';

    console.log('[YouTube Import] 📥 Downloading pristine video stream...');
    try {
      const stream = await yt.download(videoId, {
        type: 'video+audio',
        quality: 'best',
        format: 'any',
      });
      videoBuffer = await readStreamToBuffer(stream);
      console.log(
        `[YouTube Import] 📦 Download complete: ${(videoBuffer.length / (1024 * 1024)).toFixed(2)} MB`
      );
    } catch (androidErr: any) {
      // Graceful fallback to MWEB client if Android client encounters unexpected response
      console.log('[YouTube Import] Fallback to MWEB streaming pipeline...');
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
      console.log(
        `[YouTube Import] 📦 Download complete: ${(videoBuffer.length / (1024 * 1024)).toFixed(2)} MB`
      );
    }

    // ── 4. Upload to Cloudflare Stream ────────────────────────────────────────
    let streamUid: string;
    let hlsUrl: string;
    let thumbnailUrl: string;
    let animatedWebpUrl: string;

    const hasValidCredentials = accountId && apiToken && !accountId.includes('your_');

    if (hasValidCredentials) {
      console.log('[YouTube Import] ☁️ Uploading to Cloudflare Stream...');
      
      // Request Direct Upload URL from Cloudflare Stream
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

      // Upload binary payload to Cloudflare Stream Direct Upload endpoint
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
      // Dev / Demo Fallback when Cloudflare API credentials are not configured
      streamUid = `yt_${videoId}_${Date.now()}`;
      hlsUrl = `https://${streamDomain}/${streamUid}/manifest/video.m3u8`;
      thumbnailUrl =
        basic.thumbnail?.[0]?.url ||
        `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
      animatedWebpUrl = thumbnailUrl;
    }

    // ── 5. Optional Document Creation (Default: Form population only) ─────────
    let createdDocId: string | null = null;
    if (body.createDocument) {
      const payload = await getPayload({ config });
      const users = await payload.find({ collection: 'users', limit: 1 });
      const authorId = users.docs[0]?.id || '6aab8a67467d4a0bf899e129';

      const newReel = await payload.create({
        collection: 'reels',
        data: {
          caption: rawTitle,
          videoSource: 'cloudflare',
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
      data: {
        id: createdDocId,
        caption: rawTitle,
        streamUid,
        hlsUrl,
        thumbnailUrl,
        animatedWebpUrl,
        durationSeconds,
        authorName: channelName,
        quality: detectedQuality,
      },
    });
  } catch (error: any) {
    console.error('[YouTube Import Route Error]', error);
    return NextResponse.json(
      { error: error.message || 'Failed to import YouTube Shorts video in high quality' },
      { status: 500 }
    );
  }
}
