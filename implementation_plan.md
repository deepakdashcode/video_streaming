# Video Sharing Platform (LAN Watch Together) - Implementation Plan

## Overview & Plan Summary
We are building a locally hosted, browser-based "Watch Together" platform that allows friends on the same LAN network to create/join rooms, watch synchronized video streams (either local video file uploads or direct browser-playable URLs), send floating emoji reactions, and share optional webcam/mic feeds via WebRTC.

### Core Architectural Concepts
1. **Host Control & Sync Model**: The host controls playback actions (play, pause, seek, playback rate). The server acts as the source of truth for timestamps. Clients auto-adjust timing via drift correction algorithms (playback rate adjustment for small drift `<1000ms`, hard seek for larger drift).
2. **Local Video Streaming**: Host can share a local video file (`.mp4`, `.webm`). The file is uploaded to the local backend server, which exposes a chunked byte-range REST endpoint (`/api/rooms/{id}/media/{media_id}`) so participants can stream seamlessly.
3. **Real-time Pipeline**: A single WebSocket connection per client handles room updates, playback synchronization events, live emoji reactions, and WebRTC signaling (SDP offer/answer, ICE candidates).
4. **WebRTC Mesh Network**: For low latency cam/mic sharing up to 8–10 participants without requiring an external SFU server.

---

## Tech Stack Discussion & Options

### Frontend
- **Core**: React 18/19 with TypeScript and Vite.
- **Styling**: Dark mode design system with modern glassmorphism, gradient accents, and responsive layout.
- **Icons & Motion**: Lucide React / CSS animations for floating reaction particles.
- **State & Hooks**: Custom React hooks (`useWebSocket`, `usePlaybackSync`, `useWebRTC`).

### Backend Options (For Discussion)
- **Option A: Python + FastAPI (Original Document Choice)**
  - *Advantages*: Native support for `StreamingResponse` with HTTP byte-range requests for large local video files, robust WebSocket handling, fast prototyping with Pydantic validation.
  - *Disadvantages*: Requires Python 3.10+ runtime and FastAPI/uvicorn dependencies.
- **Option B: Node.js + Express / Fastify with TypeScript (Alternative Choice)**
  - *Advantages*: Unified TypeScript language across frontend and backend, shared model types, simple package management (`npm`).
  - *Disadvantages*: Native range-request video streaming code requires handling `fs.createReadStream` headers manually.

> **Recommendation**: **FastAPI (Python)** or **Node.js (TypeScript)** are both standard and well-suited. FastAPI is slightly cleaner for local video file byte streaming, while Node.js keeps the entire project in TypeScript.

---

## User Review Required

> [!IMPORTANT]
> Please confirm your tech stack preferences:
> 1. **Backend Stack**: Do you prefer **FastAPI (Python)** or **Node.js / Express (TypeScript)**?
> 2. **Frontend Styling**: Do you prefer **Vanilla CSS (Custom tokens, Glassmorphism)** or **Tailwind CSS**?

---

## Proposed File Structure & Implementation Steps

### Directory Layout
```text
VideoSharing/
├── backend/
│   ├── app/
│   │   ├── main.py (or server.ts)
│   │   ├── config.py
│   │   ├── api/          # Room & Media REST endpoints
│   │   ├── websocket/    # WebSocket connection manager & event handlers
│   │   ├── services/     # Room state & media file manager
│   │   └── models/       # Data validation schemas
│   └── uploads/          # Ephemeral local video storage
├── frontend/
│   ├── src/
│   │   ├── components/   # VideoPlayer, ParticipantGrid, ReactionsBar, HostControls
│   │   ├── pages/        # Home, CreateRoom, JoinRoom, Room
│   │   ├── hooks/        # useWebSocket, usePlaybackSync, useWebRTC
│   │   ├── services/     # API & WS services
│   │   └── App.tsx
│   └── package.json
```

---

## Proposed Milestones & Phased Execution

### Phase 1: Foundation & Backend Setup
- Initialize Frontend (Vite + React + TS) and Backend (FastAPI / Express).
- Implement Room creation, join authentication, and password verification endpoints.
- Store room session tokens.

### Phase 2: Core Watch Room UI & Video Player
- Build responsive Watch Room UI layout (Video Player primary view, Sidebar for participants, Host Controls drawer).
- Implement HTML5 `<video>` component with Host control overlay.

### Phase 3: WebSocket Engine & Playback Synchronization
- Setup WebSocket server & client hub `/ws/rooms/{room_id}`.
- Implement server-timestamp based sync protocol (`PLAY`, `PAUSE`, `SEEK`, `RATE_CHANGE`).
- Add client-side drift detection and automatic rate/seek adjustment.

### Phase 4: Local Video File Streaming & URL Sharing
- Add Host local file selection & multipart upload endpoint.
- Implement HTTP Byte-Range HTTP 206 streaming for local video files.
- Support direct browser-playable public URLs (`.mp4`/`.webm`).

### Phase 5: Floating Emoji Reactions & Participant Grid
- Build real-time reaction broadcasting via WebSockets with animated CSS particle effects.
- Implement participant status cards (Host badge, active speaker indicator, mute states).

### Phase 6: WebRTC Webcam & Microphone Sharing
- Implement WebRTC mesh peer connection signaling over WebSocket.
- Add host controls to turn participant camera/mic allowance ON or OFF.
- Add explicit user permission toggles for mic/cam media streams.

### Phase 7: LAN Deployment & Binding
- Configure backend to bind to `0.0.0.0` for local LAN IP access (`http://192.168.x.x:port`).
- Provide simple LAN startup runner scripts.

---

## Verification Plan

### Automated Verification
- Endpoint unit tests for room creation, password validation, and WebSocket state connection.
- HTTP Range Header byte-chunking tests for video streaming.

### Manual Verification
- Test sync timing between two side-by-side browser windows (Host play/pause/seek vs Participant drift).
- Stream local `.mp4` file to participant browser.
- Test WebRTC media feeds and reaction animations.
- Test mobile/tablet access over local LAN IP.
