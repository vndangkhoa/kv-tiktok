from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig, CacheMode, LLMConfig
from crawl4ai.extraction_strategy import LLMExtractionStrategy
from pydantic import BaseModel, Field
import os
import json
import asyncio
from typing import List, Optional
import yt_dlp
from cachetools import TTLCache
import time

class VideoSchema(BaseModel):
    url: str = Field(..., description="The URL to the video content")
    description: str = Field(..., description="The video caption/description")
    author: str = Field(..., description="The username of the creator")

class FeedService:
    # Class-level TTL cache for feed results (60 second expiry, max 10 entries)
    _feed_cache: TTLCache = TTLCache(maxsize=10, ttl=60)
    _browser_warmed_up: bool = False
    _persistent_session_id: str = "tiktok_feed_session"

    def __init__(self):
        self.api_key = os.getenv("OPENAI_API_KEY")

    async def warmup(self):
        """Pre-warm the browser session on startup for faster first request."""
        if FeedService._browser_warmed_up:
            return
        
        print("DEBUG: Warming up browser session...")
        try:
            browser_config = BrowserConfig(headless=True, java_script_enabled=True)
            run_config = CrawlerRunConfig(
                cache_mode=CacheMode.BYPASS,
                session_id=FeedService._persistent_session_id,
                wait_until="domcontentloaded"
            )
            async with AsyncWebCrawler(config=browser_config) as crawler:
                await crawler.arun(url="https://www.tiktok.com", config=run_config)
            FeedService._browser_warmed_up = True
            print("DEBUG: Browser session warmed up successfully!")
        except Exception as e:
            print(f"DEBUG: Warmup failed (non-critical): {e}")

    async def _resolve_video_url(self, url: str) -> Optional[str]:
        """Resolve direct media URL using yt-dlp."""
        cookie_header = ""
        user_agent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36"
        
        if os.path.exists("cookies.json"):
            try:
                with open("cookies.json", 'r') as f:
                    cookies_dict = json.load(f)
                    cookie_header = "; ".join([f"{k}={v}" for k, v in cookies_dict.items()])
            except Exception as e:
                print(f"Error preparing cookies for yt-dlp: {e}")

        if os.path.exists("session_metadata.json"):
            try:
                with open("session_metadata.json", "r") as f:
                    meta = json.load(f)
                    user_agent = meta.get("user_agent", user_agent)
            except:
                pass

        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'format': 'best',
            'http_headers': {
                'Cookie': cookie_header,
                'User-Agent': user_agent
            } if cookie_header else None,
            'socket_timeout': 10,
        }
        
        try:
            loop = asyncio.get_event_loop()
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = await loop.run_in_executor(None, lambda: ydl.extract_info(url, download=False))
                return info.get('url')
        except Exception as e:
            print(f"Failed to resolve URL {url}: {e}")
            return None

    async def get_feed(self, source_url: str = "https://www.tiktok.com/foryou", skip_cache: bool = False) -> List[dict]:
        # Check cache first (unless skip_cache is True for infinite scroll)
        cache_key = source_url
        if not skip_cache and cache_key in FeedService._feed_cache:
            print(f"DEBUG: Returning cached results for {source_url}")
            return FeedService._feed_cache[cache_key]

        # 1. Load cookies
        crawl_cookies = []
        cookies_path = "cookies.json"
        own_user_id = None  # Track logged-in user's ID to filter out their videos
        
        if os.path.exists(cookies_path):
            try:
                with open(cookies_path, 'r') as f:
                    cookie_dict = json.load(f)
                    # Extract the logged-in user's ID from cookies
                    own_user_id = cookie_dict.get("living_user_id")
                    
                    for k, v in cookie_dict.items():
                        crawl_cookies.append({
                            "name": k, 
                            "value": v, 
                            "domain": ".tiktok.com", 
                            "path": "/"
                        })
                print(f"DEBUG: Loaded {len(crawl_cookies)} cookies. User ID: {own_user_id}")
            except Exception as e:
                print(f"Error loading cookies: {e}")

        # 2. Config Crawler
        default_ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        user_agent = default_ua
        if os.path.exists("session_metadata.json"):
            try:
                with open("session_metadata.json", "r") as f:
                    meta = json.load(f)
                    user_agent = meta.get("user_agent", default_ua)
            except:
                pass

        browser_config = BrowserConfig(
            headless=True,
            java_script_enabled=True,
            cookies=crawl_cookies if crawl_cookies else None,
            headers={
                "User-Agent": user_agent
            }
        )
        
        # Aggressive scrolling to load many videos (12 scrolls = ~30+ videos)
        run_config = CrawlerRunConfig(
            cache_mode=CacheMode.BYPASS,
            session_id=FeedService._persistent_session_id,
            js_code="""
                // Scroll aggressively to load ~30 videos
                for (let i = 0; i < 12; i++) {
                    window.scrollBy(0, 1500);
                    await new Promise(r => setTimeout(r, 800));
                }
            """,
            wait_for="body",
            wait_until="domcontentloaded",
            delay_before_return_html=10.0,
            page_timeout=60000,
            magic=True
        )

        try:
            print(f"DEBUG: Starting crawl for: {source_url}")
            async with AsyncWebCrawler(config=browser_config) as crawler:
                result = await asyncio.wait_for(
                    crawler.arun(url=source_url, config=run_config),
                    timeout=90.0
                )
            
            print(f"DEBUG: Crawl Success: {result.success}")
            if not result.success:
                print(f"DEBUG: Crawl Error: {result.error_message}")
                return []

            # Parse SIGI_STATE from HTML (TikTok's embedded data)
            html = result.html if result.html else ""
            videos = []
            
            # Try to find video links directly from HTML
            import re
            
            # TikTok uses relative URLs like /@username/video/1234567890
            video_pattern = r'/@([a-zA-Z0-9_.]+)/video/(\d+)'
            matches = re.findall(video_pattern, html)
            
            # Dedupe by video ID, skip own videos, and keep first 20
            seen_ids = set()
            unique_videos = []
            skipped_own = 0
            for author, video_id in matches:
                # Skip videos from the logged-in user's account
                if own_user_id and author == own_user_id:
                    skipped_own += 1
                    continue
                    
                if video_id not in seen_ids:
                    seen_ids.add(video_id)
                    unique_videos.append((author, video_id))
                    if len(unique_videos) >= 30:  # Get up to 30 videos per batch
                        break
            
            if skipped_own > 0:
                print(f"DEBUG: Skipped {skipped_own} videos from own account")
            
            print(f"DEBUG: Found {len(unique_videos)} unique videos in HTML")
            print(f"DEBUG: HTML length: {len(html)} characters")

            if unique_videos:
                # Build video objects (author and video_id already extracted)
                for author, video_id in unique_videos:
                    videos.append({
                        "url": f"https://www.tiktok.com/@{author}/video/{video_id}",
                        "author": author,
                        "description": f"Video by @{author}"
                    })
                
                # Resolve direct URLs in parallel
                print(f"DEBUG: Resolving direct URLs for {len(videos)} videos...")
                
                async def resolve_item(item):
                    direct_url = await self._resolve_video_url(item['url'])
                    if direct_url:
                        item['url'] = direct_url
                        return item
                    return None

                resolved_items = await asyncio.gather(*[resolve_item(item) for item in videos])
                final_results = [item for item in resolved_items if item]
                
                # Cache results
                if final_results:
                    FeedService._feed_cache[cache_key] = final_results
                    print(f"DEBUG: Cached {len(final_results)} videos")
                
                return final_results
            else:
                print("DEBUG: No video IDs found in HTML, trying SIGI_STATE...")
                
                # Try parsing SIGI_STATE JSON
                sigi_pattern = r'<script id="SIGI_STATE" type="application/json">(.+?)</script>'
                sigi_match = re.search(sigi_pattern, html, re.DOTALL)
                
                if sigi_match:
                    try:
                        sigi_data = json.loads(sigi_match.group(1))
                        items = sigi_data.get("ItemModule", {})
                        
                        for item_id, item_data in list(items.items())[:10]:
                            author = item_data.get("author", "unknown")
                            desc = item_data.get("desc", "")
                            video_url = f"https://www.tiktok.com/@{author}/video/{item_id}"
                            
                            videos.append({
                                "url": video_url,
                                "author": author,
                                "description": desc or f"Video by @{author}"
                            })
                        
                        if videos:
                            # Resolve URLs
                            async def resolve_item(item):
                                direct_url = await self._resolve_video_url(item['url'])
                                if direct_url:
                                    item['url'] = direct_url
                                    return item
                                return None

                            resolved_items = await asyncio.gather(*[resolve_item(item) for item in videos])
                            final_results = [item for item in resolved_items if item]
                            
                            if final_results:
                                FeedService._feed_cache[cache_key] = final_results
                                print(f"DEBUG: Cached {len(final_results)} videos from SIGI_STATE")
                            
                            return final_results
                    except Exception as e:
                        print(f"DEBUG: Failed to parse SIGI_STATE: {e}")
                
                return []

        except asyncio.TimeoutError:
            print("DEBUG: Crawl timed out after 90s")
            return []
        except Exception as e:
            print(f"DEBUG: Crawl process failed: {e}")
            return []

    async def search_videos(self, query: str) -> List[dict]:
        search_url = f"https://www.tiktok.com/search?q={query}"
        return await self.get_feed(source_url=search_url)

    async def check_cookie_health(self) -> bool:
        """Check if cookies are still valid by hitting a simple endpoint."""
        if not os.path.exists("cookies.json"):
            return False
        
        # In a real scenario, we'd hit https://www.tiktok.com/api/user/detail/ or similar
        # For now, we'll just check if the file exists and is non-empty
        return os.path.getsize("cookies.json") > 0

feed_service = FeedService()
