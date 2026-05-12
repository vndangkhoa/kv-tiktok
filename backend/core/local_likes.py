"""
Local likes storage - saves liked videos locally when user double-taps.
"""

import os
import json
import asyncio
import hashlib
from typing import List, Optional
from datetime import datetime

router = likes_router = None

# Lazy import to avoid circular dependencies
def get_router():
    global likes_router
    if likes_router is None:
        from fastapi import APIRouter
        likes_router = APIRouter(prefix="/likes", tags=["likes"])
    return likes_router

LIKES_FILE = "/tmp/purestream_likes.json"
_likes_cache = None


def _load_likes() -> List[dict]:
    global _likes_cache
    if _likes_cache is not None:
        return _likes_cache
    
    if os.path.exists(LIKES_FILE):
        try:
            with open(LIKES_FILE, "r") as f:
                _likes_cache = json.load(f)
        except:
            _likes_cache = []
    else:
        _likes_cache = []
    
    return _likes_cache


def _save_likes(likes: List[dict]):
    global _likes_cache
    _likes_cache = likes
    with open(LIKES_FILE, "w") as f:
        json.dump(likes, f, indent=2)


def add_like(video: dict) -> dict:
    """Add a video to local likes."""
    likes = _load_likes()
    
    # Check if already liked
    if any(v.get("id") == video.get("id") for v in likes):
        return {"status": "already_liked", "video": video}
    
    # Add timestamp
    video["liked_at"] = datetime.now().isoformat()
    likes.insert(0, video)  # Add to beginning
    
    _save_likes(likes)
    return {"status": "added", "video": video}


def remove_like(video_id: str) -> dict:
    """Remove a video from local likes."""
    likes = _load_likes()
    likes = [v for v in likes if v.get("id") != video_id]
    _save_likes(likes)
    return {"status": "removed", "video_id": video_id}


def is_liked(video_id: str) -> bool:
    """Check if video is liked."""
    likes = _load_likes()
    return any(v.get("id") == video_id for v in likes)


def get_likes() -> List[dict]:
    """Get all liked videos."""
    return _load_likes()


def clear_likes():
    """Clear all likes."""
    _save_likes([])
    return {"status": "cleared"}