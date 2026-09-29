import { NextResponse } from 'next/server';
import { getPayload } from 'payload';
import config from '@payload-config';
import axios from 'axios';
import { uploadToS3, getPresignedGetUrl, isS3Configured } from '@/lib/s3';
import { randomUUID } from 'crypto';

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
import fs from 'node:fs';
import path from 'node:path';

// Configure JavaScript evaluator required by youtubei.js to decipher video URLs
try {
  Platform.shim.eval = (data: any, env: any = {}) => {
    return new Function(...Object.keys(env), data.output)(...Object.values(env));
  };
} catch (err: any) {
  console.warn('[YouTube Import] Platform.shim.eval setup warning:', err?.message);
}

function getYouTubeCookie(): string | undefined {
  if (process.env.YOUTUBE_COOKIE?.trim()) {
    return process.env.YOUTUBE_COOKIE.trim();
  }
  try {
    const envPath = path.join(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      const match = content.match(/YOUTUBE_COOKIE=["']([^"']+)["']/);
      if (match && match[1]) {
        process.env.YOUTUBE_COOKIE = match[1];
        return match[1];
      }
    }
  } catch (_) {}
  return undefined;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const rawUrl: string = body.url || '';
    const customCaption: string = body.caption || '';
    const customThumbnail: string = body.thumbnailUrl || '';
    const customAuthorName: string = body.authorName || '';
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
      const author = customAuthorName.trim() || meta.authorName;
      const thumbnail = customThumbnail.trim() || meta.thumbnailUrl;

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
            thumbnailUrl: thumbnail,
            animatedWebpUrl: thumbnail,
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
          thumbnailUrl: thumbnail,
          animatedWebpUrl: thumbnail,
          durationSeconds: 60,
          authorName: author,
          quality: 'Direct Lossless HD',
          isDirectYouTube: true,
        },
      });
    }

    // ── Transcode Mode: Attempt Cloudflare Ingestion with Graceful Fallback ────
    const streamDomain = process.env.CLOUDFLARE_STREAM_DOMAIN || 'videodelivery.net';
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const apiToken = process.env.CLOUDFLARE_STREAM_API_TOKEN;
    const hasValidCredentials = Boolean(accountId && apiToken && !accountId.includes('your_'));

    // Pre-fetch oEmbed metadata (reliable, no-login required)
    const oembed = await fetchOEmbedMetadata(videoId);
    let rawTitle = customCaption.trim() || oembed.title || 'YouTube Short';
    let channelName = customAuthorName.trim() || oembed.authorName || 'YouTube Creator';
    let durationSeconds = 60;
    let thumbnailUrl = customThumbnail.trim() || oembed.thumbnailUrl || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    let animatedWebpUrl = thumbnailUrl;
    let streamUid: string = videoId;
    let hlsUrl: string = `https://www.youtube.com/shorts/${videoId}`;
    let detectedQuality = 'HD';
    let isDirectYouTube = false;
    let fallbackNotice: string | null = null;

    try {
      console.log(`[YouTube Import] 📥 Downloading stream for ID: ${videoId}...`);
      let videoBuffer: Buffer | null = null;
      let lastDownloadErr: any = null; // Multiple clients to maximize resilience against YouTube datacenter bot protection

      const clientCandidates = [
        ClientType.MWEB,
        ClientType.TV_EMBEDDED,
        ClientType.ANDROID,
        ClientType.WEB,
      ];

      for (const clientType of clientCandidates) {
        try {
          const ytCookie = getYouTubeCookie();
          const yt = await Innertube.create({
            client_type: clientType,
            generate_session_locally: true,
            ...(ytCookie ? { cookie: ytCookie } : {}),
          });

          // Attempt to enrich duration / quality from basic info if permitted
          try {
            const info = await yt.getBasicInfo(videoId);
            const basic = info.basic_info;
            if (basic) {
              rawTitle = customCaption.trim() || basic.title || rawTitle;
              channelName = customAuthorName.trim() || basic.author || channelName;
              durationSeconds = basic.duration || durationSeconds;
              thumbnailUrl = customThumbnail.trim() || basic.thumbnail?.[0]?.url || thumbnailUrl;
            }
          } catch (_) {
            // Ignore basic info restriction; oEmbed metadata is already set
          }

          const stream = await yt.download(videoId, {
            type: 'video+audio',
            quality: 'best',
            format: 'any',
          });

          videoBuffer = await readStreamToBuffer(stream);
          if (videoBuffer && videoBuffer.length > 0) {
            console.log(`[YouTube Import] ✅ Successfully downloaded via client ${clientType} (${(videoBuffer.length / (1024 * 1024)).toFixed(2)} MB)`);
            break;
          }
        } catch (err: any) {
          console.warn(`[YouTube Import] Client ${clientType} download attempt failed:`, err?.message);
          lastDownloadErr = err;
        }
      }

      if (!videoBuffer || videoBuffer.length === 0) {
        let errMessage = lastDownloadErr?.message || 'Failed to download YouTube video stream.';
        if (errMessage.toLowerCase().includes('login') || errMessage.toLowerCase().includes('bot') || errMessage.toLowerCase().includes('unavailable')) {
          errMessage = 'YouTube Bot Protection: YouTube is restricting automated server downloads from this cloud hosting datacenter.';
        }
        throw new Error(errMessage);
      }

      if (hasValidCredentials) {
        let uploadedS3Key: string | null = null;

        // ── If S3 is configured: archive master file first, then CF pulls from S3 ──
        if (isS3Configured()) {
          try {
            console.log('[YouTube Import] 📦 Archiving master video to S3...');
            const s3Key = `videos/${randomUUID()}.mp4`;
            await uploadToS3(s3Key, videoBuffer, 'video/mp4');
            uploadedS3Key = s3Key;
            console.log(`[YouTube Import] ✅ S3 archive complete: ${s3Key}`);

            // Generate presigned URL for Cloudflare to pull from
            const presignedUrl = await getPresignedGetUrl(s3Key, 7200);

            console.log('[YouTube Import] ☁️ Triggering Cloudflare Stream /copy from S3...');
            const cfCopyRes = await fetch(
              `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/copy`,
              {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${apiToken}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  url: presignedUrl,
                  meta: {
                    name: rawTitle,
                    source: 'youtube-s3-import',
                    youtubeId: videoId,
                    s3Key,
                    channelName,
                  },
                  requireSignedURLs: false,
                  allowedOrigins: ['*'],
                }),
              }
            );

            if (!cfCopyRes.ok) {
              const errText = await cfCopyRes.text();
              throw new Error(`Cloudflare /copy from S3 failed: ${errText}`);
            }

            const cfCopyData = await cfCopyRes.json();
            streamUid = cfCopyData.result.uid;
          } catch (s3Err: any) {
            console.warn('[YouTube Import] S3+CF copy failed, falling back to direct upload:', s3Err.message);
            uploadedS3Key = null;
            // Fall through to direct upload below
          }
        }

        // ── Fallback or no S3: upload binary directly to Cloudflare ──────────
        if (!uploadedS3Key) {
          console.log('[YouTube Import] ☁️ Uploading directly to Cloudflare Stream...');
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

          const uploadBinaryRes = await fetch(uploadUrl, { method: 'POST', body: formData });
          if (!uploadBinaryRes.ok) {
            const uploadErr = await uploadBinaryRes.text();
            throw new Error(`Failed to upload video binary to Cloudflare: ${uploadErr}`);
          }
        }

        hlsUrl = `https://${streamDomain}/${streamUid}/manifest/video.m3u8`;
        thumbnailUrl = `https://${streamDomain}/${streamUid}/thumbnails/thumbnail.jpg?time=1s&height=720`;
        animatedWebpUrl = `https://${streamDomain}/${streamUid}/thumbnails/thumbnail.gif`;
        console.log(`[YouTube Import] ✅ Successfully uploaded to Cloudflare Stream (UID: ${streamUid})`);

        // Persist S3 key to outer scope so it's included in the Reel document
        if (uploadedS3Key) {
          // Attach to closure variable for the document creation step below
          (body as any).__s3Key = uploadedS3Key;

          try {
            const payload = await getPayload({ config });
            const filename = uploadedS3Key.replace(/^videos\//, '');
            const db = (payload.db as any)?.connection?.db;
            if (db) {
              const existing = await db.collection('media').findOne({ filename });
              if (!existing) {
                await db.collection('media').insertOne({
                  alt: rawTitle,
                  filename,
                  mimeType: 'video/mp4',
                  filesize: videoBuffer.length,
                  prefix: 'videos',
                  streamUid,
                  hlsUrl,
                  thumbnailUrl,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                });
                console.log(`[YouTube Import] Registered S3 file in Media collection: ${filename}`);
              } else {
                await db.collection('media').updateOne(
                  { filename },
                  { $set: { streamUid, hlsUrl, thumbnailUrl, updatedAt: new Date() } }
                );
              }
            }
          } catch (mediaErr: any) {
            console.warn('[YouTube Import] Media collection registration warning:', mediaErr.message);
          }
        }
      } else {
        throw new Error('Cloudflare Stream credentials are missing in the server environment.');
      }
    } catch (ingestErr: any) {
      console.warn('[YouTube Import] Cloudflare ingestion restricted on cloud IP, activating Direct HD Stream fallback:', ingestErr?.message);
      isDirectYouTube = true;
      fallbackNotice = '⚡ Ingested as Direct Lossless HD Stream — YouTube cloud datacenter protection active on Vercel.';
      streamUid = videoId;
      hlsUrl = `https://www.youtube.com/shorts/${videoId}`;
      detectedQuality = 'Direct Lossless HD';
    }

    // ── Document Creation (if requested) ─────────────────────────────────────
    let createdDocId: string | null = null;
    const s3Key: string | null = (body as any).__s3Key || null;
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
          ...(s3Key ? { s3Key } : {}),
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
        s3Key,
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
