import os
import time
import mimetypes
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, Header, UploadFile, File, Request, status
from fastapi.responses import StreamingResponse
from app.services.room_service import room_service
from app.config import settings
from app.api.rooms import get_current_user_from_header
from app.models.schemas import UserRole, MediaSourceType
from app.websocket.manager import manager

router = APIRouter(prefix="/api/rooms", tags=["Media"])

@router.post("/{room_id}/media/upload")

async def upload_local_video(
    room_id: str,
    file: UploadFile = File(...),
    auth: dict = Depends(get_current_user_from_header)
):
    room = room_service.get_room(room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    user = room.participants.get(auth["user_id"])
    if not user:
        raise HTTPException(status_code=403, detail="Not a participant in room")

    if user.role != UserRole.HOST and not room.settings.allow_participant_control:
        raise HTTPException(status_code=403, detail="Only host can change media source")

    # Validate file extension & mime type
    filename = file.filename or "video.mp4"
    ext = os.path.splitext(filename)[1].lower()
    allowed_exts = [".mp4", ".webm", ".mkv", ".mov", ".m4v", ".avi"]
    if ext not in allowed_exts:
        raise HTTPException(status_code=400, detail=f"Unsupported video format '{ext}'. Use .mp4 or .webm")

    mime_type, _ = mimetypes.guess_type(filename)
    if not mime_type or not mime_type.startswith("video/"):
        mime_type = "video/mp4"

    # Store file in uploads directory
    room_upload_dir = os.path.join(settings.UPLOAD_DIR, room_id)
    os.makedirs(room_upload_dir, exist_ok=True)
    
    file_path = os.path.join(room_upload_dir, f"{int(time.time())}_{filename}")
    
    # Save uploaded file
    try:
        with open(file_path, "wb") as f:
            while chunk := await file.read(1024 * 1024): # 1MB chunks
                f.write(chunk)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save uploaded video: {str(e)}")

    media_id = room_service.register_local_media(room_id, filename, file_path, mime_type)
    media_url = f"/api/rooms/{room_id}/media/{media_id}"

    now_ms = time.time() * 1000
    room.playback_state.media_id = media_id
    room.playback_state.source_type = MediaSourceType.LOCAL_FILE
    room.playback_state.media_url = media_url
    room.playback_state.title = filename
    room.playback_state.position = 0.0
    room.playback_state.playing = True
    room.playback_state.updated_at = now_ms

    await manager.broadcast_to_room({
        "type": "MEDIA_CHANGED",
        "timestamp": now_ms,
        "payload": {
            "playback_state": room.playback_state.model_dump(),
            "changed_by": user.display_name
        }
    }, room.id)

    return {
        "status": "ok",
        "media_id": media_id,
        "media_url": media_url,
        "playback_state": room.playback_state.model_dump()
    }

@router.get("/{room_id}/media/{media_id}")

async def stream_local_video(room_id: str, media_id: str, request: Request):
    """HTTP 206 Partial Content Byte-Range video streaming endpoint."""
    media_info = room_service.get_local_media(room_id, media_id)
    if not media_info:
        raise HTTPException(status_code=404, detail="Media file not found")

    file_path = media_info["file_path"]
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File missing from storage")

    file_size = os.path.getsize(file_path)
    mime_type = media_info.get("mime_type", "video/mp4")

    range_header = request.headers.get("range")
    
    if range_header:
        # Parse range header e.g. "bytes=0-" or "bytes=1000-2000"
        bytes_type, bytes_range = range_header.strip().split("=")
        if bytes_type != "bytes":
            raise HTTPException(status_code=400, detail="Invalid Range header")

        parts = bytes_range.split("-")
        start = int(parts[0]) if parts[0] else 0
        end = int(parts[1]) if len(parts) > 1 and parts[1] else file_size - 1

        if start >= file_size or end >= file_size or start > end:
            raise HTTPException(
                status_code=status.HTTP_416_REQUESTED_RANGE_NOT_SATISFIABLE,
                headers={"Content-Range": f"bytes */{file_size}"}
            )

        chunk_size = (end - start) + 1

        def iter_file_chunk(file_path: str, offset: int, length: int):
            with open(file_path, "rb") as f:
                f.seek(offset)
                remaining = length
                while remaining > 0:
                    read_len = min(1024 * 512, remaining) # 512KB chunks
                    data = f.read(read_len)
                    if not data:
                        break
                    remaining -= len(data)
                    yield data

        headers = {
            "Content-Range": f"bytes {start}-{end}/{file_size}",
            "Accept-Ranges": "bytes",
            "Content-Length": str(chunk_size),
            "Content-Type": mime_type,
        }

        return StreamingResponse(
            iter_file_chunk(file_path, start, chunk_size),
            status_code=206,
            headers=headers
        )

    # Full file fallback
    def iter_full_file(file_path: str):
        with open(file_path, "rb") as f:
            while chunk := f.read(1024 * 512):
                yield chunk

    return StreamingResponse(
        iter_full_file(file_path),
        media_type=mime_type,
        headers={"Content-Length": str(file_size), "Accept-Ranges": "bytes"}
    )
