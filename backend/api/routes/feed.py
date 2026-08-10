"""
Feed API routes with LRU video cache for mobile optimization.
"""

from fastapi import APIRouter, Query, HTTPException, Request
from fastapi.responses import StreamingResponse, FileResponse
from pydantic import BaseModel
from typing import Optional
import httpx
import os
import json
import tempfile
import asyncio
import hashlib
import time
import shutil

from core.playwright_manager import PlaywrightManager

router = APIRouter()

# ========== LRU VIDEO CACHE ==========
CACHE_DIR = os.path.join(tempfile.gettempdir(), "kv_tiktok_cache")
MAX_CACHE_SIZE_MB = 500  # Limit cache to 500MB
MAX_CACHE_FILES = 30     # Keep max 30 videos cached
CACHE_TTL_HOURS = 2      # Videos expire after 2 hours

def init_cache():
    """Initialize cache directory."""
    os.makedirs(CACHE_DIR, exist_ok=True)
    cleanup_old_cache()

def get_cache_key(url: str) -> str:
    """Generate cache key from URL."""
    return hashlib.md5(url.encode()).hexdigest()

def get_cached_path(url: str) -> Optional[str]:
    """Check if video is cached and not expired."""
    cache_key = get_cache_key(url)
    cached_file = os.path.join(CACHE_DIR, f"{cache_key}.mp4")
    
    if os.path.exists(cached_file):
        # Check TTL
        file_age_hours = (time.time() - os.path.getmtime(cached_file)) / 3600
        if file_age_hours < CACHE_TTL_HOURS:
            # Touch file to update LRU
            os.utime(cached_file, None)
            return cached_file
        else:
            # Expired, delete
            os.unlink(cached_file)
    
    return None

def save_to_cache(url: str, source_path: str) -> str:
    """Save video to cache, return cached path."""
    cache_key = get_cache_key(url)
    cached_file = os.path.join(CACHE_DIR, f"{cache_key}.mp4")
    
    # Copy to cache
    shutil.copy2(source_path, cached_file)
    
    # Enforce cache limits
    enforce_cache_limits()
    
    return cached_file

def enforce_cache_limits():
    """Remove old files if cache exceeds limits."""
    if not os.path.exists(CACHE_DIR):
        return
    
    files = []
    total_size = 0
    
    for f in os.listdir(CACHE_DIR):
        fpath = os.path.join(CACHE_DIR, f)
        if os.path.isfile(fpath):
            stat = os.stat(fpath)
            files.append((fpath, stat.st_mtime, stat.st_size))
            total_size += stat.st_size
    
    # Sort by modification time (oldest first)
    files.sort(key=lambda x: x[1])
    
    # Remove oldest until under limits
    max_bytes = MAX_CACHE_SIZE_MB * 1024 * 1024
    
    while (len(files) > MAX_CACHE_FILES or total_size > max_bytes) and files:
        oldest = files.pop(0)
        try:
            os.unlink(oldest[0])
            total_size -= oldest[2]
            print(f"CACHE: Removed {oldest[0]} (LRU)")
        except:
            pass

def cleanup_old_cache():
    """Remove expired files on startup."""
    if not os.path.exists(CACHE_DIR):
        return
    
    now = time.time()
    for f in os.listdir(CACHE_DIR):
        fpath = os.path.join(CACHE_DIR, f)
        if os.path.isfile(fpath):
            age_hours = (now - os.path.getmtime(fpath)) / 3600
            if age_hours > CACHE_TTL_HOURS:
                try:
                    os.unlink(fpath)
                    print(f"CACHE: Expired {f}")
                except:
                    pass

def get_cache_stats() -> dict:
    """Get cache statistics."""
    if not os.path.exists(CACHE_DIR):
        return {"files": 0, "size_mb": 0}
    
    total = 0
    count = 0
    for f in os.listdir(CACHE_DIR):
        fpath = os.path.join(CACHE_DIR, f)
        if os.path.isfile(fpath):
            total += os.path.getsize(fpath)
            count += 1
    
    return {"files": count, "size_mb": round(total / 1024 / 1024, 2)}

# Initialize cache on module load
init_cache()

# ========== API ROUTES ==========

from typing import Optional, Any, Union, List, Dict

class FeedRequest(BaseModel):
    """Request body for feed endpoint with optional JSON credentials."""
    credentials: Optional[Union[Dict, List]] = None


@router.post("")
async def get_feed(request: FeedRequest = None):
    """Get TikTok feed using network interception."""
    cookies = None
    user_agent = None
    
    if request and request.credentials:
        cookies, user_agent = PlaywrightManager.parse_json_credentials(request.credentials)
        print(f"DEBUG: Using provided credentials ({len(cookies)} cookies)")
    
    try:
        videos = await PlaywrightManager.intercept_feed(cookies, user_agent)
        return videos
    except Exception as e:
        print(f"DEBUG: Feed error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("")
async def get_feed_simple(fast: bool = False, skip_cache: bool = False):
    """Simple GET endpoint to fetch feed using stored credentials.
    
    Args:
        fast: If True, only get initial batch (0 scrolls). If False, scroll 5 times.
        skip_cache: If True, always fetch fresh videos (for infinite scroll).
    """
    try:
        # Fast mode = 0 scrolls (just initial batch), Normal = 5 scrolls
        scroll_count = 0 if fast else 5
        
        # When skipping cache for infinite scroll, do more scrolling to get different videos
        if skip_cache:
            scroll_count = 8  # More scrolling to get fresh content
            
        videos = await PlaywrightManager.intercept_feed(scroll_count=scroll_count)
        return videos
    except Exception as e:
        print(f"DEBUG: Feed error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/cache-stats")
async def cache_stats():
    """Get video cache statistics."""
    return get_cache_stats()


@router.delete("/cache")
async def clear_cache():
    """Clear video cache."""
    if os.path.exists(CACHE_DIR):
        shutil.rmtree(CACHE_DIR, ignore_errors=True)
    os.makedirs(CACHE_DIR, exist_ok=True)
    return {"status": "cleared"}


@router.get("/proxy")
async def proxy_video(
    url: str = Query(..., description="The TikTok video URL to proxy"),
    download: bool = Query(False, description="Force download with attachment header")
):
    """
    Proxy video with LRU caching for mobile optimization.
    OPTIMIZED: No server-side transcoding - client handles decoding.
    This reduces server CPU to ~0% during video playback.
    """
    import yt_dlp
    import re
    
    # Check cache first
    cached_path = get_cached_path(url)
    if cached_path:
        print(f"CACHE HIT: {url[:50]}...")
        
        response_headers = {
            "Accept-Ranges": "bytes",
            "Cache-Control": "public, max-age=3600",
        }
        if download:
            video_id_match = re.search(r'/video/(\d+)', url)
            video_id = video_id_match.group(1) if video_id_match else "tiktok_video"
            response_headers["Content-Disposition"] = f'attachment; filename="{video_id}.mp4"'
        
        return FileResponse(
            cached_path,
            media_type="video/mp4",
            headers=response_headers
        )
    
    print(f"CACHE MISS: {url[:50]}... (downloading)")
    
    # Load stored credentials
    cookies, user_agent = PlaywrightManager.load_stored_credentials()
    
    # Create temp file for download
    temp_dir = tempfile.mkdtemp()
    output_template = os.path.join(temp_dir, "video.%(ext)s")
    
    # Create cookies file for yt-dlp
    cookie_file_path = None
    if cookies:
        cookie_file = tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False)
        cookie_file.write("# Netscape HTTP Cookie File\n")
        for c in cookies:
            cookie_file.write(f".tiktok.com\tTRUE\t/\tFALSE\t0\t{c['name']}\t{c['value']}\n")
        cookie_file.close()
        cookie_file_path = cookie_file.name
    
    # Download best quality with H.264 video codec (browser compatible)
    ydl_opts = {
        'format': 'bestvideo[vcodec^=avc1][ext=mp4]+bestaudio[ext=m4a]/bestvideo[vcodec^=avc][ext=mp4]+bestaudio/best[ext=mp4][vcodec^=avc]/bestvideo[ext=mp4]+bestaudio/best',
        'outtmpl': output_template,
        'quiet': True,
        'no_warnings': True,
        'retries': 5,
        'fragment_retries': 5,
        'http_headers': {
            'User-Agent': user_agent,
            'Referer': 'https://www.tiktok.com/'
        }
    }
    
    if cookie_file_path:
        ydl_opts['cookiefile'] = cookie_file_path
    
    video_path = None
    video_codec = "unknown"
    
    try:
        loop = asyncio.get_event_loop()
        
        def download_video():
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=True)
                ext = info.get('ext', 'mp4')
                vcodec = info.get('vcodec', 'unknown') or 'unknown'
                return os.path.join(temp_dir, f"video.{ext}"), vcodec
        
        video_path, video_codec = await loop.run_in_executor(None, download_video)
        
        if not os.path.exists(video_path):
            raise Exception("Video file not created")
        
        print(f"Downloaded codec: {video_codec}")
        
        # Save to cache directly - client-side player handles all formats
        cached_path = save_to_cache(url, video_path)
        stats = get_cache_stats()
        print(f"CACHED: {url[:50]}... ({stats['files']} files, {stats['size_mb']}MB total)")
        
    except Exception as e:
        print(f"DEBUG: yt-dlp download failed: {e}")
        # Cleanup
        if cookie_file_path and os.path.exists(cookie_file_path):
            os.unlink(cookie_file_path)
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=f"Could not download video: {e}")
    
    # Cleanup temp (cached file is separate)
    if cookie_file_path and os.path.exists(cookie_file_path):
        os.unlink(cookie_file_path)
    shutil.rmtree(temp_dir, ignore_errors=True)
    
    # Return from cache with codec info header
    response_headers = {
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=3600",
        "X-Video-Codec": video_codec,  # Let client know the codec
    }
    if download:
        video_id_match = re.search(r'/video/(\d+)', url)
        video_id = video_id_match.group(1) if video_id_match else "tiktok_video"
        response_headers["Content-Disposition"] = f'attachment; filename="{video_id}.mp4"'
    
    return FileResponse(
        cached_path,
        media_type="video/mp4",
        headers=response_headers
    )



@router.get("/thin-proxy")
async def thin_proxy_video(
    request: Request,
    cdn_url: str = Query(..., description="Direct TikTok CDN URL")
):
    """
    Thin proxy - forwards CDN requests with proper headers.
    For video playback, always returns full content on first request.
    """

    cookies, user_agent = PlaywrightManager.load_stored_credentials()

    headers = {
        "User-Agent": user_agent or PlaywrightManager.DEFAULT_USER_AGENT,
        "Referer": "https://www.tiktok.com/",
        "Accept": "*/*",
        "Accept-Language": "en-US,en;q=0.9",
        "Origin": "https://www.tiktok.com",
        "Range": "bytes=0-",  # Request full file
    }

    if cookies:
        cookie_str = "; ".join([f"{c['name']}={c['value']}" for c in cookies])
        headers["Cookie"] = cookie_str

    try:
        client = httpx.AsyncClient(timeout=120.0, follow_redirects=True)
        req = client.build_request("GET", cdn_url, headers=headers)
        r = await client.send(req, stream=True)

        content_type = r.headers.get("Content-Type", "video/mp4")
        content_length = r.headers.get("Content-Length")
        content_range = r.headers.get("Content-Range")
        status_code = r.status_code

        async def stream_from_cdn():
            try:
                async for chunk in r.aiter_bytes(chunk_size=128 * 1024):
                    yield chunk
            finally:
                await r.aclose()
                await client.aclose()

        response_headers = {
            "Accept-Ranges": "bytes",
            "Cache-Control": "public, max-age=3600",
            "Content-Type": content_type,
        }

        if content_length:
            response_headers["Content-Length"] = content_length
        if content_range:
            response_headers["Content-Range"] = content_range

        return StreamingResponse(
            stream_from_cdn(),
            status_code=status_code,
            media_type="video/mp4",
            headers=response_headers
        )

    except Exception as e:
        print(f"Thin proxy error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
