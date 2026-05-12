"""
TikTok Direct API Service - Fast API calls without browser automation.

Replaces Playwright crawling with direct HTTP requests to TikTok's internal APIs.
Expected performance: ~100-500ms vs 5-15 seconds with Playwright.
"""

import httpx
import asyncio
from typing import List, Optional, Dict, Any
from urllib.parse import quote

from core.playwright_manager import PlaywrightManager


class TikTokAPIService:
    """
    Direct TikTok API calls for instant data retrieval.
    
    Key endpoints used:
    - /api/user/detail/?uniqueId={username} - Get user profile and secUid
    - /api/post/item_list/?secUid={secUid}&count={count} - Get user's videos
    - /api/search/general/full/?keyword={query} - Search videos
    """
    
    BASE_URL = "https://www.tiktok.com"
    DEFAULT_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    
    @staticmethod
    def _build_headers(cookies: List[dict], user_agent: str = None) -> dict:
        """Build request headers with cookies and user agent."""
        cookie_str = "; ".join([f"{c['name']}={c['value']}" for c in cookies])
        
        return {
            "User-Agent": user_agent or TikTokAPIService.DEFAULT_USER_AGENT,
            "Referer": "https://www.tiktok.com/",
            "Cookie": cookie_str,
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "en-US,en;q=0.9",
            "sec-ch-ua": '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": '"Windows"',
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "same-origin",
        }
    
    @staticmethod
    def _extract_video_data(item: dict) -> Optional[dict]:
        """
        Extract video data from TikTok API response item.
        Matches the format used by PlaywrightManager._extract_video_data().
        """
        try:
            if not isinstance(item, dict):
                return None
            
            video_id = item.get("id") or item.get("aweme_id")
            
            # Get author info
            author_data = item.get("author", {})
            author = author_data.get("uniqueId") or author_data.get("unique_id") or "unknown"
            
            # Get description
            desc = item.get("desc") or item.get("description") or ""
            
            # Check if this is a product/shop video
            is_shop_video = bool(item.get("products") or item.get("commerce_info") or item.get("poi_info"))
            
            # Get thumbnail/cover image
            thumbnail = None
            video_data = item.get("video", {})
            
            thumbnail_sources = [
                video_data.get("cover"),
                video_data.get("dynamicCover"),
                video_data.get("originCover"),
            ]
            for src in thumbnail_sources:
                if src:
                    thumbnail = src
                    break
            
            # Get direct CDN URL
            cdn_url = None
            cdn_sources = [
                video_data.get("playAddr"),
                video_data.get("downloadAddr"),
            ]
            for src in cdn_sources:
                if src:
                    cdn_url = src
                    break
            
            # Video page URL
            video_url = f"https://www.tiktok.com/@{author}/video/{video_id}"
            
            # Get stats
            stats = item.get("stats", {}) or item.get("statistics", {})
            views = stats.get("playCount") or stats.get("play_count") or 0
            likes = stats.get("diggCount") or stats.get("digg_count") or 0
            comments = stats.get("commentCount") or stats.get("comment_count") or 0
            shares = stats.get("shareCount") or stats.get("share_count") or 0
            
            if video_id and author:
                result = {
                    "id": str(video_id),
                    "url": video_url,
                    "author": author,
                    "description": desc[:200] if desc else f"Video by @{author}"
                }
                if thumbnail:
                    result["thumbnail"] = thumbnail
                if cdn_url:
                    result["cdn_url"] = cdn_url
                if views:
                    result["views"] = views
                if likes:
                    result["likes"] = likes
                if comments:
                    result["comments"] = comments
                if shares:
                    result["shares"] = shares
                if is_shop_video:
                    result["has_product"] = True
                return result
                
        except Exception as e:
            print(f"DEBUG: Error extracting video data: {e}")
        
        return None
    
    @staticmethod
    async def get_user_sec_uid(username: str, cookies: List[dict], user_agent: str = None) -> Optional[str]:
        """
        Get user's secUid from their profile.
        secUid is required for the video list API.
        """
        headers = TikTokAPIService._build_headers(cookies, user_agent)
        profile_url = f"{TikTokAPIService.BASE_URL}/api/user/detail/?uniqueId={username}"
        
        try:
            async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
                response = await client.get(profile_url, headers=headers)
                
                if response.status_code != 200:
                    print(f"DEBUG: Failed to get user profile, status: {response.status_code}")
                    return None
                
                data = response.json()
                user_info = data.get("userInfo", {})
                user = user_info.get("user", {})
                sec_uid = user.get("secUid")
                
                if sec_uid:
                    print(f"DEBUG: Got secUid for @{username}: {sec_uid[:20]}...")
                    return sec_uid
                    
        except Exception as e:
            print(f"DEBUG: Error getting secUid for {username}: {e}")
        
        return None
    
    @staticmethod
    async def get_user_videos(
        username: str, 
        cookies: List[dict], 
        user_agent: str = None, 
        limit: int = 20,
        cursor: int = 0
    ) -> List[dict]:
        """
        Fetch videos from a user's profile using direct API call.
        
        Args:
            username: TikTok username (without @)
            cookies: Auth cookies list
            user_agent: Browser user agent
            limit: Max videos to return
            cursor: Pagination cursor for more videos
            
        Returns:
            List of video dictionaries
        """
        print(f"DEBUG: [API] Fetching videos for @{username} (limit={limit})...")
        
        # Step 1: Get secUid
        sec_uid = await TikTokAPIService.get_user_sec_uid(username, cookies, user_agent)
        
        if not sec_uid:
            print(f"DEBUG: [API] Could not get secUid for @{username}")
            return []
        
        # Step 2: Fetch video list
        headers = TikTokAPIService._build_headers(cookies, user_agent)
        
        # Build video list API URL
        video_list_url = (
            f"{TikTokAPIService.BASE_URL}/api/post/item_list/?"
            f"secUid={quote(sec_uid)}&"
            f"count={min(limit, 35)}&"  # TikTok max per request is ~35
            f"cursor={cursor}"
        )
        
        try:
            async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
                response = await client.get(video_list_url, headers=headers)
                
                if response.status_code != 200:
                    print(f"DEBUG: [API] Video list failed, status: {response.status_code}")
                    return []
                
                data = response.json()
                
                # Extract videos from response
                items = data.get("itemList", []) or data.get("aweme_list", [])
                
                videos = []
                for item in items[:limit]:
                    video_data = TikTokAPIService._extract_video_data(item)
                    if video_data:
                        videos.append(video_data)
                
                print(f"DEBUG: [API] Successfully fetched {len(videos)} videos for @{username}")
                return videos
                
        except Exception as e:
            print(f"DEBUG: [API] Error fetching videos for {username}: {e}")
            return []
    
    @staticmethod
    async def search_videos(
        query: str,
        cookies: List[dict],
        user_agent: str = None,
        limit: int = 20,
        cursor: int = 0
    ) -> List[dict]:
        """
        Search for videos using direct API call.
        
        Args:
            query: Search keyword or hashtag
            cookies: Auth cookies list
            user_agent: Browser user agent
            limit: Max videos to return
            cursor: Pagination offset
            
        Returns:
            List of video dictionaries
        """
        print(f"DEBUG: [API] Searching for '{query}' (limit={limit}, cursor={cursor})...")
        
        headers = TikTokAPIService._build_headers(cookies, user_agent)
        
        # Build search API URL
        # TikTok uses different search endpoints, try the main one
        search_url = (
            f"{TikTokAPIService.BASE_URL}/api/search/general/full/?"
            f"keyword={quote(query)}&"
            f"offset={cursor}&"
            f"search_source=normal_search&"
            f"is_filter_search=0&"
            f"web_search_code=%7B%22tiktok%22%3A%7B%22client_params_x%22%3A%7B%22search_engine%22%3A%7B%22ies_mt_user_live_video_card_use_498%22%3A1%7D%7D%7D%7D"
        )
        
        try:
            async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
                response = await client.get(search_url, headers=headers)
                
                if response.status_code != 200:
                    print(f"DEBUG: [API] Search failed, status: {response.status_code}")
                    # Try alternative search endpoint
                    return await TikTokAPIService._search_videos_alt(query, cookies, user_agent, limit, cursor)
                
                data = response.json()
                
                # Search results structure
                videos = []
                
                # Try different response formats
                item_list = data.get("data", [])
                if not item_list:
                    item_list = data.get("itemList", [])
                if not item_list:
                    item_list = data.get("item_list", [])
                
                for item in item_list[:limit]:
                    # Search results may have nested structure
                    video_item = item.get("item", item)
                    video_data = TikTokAPIService._extract_video_data(video_item)
                    if video_data:
                        videos.append(video_data)
                
                if videos:
                    print(f"DEBUG: [API] Successfully found {len(videos)} videos for '{query}'")
                    return videos
                else:
                    # Fallback to alternative endpoint
                    return await TikTokAPIService._search_videos_alt(query, cookies, user_agent, limit, cursor)
                
        except Exception as e:
            print(f"DEBUG: [API] Error searching for {query}: {e}")
            return await TikTokAPIService._search_videos_alt(query, cookies, user_agent, limit, cursor)
    
    @staticmethod
    async def _search_videos_alt(
        query: str,
        cookies: List[dict],
        user_agent: str = None,
        limit: int = 20,
        cursor: int = 0
    ) -> List[dict]:
        """
        Alternative search using video-specific endpoint.
        """
        print(f"DEBUG: [API] Trying alternative search endpoint...")
        
        headers = TikTokAPIService._build_headers(cookies, user_agent)
        
        # Try video-specific search endpoint
        search_url = (
            f"{TikTokAPIService.BASE_URL}/api/search/item/full/?"
            f"keyword={quote(query)}&"
            f"offset={cursor}&"
            f"count={min(limit, 30)}"
        )
        
        try:
            async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
                response = await client.get(search_url, headers=headers)
                
                if response.status_code != 200:
                    print(f"DEBUG: [API] Alt search also failed, status: {response.status_code}")
                    return []
                
                data = response.json()
                
                videos = []
                item_list = data.get("itemList", []) or data.get("item_list", []) or data.get("data", [])
                
                for item in item_list[:limit]:
                    video_data = TikTokAPIService._extract_video_data(item)
                    if video_data:
                        videos.append(video_data)
                
                print(f"DEBUG: [API] Alt search found {len(videos)} videos")
                return videos
                
        except Exception as e:
            print(f"DEBUG: [API] Alt search error: {e}")
            return []


# Singleton instance
tiktok_api = TikTokAPIService()
