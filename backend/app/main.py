import time
import json
import logging
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.api.rooms import router as rooms_router
from app.api.media import router as media_router
from app.services.room_service import room_service
from app.security import verify_token
from app.websocket.manager import manager
from app.websocket.handlers import handle_ws_event

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("main")

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
)

# Enable CORS for local network and dev servers
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Allow local LAN origin connections
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(rooms_router)
app.include_router(media_router)

@app.get("/api/health")
async def health_check():
    return {
        "status": "healthy",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "active_rooms": len(room_service.rooms),
        "timestamp": time.time()
    }

@app.websocket("/ws/rooms/{room_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str, token: str = Query(...)):
    # Validate session token
    auth_data = verify_token(token)
    if not auth_data or auth_data["room_id"] != room_id.upper().strip():
        await websocket.close(code=4008, reason="Unauthorized or invalid token")
        return

    room_id = room_id.upper().strip()
    user_id = auth_data["user_id"]

    room = room_service.get_room(room_id)
    if not room or user_id not in room.participants:
        await websocket.close(code=4004, reason="Room or user not found")
        return

    user = room.participants[user_id]
    await manager.connect(room_id, user_id, websocket)

    # Send initial room state to the newly connected client
    await websocket.send_text(json.dumps({
        "type": "INIT_ROOM_STATE",
        "timestamp": time.time() * 1000,
        "payload": {
            "room": room.model_dump(),
            "self_user_id": user_id
        }
    }))

    # Notify others in the room
    await manager.broadcast_to_room({
        "type": "USER_CONNECTED",
        "timestamp": time.time() * 1000,
        "payload": {
            "user": user.model_dump()
        }
    }, room_id, exclude_user_id=user_id)

    try:
        while True:
            data = await websocket.receive_text()
            try:
                event_data = json.loads(data)
                await handle_ws_event(room_id, user_id, event_data)
            except json.JSONDecodeError:
                logger.warning(f"Invalid JSON received from {user_id}")
    except WebSocketDisconnect:
        manager.disconnect(room_id, user_id)
        # Notify remaining users
        await manager.broadcast_to_room({
            "type": "USER_DISCONNECTED",
            "timestamp": time.time() * 1000,
            "payload": {
                "user_id": user_id,
                "user_name": user.display_name
            }
        }, room_id)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host=settings.HOST, port=settings.PORT, reload=True)
