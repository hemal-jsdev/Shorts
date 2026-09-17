import { NextResponse } from 'next/server';

/**
 * POST /api/cloudflare/upload-url
 *
 * Requests a Cloudflare Stream direct (TUS) upload URL.
 * The client then uploads the video file directly to Cloudflare — no bytes
 * pass through our Next.js server, keeping it lean and memory-safe.
 *
 * Returns:
 *   uploadUrl    — TUS endpoint to PATCH chunks to
 *   streamUid    — Cloudflare Stream video UID
 *   hlsUrl       — HLS .m3u8 manifest (available after transcoding ~30s)
 *   dashUrl      — DASH .mpd manifest
 *   thumbnailUrl — Static thumbnail
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const maxDurationSeconds: number = body.maxDurationSeconds || 300;

    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const apiToken = process.env.CLOUDFLARE_STREAM_API_TOKEN;
    const streamDomain = process.env.CLOUDFLARE_STREAM_DOMAIN || 'videodelivery.net';

    // ── Validate credentials ──────────────────────────────────────────────
    if (!accountId || !apiToken || accountId.includes('your_')) {
      // Dev fallback — return a mock so the UI can be demoed without credentials
      const mockUid = `cf_dev_${Date.now()}`;
      console.warn('[Cloudflare Upload] No credentials set — returning mock upload URL');
      return NextResponse.json({
        data: {
          uploadUrl: `https://upload.videodelivery.net/${mockUid}`,
          streamUid: mockUid,
          hlsUrl: `https://${streamDomain}/${mockUid}/manifest/video.m3u8`,
          dashUrl: `https://${streamDomain}/${mockUid}/manifest/video.mpd`,
          thumbnailUrl: `https://${streamDomain}/${mockUid}/thumbnails/thumbnail.jpg?time=1s&height=720`,
          animatedWebpUrl: `https://${streamDomain}/${mockUid}/thumbnails/thumbnail.gif`,
        },
      });
    }

    // ── Call Cloudflare Stream direct_upload API ──────────────────────────
    const cfRes = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/direct_upload`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          maxDurationSeconds,
          meta: {
            source: 'insta-shorts-payload-admin',
            uploadedAt: new Date().toISOString(),
          },
          requireSignedURLs: false,
          // TUS resumable upload support
          allowedOrigins: ['*'],
        }),
      }
    );

    if (!cfRes.ok) {
      const errBody = await cfRes.json().catch(() => ({}));
      const errMsg = errBody?.errors?.[0]?.message || `HTTP ${cfRes.status}`;
      throw new Error(`Cloudflare API error: ${errMsg}`);
    }

    const cfData = await cfRes.json();
    const result = cfData.result;
    const streamUid: string = result.uid;

    return NextResponse.json({
      data: {
        uploadUrl: result.uploadURL,
        streamUid,
        hlsUrl: `https://${streamDomain}/${streamUid}/manifest/video.m3u8`,
        dashUrl: `https://${streamDomain}/${streamUid}/manifest/video.mpd`,
        thumbnailUrl: `https://${streamDomain}/${streamUid}/thumbnails/thumbnail.jpg?time=1s&height=720`,
        animatedWebpUrl: `https://${streamDomain}/${streamUid}/thumbnails/thumbnail.gif`,
      },
    });
  } catch (error: any) {
    console.error('[Cloudflare Upload URL]', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create upload URL' },
      { status: 500 }
    );
  }
}
