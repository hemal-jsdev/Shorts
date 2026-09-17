import { NextResponse } from 'next/server';
import axios from 'axios';

function extractYouTubeId(url: string): string | null {
  if (!url) return null;
  const match = url.match(
    /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|shorts\/|watch\?v=|watch\?.+&v=))([\w-]{11})/
  );
  return match ? match[1] : null;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const url = searchParams.get('url');

    if (!url) {
      return NextResponse.json({ error: 'YouTube URL is required' }, { status: 400 });
    }

    const videoId = extractYouTubeId(url);
    if (!videoId) {
      return NextResponse.json(
        { error: 'Invalid YouTube URL. Please provide a valid YouTube Shorts or Video link.' },
        { status: 400 }
      );
    }

    // Query official YouTube oEmbed API
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    
    let title = 'YouTube Short';
    let authorName = 'YouTube Creator';
    let authorUrl = `https://www.youtube.com/@creator`;
    let thumbnailUrl = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

    try {
      const oembedRes = await axios.get(oembedUrl, { timeout: 6000 });
      if (oembedRes.data) {
        title = oembedRes.data.title || title;
        authorName = oembedRes.data.author_name || authorName;
        authorUrl = oembedRes.data.author_url || authorUrl;
        if (oembedRes.data.thumbnail_url) {
          thumbnailUrl = oembedRes.data.thumbnail_url;
        }
      }
    } catch (oembedErr: any) {
      console.warn('[YouTube Meta] oEmbed fetch fallback:', oembedErr.message);
    }

    // Try high-resolution thumbnail (maxresdefault)
    const maxResUrl = `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
    try {
      const headCheck = await axios.head(maxResUrl, { timeout: 3000 });
      if (headCheck.status === 200) {
        thumbnailUrl = maxResUrl;
      }
    } catch (_) {
      // Keep hqdefault.jpg
    }

    // Extract hashtags from title
    const hashtagMatches = title.match(/#([a-zA-Z0-9_-]+)/g);
    let hashtags: string[] = [];
    if (hashtagMatches) {
      hashtags = hashtagMatches.map((h) => h.replace(/^#/, '').toLowerCase());
    } else {
      hashtags = ['shorts', 'viral', 'reels'];
    }

    return NextResponse.json({
      success: true,
      data: {
        videoId,
        title,
        caption: title,
        authorName,
        authorUrl,
        thumbnailUrl,
        audioName: `${authorName} - Original Voice 🎵`,
        hashtags,
        embedUrl: `https://www.youtube.com/shorts/${videoId}`,
        hlsUrl: `https://www.youtube.com/shorts/${videoId}`,
      },
    });
  } catch (error: any) {
    console.error('[YouTube Meta Error]', error.message);
    return NextResponse.json({ error: error.message || 'Failed to fetch YouTube metadata' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const url = body.url;

    if (!url) {
      return NextResponse.json({ error: 'YouTube URL is required' }, { status: 400 });
    }

    // Redirect logic to GET
    const mockReq = new Request(`http://localhost:3000/api/youtube/metadata?url=${encodeURIComponent(url)}`);
    return GET(mockReq);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
