import { Innertube, ClientType } from 'youtubei.js';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { randomUUID } from 'crypto';
import ffmpegPath from 'ffmpeg-static';

export interface MuxResult {
  buffer: Buffer;
  width: number;
  height: number;
  durationSeconds: number;
  title?: string;
  author?: string;
}

/**
 * Downloads the best available separate video and audio streams from YouTube,
 * muxes them using FFmpeg, and scales to vertical Full HD (1080x1920) so that
 * Cloudflare Stream can generate all rendition ladders: 1080p, 720p, 480p, 360p, 240p.
 */
export async function downloadAndMuxYouTube(
  videoId: string,
  options: {
    targetResolution?: '1080p' | '720p' | 'original';
    cookie?: string;
  } = {}
): Promise<MuxResult> {
  const { targetResolution = '1080p', cookie = process.env.YOUTUBE_COOKIE } = options;

  console.log(`[VideoMuxer] 🎬 Initializing YouTube client for ID: ${videoId}...`);

  // iOS client provides reliable DASH video & audio streams without cipher blocks
  const yt = await Innertube.create({
    client_type: ClientType.IOS,
    generate_session_locally: true,
    ...(cookie ? { cookie } : {}),
  });

  let title = '';
  let author = '';
  let durationSeconds = 60;

  try {
    const basicInfo = await yt.getBasicInfo(videoId);
    if (basicInfo?.basic_info) {
      title = basicInfo.basic_info.title || '';
      author = basicInfo.basic_info.author || '';
      durationSeconds = basicInfo.basic_info.duration || 60;
    }
  } catch (err: any) {
    console.warn('[VideoMuxer] Non-critical: could not fetch basicInfo:', err?.message);
  }

  const uniqueId = randomUUID();
  const tempDir = os.tmpdir();
  const vTmp = path.join(tempDir, `yt_v_${uniqueId}.mp4`);
  const aTmp = path.join(tempDir, `yt_a_${uniqueId}.m4a`);
  const outTmp = path.join(tempDir, `yt_out_${uniqueId}.mp4`);

  try {
    // ── 1. Download best video track (video-only stream) ──────────────────────
    console.log(`[VideoMuxer] 📥 Fetching high-quality video track for ${videoId}...`);
    const vStream = await yt.download(videoId, { type: 'video', quality: 'best' });
    const vWs = fs.createWriteStream(vTmp);
    const vReader = vStream.getReader();
    while (true) {
      const { done, value } = await vReader.read();
      if (done) break;
      vWs.write(Buffer.from(value));
    }
    vWs.end();
    await new Promise<void>((resolve, reject) => {
      vWs.on('finish', () => resolve());
      vWs.on('error', reject);
    });
    const vSizeMb = (fs.statSync(vTmp).size / (1024 * 1024)).toFixed(2);
    console.log(`[VideoMuxer] ✅ Video track downloaded (${vSizeMb} MB)`);

    // ── 2. Download best audio track (audio-only stream) ──────────────────────
    console.log(`[VideoMuxer] 📥 Fetching high-quality audio track for ${videoId}...`);
    const aStream = await yt.download(videoId, { type: 'audio', quality: 'best' });
    const aWs = fs.createWriteStream(aTmp);
    const aReader = aStream.getReader();
    while (true) {
      const { done, value } = await aReader.read();
      if (done) break;
      aWs.write(Buffer.from(value));
    }
    aWs.end();
    await new Promise<void>((resolve, reject) => {
      aWs.on('finish', () => resolve());
      aWs.on('error', reject);
    });
    const aSizeMb = (fs.statSync(aTmp).size / (1024 * 1024)).toFixed(2);
    console.log(`[VideoMuxer] ✅ Audio track downloaded (${aSizeMb} MB)`);

    // ── 3. Mux & Scale to 1080x1920 using FFmpeg ──────────────────────────────
    console.log(`[VideoMuxer] ⚙️ Muxing & encoding Full HD master via FFmpeg...`);
    const startTime = Date.now();

    const ffmpegArgs: string[] = ['-i', vTmp, '-i', aTmp];

    if (targetResolution === '1080p') {
      // Scale to 1080x1920 vertical shorts format with padding preservation
      ffmpegArgs.push(
        '-vf',
        'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,format=yuv420p',
        '-c:v',
        'libx264',
        '-preset',
        'ultrafast',
        '-crf',
        '20'
      );
    } else {
      ffmpegArgs.push('-c:v', 'copy');
    }

    ffmpegArgs.push(
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-movflags',
      '+faststart',
      '-y',
      outTmp
    );

    const execPath = ffmpegPath || 'ffmpeg';

    await new Promise<void>((resolve, reject) => {
      const ff = spawn(execPath, ffmpegArgs);
      let stderrLog = '';
      ff.stderr?.on('data', (d) => {
        stderrLog += d.toString();
      });
      ff.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(
            new Error(
              `FFmpeg process exited with code ${code}: ${stderrLog.slice(-300)}`
            )
          );
        }
      });
      ff.on('error', reject);
    });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const outBuffer = fs.readFileSync(outTmp);
    const outMb = (outBuffer.length / (1024 * 1024)).toFixed(2);
    console.log(`[VideoMuxer] 🎉 1080p Master created in ${elapsed}s! Size: ${outMb} MB`);

    return {
      buffer: outBuffer,
      width: 1080,
      height: 1920,
      durationSeconds,
      title,
      author,
    };
  } finally {
    // ── Cleanup temporary files ──────────────────────────────────────────────
    try {
      if (fs.existsSync(vTmp)) fs.unlinkSync(vTmp);
      if (fs.existsSync(aTmp)) fs.unlinkSync(aTmp);
      if (fs.existsSync(outTmp)) fs.unlinkSync(outTmp);
    } catch (cleanupErr) {
      console.warn('[VideoMuxer] Temp file cleanup warning:', cleanupErr);
    }
  }
}
