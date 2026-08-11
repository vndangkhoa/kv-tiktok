import yt_dlp
import os
import asyncio
import httpx
import tempfile
import shutil
from core.playwright_manager import PlaywrightManager

class DownloadService:
    def __init__(self):
        self.download_dir = "downloads"
        if not os.path.exists(self.download_dir):
            os.makedirs(self.download_dir)

    async def download_video(self, url: str, cdn_url: str = None) -> dict:
        """
        Download video and return metadata/file path.

        Prefers the direct TikTok CDN URL (playable MP4, no WAF issues).
        Falls back to yt-dlp with stored cookies + TLS impersonation.
        """
        cookies, user_agent = PlaywrightManager.load_stored_credentials()

        if cdn_url:
            try:
                return await self._download_from_cdn(url, cdn_url, cookies, user_agent)
            except Exception as e:
                print(f"CDN download failed, falling back to yt-dlp: {e}")

        return await self._download_with_ytdlp(url, cookies, user_agent)

    async def _download_from_cdn(self, url: str, cdn_url: str, cookies: list, user_agent: str) -> dict:
        headers = {
            "User-Agent": user_agent or PlaywrightManager.DEFAULT_USER_AGENT,
            "Referer": "https://www.tiktok.com/",
            "Accept": "*/*",
            "Accept-Language": "en-US,en;q=0.9",
            "Origin": "https://www.tiktok.com",
        }
        if cookies:
            cookie_str = "; ".join([f"{c['name']}={c['value']}" for c in cookies])
            headers["Cookie"] = cookie_str

        client = httpx.AsyncClient(timeout=120.0, follow_redirects=True)
        try:
            req = client.build_request("GET", cdn_url, headers=headers)
            r = await client.send(req, stream=True)
            r.raise_for_status()
            content_type = r.headers.get("Content-Type", "")
            if "json" in content_type:
                raise Exception(f"CDN returned non-video content type: {content_type}")

            ext = "mp4"
            video_id = url.rstrip("/").split("/")[-1]
            if not video_id.isdigit():
                import re
                m = re.search(r'/video/(\d+)', url)
                video_id = m.group(1) if m else video_id
            filename = os.path.join(self.download_dir, f"{video_id}.{ext}")

            with open(filename, "wb") as f:
                async for chunk in r.aiter_bytes(chunk_size=128 * 1024):
                    f.write(chunk)
        finally:
            await client.aclose()

        if not os.path.exists(filename) or os.path.getsize(filename) == 0:
            raise Exception("Download produced an empty file")

        return {
            "status": "success",
            "filename": filename,
            "title": video_id,
            "id": video_id,
        }

    async def _download_with_ytdlp(self, url: str, cookies: list, user_agent: str) -> dict:
        ydl_opts = {
            'format': 'best',
            'outtmpl': f'{self.download_dir}/%(id)s.%(ext)s',
            'noplaylist': True,
            'quiet': True,
            'http_headers': {
                'User-Agent': user_agent,
                'Referer': 'https://www.tiktok.com/'
            },
        }

        cookie_file_path = None
        if cookies:
            cookie_file = tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False)
            cookie_file.write("# Netscape HTTP Cookie File\n")
            for c in cookies:
                cookie_file.write(f".tiktok.com\tTRUE\t/\tFALSE\t0\t{c['name']}\t{c['value']}\n")
            cookie_file.close()
            cookie_file_path = cookie_file.name
            ydl_opts['cookiefile'] = cookie_file_path

        try:
            from yt_dlp.networking.impersonate import ImpersonateTarget
            ydl_opts['impersonate'] = ImpersonateTarget(client='safari', version=None)
        except Exception:
            pass

        loop = asyncio.get_event_loop()
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = await loop.run_in_executor(None, lambda: ydl.extract_info(url, download=True))
                filename = ydl.prepare_filename(info)
                return {
                    "status": "success",
                    "filename": filename,
                    "title": info.get('title'),
                    "id": info.get('id')
                }
        except Exception as e:
            return {"status": "error", "message": str(e)}
        finally:
            if cookie_file_path and os.path.exists(cookie_file_path):
                os.unlink(cookie_file_path)

download_service = DownloadService()
