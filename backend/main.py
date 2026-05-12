import sys
import asyncio

# CRITICAL: Set Windows event loop policy BEFORE any other imports
# Playwright requires ProactorEventLoop for subprocess support on Windows
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from contextlib import asynccontextmanager
from pathlib import Path
from api.routes import auth, feed, download, following, config, user, likes


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    print("🚀 Starting PureStream API (Network Interception Mode)...")
    import asyncio
    try:
        loop = asyncio.get_running_loop()
        print(f"DEBUG: Running event loop: {type(loop)}")
    except Exception as e:
        print(f"DEBUG: Could not get running loop: {e}")
    yield
    print("👋 Shutting down PureStream API...")

import asyncio
import sys

app = FastAPI(title="PureStream API", version="2.0.0", lifespan=lifespan)

if __name__ == "__main__":
    if sys.platform == "win32":
        try:
            loop = asyncio.get_event_loop()
            print(f"DEBUG: Current event loop: {type(loop)}")
        except:
             print("DEBUG: No event loop yet")
             

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(feed.router, prefix="/api/feed", tags=["Feed"])
app.include_router(download.router, prefix="/api/download", tags=["Download"])
app.include_router(following.router, prefix="/api/following", tags=["Following"])
app.include_router(config.router, prefix="/api/config", tags=["Config"])
app.include_router(user.router, prefix="/api/user", tags=["User"])
app.include_router(likes.router, prefix="/api", tags=["Likes"])

@app.get("/health")
async def health_check():
    return {"status": "ok"}

# Serve static frontend files in production
FRONTEND_DIR = Path(__file__).parent.parent / "frontend" / "dist"
if FRONTEND_DIR.exists():
    # Mount static assets
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIR / "assets"), name="assets")
    
    # Serve index.html for all non-API routes (SPA fallback)
    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        # If requesting a file that exists, serve it
        file_path = FRONTEND_DIR / full_path
        if file_path.is_file():
            return FileResponse(file_path)
        # Otherwise serve index.html for SPA routing
        return FileResponse(FRONTEND_DIR / "index.html")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8002, reload=False, loop="asyncio")

