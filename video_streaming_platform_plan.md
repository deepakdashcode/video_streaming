# Video Live Sharing Platform — Local LAN Implementation Plan

## 1. Project goal

Build a locally hosted, browser-based "watch together" platform that lets friends on the same LAN create a room and watch a video together.

### Core workflow

1. A user creates a room.
2. The creator becomes the default host.
3. The room can be open or password-protected.
4. Other users join using the room ID.
5. The host shares either:
   - a public video URL, or
   - a local video file from the host's device.
6. Participants watch the same content with synchronized playback.
7. Participants may optionally share webcam and microphone when:
   - the host has enabled/allowed it, and
   - the participant explicitly agrees.
8. Host and participants can see the shared video and permitted participant media.
9. Participants can send lightweight reactions such as ❤️ 😂 👍 😮 👏.
10. Initially, everything runs on one machine/server and is reachable by devices connected to the same LAN.
11. After the LAN version is stable, the architecture can be adapted for internet hosting.

---

# 2. Recommended architecture

Use a browser-first architecture so phones, tablets, laptops and desktops can join without installing an application.

```text
                         LAN
                          |
              +-----------+-----------+
              |                       |
        Host Browser             Participant Browsers
              |                 /        |        \
              |               phone    laptop    tablet
              |                  \        |        /
              +-------------------+-------+-------+
                                  |
                           Local Web Server
                           /             \
                    REST/HTTP          WebSocket
                         |                 |
                    Room/Auth       Real-time events
                         |                 |
                         +--------+--------+
                                  |
                              WebRTC
                         (optional media)
```

### Important distinction

Do NOT send the host's webcam/mic/video through the application server unless necessary.

For webcam/mic, use **WebRTC peer-to-peer media** where practical.

For the movie/video itself:

- A public URL can be played by browsers if the source permits browser playback/CORS.
- A local video file should initially be served by the local server from the host's browser upload/share session, rather than trying to transmit the entire file through WebRTC.
- The server can expose a temporary room-scoped media URL to participants.
- Playback synchronization should use WebSocket events and timestamps rather than repeatedly streaming video through WebSocket.

This keeps the initial system considerably simpler.

---

# 3. Suggested technology stack

## Frontend

- React
- TypeScript
- Vite
- HTML5 `<video>`
- WebSocket client
- WebRTC APIs
- MediaDevices API for webcam/microphone
- Responsive CSS

## Backend

- Python
- FastAPI
- Uvicorn
- WebSocket support
- Pydantic
- SQLite for persistent room metadata if persistence is desired
- In-memory state for the first prototype

## Local media

- Host uploads/selects a video file.
- Backend stores it temporarily.
- Backend exposes it only to members of that room.
- Add cleanup when the room expires.

## Optional later infrastructure

- Redis for multi-instance WebSocket state
- PostgreSQL for production persistence
- Object storage for uploaded media
- TURN server for WebRTC across difficult networks
- Reverse proxy such as Nginx/Caddy
- Docker for deployment

---

# 4. MVP scope

Build the first version in these milestones.

## Phase 0 — Project setup

Create:

```text
watch-together/
├── frontend/
├── backend/
├── README.md
├── implementation_plan.md
└── .gitignore
```

Set up:

- React + TypeScript + Vite frontend
- FastAPI backend
- local development scripts
- environment configuration
- basic API health check

Success criteria:

- frontend opens in browser
- backend starts locally
- frontend can communicate with backend

---

# 5. Phase 1 — Room creation and joining

## Room creation

Host clicks:

> Create Room

Form:

- room name (optional)
- password protection toggle
- password (only when enabled)

Backend creates:

```text
room_id
room_password_hash
host_user_id
created_at
expires_at
```

Generate short, human-friendly room IDs.

Example:

```text
AB7K2Q
```

Avoid IDs that are difficult to distinguish such as:

```text
O / 0
I / l / 1
```

## Joining

Participant enters:

```text
Room ID
Password (if required)
Display name
```

Backend validates the request and returns a session/token.

## Roles

Start with:

```text
HOST
PARTICIPANT
```

A user should never be able to choose HOST from the client.

The server determines the role.

---

# 6. Phase 2 — Room UI

Create a responsive room page.

Suggested layout:

```text
+------------------------------------------------------+
| Room: AB7K2Q                    Host: Deepak          |
+------------------------------------------------------+
|                                                      |
|                VIDEO PLAYER                         |
|                                                      |
|                                                      |
+------------------------------------------------------+
| ▶  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  01:23:45       |
+------------------------------------------------------+
| Participants                                         |
|                                                      |
| [Deepak] [Rahul] [Priya] [Amit]                     |
|                                                      |
+------------------------------------------------------+
| 😂  ❤️  👍  😮  👏                                   |
+------------------------------------------------------+
```

For smaller screens:

```text
Video
Participants
Controls
Reactions
```

Do not overload the first UI with unnecessary features.

---

# 7. Phase 3 — Video sharing

Support two source types.

## A. Public video URL

Host selects:

> Share URL

Input:

```text
https://example.com/video.mp4
```

Backend validates the URL format and room broadcasts:

```json
{
  "type": "MEDIA_SOURCE_CHANGED",
  "sourceType": "URL",
  "url": "...",
  "version": 1
}
```

Client loads the source.

### Important limitation

A normal webpage URL is NOT automatically a playable video.

The MVP should document that URLs need to point to browser-playable media, for example:

```text
.mp4
.webm
```

Do not initially attempt to extract videos from arbitrary websites such as YouTube, Netflix, Prime Video, etc.

Those services have DRM, embedding restrictions and/or terms that make arbitrary synchronized playback technically and legally different from playing a normal media URL.

---

## B. Local video file

Host selects:

> Share Local Video

Browser sends the file to the backend.

Backend creates a temporary room media resource.

Example:

```text
/media/{room_id}/{media_id}
```

Participants receive:

```json
{
  "type": "MEDIA_SOURCE_CHANGED",
  "sourceType": "LOCAL_FILE",
  "mediaId": "abc123"
}
```

Participants then load the media URL.

### Security requirements

Never expose an arbitrary filesystem path.

Bad:

```text
C:\Users\Deepak\Movies\movie.mp4
```

Good:

```text
/media/AB7K2Q/abc123
```

Validate:

- file size
- MIME type
- extension
- room membership
- media ownership
- path traversal

Store uploads outside the frontend's static directory.

---

# 8. Phase 4 — Synchronized playback

This is the core feature.

Use the host as the playback authority.

The host broadcasts events:

```text
PLAY
PAUSE
SEEK
RATE_CHANGE
MEDIA_CHANGED
```

Example:

```json
{
  "type": "PLAY",
  "position": 123.42,
  "serverTime": 1750000000000
}
```

Participants calculate the expected playback position from the timestamp rather than blindly calling `play()` at whatever position they currently have.

## Sync model

Maintain:

```text
media_id
playing
position
playback_rate
updated_at
```

When a participant joins:

1. receive current playback state
2. calculate current position
3. load media
4. seek to position
5. play/pause accordingly

## Drift correction

Every few seconds, compare:

```text
expectedPosition
actualPosition
```

If drift is small:

```text
< 250ms
```

do nothing.

If drift is moderate:

```text
250ms - 1000ms
```

temporarily adjust playback rate.

If drift is large:

```text
> 1000ms
```

perform a seek.

This avoids constant visible seeking.

## Host controls

Initially:

- play
- pause
- seek
- playback speed
- change media

Participants should NOT control playback by default.

---

# 9. Phase 5 — Real-time communication

Use WebSockets.

Suggested endpoint:

```text
/ws/rooms/{room_id}
```

Messages should have a common envelope:

```json
{
  "type": "MESSAGE_TYPE",
  "requestId": "optional-id",
  "timestamp": 1750000000000,
  "payload": {}
}
```

Initial message types:

```text
ROOM_STATE
USER_JOINED
USER_LEFT

MEDIA_CHANGED

PLAY
PAUSE
SEEK
RATE_CHANGED

REACTION

CAMERA_PERMISSION_CHANGED
MIC_PERMISSION_CHANGED

WEBRTC_OFFER
WEBRTC_ANSWER
WEBRTC_ICE_CANDIDATE
```

---

# 10. Phase 6 — Reactions

Add quick reactions.

Initial set:

```text
❤️
😂
👍
😮
👏
🔥
```

When a participant clicks one:

```json
{
  "type": "REACTION",
  "payload": {
    "emoji": "😂",
    "userId": "user123"
  }
}
```

Server broadcasts it to the room.

Frontend displays a temporary floating animation.

Example:

```text
        😂
   ❤️       👍

              🔥
```

Do not persist reactions initially.

Add rate limiting to prevent spam.

Example:

```text
maximum 5 reactions / second / user
```

---

# 11. Phase 7 — Webcam and microphone

This should be implemented after video synchronization works.

## Permission model

There are two independent controls:

### Host setting

```text
Allow participant cameras: ON/OFF
Allow participant microphones: ON/OFF
```

### Participant setting

Browser permission + explicit participant action:

```text
[Turn Camera On]
[Turn Mic On]
```

Both conditions must be satisfied.

The host should be able to mute/remove a participant's media stream.

## WebRTC

Use:

```text
getUserMedia()
RTCPeerConnection
```

WebSocket is used only for signaling.

Example:

```text
Participant A
     |
     | WebRTC offer
     v
    Server
     |
     | WebRTC offer
     v
Participant B
```

The server should not carry the actual audio/video packets in the basic architecture.

---

# 12. WebRTC topology decision

For the LAN MVP, use a simple mesh architecture:

```text
Host
 ├── Participant A
 ├── Participant B
 └── Participant C
```

This is acceptable for small rooms.

Recommended initial room limit:

```text
8–10 people
```

Do NOT build an SFU immediately.

For larger rooms, later move to an SFU such as:

- LiveKit
- mediasoup
- Janus
- Pion-based infrastructure

An SFU becomes important because mesh WebRTC scales poorly as participant count grows.

---

# 13. Phase 8 — Participant video grid

When webcams are enabled:

```text
+-------------------------+
|        MOVIE            |
|                         |
+-------------------------+

+------+ +------+ +------+
| Host | | Rahul| | Priya|
+------+ +------+ +------+
```

The movie should remain the dominant element.

Allow:

- participant mute indicator
- camera-off avatar
- active speaker indicator
- host badge
- connection quality indicator

---

# 14. Phase 9 — Host controls

Host dashboard should include:

### Room

- copy room ID
- copy invite link
- change password
- lock room
- close room

### Participants

- see participants
- remove participant
- mute participant
- disable participant camera
- promote participant to co-host

### Media

- choose URL
- upload local video
- pause/play
- seek
- playback speed

### Permissions

- allow participant camera
- allow participant mic
- allow participant playback control

---

# 15. Phase 10 — LAN access

This is an explicit MVP requirement.

Do NOT bind the backend only to:

```text
127.0.0.1
```

Bind it to:

```text
0.0.0.0
```

Example:

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Frontend should also be reachable from LAN.

Example:

```text
http://192.168.1.20:5173
```

or, preferably, serve the built frontend from the backend:

```text
http://192.168.1.20:8000
```

The host machine's LAN IP can be discovered with:

```bash
ipconfig
```

on Windows.

Example:

```text
IPv4 Address: 192.168.1.20
```

Friends on the same network open:

```text
http://192.168.1.20:8000
```

## Windows firewall

The setup documentation should explain allowing the application port through Windows Firewall.

Do not disable the firewall globally.

---

# 16. LAN-specific security

Even though this is local, treat the LAN as untrusted.

Implement:

- room authorization
- random room IDs
- password hashing
- session tokens
- membership validation
- WebSocket authorization
- media authorization
- upload size limits
- MIME validation
- rate limiting
- cleanup of expired rooms/media

Never trust:

```text
room_id
user_id
role
media_id
```

provided by the browser.

---

# 17. State model

## Room

```text
Room
├── id
├── name
├── password_hash
├── host_user_id
├── created_at
├── expires_at
├── locked
├── allow_camera
├── allow_microphone
├── allow_participant_control
└── current_media_id
```

## User

```text
User
├── id
├── display_name
├── role
├── joined_at
├── camera_enabled
└── microphone_enabled
```

## Playback state

```text
PlaybackState
├── media_id
├── playing
├── position
├── playback_rate
└── updated_at
```

---

# 18. API design

Initial REST endpoints:

```text
POST   /api/rooms
POST   /api/rooms/{room_id}/join
GET    /api/rooms/{room_id}
POST   /api/rooms/{room_id}/media/url
POST   /api/rooms/{room_id}/media/upload
DELETE /api/rooms/{room_id}/media/{media_id}

PATCH  /api/rooms/{room_id}/settings
DELETE /api/rooms/{room_id}/participants/{user_id}
```

WebSocket:

```text
/ws/rooms/{room_id}?token=...
```

Keep the API small initially.

---

# 19. Suggested backend structure

```text
backend/
├── app/
│   ├── main.py
│   ├── config.py
│   │
│   ├── api/
│   │   ├── rooms.py
│   │   ├── media.py
│   │   └── participants.py
│   │
│   ├── websocket/
│   │   ├── manager.py
│   │   ├── handlers.py
│   │   └── messages.py
│   │
│   ├── models/
│   │   ├── room.py
│   │   ├── user.py
│   │   └── media.py
│   │
│   ├── services/
│   │   ├── room_service.py
│   │   ├── media_service.py
│   │   └── playback_service.py
│   │
│   └── security/
│       ├── auth.py
│       └── validation.py
│
├── tests/
├── uploads/
└── requirements.txt
```

---

# 20. Suggested frontend structure

```text
frontend/
├── src/
│   ├── components/
│   │   ├── VideoPlayer.tsx
│   │   ├── ParticipantGrid.tsx
│   │   ├── ParticipantTile.tsx
│   │   ├── ReactionBar.tsx
│   │   ├── ChatPanel.tsx
│   │   └── HostControls.tsx
│   │
│   ├── pages/
│   │   ├── Home.tsx
│   │   ├── CreateRoom.tsx
│   │   ├── JoinRoom.tsx
│   │   └── Room.tsx
│   │
│   ├── hooks/
│   │   ├── useWebSocket.ts
│   │   ├── usePlaybackSync.ts
│   │   └── useWebRTC.ts
│   │
│   ├── services/
│   │   ├── api.ts
│   │   ├── websocket.ts
│   │   └── webrtc.ts
│   │
│   ├── types/
│   │   └── room.ts
│   │
│   └── App.tsx
│
└── package.json
```

---

# 21. Development order

Build in exactly this order to reduce debugging complexity.

### Milestone 1

Backend health endpoint + frontend shell.

### Milestone 2

Create room + join room.

### Milestone 3

WebSocket connection + participant list.

### Milestone 4

Host loads a local video and participants can play it.

### Milestone 5

Synchronized play/pause/seek.

### Milestone 6

URL-based video source.

### Milestone 7

Reactions.

### Milestone 8

Host permission controls.

### Milestone 9

WebRTC webcam.

### Milestone 10

WebRTC microphone.

### Milestone 11

Host participant controls.

### Milestone 12

LAN packaging and testing.

Do not start WebRTC before the synchronized video experience is stable.

---

# 22. Testing plan

## Room tests

- create open room
- create password room
- wrong password
- invalid room
- room locking
- host disconnect
- participant disconnect

## Playback tests

- host play
- host pause
- host seek
- late participant joining
- participant refresh
- network delay
- video buffering
- changing media
- URL media
- local media

## Reaction tests

- multiple simultaneous reactions
- reaction rate limit
- reconnect
- room isolation

## WebRTC tests

- camera permission denied
- microphone permission denied
- camera toggle
- mic toggle
- host disables camera
- host disables mic
- participant disconnect
- reconnection
- multiple participants

## LAN tests

Test with:

- Windows laptop
- Android phone
- iPhone/iPad if available
- another laptop

Verify:

- same LAN access
- Wi-Fi isolation issues
- firewall behavior
- responsive UI
- video playback
- WebRTC connectivity

---

# 23. Important browser/security consideration

Local LAN deployment is straightforward for HTTP video playback, but browser media APIs have security requirements.

In particular, webcam/microphone access can be affected by the browser's secure-context rules.

For development, `localhost` is treated specially, but another device accessing:

```text
http://192.168.x.x
```

may not behave the same way for camera/microphone permissions.

Therefore, before declaring LAN WebRTC complete, test secure-context behavior on the actual target devices.

A good next step is to support local HTTPS using a development certificate, or eventually use a proper HTTPS domain when internet-hosted.

Do not build the entire application around the assumption that plain HTTP LAN access will always allow camera/mic APIs.

---

# 24. Future feature ideas

Once the MVP works, this could become much more fun.

## Chat

Add room chat:

```text
Rahul: 😂😂
Priya: bro this scene
Amit: wait WHAT
```

Support:

- emoji
- GIFs
- reply
- mentions
- message timestamps

---

## Watch party reactions

Instead of only displaying reactions:

```text
😂 😂 ❤️ 🔥
```

make them appear at the same point in the movie timeline.

Example:

```text
01:42:15

😂  18 reactions
🔥  7 reactions
```

Later show a "most reacted moments" timeline.

---

## Synchronized subtitles

Host uploads:

```text
movie.mp4
movie.srt
```

The server distributes the subtitle file and keeps subtitle timing synchronized.

---

## Polls

Host can ask:

> Should we watch another movie?

Options:

```text
Yes
No
Absolutely
```

---

## Room voting

Participants vote on:

- next movie
- next episode
- snack choice
- which game to play

---

## Co-hosts

Allow the host to promote trusted participants.

---

## Host handoff

If the host leaves:

```text
Host disconnected.

[Take over room]
```

or automatically select another participant.

---

## Party mode

Add:

- music
- animated reactions
- sound effects
- confetti
- virtual backgrounds
- custom room themes

---

## Karaoke mode

For music videos:

- synchronized lyrics
- microphone sharing
- reactions
- scoring

---

## Trivia mode

Pause the movie and show a question.

Everyone answers.

Example:

> Who do you think is going to enter the room?

Then reveal the result.

---

## Spoiler protection

Allow participants to mark messages:

```text
⚠️ Spoiler
```

Hide spoiler text until clicked.

---

## Presence

Show:

```text
🟢 Rahul — Watching
🟢 Priya — Paused
🟡 Amit — Buffering
🔴 Sam — Disconnected
```

---

## Watch history

For private rooms:

```text
Recently watched
Continue watching
```

This becomes more useful if the application eventually supports user accounts.

---

# 25. Bigger future architecture

If the project becomes popular, evolve toward:

```text
                    CDN
                     |
                Media Storage
                     |
                 API Server
                /          \
          PostgreSQL       Redis
                              |
                       WebSocket Layer
                              |
                             SFU
                    /      |      |      \
                 User     User   User    User
```

Use an SFU for webcam/mic instead of peer-to-peer mesh.

Use object storage + CDN for large video files.

Use Redis for cross-server room state and WebSocket fanout.

---

# 26. Features to deliberately NOT build initially

Avoid scope explosion.

Do NOT initially build:

- user accounts
- social profiles
- recommendation engine
- mobile apps
- arbitrary YouTube/Netflix integration
- recording
- AI moderation
- public room discovery
- payments
- large-room broadcasting
- production-grade multi-region infrastructure

First make:

> "Five friends on my Wi-Fi can open a browser, join my room, and watch a video together with synchronized playback and reactions."

rock solid.

---

# 27. Definition of done for LAN MVP

The MVP is complete when all of these work:

- [ ] Host creates room
- [ ] Open/password room works
- [ ] Participants join using room ID
- [ ] Host is correctly identified
- [ ] Participant list updates in real time
- [ ] Host shares local video
- [ ] Participants can watch it
- [ ] Host play/pause synchronizes
- [ ] Host seeking synchronizes
- [ ] Late joiners synchronize correctly
- [ ] Host can share a browser-playable video URL
- [ ] Reactions work in real time
- [ ] Host can enable/disable participant camera
- [ ] Host can enable/disable participant mic
- [ ] Participant explicitly controls their own camera/mic
- [ ] WebRTC works between LAN devices
- [ ] Host can remove participants
- [ ] Room closes cleanly
- [ ] LAN devices can access the application
- [ ] Basic upload/security validation works
- [ ] No arbitrary filesystem access is exposed

---

# 28. Recommended implementation principle

Keep three systems logically separate:

```text
                 WATCH-TOGETHER
                       |
       +---------------+----------------+
       |               |                |
    Playback        Signaling        Media
       |               |                |
   HTML video       WebSocket         WebRTC
       |               |                |
 play/pause/seek   room events       camera/mic
```

This separation will make the project much easier to debug and will make the eventual move from LAN → internet hosting much less painful.

The first goal is not to build "Netflix with video chat."

The first goal is:

> **A fast, simple virtual couch for friends on the same network.**
