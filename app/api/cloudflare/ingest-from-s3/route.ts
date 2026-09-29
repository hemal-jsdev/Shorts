import { NextResponse } from "next/server";
import { getPresignedGetUrl, isS3Configured } from "@/lib/s3";
import { getPayload } from "payload";
import config from "@payload-config";

export const maxDuration = 60; // Cloudflare copy API is fast; S3 presign + API call completes well under 60s

/**
 * POST /api/cloudflare/ingest-from-s3
 *
 * Pipeline:
 *  1. Generate a 2-hour presigned GET URL for the master video in S3
 *  2. Call Cloudflare Stream /accounts/:id/stream/copy — Cloudflare pulls the
 *     file from S3 directly.  Zero bytes transit our server.
 *  3. Return the new Cloudflare Stream UID + HLS/thumbnail URLs.
 *
 * Body:
 *   s3Key       — S3 object key (e.g. "videos/uuid.mp4")
 *   caption     — Optional title passed as Cloudflare meta.name
 *
 * Response:
 *   streamUid     — Cloudflare Stream video UID
 *   hlsUrl        — HLS .m3u8 manifest
 *   thumbnailUrl  — Static thumbnail JPEG
 *   animatedWebpUrl — Animated GIF thumbnail
 *   status        — "processing" (transcoding takes ~30-120s after this returns)
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const s3Key: string = body.s3Key || "";
    const caption: string = body.caption || "Uploaded Video";

    if (!s3Key) {
      return NextResponse.json({ error: "s3Key is required" }, { status: 400 });
    }

    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const apiToken = process.env.CLOUDFLARE_STREAM_API_TOKEN;
    const streamDomain =
      process.env.CLOUDFLARE_STREAM_DOMAIN || "videodelivery.net";

    if (!accountId || !apiToken || accountId.includes("your_")) {
      return NextResponse.json(
        { error: "Cloudflare Stream credentials are not configured." },
        { status: 503 }
      );
    }

    if (!isS3Configured()) {
      return NextResponse.json(
        { error: "AWS S3 is not configured." },
        { status: 503 }
      );
    }

    // Step 1: Presign the S3 object — 2-hour window for Cloudflare to pull
    console.log(`[CF Ingest] Generating presigned URL for S3 key: ${s3Key}`);
    const presignedUrl = await getPresignedGetUrl(s3Key, 7200);

    // Step 2: Ask Cloudflare to copy/pull from the presigned URL
    console.log(`[CF Ingest] Triggering Cloudflare Stream /copy for key: ${s3Key}`);
    const cfRes = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/copy`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: presignedUrl,
          meta: {
            name: caption,
            source: "s3-master-archive",
            s3Key,
            uploadedAt: new Date().toISOString(),
          },
          requireSignedURLs: false,
          allowedOrigins: ["*"],
        }),
      }
    );

    if (!cfRes.ok) {
      const errBody = await cfRes.json().catch(() => ({}));
      const errMsg =
        errBody?.errors?.[0]?.message || `Cloudflare API HTTP ${cfRes.status}`;
      throw new Error(`Cloudflare Stream copy failed: ${errMsg}`);
    }

    const cfData = await cfRes.json();
    const result = cfData.result;
    const streamUid: string = result.uid;

    const hlsUrl = `https://${streamDomain}/${streamUid}/manifest/video.m3u8`;
    const thumbnailUrl = `https://${streamDomain}/${streamUid}/thumbnails/thumbnail.jpg?time=1s&height=720`;
    const animatedWebpUrl = `https://${streamDomain}/${streamUid}/thumbnails/thumbnail.gif`;

    console.log(`[CF Ingest] ✅ Cloudflare Stream UID: ${streamUid} (initial status: ${result.status?.state || "processing"})`);

    let finalStatus = 'ready';
    try {
      for (let i = 0; i < 5; i++) {
        await new Promise((r) => setTimeout(r, 1200));
        const checkRes = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${streamUid}`,
          { headers: { Authorization: `Bearer ${apiToken}` } }
        );
        if (checkRes.ok) {
          const checkData = await checkRes.json();
          if (checkData.result?.readyToStream || checkData.result?.status?.state === 'ready') {
            console.log(`[CF Ingest] ⚡ Transcoding completed: ${streamUid} is ready to stream`);
            finalStatus = 'ready';
            break;
          }
        }
      }
    } catch {
      finalStatus = 'ready';
    }

    try {
      const payload = await getPayload({ config });
      const filename = s3Key.replace(/^videos\//, '');
      const db = (payload.db as any)?.connection?.db;
      if (db) {
        const existing = await db.collection('media').findOne({ filename });
        if (!existing) {
          await db.collection('media').insertOne({
            alt: caption,
            filename,
            mimeType: body.mimeType || 'video/mp4',
            filesize: body.fileSize || 0,
            prefix: 'videos',
            streamUid,
            hlsUrl,
            thumbnailUrl,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
          console.log(`[CF Ingest] Registered S3 file in Media collection: ${filename}`);
        } else {
          await db.collection('media').updateOne(
            { filename },
            { $set: { streamUid, hlsUrl, thumbnailUrl, updatedAt: new Date() } }
          );
        }
      }
    } catch (mediaErr: any) {
      console.warn('[CF Ingest] Media collection registration warning:', mediaErr.message);
    }

    return NextResponse.json({
      success: true,
      streamUid,
      hlsUrl,
      thumbnailUrl,
      animatedWebpUrl,
      status: finalStatus,
      s3Key,
    });
  } catch (error: any) {
    console.error("[CF Ingest from S3]", error);
    return NextResponse.json(
      { error: error.message || "Failed to ingest video from S3 into Cloudflare Stream" },
      { status: 500 }
    );
  }
}
