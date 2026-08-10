"""
Windows-compatible startup script for kv-tiktok.
Sets ProactorEventLoop policy BEFORE uvicorn imports anything.
"""
import sys
import asyncio

# CRITICAL: Must be set before importing uvicorn or any async code
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
    # Also create the loop early
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    print(f"DEBUG: Forced ProactorEventLoop: {type(loop)}")

# Now import and run uvicorn
import uvicorn

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8002,
        reload=False,  # Disabled: reload subprocess loses ProactorEventLoop on Windows
        loop="asyncio"  # Use asyncio, which should now use our ProactorEventLoop
    )
