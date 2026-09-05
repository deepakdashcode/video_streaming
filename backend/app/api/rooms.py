import time
from fastapi import APIRouter, HTTPException, Depends, Header
from typing import Optional
from app.models.schemas import (
    CreateRoomRequest, CreateRoomResponse,
    JoinRoomRequest, JoinRoomResponse,
    SetMediaUrlRequest, UpdateSettingsRequest,
    Room, MediaSourceType, UserRole
)
from app.services.room_service import room_service
from app.security import verify_token
from app.websocket.manager import manager

router = APIRouter(prefix="/api/rooms", tags=["Rooms"])

def get_current_user_from_header(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization token header")
    
    token = authorization.replace("Bearer ", "").strip()
    auth_data = verify_token(token)
    if not auth_data:
        raise HTTPException(status_code=401, detail="Invalid or expired session token")
    
    return auth_data

@router.post("", response_model=CreateRoomResponse)

async def create_room(req: CreateRoomRequest):
    room, host_user, token = room_service.create_room(
        room_name=req.room_name,
        password=req.password,
        host_name=req.host_name
    )
    return CreateRoomResponse(
        room_id=room.id,
        user_id=host_user.id,
        token=token,
        role=host_user.role
    )

@router.post("/{room_id}/join", response_model=JoinRoomResponse)

async def join_room(room_id: str, req: JoinRoomRequest):
    room, user, token, err_msg = room_service.join_room(
        room_id=room_id,
        display_name=req.display_name,
        password=req.password
    )
    if not room or not user or not token:
        raise HTTPException(status_code=400, detail=err_msg)

    # Notify WebSocket room members about new user
    await manager.broadcast_to_room({
        "type": "USER_JOINED",
        "timestamp": time.time() * 1000,
        "payload": {
            "user": user.model_dump()
        }
    }, room.id, exclude_user_id=user.id)

    return JoinRoomResponse(
        room_id=room.id,
        user_id=user.id,
        token=token,
        role=user.role,
        room_name=room.name
    )

@router.get("/{room_id}")

async def get_room(room_id: str, auth: dict = Depends(get_current_user_from_header)):
    room = room_service.get_room(room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")
    
    if auth["room_id"] != room.id:
        raise HTTPException(status_code=403, detail="Not authorized for this room")

    return room.model_dump()

@router.post("/{room_id}/media/url")

async def set_media_url(room_id: str, req: SetMediaUrlRequest, auth: dict = Depends(get_current_user_from_header)):
    room = room_service.get_room(room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    user = room.participants.get(auth["user_id"])
    if not user:
        raise HTTPException(status_code=403, detail="Not a participant in room")

    if user.role != UserRole.HOST and not room.settings.allow_participant_control:
        raise HTTPException(status_code=403, detail="Only host can change media source")

    now_ms = time.time() * 1000
    room.playback_state.source_type = MediaSourceType.URL
    room.playback_state.media_url = req.url
    room.playback_state.title = req.title or req.url.split("/")[-1]
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

    return {"status": "ok", "playback_state": room.playback_state.model_dump()}

@router.delete("/{room_id}/participants/{user_id}")

async def kick_participant(room_id: str, user_id: str, auth: dict = Depends(get_current_user_from_header)):
    room = room_service.get_room(room_id)
    if not room:
        raise HTTPException(status_code=404, detail="Room not found")

    if auth["role"] != UserRole.HOST.value:
        raise HTTPException(status_code=403, detail="Only host can remove participants")

    target_user = room.participants.get(user_id)
    if not target_user:
        raise HTTPException(status_code=404, detail="Participant not found")

    room_service.remove_participant(room_id, user_id)

    # Disconnect WS & notify room
    await manager.send_personal_message({
        "type": "KICKED",
        "payload": {"reason": "Removed by host"}
    }, room_id, user_id)
    
    manager.disconnect(room_id, user_id)

    await manager.broadcast_to_room({
        "type": "USER_LEFT",
        "timestamp": time.time() * 1000,
        "payload": {
            "user_id": user_id,
            "user_name": target_user.display_name,
            "reason": "kicked"
        }
    }, room_id)

    return {"status": "ok"}
