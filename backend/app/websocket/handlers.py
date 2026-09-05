import time
from typing import Dict, Any
from app.services.room_service import room_service
from app.websocket.manager import manager
from app.models.schemas import UserRole, MediaSourceType

# Store user_id -> last 5 reaction timestamps for rate limiting
reaction_rate_limits: Dict[str, list] = {}

async def handle_ws_event(room_id: str, user_id: str, event_data: dict):
    event_type = event_data.get("type")
    payload = event_data.get("payload", {})
    request_id = event_data.get("requestId")

    room = room_service.get_room(room_id)
    if not room:
        return

    user = room.participants.get(user_id)
    if not user:
        return

    is_host = (user.role == UserRole.HOST)
    can_control = is_host or room.settings.allow_participant_control

    # 1. Playback Controls (PLAY, PAUSE, SEEK, RATE_CHANGE)
    if event_type in ["PLAY", "PAUSE", "SEEK", "RATE_CHANGE"]:
        if not can_control:
            await manager.send_personal_message({
                "type": "ERROR",
                "payload": {"message": "Only host can control playback"}
            }, room_id, user_id)
            return

        now_ms = time.time() * 1000
        state = room.playback_state

        if event_type == "PLAY":
            state.playing = True
            if "position" in payload:
                state.position = float(payload["position"])
            state.updated_at = now_ms

        elif event_type == "PAUSE":
            state.playing = False
            if "position" in payload:
                state.position = float(payload["position"])
            state.updated_at = now_ms

        elif event_type == "SEEK":
            if "position" in payload:
                state.position = float(payload["position"])
            state.updated_at = now_ms

        elif event_type == "RATE_CHANGE":
            if "playback_rate" in payload:
                state.playback_rate = float(payload["playback_rate"])
            state.updated_at = now_ms

        # Broadcast updated playback state to all clients
        await manager.broadcast_to_room({
            "type": "PLAYBACK_STATE_CHANGED",
            "timestamp": now_ms,
            "payload": {
                "playback_state": state.model_dump(),
                "action": event_type,
                "actor_id": user_id,
                "actor_name": user.display_name
            }
        }, room_id)

    # 2. Reactions
    elif event_type == "REACTION":
        emoji = payload.get("emoji", "❤️")
        now = time.time()

        # Rate limiting: max 5 per second
        history = reaction_rate_limits.get(user_id, [])
        history = [t for t in history if now - t < 1.0]
        if len(history) >= 5:
            return # Ignore excess reactions
        history.append(now)
        reaction_rate_limits[user_id] = history

        await manager.broadcast_to_room({
            "type": "REACTION",
            "timestamp": now * 1000,
            "payload": {
                "emoji": emoji,
                "user_id": user_id,
                "user_name": user.display_name
            }
        }, room_id)

    # 3. Media Toggles (Camera & Mic)
    elif event_type in ["CAMERA_TOGGLE", "MIC_TOGGLE"]:
        if event_type == "CAMERA_TOGGLE":
            enabled = bool(payload.get("enabled", False))
            if enabled and not room.settings.allow_camera and not is_host:
                return # Host disabled camera
            user.camera_enabled = enabled
        elif event_type == "MIC_TOGGLE":
            enabled = bool(payload.get("enabled", False))
            if enabled and not room.settings.allow_microphone and not is_host:
                return # Host disabled mic
            user.microphone_enabled = enabled

        await manager.broadcast_to_room({
            "type": "USER_STATE_CHANGED",
            "timestamp": time.time() * 1000,
            "payload": {
                "user": user.model_dump()
            }
        }, room_id)

    # 4. Screen Sharing Events
    elif event_type == "SCREEN_SHARE_REQUEST":
        # Participant requests to share screen -> notify Host
        if is_host or room.settings.allow_screen_share:
            # Auto-approved if host or setting enabled
            await manager.send_personal_message({
                "type": "SCREEN_SHARE_PERMISSION_RESPONSE",
                "timestamp": time.time() * 1000,
                "payload": {"approved": True}
            }, room_id, user_id)
        else:
            # Relay request to host
            await manager.send_personal_message({
                "type": "SCREEN_SHARE_REQUEST_FROM_USER",
                "timestamp": time.time() * 1000,
                "payload": {
                    "requester_id": user_id,
                    "requester_name": user.display_name
                }
            }, room_id, room.host_user_id)

    elif event_type == "SCREEN_SHARE_RESPONSE":
        # Host approves or denies screen share request
        if not is_host:
            return
        target_id = payload.get("requester_id")
        approved = bool(payload.get("approved", False))
        if target_id:
            await manager.send_personal_message({
                "type": "SCREEN_SHARE_PERMISSION_RESPONSE",
                "timestamp": time.time() * 1000,
                "payload": {"approved": approved}
            }, room_id, target_id)

    elif event_type == "SCREEN_SHARE_START":
        # Check permission: must be host or allowed
        if not is_host and not room.settings.allow_screen_share:
            return

        screen_stream_id = payload.get("screen_stream_id")
        now_ms = time.time() * 1000
        state = room.playback_state
        state.source_type = MediaSourceType.SCREEN_SHARE
        state.media_url = None
        state.media_id = None
        state.title = f"Screen Share: {user.display_name}"
        state.playing = True
        state.position = 0.0
        state.updated_at = now_ms
        state.sharer_user_id = user_id
        state.sharer_name = user.display_name
        state.screen_stream_id = screen_stream_id

        await manager.broadcast_to_room({
            "type": "MEDIA_CHANGED",
            "timestamp": now_ms,
            "payload": {
                "playback_state": state.model_dump(),
                "changed_by": user.display_name
            }
        }, room_id)

        # Also broadcast the stream ID separately for ontrack handlers
        if screen_stream_id:
            await manager.broadcast_to_room({
                "type": "SCREEN_SHARE_STREAM_ID",
                "timestamp": now_ms,
                "payload": {
                    "screen_stream_id": screen_stream_id,
                    "sharer_user_id": user_id
                }
            }, room_id, exclude_user_id=user_id)

    elif event_type == "SCREEN_SHARE_STOP":
        # Stop active screen share (only host or active sharer)
        if not is_host and room.playback_state.sharer_user_id != user_id:
            return

        now_ms = time.time() * 1000
        state = room.playback_state
        state.source_type = MediaSourceType.NONE
        state.media_url = None
        state.media_id = None
        state.title = "No Video Loaded"
        state.playing = False
        state.position = 0.0
        state.updated_at = now_ms
        state.sharer_user_id = None
        state.sharer_name = None
        state.screen_stream_id = None

        await manager.broadcast_to_room({
            "type": "MEDIA_CHANGED",
            "timestamp": now_ms,
            "payload": {
                "playback_state": state.model_dump(),
                "changed_by": user.display_name
            }
        }, room_id)

    # 4b. P2P Video Sharing (captureStream)
    elif event_type == "VIDEO_SHARE_START":
        if not is_host and not room.settings.allow_screen_share:
            return

        screen_stream_id = payload.get("screen_stream_id")
        video_title = payload.get("title", f"Video Share: {user.display_name}")
        now_ms = time.time() * 1000
        state = room.playback_state
        state.source_type = MediaSourceType.P2P_VIDEO
        state.media_url = None
        state.media_id = None
        state.title = video_title
        state.playing = True
        state.position = 0.0
        state.updated_at = now_ms
        state.sharer_user_id = user_id
        state.sharer_name = user.display_name
        state.screen_stream_id = screen_stream_id

        await manager.broadcast_to_room({
            "type": "MEDIA_CHANGED",
            "timestamp": now_ms,
            "payload": {
                "playback_state": state.model_dump(),
                "changed_by": user.display_name
            }
        }, room_id)

        if screen_stream_id:
            await manager.broadcast_to_room({
                "type": "SCREEN_SHARE_STREAM_ID",
                "timestamp": now_ms,
                "payload": {
                    "screen_stream_id": screen_stream_id,
                    "sharer_user_id": user_id
                }
            }, room_id, exclude_user_id=user_id)

    elif event_type == "VIDEO_SHARE_STOP":
        if not is_host and room.playback_state.sharer_user_id != user_id:
            return

        now_ms = time.time() * 1000
        state = room.playback_state
        state.source_type = MediaSourceType.NONE
        state.media_url = None
        state.media_id = None
        state.title = "No Video Loaded"
        state.playing = False
        state.position = 0.0
        state.updated_at = now_ms
        state.sharer_user_id = None
        state.sharer_name = None
        state.screen_stream_id = None

        await manager.broadcast_to_room({
            "type": "MEDIA_CHANGED",
            "timestamp": now_ms,
            "payload": {
                "playback_state": state.model_dump(),
                "changed_by": user.display_name
            }
        }, room_id)

    # 5. WebRTC Signaling (WEBRTC_OFFER, WEBRTC_ANSWER, WEBRTC_ICE_CANDIDATE)
    elif event_type in ["WEBRTC_OFFER", "WEBRTC_ANSWER", "WEBRTC_ICE_CANDIDATE"]:
        target_user_id = payload.get("target_user_id")
        if target_user_id:
            await manager.send_personal_message({
                "type": event_type,
                "timestamp": time.time() * 1000,
                "payload": {
                    "from_user_id": user_id,
                    "from_user_name": user.display_name,
                    "signal_data": payload.get("signal_data")
                }
            }, room_id, target_user_id)

    # 6. Host Settings Update
    elif event_type == "HOST_SETTINGS_UPDATE":
        if not is_host:
            return
        settings_data = payload.get("settings", {})
        if "locked" in settings_data:
            room.settings.locked = bool(settings_data["locked"])
        if "allow_camera" in settings_data:
            room.settings.allow_camera = bool(settings_data["allow_camera"])
        if "allow_microphone" in settings_data:
            room.settings.allow_microphone = bool(settings_data["allow_microphone"])
        if "allow_participant_control" in settings_data:
            room.settings.allow_participant_control = bool(settings_data["allow_participant_control"])
        if "allow_screen_share" in settings_data:
            room.settings.allow_screen_share = bool(settings_data["allow_screen_share"])

        await manager.broadcast_to_room({
            "type": "ROOM_SETTINGS_CHANGED",
            "timestamp": time.time() * 1000,
            "payload": {
                "settings": room.settings.model_dump()
            }
        }, room_id)
