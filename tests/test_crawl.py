import asyncio
import base64
from crawl4ai import AsyncWebCrawler

async def main():
    print("Starting Crawl4AI test...")
    async with AsyncWebCrawler(verbose=True) as crawler:
        url = "https://www.tiktok.com/search?q=hot+trend"
        print(f"Crawling: {url}")
        
        # Browser config
        run_conf = {
            "url": url,
            "wait_for": "css:[data-e2e='search_video_item']",
            "css_selector": "[data-e2e='search_video_item']",
            "screenshot": True,
            "magic": True
        }
        
        print(f"Crawling with config: {run_conf}")
        result = await crawler.arun(**run_conf)
        
        if result.success:
            print("Crawl successful!")
            print(f"HTML length: {len(result.html)}")
            
            if result.screenshot:
                with open("crawl_screenshot.png", "wb") as f:
                    f.write(base64.b64decode(result.screenshot))
                print("Saved screenshot to crawl_screenshot.png")
            
            # Save for inspection
            with open("crawl_debug.html", "w", encoding="utf-8") as f:
                f.write(result.html)
            with open("crawl_debug.md", "w", encoding="utf-8") as f:
                f.write(result.markdown)
                
        else:
            print(f"Crawl failed: {result.error_message}")

if __name__ == "__main__":
    asyncio.run(main())
