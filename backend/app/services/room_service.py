import time
import os
from typing import Dict, Optional, Tuple
from app.models.schemas import Room, User, UserRole, PlaybackState, MediaSourceType, RoomSettings
from app.security import generate_room_id, generate_id, hash_password, verify_password, generate_token

class RoomService:
    def __init__(self):
        self.rooms: Dict[str, Room] = {}
        # Stores room_id -> dict of media_id -> file path info
        self.room_media: Dict[str, Dict[str, dict]] = {}

    def create_room(self, room_name: Optional[str], password: Optional[str], host_name: str) -> Tuple[Room, User, str]:
        room_id = generate_room_id()
        while room_id in self.rooms:
            room_id = generate_room_id()

        host_id = generate_id()
        host_user = User(
            id=host_id,
            display_name=host_name.strip() or "Host",
            role=UserRole.HOST
        )

        has_pw = bool(password and password.strip())
        pw_hash = hash_password(password.strip()) if has_pw else None

        room = Room(
            id=room_id,
            name=room_name.strip() if room_name and room_name.strip() else f"Room {room_id}",
            has_password=has_pw,
            password_hash=pw_hash,
            host_user_id=host_id,
            participants={host_id: host_user},
            playback_state=PlaybackState()
        )

        self.rooms[room_id] = room
        self.room_media[room_id] = {}
        token = generate_token(room_id, host_id, UserRole.HOST.value)

        return room, host_user, token

    def join_room(self, room_id: str, display_name: str, password: Optional[str]) -> Tuple[Optional[Room], Optional[User], Optional[str], str]:
        room_id = room_id.upper().strip()
        if room_id not in self.rooms:
            return None, None, None, "Room not found"

        room = self.rooms[room_id]

        if room.settings.locked:
            return None, None, None, "Room is locked by host"

        if room.has_password:
            if not password or not verify_password(password.strip(), room.password_hash or ""):
                return None, None, None, "Incorrect room password"

        user_id = generate_id()
        user = User(
            id=user_id,
            display_name=display_name.strip() or "Participant",
            role=UserRole.PARTICIPANT
        )

        room.participants[user_id] = user
        token = generate_token(room_id, user_id, UserRole.PARTICIPANT.value)

        return room, user, token, "Success"

    def get_room(self, room_id: str) -> Optional[Room]:
        return self.rooms.get(room_id.upper().strip())

    def remove_participant(self, room_id: str, user_id: str) -> bool:
        room = self.get_room(room_id)
        if not room or user_id not in room.participants:
            return False
        
        del room.participants[user_id]

        # If host leaves, reassign host or close room
        if room.host_user_id == user_id:
            remaining_participants = list(room.participants.values())
            if remaining_participants:
                new_host = remaining_participants[0]
                new_host.role = UserRole.HOST
                room.host_user_id = new_host.id
            else:
                self.delete_room(room_id)

        return True

    def delete_room(self, room_id: str):
        room_id = room_id.upper().strip()
        if room_id in self.rooms:
            del self.rooms[room_id]
        if room_id in self.room_media:
            # Clean up files
            for media_info in self.room_media[room_id].values():
                filepath = media_info.get("file_path")
                if filepath and os.path.exists(filepath):
                    try:
                        os.remove(filepath)
                    except Exception:
                        pass
            del self.room_media[room_id]

    def register_local_media(self, room_id: str, filename: str, file_path: str, mime_type: str) -> str:
        media_id = generate_id()
        if room_id not in self.room_media:
            self.room_media[room_id] = {}
        
        self.room_media[room_id][media_id] = {
            "media_id": media_id,
            "filename": filename,
            "file_path": file_path,
            "mime_type": mime_type,
            "created_at": time.time()
        }
        return media_id

    def get_local_media(self, room_id: str, media_id: str) -> Optional[dict]:
        return self.room_media.get(room_id, {}).get(media_id)

room_service = RoomService()
