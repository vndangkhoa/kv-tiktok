"""
Likes API routes - manage locally saved liked videos.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List

from core.local_likes import add_like, remove_like, is_liked, get_likes, clear_likes

router = APIRouter(prefix="/likes", tags=["likes"])


class VideoLike(BaseModel):
    id: str
    url: str
    author: str
    description: Optional[str] = None
    thumbnail: Optional[str] = None
    cdn_url: Optional[str] = None
    views: Optional[int] = None


@router.post("")
async def like_video(video: VideoLike):
    """Add a video to liked list."""
    result = add_like(video.model_dump())
    return result


@router.delete("/{video_id}")
async def unlike_video(video_id: str):
    """Remove a video from liked list."""
    result = remove_like(video_id)
    return result


@router.get("")
async def get_liked_videos():
    """Get all liked videos."""
    likes = get_likes()
    return {"videos": likes, "count": len(likes)}


@router.get("/check/{video_id}")
async def check_liked(video_id: str):
    """Check if a video is liked."""
    liked = is_liked(video_id)
    return {"video_id": video_id, "liked": liked}


@router.delete("")
async def clear_all_likes():
    """Clear all liked videos."""
    result = clear_likes()
    return result