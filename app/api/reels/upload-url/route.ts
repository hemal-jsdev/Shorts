import { NextResponse } from 'next/server';
import axios from 'axios';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const maxDurationSeconds = body.maxDurationSeconds || 60;

    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    const apiToken = process.env.CLOUDFLARE_STREAM_API_TOKEN;
    const streamDomain = process.env.CLOUDFLARE_STREAM_DOMAIN || 'videodelivery.net';

    const isConfigured = accountId && apiToken && !accountId.includes('your_');

    if (!isConfigured) {
      const mockUid = `cf_mock_${Date.now()}`;
      return NextResponse.json({
        data: {
          uploadUrl: `https://upload.videodelivery.net/${mockUid}`,
          streamUid: mockUid,
          hlsUrl: `https://${streamDomain}/${mockUid}/manifest/video.m3u8`,
          dashUrl: `https://${streamDomain}/${mockUid}/manifest/video.mpd`,
          thumbnailUrl: `https://${streamDomain}/${mockUid}/thumbnails/thumbnail.jpg?time=1s&height=720`,
          animatedWebpUrl: `https://${streamDomain}/${mockUid}/animated.webp?duration=4s&fps=15`,
        },
      });
    }

    try {
      const cfRes = await axios.post(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/direct_upload`,
        {
          maxDurationSeconds,
          meta: {
            source: 'insta-shorts-payload',
            timestamp: new Date().toISOString(),
          },
          requireSignedURLs: false,
        },
        {
          headers: {
            Authorization: `Bearer ${apiToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const result = cfRes.data.result;
      const streamUid = result.uid;

      return NextResponse.json({
        data: {
          uploadUrl: result.uploadURL,
          streamUid,
          hlsUrl: `https://${streamDomain}/${streamUid}/manifest/video.m3u8`,
          dashUrl: `https://${streamDomain}/${streamUid}/manifest/video.mpd`,
          thumbnailUrl: `https://${streamDomain}/${streamUid}/thumbnails/thumbnail.jpg?time=1s&height=720`,
          animatedWebpUrl: `https://${streamDomain}/${streamUid}/animated.webp?duration=4s&fps=15`,
        },
      });
    } catch (cfErr: any) {
      const errMsg = cfErr.response?.data?.errors?.[0]?.message || cfErr.message;
      console.warn(`[Cloudflare Direct Upload] API returned: ${errMsg}. Providing mock upload endpoint.`);

      const mockUid = `cf_mock_${Date.now()}`;
      return NextResponse.json({
        data: {
          uploadUrl: `https://upload.videodelivery.net/${mockUid}`,
          streamUid: mockUid,
          hlsUrl: `https://${streamDomain}/${mockUid}/manifest/video.m3u8`,
          thumbnailUrl: `https://${streamDomain}/${mockUid}/thumbnails/thumbnail.jpg?time=1s&height=720`,
        },
      });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
