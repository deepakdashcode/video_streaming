from enum import Enum
from typing import Optional, Dict, List, Any
from pydantic import BaseModel, Field, ConfigDict
import time

class UserRole(str, Enum):
    HOST = "HOST"
    PARTICIPANT = "PARTICIPANT"

class MediaSourceType(str, Enum):
    NONE = "NONE"
    URL = "URL"
    LOCAL_FILE = "LOCAL_FILE"
    SCREEN_SHARE = "SCREEN_SHARE"
    P2P_VIDEO = "P2P_VIDEO"

class User(BaseModel):
    id: str
    display_name: str
    role: UserRole
    joined_at: float = Field(default_factory=time.time)
    camera_enabled: bool = False
    microphone_enabled: bool = False

class PlaybackState(BaseModel):
    media_id: Optional[str] = None
    source_type: MediaSourceType = MediaSourceType.NONE
    media_url: Optional[str] = None
    title: Optional[str] = "No Video Loaded"
    playing: bool = False
    position: float = 0.0 # seconds
    playback_rate: float = 1.0
    updated_at: float = Field(default_factory=lambda: time.time() * 1000) # Epoch ms
    sharer_user_id: Optional[str] = None
    sharer_name: Optional[str] = None
    screen_stream_id: Optional[str] = None

class RoomSettings(BaseModel):
    locked: bool = False
    allow_camera: bool = True
    allow_microphone: bool = True
    allow_participant_control: bool = False
    allow_screen_share: bool = False

class Room(BaseModel):
    id: str
    name: str
    has_password: bool = False
    password_hash: Optional[str] = None
    host_user_id: str
    created_at: float = Field(default_factory=time.time)
    settings: RoomSettings = Field(default_factory=RoomSettings)
    participants: Dict[str, User] = Field(default_factory=dict)
    playback_state: PlaybackState = Field(default_factory=PlaybackState)

# API Request/Response Schemas
class CreateRoomRequest(BaseModel):
    room_name: Optional[str] = "Watch Party"
    password: Optional[str] = None
    host_name: str = "Host"

class CreateRoomResponse(BaseModel):
    room_id: str
    user_id: str
    token: str
    role: UserRole

class JoinRoomRequest(BaseModel):
    password: Optional[str] = None
    display_name: str

class JoinRoomResponse(BaseModel):
    room_id: str
    user_id: str
    token: str
    role: UserRole
    room_name: str

class SetMediaUrlRequest(BaseModel):
    url: str
    title: Optional[str] = "Web Video Stream"

class UpdateSettingsRequest(BaseModel):
    locked: Optional[bool] = None
    allow_camera: Optional[bool] = None
    allow_microphone: Optional[bool] = None
    allow_participant_control: Optional[bool] = None

class WSEvent(BaseModel):
    type: str
    requestId: Optional[str] = None
    timestamp: float = Field(default_factory=lambda: time.time() * 1000)
    payload: Dict[str, Any] = Field(default_factory=dict)
