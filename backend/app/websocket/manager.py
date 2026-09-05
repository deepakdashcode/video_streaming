import json
import logging
from typing import Dict, List, Set, Optional
from fastapi import WebSocket

logger = logging.getLogger("websocket_manager")

class ConnectionManager:
    def __init__(self):
        # room_id -> user_id -> WebSocket
        self.room_connections: Dict[str, Dict[str, WebSocket]] = {}

    async def connect(self, room_id: str, user_id: str, websocket: WebSocket):
        await websocket.accept()
        if room_id not in self.room_connections:
            self.room_connections[room_id] = {}
        self.room_connections[room_id][user_id] = websocket
        logger.info(f"User {user_id} connected to room {room_id}")

    def disconnect(self, room_id: str, user_id: str):
        if room_id in self.room_connections:
            if user_id in self.room_connections[room_id]:
                del self.room_connections[room_id][user_id]
            if not self.room_connections[room_id]:
                del self.room_connections[room_id]
        logger.info(f"User {user_id} disconnected from room {room_id}")

    async def send_personal_message(self, message: dict, room_id: str, user_id: str):
        if room_id in self.room_connections and user_id in self.room_connections[room_id]:
            try:
                await self.room_connections[room_id][user_id].send_text(json.dumps(message))
            except Exception as e:
                logger.error(f"Error sending message to {user_id}: {e}")

    async def broadcast_to_room(self, message: dict, room_id: str, exclude_user_id: Optional[str] = None):
        if room_id not in self.room_connections:
            return

        payload = json.dumps(message)
        disconnected_users = []

        for uid, ws in self.room_connections[room_id].items():
            if exclude_user_id and uid == exclude_user_id:
                continue
            try:
                await ws.send_text(payload)
            except Exception as e:
                logger.error(f"Error broadcasting to {uid}: {e}")
                disconnected_users.append(uid)

        for uid in disconnected_users:
            self.disconnect(room_id, uid)

manager = ConnectionManager()
