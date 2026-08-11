from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from fastapi.responses import FileResponse
from core.download_service import download_service
import os

router = APIRouter()

class DownloadRequest(BaseModel):
    url: str
    cdn_url: Optional[str] = None

@router.post("")
async def download_video(req: DownloadRequest):
    result = await download_service.download_video(req.url, req.cdn_url)

    if result["status"] == "error":
        raise HTTPException(status_code=500, detail=result["message"])

    return result

@router.get("/file/{video_id}")
async def get_downloaded_file(video_id: str):
    download_dir = "downloads"
    for filename in os.listdir(download_dir):
        if filename.startswith(video_id):
            return FileResponse(path=os.path.join(download_dir, filename), filename=filename)

    raise HTTPException(status_code=404, detail="File not found")
