"""
PlaywrightManager - Core class for TikTok network interception.

Uses Playwright to:
1. Parse cookies from JSON format
2. Handle browser-based SSL login
3. Intercept /item_list API responses (instead of scraping HTML)
"""

import os
import json
import asyncio
import traceback
from typing import List, Dict, Optional, Any
from playwright.async_api import async_playwright, Response, Browser, BrowserContext

try:
    from playwright_stealth import stealth_async
except ImportError:
    try:
        from playwright_stealth import Stealth
        async def stealth_async(page):
            await Stealth().apply_stealth_async(page)
    except ImportError:
        print("WARNING: playwright_stealth not found, disabling stealth mode.")
        async def stealth_async(page):
            pass


COOKIES_FILE = "cookies.json"
USER_AGENT_FILE = "user_agent.json"


class PlaywrightManager:
    """Manages Playwright browser for TikTok feed interception."""
    
    # Anti-detection browser args
    BROWSER_ARGS = [
        "--disable-blink-features=AutomationControlled",
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        "--disable-gpu",
        "--kiosk",  # Force full screen mode
        "--start-maximized"
    ]
    
    DEFAULT_USER_AGENT = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
    
    # Use installed Chrome instead of Playwright's Chromium (avoids slow download)
    import platform
    import os
    
    # Check if running on macOS
    if platform.system() == "Darwin" and os.path.exists("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"):
        CHROME_PATH = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    else:
        # On Linux/Docker, use Playwright's bundled Chromium (None lets Playwright decide)
        CHROME_PATH = None
    
    # VNC login state (class-level to persist across requests)
    _vnc_playwright = None
    _vnc_browser = None
    _vnc_context = None
    _vnc_page = None
    _vnc_active = False

    @staticmethod
    def parse_json_credentials(json_creds: Any) -> tuple[List[dict], str]:
        """
        Parse JSON credentials. Supports:
        1. Array format: [{"name": "...", "value": "..."}, ...]
        2. http object format: {"http": {"headers": {...}, "cookies": {...}}}
        
        Returns: (cookies_list, user_agent)
        """
        cookies = []
        user_agent = PlaywrightManager.DEFAULT_USER_AGENT
        
        # Handle array format (Cookie-Editor)
        if isinstance(json_creds, list):
            for c in json_creds:
                if isinstance(c, dict) and "name" in c and "value" in c:
                    cookie = {
                        "name": c["name"],
                        "value": str(c["value"]),
                        "domain": c.get("domain") or ".tiktok.com",
                        "path": c.get("path") or "/",
                        "secure": c.get("secure", True),
                        "httpOnly": c.get("httpOnly", False)
                    }
                    if "sameSite" in c and c["sameSite"]:
                        # Playwright expects "Strict", "Lax", or "None"
                        ss = str(c["sameSite"]).capitalize()
                        if ss in ["Strict", "Lax", "None"]:
                            cookie["sameSite"] = ss
                    
                    cookies.append(cookie)
            return cookies, user_agent

        # Handle object format
        if isinstance(json_creds, dict):
            http_data = json_creds.get("http", {})
            headers = http_data.get("headers", {})
            cookies_dict = http_data.get("cookies", {})
            
            # Get User-Agent from headers
            if "User-Agent" in headers:
                user_agent = headers["User-Agent"]
            
            # Parse cookies from the cookies dict (preferred)
            if cookies_dict:
                for name, value in cookies_dict.items():
                    cookies.append({
                        "name": name,
                        "value": str(value),
                        "domain": ".tiktok.com",
                        "path": "/"
                    })
            # Fallback: parse from Cookie header string
            elif "Cookie" in headers:
                cookie_str = headers["Cookie"]
                for part in cookie_str.split(";"):
                    part = part.strip()
                    if "=" in part:
                        name, value = part.split("=", 1)
                        cookies.append({
                            "name": name.strip(),
                            "value": value.strip(),
                            "domain": ".tiktok.com",
                            "path": "/"
                        })
        
        return cookies, user_agent

    @staticmethod
    def load_stored_credentials() -> tuple[List[dict], str]:
        """Load cookies and user agent from stored files."""
        cookies = []
        user_agent = PlaywrightManager.DEFAULT_USER_AGENT
        
        if os.path.exists(COOKIES_FILE):
            try:
                with open(COOKIES_FILE, "r") as f:
                    data = json.load(f)
                    if isinstance(data, list):
                        # Sanitize each cookie for Playwright compatibility
                        for c in data:
                            if isinstance(c, dict) and "name" in c and "value" in c:
                                cookie = {
                                    "name": c["name"],
                                    "value": str(c["value"]),
                                    "domain": c.get("domain") or ".tiktok.com",
                                    "path": c.get("path") or "/",
                                }
                                # Only add optional fields if they have valid values
                                if c.get("secure") is not None:
                                    cookie["secure"] = bool(c["secure"])
                                if c.get("httpOnly") is not None:
                                    cookie["httpOnly"] = bool(c["httpOnly"])
                                # Sanitize sameSite - Playwright only accepts Strict|Lax|None
                                if c.get("sameSite"):
                                    ss = str(c["sameSite"]).capitalize()
                                    if ss in ["Strict", "Lax", "None"]:
                                        cookie["sameSite"] = ss
                                    # If invalid, just omit it
                                cookies.append(cookie)
                    elif isinstance(data, dict):
                        # Backward compatibility or simple dict format
                        for name, value in data.items():
                            cookies.append({
                                "name": name,
                                "value": str(value),
                                "domain": ".tiktok.com",
                                "path": "/"
                            })
            except Exception as e:
                print(f"Error loading cookies: {e}")
        
        if os.path.exists(USER_AGENT_FILE):
            try:
                with open(USER_AGENT_FILE, "r") as f:
                    data = json.load(f)
                    user_agent = data.get("user_agent", user_agent)
            except:
                pass
        
        return cookies, user_agent

    @staticmethod
    def save_credentials(cookies: List[dict] | dict, user_agent: str = None):
        """Save cookies and user agent to files."""
        with open(COOKIES_FILE, "w") as f:
            json.dump(cookies, f, indent=2)
        
        if user_agent:
            with open(USER_AGENT_FILE, "w") as f:
                json.dump({"user_agent": user_agent}, f)

    @classmethod
    async def start_vnc_login(cls) -> dict:
        """
        Start a visible browser for VNC login.
        The browser displays on DISPLAY=:99 which is streamed via noVNC.
        Returns immediately - browser stays open for user interaction.
        """
        # Close any existing VNC session
        if cls._vnc_active:
            await cls.stop_vnc_login()
        
        print("DEBUG: Starting VNC login browser...")
        
        try:
            cls._vnc_playwright = await async_playwright().start()
            cls._vnc_browser = await cls._vnc_playwright.chromium.launch(
                headless=False,  # Visible browser
                args=cls.BROWSER_ARGS
            )
            
            cls._vnc_context = await cls._vnc_browser.new_context(
                user_agent=cls.DEFAULT_USER_AGENT,
                viewport={"width": 1920, "height": 1000}
            )
            
            cls._vnc_page = await cls._vnc_context.new_page()
            await stealth_async(cls._vnc_page)
            await cls._vnc_page.goto("https://www.tiktok.com/login", wait_until="domcontentloaded")
            
            cls._vnc_active = True
            print("DEBUG: VNC browser opened with TikTok login page")
            
            return {
                "status": "started",
                "message": "Browser opened. Please login via the VNC stream."
            }
            
        except Exception as e:
            print(f"DEBUG: VNC login start error: {e}")
            cls._vnc_active = False
            return {
                "status": "error",
                "message": f"Failed to start browser: {str(e)}"
            }

    @classmethod
    async def check_vnc_login(cls) -> dict:
        """
        Check if user has logged in by looking for sessionid cookie.
        Called by frontend via polling.
        """
        if not cls._vnc_active or not cls._vnc_context:
            return {"status": "not_active", "logged_in": False}
        
        try:
            all_cookies = await cls._vnc_context.cookies()
            cookies_found = {}
            
            for cookie in all_cookies:
                if cookie.get("domain", "").endswith("tiktok.com"):
                    cookies_found[cookie["name"]] = cookie["value"]
            
            if "sessionid" in cookies_found:
                # Save cookies and close browser
                cls.save_credentials(cookies_found, cls.DEFAULT_USER_AGENT)
                await cls.stop_vnc_login()
                
                return {
                    "status": "success",
                    "logged_in": True,
                    "message": "Login successful!",
                    "cookie_count": len(cookies_found)
                }
            
            return {"status": "waiting", "logged_in": False}
            
        except Exception as e:
            print(f"DEBUG: VNC check error: {e}")
            return {"status": "error", "logged_in": False, "message": str(e)}

    @classmethod
    async def stop_vnc_login(cls) -> dict:
        """Close the VNC browser session."""
        print("DEBUG: Stopping VNC login browser...")
        
        try:
            if cls._vnc_browser:
                await cls._vnc_browser.close()
            if cls._vnc_playwright:
                await cls._vnc_playwright.stop()
        except Exception as e:
            print(f"DEBUG: Error closing VNC browser: {e}")
        
        cls._vnc_browser = None
        cls._vnc_context = None
        cls._vnc_page = None
        cls._vnc_playwright = None
        cls._vnc_active = False
        
        return {"status": "stopped"}

    @staticmethod
    async def credential_login(username: str, password: str, timeout_seconds: int = 60) -> dict:
        """
        Headless login using username/password.
        Works on Docker/NAS deployments without a display.
        
        Args:
            username: TikTok username, email, or phone
            password: TikTok password
            timeout_seconds: Max time to wait for login
            
        Returns: {"status": "success/error", "message": "...", "cookie_count": N}
        """
        print(f"DEBUG: Starting headless credential login for: {username}")
        
        async with async_playwright() as p:
            browser = await p.chromium.launch(
                headless=True,
                args=PlaywrightManager.BROWSER_ARGS
            )
            
            context = await browser.new_context(
                user_agent=PlaywrightManager.DEFAULT_USER_AGENT
            )
            
            page = await context.new_page()
            await stealth_async(page)
            
            try:
                # Navigate to TikTok login page
                await page.goto("https://www.tiktok.com/login/phone-or-email/email", wait_until="domcontentloaded")
                await asyncio.sleep(2)
                
                print("DEBUG: Looking for login form...")
                
                # Wait for and fill username/email field
                username_selector = 'input[name="username"], input[placeholder*="Email"], input[placeholder*="email"], input[type="text"]'
                await page.wait_for_selector(username_selector, timeout=10000)
                await page.fill(username_selector, username)
                await asyncio.sleep(0.5)
                
                # Fill password field
                password_selector = 'input[type="password"]'
                await page.wait_for_selector(password_selector, timeout=5000)
                await page.fill(password_selector, password)
                await asyncio.sleep(0.5)
                
                print("DEBUG: Credentials filled, clicking login...")
                
                # Click login button
                login_button = 'button[type="submit"], button[data-e2e="login-button"]'
                await page.click(login_button)
                
                # Wait for login to complete - poll for sessionid cookie
                print("DEBUG: Waiting for login to complete...")
                elapsed = 0
                check_interval = 2
                cookies_found = {}
                
                while elapsed < timeout_seconds:
                    await asyncio.sleep(check_interval)
                    elapsed += check_interval
                    
                    # Check for error messages
                    error_el = await page.query_selector('[class*="error"], [class*="Error"]')
                    if error_el:
                        error_text = await error_el.inner_text()
                        if error_text and len(error_text) > 0:
                            await browser.close()
                            return {
                                "status": "error",
                                "message": f"Login failed: {error_text[:100]}",
                                "cookie_count": 0
                            }
                    
                    # Check cookies
                    all_cookies = await context.cookies()
                    for cookie in all_cookies:
                        if cookie.get("domain", "").endswith("tiktok.com"):
                            cookies_found[cookie["name"]] = cookie["value"]
                    
                    if "sessionid" in cookies_found:
                        print(f"DEBUG: Login successful! Found {len(cookies_found)} cookies.")
                        break
                    
                    # Check if CAPTCHA or verification needed
                    captcha = await page.query_selector('[class*="captcha"], [class*="Captcha"], [class*="verify"]')
                    if captcha:
                        await browser.close()
                        return {
                            "status": "error",
                            "message": "TikTok requires verification (CAPTCHA). Please try the cookie method.",
                            "cookie_count": 0
                        }
                    
                    print(f"DEBUG: Waiting for login... ({elapsed}s)")
                
                await browser.close()
                
                if "sessionid" not in cookies_found:
                    return {
                        "status": "error",
                        "message": "Login timed out. Check your credentials or try the cookie method.",
                        "cookie_count": 0
                    }
                
                # Save credentials
                PlaywrightManager.save_credentials(cookies_found, PlaywrightManager.DEFAULT_USER_AGENT)
                
                return {
                    "status": "success",
                    "message": "Successfully logged in!",
                    "cookie_count": len(cookies_found)
                }
                
            except Exception as e:
                await browser.close()
                print(f"DEBUG: Login error: {e}")
                return {
                    "status": "error",
                    "message": f"Login failed: {str(e)[:100]}",
                    "cookie_count": 0
                }

    @staticmethod
    async def browser_login(timeout_seconds: int = 180) -> dict:
        """
        Open visible browser for user to login via TikTok's SSL login.
        Waits for sessionid cookie to be set.
        
        Returns: {"status": "success/timeout", "cookies": {...}, "cookie_count": N}
        """
        print("DEBUG: Opening browser for TikTok login...")
        
        async with async_playwright() as p:
            browser = await p.chromium.launch(
                headless=False,
                args=PlaywrightManager.BROWSER_ARGS
            )
            
            context = await browser.new_context(
                user_agent=PlaywrightManager.DEFAULT_USER_AGENT
            )
            
            page = await context.new_page()
            await stealth_async(page)
            
            # Navigate to TikTok login
            await page.goto("https://www.tiktok.com/login", wait_until="domcontentloaded")
            print("DEBUG: Login page opened. Waiting for user to complete login...")
            
            # Poll for sessionid cookie
            elapsed = 0
            check_interval = 2
            cookies_found = {}
            
            while elapsed < timeout_seconds:
                await asyncio.sleep(check_interval)
                elapsed += check_interval
                
                all_cookies = await context.cookies()
                
                for cookie in all_cookies:
                    if cookie.get("domain", "").endswith("tiktok.com"):
                        cookies_found[cookie["name"]] = cookie["value"]
                
                if "sessionid" in cookies_found:
                    print(f"DEBUG: Login detected! Found {len(cookies_found)} cookies.")
                    break
                
                print(f"DEBUG: Waiting for login... ({elapsed}s)")
            
            await browser.close()
            
            if "sessionid" not in cookies_found:
                return {
                    "status": "timeout",
                    "message": "Login timed out. Please try again.",
                    "cookie_count": 0
                }
            
            # Save credentials
            PlaywrightManager.save_credentials(cookies_found, PlaywrightManager.DEFAULT_USER_AGENT)
            
            return {
                "status": "success",
                "message": "Successfully connected to TikTok!",
                "cookie_count": len(cookies_found)
            }

    @staticmethod
    async def intercept_feed(cookies: List[dict] = None, user_agent: str = None, scroll_count: int = 5) -> List[dict]:
        """Navigate to TikTok feed and intercept API responses."""
        try:
            return await PlaywrightManager._intercept_feed_impl(cookies, user_agent, scroll_count)
        except Exception as e:
            print(f"DEBUG: Error in intercept_feed: {e}")
            print(traceback.format_exc())
            raise e

    @staticmethod
    async def _intercept_feed_impl(cookies: List[dict] = None, user_agent: str = None, scroll_count: int = 5) -> List[dict]:
        if not cookies:
            cookies, user_agent = PlaywrightManager.load_stored_credentials()
        
        if not user_agent:
            user_agent = PlaywrightManager.DEFAULT_USER_AGENT
        
        if not cookies:
            print("DEBUG: No cookies available")
            return []
        
        print(f"DEBUG: Starting network interception with {len(cookies)} cookies (scrolls={scroll_count})")
        
        captured_videos = []
        
        async def handle_response(response: Response):
            """Capture /item_list API responses."""
            nonlocal captured_videos
            
            url = response.url
            
            # Look for TikTok's feed API
            if "item_list" in url or "recommend/item" in url:
                try:
                    data = await response.json()
                    
                    # TikTok returns videos in various nested formats
                    items = []
                    
                    # Try direct itemList first
                    if data.get("itemList") and isinstance(data["itemList"], list):
                        items = data["itemList"]
                    elif data.get("aweme_list") and isinstance(data["aweme_list"], list):
                        items = data["aweme_list"]
                    # Try nested data structure
                    elif data.get("data"):
                        nested_data = data["data"]
                        if isinstance(nested_data, list):
                            for item in nested_data:
                                if isinstance(item, dict):
                                    if "item" in item and isinstance(item["item"], dict):
                                        items.append(item["item"])
                                    else:
                                        items.append(item)
                        elif isinstance(nested_data, dict):
                            items = nested_data.get("itemList", []) or nested_data.get("aweme_list", [])
                    
                    for item in items:
                        video_data = PlaywrightManager._extract_video_data(item)
                        if video_data:
                            captured_videos.append(video_data)
                    
                    print(f"DEBUG: Captured {len(items)} videos from API")
                    
                except Exception as e:
                    print(f"DEBUG: Error parsing API response: {e}")
        
        async with async_playwright() as p:
            browser = await p.chromium.launch(
                headless=True,
                executable_path=PlaywrightManager.CHROME_PATH,
                args=PlaywrightManager.BROWSER_ARGS
            )
            
            context = await browser.new_context(user_agent=user_agent)
            
            if cookies:
                try:
                    await context.add_cookies(cookies)
                    print(f"DEBUG: Applied {len(cookies)} cookies to browser context")
                except Exception as e:
                    print(f"DEBUG: Error applying cookies: {e}")
                    if len(cookies) > 0:
                        print(f"DEBUG: Sample cookie: {cookies[0]}")
                    raise e
            
            page = await context.new_page()
            await stealth_async(page)
            
            # Set up response listener
            page.on("response", handle_response)
            
            try:
                # Navigate to For You page
                await page.goto(
                    "https://www.tiktok.com/foryou",
                    wait_until="domcontentloaded",
                    timeout=30000
                )
                
                # Wait for initial load - ensure we capture at least one batch
                # Poll for videos if in fast mode
                for _ in range(10): # Max 10 seconds wait
                    if len(captured_videos) > 0:
                        break
                    await asyncio.sleep(1)
                
                # If still no videos, maybe scroll once to trigger
                if len(captured_videos) == 0:
                    print("DEBUG: No videos after initial load, scrolling once...")
                    await page.evaluate("window.scrollBy(0, 800)")
                    await asyncio.sleep(2)
                
                # Scroll loop
                for i in range(scroll_count):
                    await page.evaluate("window.scrollBy(0, 800)")
                    await asyncio.sleep(1)
                
                # Give time for API responses to be captured
                await asyncio.sleep(2)
                
            except Exception as e:
                print(f"DEBUG: Navigation error: {e}")
            
            await browser.close()
        
        print(f"DEBUG: Total captured videos: {len(captured_videos)}")
        return captured_videos

    @staticmethod
    def _extract_video_data(item: dict) -> Optional[dict]:
        """Extract video data from TikTok API item, including product/shop videos."""
        try:
            if not isinstance(item, dict):
                print(f"DEBUG: Skipping invalid item (type: {type(item)})")
                return None

            # Handle different API response formats
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
            
            # Try different thumbnail sources
            thumbnail_sources = [
                video_data.get("cover"),
                video_data.get("dynamicCover"),
                video_data.get("originCover"),
                video_data.get("ai_dynamic_cover", {}).get("url_list", [None])[0] if isinstance(video_data.get("ai_dynamic_cover"), dict) else None,
            ]
            for src in thumbnail_sources:
                if src:
                    thumbnail = src
                    break
            
            # Get direct CDN URL - try multiple sources (including for shop videos)
            cdn_url = None
            cdn_sources = [
                # Standard sources
                video_data.get("playAddr"),
                video_data.get("downloadAddr"),
                # Bit rate sources (often works for shop videos)
                video_data.get("bitrateInfo", [{}])[0].get("PlayAddr", {}).get("UrlList", [None])[0] if video_data.get("bitrateInfo") else None,
                # Play URL list
                video_data.get("play_addr", {}).get("url_list", [None])[0] if isinstance(video_data.get("play_addr"), dict) else None,
                # Download URL list
                video_data.get("download_addr", {}).get("url_list", [None])[0] if isinstance(video_data.get("download_addr"), dict) else None,
            ]
            
            for src in cdn_sources:
                if src:
                    cdn_url = src
                    break
            
            # Use TikTok page URL as fallback (yt-dlp resolves this)
            video_url = f"https://www.tiktok.com/@{author}/video/{video_id}"
            
            # Get stats (views, likes)
            stats = item.get("stats", {}) or item.get("statistics", {})
            views = stats.get("playCount") or stats.get("play_count") or 0
            likes = stats.get("diggCount") or stats.get("digg_count") or 0
            
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
                    result["cdn_url"] = cdn_url  # Direct CDN URL for thin proxy
                if views:
                    result["views"] = views
                if likes:
                    result["likes"] = likes
                if is_shop_video:
                    result["has_product"] = True  # Flag for product videos
                return result
        
        except Exception as e:
            print(f"DEBUG: Error extracting video data: {e}")
        
        return None

    @staticmethod
    async def fetch_user_videos(username: str, cookies: list, user_agent: str = None, limit: int = 10) -> list:
        """
        Fetch videos from a specific user's profile page.
        Uses Playwright to intercept the user's video list API.
        """
        from playwright.async_api import async_playwright, Response
        
        if not user_agent:
            user_agent = PlaywrightManager.DEFAULT_USER_AGENT
        
        if not cookies:
            print("DEBUG: No cookies available for user videos")
            return []
        
        print(f"DEBUG: Fetching videos for @{username}...")
        
        captured_videos = []
        
        async def handle_response(response: Response):
            """Capture user's video list API responses."""
            nonlocal captured_videos
            
            url = response.url
            
            # Look for user's video list API
            if "item_list" in url or "post/item_list" in url:
                try:
                    data = await response.json()
                    
                    items = data.get("itemList", []) or data.get("aweme_list", [])
                    
                    for item in items:
                        if len(captured_videos) >= limit:
                            break
                        video_data = PlaywrightManager._extract_video_data(item)
                        if video_data:
                            captured_videos.append(video_data)
                    
                    print(f"DEBUG: Captured {len(items)} videos from user API")
                    
                except Exception as e:
                    print(f"DEBUG: Error parsing user API response: {e}")
        
        async with async_playwright() as p:
            browser = await p.chromium.launch(
                headless=True,
                executable_path=PlaywrightManager.CHROME_PATH,
                args=PlaywrightManager.BROWSER_ARGS
            )
            
            context = await browser.new_context(user_agent=user_agent)
            await context.add_cookies(cookies)
            
            page = await context.new_page()
            await stealth_async(page)
            page.on("response", handle_response)
            
            try:
                # Navigate to user's profile page
                profile_url = f"https://www.tiktok.com/@{username}"
                await page.goto(profile_url, wait_until="networkidle", timeout=30000)
                
                # Wait for videos to load
                await asyncio.sleep(2)
                
                # Scroll a bit to trigger more video loading
                await page.evaluate("window.scrollBy(0, 500)")
                await asyncio.sleep(1)
                
            except Exception as e:
                print(f"DEBUG: Error navigating to profile: {e}")
            
            await browser.close()
        
        print(f"DEBUG: Total captured user videos: {len(captured_videos)}")
        return captured_videos

    @staticmethod
    async def search_videos(query: str, cookies: list, user_agent: str = None, limit: int = 20, cursor: int = 0) -> list:
        """
        Search for videos by keyword or hashtag.
        Uses Playwright to intercept TikTok search results API.
        
        Args:
            query: Search query
            cookies: Auth cookies
            user_agent: Browser user agent
            limit: Max videos to capture in this batch
            cursor: Starting offset for pagination
        """
        from playwright.async_api import async_playwright, Response
        from urllib.parse import quote
        
        if not user_agent:
            user_agent = PlaywrightManager.DEFAULT_USER_AGENT
        
        if not cookies:
            print("DEBUG: No cookies available for search")
            return []
        
        print(f"DEBUG: Searching for '{query}' (limit={limit}, cursor={cursor})...")
        
        captured_videos = []
        
        async def handle_response(response: Response):
            """Capture search results API responses."""
            nonlocal captured_videos
            
            url = response.url
            
            # Log ALL API responses to find the right one
            if "/api/" in url and "tiktok.com" in url:
                try:
                    content_type = response.headers.get("content-type", "")
                    if "json" in content_type.lower():
                        data = await response.json()
                        log_entry = {"url": url, "keys": list(data.keys()) if isinstance(data, dict) else "not dict"}
                        with open("all_responses.jsonl", "a", encoding="utf-8") as f:
                            f.write(json.dumps(log_entry) + "\n")
                except:
                    pass

            # Look for search results API - stricter
            is_search_api = "/api/search/" in url and ("item" in url or "general" in url or "full" in url)
            
            if is_search_api:
                try:
                    content_type = response.headers.get("content-type", "")
                    if "json" not in content_type.lower():
                        return
                        
                    data = await response.json()
                    
                    # Debug: print the actual structure
                    if data:
                        keys = list(data.keys()) if isinstance(data, dict) else "not a dict"
                        print(f"DEBUG: Search API response keys: {keys} from {url}")
                        
                        # DUMP FOR DEBUGGING
                        try:
                            # Append to file or overwrite with list? Overwrite with wrapper for now
                            debug_data = {"url": url, "response": data}
                            with open("debug_search_response.json", "w", encoding="utf-8") as f:
                                json.dump(debug_data, f, indent=2)
                            print("DEBUG: Dumped search response to debug_search_response.json")
                        except Exception as e:
                            print(f"DEBUG: Failed to dump response: {e}")
                    
                    # Try different response formats - TikTok nests data in various ways
                    items = []
                    
                    # First try direct itemList
                    if data.get("itemList") and isinstance(data["itemList"], list):
                        items = data["itemList"]
                    # Try data field 
                    elif data.get("data"):
                        nested_data = data["data"]
                        if isinstance(nested_data, list):
                            # data is a list of items directly
                            for item in nested_data:
                                if isinstance(item, dict):
                                    # Check if item has an "item" key (video wrapped)
                                    if "item" in item and isinstance(item["item"], dict):
                                        items.append(item["item"])
                                    # Check for aweme/video wrapper
                                    elif "aweme" in item and isinstance(item["aweme"], dict):
                                        items.append(item["aweme"])
                                    else:
                                        items.append(item)
                        elif isinstance(nested_data, dict):
                            # data is an object with items inside
                            items = nested_data.get("itemList", []) or nested_data.get("item_list", []) or \
                                   nested_data.get("videos", []) or nested_data.get("aweme_list", [])
                    # Try item_list directly
                    elif data.get("item_list"):
                        items = data["item_list"]
                    # Try aweme_list (mobile API format)
                    elif data.get("aweme_list"):
                        items = data["aweme_list"]
                    
                    if items:
                        print(f"DEBUG: Found {len(items)} items, first item keys: {list(items[0].keys()) if items and isinstance(items[0], dict) else 'N/A'}")
                    
                    for item in items:
                        # If we have enough for this specific batch, we don't need more
                        if len(captured_videos) >= limit:
                            break
                        
                        video_data = PlaywrightManager._extract_video_data(item)
                        if video_data:
                            # Avoid duplicates within the same capture session
                            if not any(v['id'] == video_data['id'] for v in captured_videos):
                                captured_videos.append(video_data)
                    
                    print(f"DEBUG: Captured {len(items)} videos from search API (Total batch: {len(captured_videos)})")
                    
                except Exception as e:
                    print(f"DEBUG: Error parsing search API response: {e}")
        
        async with async_playwright() as p:
            browser = await p.firefox.launch(
                headless=True,
            )
            
            context = await browser.new_context(user_agent=user_agent)
            await context.add_cookies(cookies)
            
            page = await context.new_page()
            await stealth_async(page)
            page.on("response", handle_response)
            
            try:

                # Navigate to TikTok search page - try standard search
                search_url = f"https://www.tiktok.com/search?q={quote(query)}"
                try:
                    await page.goto(search_url, wait_until="domcontentloaded", timeout=15000)
                except:
                    print("DEBUG: Navigation timeout, proceeding anyway")
                
                # Wait for initial results
                await asyncio.sleep(3)
                
                # Scroll based on cursor to reach previous results and then capture new ones
                # Each scroll typically loads 12-20 items
                # We scroll more as the cursor increases
                scroll_count = (cursor // 10) + 1
                # Limit total scrolls to avoid hanging
                scroll_count = min(scroll_count, 10)
                
                for i in range(scroll_count):
                    await page.evaluate("window.scrollBy(0, 1500)")
                    await asyncio.sleep(1.5)
                
                # After reaching the offset, scroll a bit more to trigger the specific batch capture
                batch_scrolls = (limit // 10) + 2  # Add extra scrolls to be safe
                for _ in range(batch_scrolls):
                    await page.evaluate("window.scrollBy(0, 2000)")  # Larger scroll
                    await asyncio.sleep(1.0) # Faster scroll cadence
                
                # Wait a bit after scrolling for all responses to settle
                await asyncio.sleep(2.5)
                
            except Exception as e:
                print(f"DEBUG: Error during search: {e}")
            
            try:
                await page.screenshot(path="debug_search_page.png")
                print("DEBUG: Saved screenshot to debug_search_page.png")
                
                # Dump HTML
                html_content = await page.content()
                with open("debug_search_page.html", "w", encoding="utf-8") as f:
                    f.write(html_content)
                print("DEBUG: Saved HTML to debug_search_page.html")
            except:
                pass

            await browser.close()
        
        print(f"DEBUG: Total captured search videos in this batch: {len(captured_videos)}")
        return captured_videos

    @staticmethod
    async def fetch_suggested_accounts(cookies: list, user_agent: str = None, limit: int = 50) -> list:
        """
        Fetch trending/suggested accounts from TikTok Vietnam.
        Uses the discover/creators API.
        """
        from playwright.async_api import async_playwright, Response
        
        if not user_agent:
            user_agent = PlaywrightManager.DEFAULT_USER_AGENT
        
        captured_accounts = []
        
        async def handle_response(response: Response):
            """Capture suggested accounts from API responses."""
            nonlocal captured_accounts
            
            url = response.url
            
            # Look for suggest/discover APIs
            if any(x in url for x in ["suggest", "discover", "recommend/user", "creator"]):
                try:
                    data = await response.json()
                    
                    # Different API formats
                    users = data.get("userList", []) or data.get("users", []) or data.get("data", [])
                    
                    for item in users:
                        user_data = item.get("user", item) if isinstance(item, dict) else item
                        if isinstance(user_data, dict):
                            username = user_data.get("uniqueId") or user_data.get("unique_id")
                            if username:
                                captured_accounts.append({
                                    "username": username,
                                    "nickname": user_data.get("nickname", username),
                                    "avatar": user_data.get("avatarThumb") or user_data.get("avatar"),
                                    "followers": user_data.get("followerCount", 0),
                                    "verified": user_data.get("verified", False),
                                    "region": "VN"
                                })
                    
                    if users:
                        print(f"DEBUG: Captured {len(users)} suggested accounts")
                        
                except Exception as e:
                    pass  # Ignore parse errors
        
        async with async_playwright() as p:
            browser = await p.chromium.launch(
                headless=True,
                executable_path=PlaywrightManager.CHROME_PATH,
                args=PlaywrightManager.BROWSER_ARGS
            )
            
            context = await browser.new_context(
                user_agent=user_agent,
                locale="vi-VN",  # Vietnamese locale
                timezone_id="Asia/Ho_Chi_Minh"
            )
            await context.add_cookies(cookies)
            
            page = await context.new_page()
            await stealth_async(page)
            page.on("response", handle_response)
            
            try:
                # Navigate to TikTok explore/discover page (Vietnam)
                await page.goto("https://www.tiktok.com/explore?lang=vi-VN", wait_until="networkidle", timeout=30000)
                await asyncio.sleep(3)
                
                # Also try the For You page to capture suggested
                await page.goto("https://www.tiktok.com/foryou?lang=vi-VN", wait_until="domcontentloaded", timeout=15000)
                await asyncio.sleep(2)
                
                # Scroll to trigger more suggestions
                for _ in range(3):
                    await page.evaluate("window.scrollBy(0, 800)")
                    await asyncio.sleep(1)
                
            except Exception as e:
                print(f"DEBUG: Error fetching suggested accounts: {e}")
            
            await browser.close()
        
        # Remove duplicates by username
        seen = set()
        unique_accounts = []
        for acc in captured_accounts:
            if acc["username"] not in seen:
                seen.add(acc["username"])
                unique_accounts.append(acc)
        
        print(f"DEBUG: Total unique suggested accounts: {len(unique_accounts)}")
        return unique_accounts[:limit]


# Singleton instance
playwright_manager = PlaywrightManager()
