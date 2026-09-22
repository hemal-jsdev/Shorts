import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import path from 'path';
import { promisify } from 'util';
import fs from 'fs';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const execAsync = promisify(exec);

export async function POST() {
  try {
    const projectRoot = process.cwd();
    const scriptPath = path.join(projectRoot, 'scripts', 'fetch_youtube_cookies.py');
    const envFilePath = path.join(projectRoot, '.env');
    const sessionDir = path.join(projectRoot, 'scripts', '.yt_session');

    if (!fs.existsSync(scriptPath)) {
      return NextResponse.json(
        { error: 'Cookie fetcher script not found. Please check scripts/fetch_youtube_cookies.py.' },
        { status: 500 }
      );
    }

    const cmd = `python "${scriptPath}" --headless --json --env-file "${envFilePath}" --session-dir "${sessionDir}"`;
    console.log('[RefreshCookies] Running:', cmd);

    const { stdout, stderr } = await execAsync(cmd, {
      timeout: 55000,
      cwd: projectRoot,
    });

    if (stderr) {
      console.log('[RefreshCookies] Script output:', stderr);
    }

    let result: { success?: boolean; cookieLength?: number; preview?: string } = {};
    try {
      result = JSON.parse(stdout.trim());
    } catch (_) {
      result = { success: true, cookieLength: stdout.trim().length };
    }

    if (!result.success) {
      return NextResponse.json(
        { error: 'Cookie fetch script failed. Run the script manually with the browser to log in first.' },
        { status: 500 }
      );
    }

    const envContent = fs.readFileSync(envFilePath, 'utf-8');
    const ytMatch = envContent.match(/YOUTUBE_COOKIE="([^"]+)"/);
    if (ytMatch) {
      process.env.YOUTUBE_COOKIE = ytMatch[1];
    }

    return NextResponse.json({
      success: true,
      message: `YouTube session cookies refreshed successfully. ${result.cookieLength || 0} bytes captured.`,
      cookieLength: result.cookieLength || 0,
      note: 'Cookies are now active for this server process. On Vercel, update YOUTUBE_COOKIE in project environment variables.',
    });
  } catch (err: any) {
    const msg = err?.message || 'Unknown error';
    console.error('[RefreshCookies] Error:', msg);

    let userMessage = `Failed to run cookie fetcher: ${msg}`;
    if (msg.includes('exit code 2') || msg.toLowerCase().includes('no session')) {
      userMessage = 'No saved YouTube session found. Please run the cookie fetcher script locally in headed mode first: python scripts/fetch_youtube_cookies.py';
    } else if (msg.toLowerCase().includes('python') || msg.toLowerCase().includes('not found')) {
      userMessage = 'Python is not available on this server. Please run the script locally and update YOUTUBE_COOKIE in Vercel environment variables.';
    } else if (msg.includes('timeout')) {
      userMessage = 'Cookie fetcher timed out. Please run manually: python scripts/fetch_youtube_cookies.py';
    }

    return NextResponse.json({ error: userMessage }, { status: 500 });
  }
}
