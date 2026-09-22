"""
YouTube Cookie Fetcher - Playwright Automation
Fetches authenticated YouTube cookies and writes them to .env as YOUTUBE_COOKIE.

Usage:
  python scripts/fetch_youtube_cookies.py          # Headed mode - opens browser for login
  python scripts/fetch_youtube_cookies.py --headless  # Headless mode - uses saved session
  python scripts/fetch_youtube_cookies.py --json   # Output result as JSON
"""

import argparse
import asyncio
import re
import sys
import json
from pathlib import Path

try:
    from playwright.async_api import async_playwright
except ImportError:
    print("ERROR: playwright not installed. Run: pip install playwright && playwright install chromium", file=sys.stderr)
    sys.exit(1)

SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent
DEFAULT_ENV_FILE = PROJECT_ROOT / ".env"
DEFAULT_SESSION_DIR = SCRIPT_DIR / ".yt_session"

YOUTUBE_LOGIN_URL = "https://accounts.google.com/v3/signin/identifier?continue=https%3A%2F%2Fwww.youtube.com%2F"
YOUTUBE_URL = "https://www.youtube.com"
REQUIRED_COOKIE_NAMES = {"SID", "HSID", "SSID", "APISID", "SAPISID", "LOGIN_INFO", "__Secure-1PAPISID", "__Secure-3PAPISID"}


def format_cookie_string(cookies):
    parts = []
    for c in cookies:
        n = c.get("name", "")
        v = c.get("value", "")
        if n and v:
            parts.append(f"{n}={v}")
    return "; ".join(parts)


def update_env_file(env_path, cookie_string):
    env_path.parent.mkdir(parents=True, exist_ok=True)
    content = env_path.read_text(encoding="utf-8") if env_path.exists() else ""
    escaped = cookie_string.replace('"', '\\"').replace("\n", "")
    new_line = f'YOUTUBE_COOKIE="{escaped}"'
    if re.search(r"^YOUTUBE_COOKIE=.*$", content, re.MULTILINE):
        content = re.sub(r"^YOUTUBE_COOKIE=.*$", new_line, content, flags=re.MULTILINE)
        print(f"[CookieFetcher] Updated YOUTUBE_COOKIE in {env_path}", file=sys.stderr)
    else:
        content = content.rstrip("\n") + f"\n\n# YouTube Session Cookie (auto-generated)\n{new_line}\n"
        print(f"[CookieFetcher] Added YOUTUBE_COOKIE to {env_path}", file=sys.stderr)
    env_path.write_text(content, encoding="utf-8")


def has_auth_cookies(cookies):
    return bool({c["name"] for c in cookies} & REQUIRED_COOKIE_NAMES)


async def fetch_cookies(headless, session_dir, env_file):
    session_dir.mkdir(parents=True, exist_ok=True)
    print(f"[CookieFetcher] Launching Chromium (headless={headless})...", file=sys.stderr)
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context(
            user_data_dir=str(session_dir),
            headless=headless,
            args=[
                "--no-sandbox",
                "--disable-blink-features=AutomationControlled",
                "--disable-dev-shm-usage",
            ],
            viewport={"width": 1280, "height": 720},
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/126.0.0.0 Safari/537.36"
            ),
            locale="en-US",
        )
        page = ctx.pages[0] if ctx.pages else await ctx.new_page()
        await page.goto(YOUTUBE_URL, wait_until="domcontentloaded", timeout=30000)
        await asyncio.sleep(2)
        cookies = await ctx.cookies(["https://www.youtube.com", "https://accounts.google.com"])

        if not has_auth_cookies(cookies):
            if headless:
                print("[CookieFetcher] No session found in headless mode.", file=sys.stderr)
                print("[CookieFetcher] Run WITHOUT --headless first to log in via browser GUI.", file=sys.stderr)
                await ctx.close()
                sys.exit(2)
            print("[CookieFetcher] No session found. Opening Google Sign-In...", file=sys.stderr)
            print("[CookieFetcher] Please log in via the browser window (up to 3 minutes).", file=sys.stderr)
            await page.goto(YOUTUBE_LOGIN_URL, wait_until="domcontentloaded", timeout=30000)
            logged_in = False
            for i in range(90):  # 90 * 2s = 3 minutes
                await asyncio.sleep(2)
                cookies = await ctx.cookies(["https://www.youtube.com", "https://accounts.google.com"])
                if has_auth_cookies(cookies):
                    print(f"[CookieFetcher] Login detected after {i*2}s!", file=sys.stderr)
                    await page.goto(YOUTUBE_URL, wait_until="domcontentloaded", timeout=20000)
                    await asyncio.sleep(3)
                    logged_in = True
                    break
                if i > 0 and (i * 2) % 15 == 0:
                    print(f"[CookieFetcher] Waiting... {i*2}s / 180s", file=sys.stderr)
            if not logged_in:
                print("[CookieFetcher] Login timeout (3 minutes).", file=sys.stderr)
                await ctx.close()
                sys.exit(1)
        else:
            print("[CookieFetcher] Existing authenticated session detected!", file=sys.stderr)

        all_cookies = await ctx.cookies([
            "https://www.youtube.com",
            "https://accounts.google.com",
            "https://youtube.com",
        ])
        await ctx.close()

    cookie_str = format_cookie_string(all_cookies)
    if not cookie_str:
        print("[CookieFetcher] No cookies collected.", file=sys.stderr)
        sys.exit(1)

    print(f"[CookieFetcher] Collected {len(all_cookies)} cookies ({len(cookie_str)} bytes).", file=sys.stderr)
    update_env_file(env_file, cookie_str)
    return cookie_str


def main():
    parser = argparse.ArgumentParser(description="Fetch YouTube authenticated cookies using Playwright")
    parser.add_argument("--env-file", type=Path, default=DEFAULT_ENV_FILE)
    parser.add_argument("--headless", action="store_true")
    parser.add_argument("--session-dir", type=Path, default=DEFAULT_SESSION_DIR)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    cookie_string = asyncio.run(fetch_cookies(args.headless, args.session_dir, args.env_file))
    if args.json:
        result = {
            "success": True,
            "cookieLength": len(cookie_string),
            "preview": cookie_string[:80] + "..." if len(cookie_string) > 80 else cookie_string,
        }
        print(json.dumps(result))
    else:
        print(cookie_string)


if __name__ == "__main__":
    main()
