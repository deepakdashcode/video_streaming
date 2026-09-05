import React, { useState, useEffect } from 'react';
import { Monitor } from 'lucide-react';
import type { SessionData, Room, User, PlaybackState, RoomSettings, FloatingReaction, WSEvent } from '../types';
import { useWebSocket } from '../hooks/useWebSocket';
import { useWebRTC } from '../hooks/useWebRTC';
import { setMediaUrl, uploadLocalVideo, kickParticipant } from '../services/api';

import { Header } from '../components/Header';
import { VideoPlayer } from '../components/VideoPlayer';
import { ReactionsBar } from '../components/ReactionsBar';
import { ParticipantGrid } from '../components/ParticipantGrid';
import { HostControls } from '../components/HostControls';

interface RoomPageProps {
  session: SessionData;
  onLeave: () => void;
}

export const RoomPage: React.FC<RoomPageProps> = ({ session, onLeave }) => {
  const [room, setRoom] = useState<Room | null>(null);
  const [participants, setParticipants] = useState<Record<string, User>>({});
  const [playbackState, setPlaybackState] = useState<PlaybackState>({
    source_type: 'NONE',
    title: 'No Video Loaded',
    playing: false,
    position: 0,
    playback_rate: 1.0,
    updated_at: Date.now(),
  });
  const [settings, setSettings] = useState<RoomSettings>({
    locked: false,
    allow_camera: true,
    allow_microphone: true,
    allow_participant_control: false,
    allow_screen_share: false,
  });

  const [reactions, setReactions] = useState<FloatingReaction[]>([]);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [pendingShareRequest, setPendingShareRequest] = useState<{ userId: string; userName: string } | null>(null);

  const { isConnected, sendEvent, subscribe } = useWebSocket(session.room_id, session.token);

  // Initialize WebRTC
  const {
    localStream,
    screenStream,
    peerStreams,
    peerScreenStreams,
    isCamOn,
    isMicOn,
    isVideoSharing,
    toggleCamera,
    toggleMic,
    startScreenShare,
    stopScreenShare,
    startVideoShare,
    stopVideoShare,
    capturedVideoRef,
  } = useWebRTC({
    selfUserId: session.user_id,
    participants,
    sendWSEvent: sendEvent,
    subscribeWS: subscribe,
  });

  const isHost = session.role === 'HOST';
  const canControl = isHost || settings.allow_participant_control;

  // Handle incoming WebSocket events
  useEffect(() => {
    const unsubInit = subscribe('INIT_ROOM_STATE', (event: WSEvent) => {
      const initialRoom: Room = event.payload.room;
      setRoom(initialRoom);
      setParticipants(initialRoom.participants);
      setPlaybackState(initialRoom.playback_state);
      setSettings(initialRoom.settings);
    });

    const unsubPlayback = subscribe('PLAYBACK_STATE_CHANGED', (event: WSEvent) => {
      setPlaybackState(event.payload.playback_state);
    });

    const unsubMedia = subscribe('MEDIA_CHANGED', (event: WSEvent) => {
      setPlaybackState(event.payload.playback_state);
    });

    const unsubUserJoined = subscribe('USER_JOINED', (event: WSEvent) => {
      const newUser: User = event.payload.user;
      setParticipants((prev) => ({ ...prev, [newUser.id]: newUser }));
    });

    const unsubUserConnected = subscribe('USER_CONNECTED', (event: WSEvent) => {
      const user: User = event.payload.user;
      setParticipants((prev) => ({ ...prev, [user.id]: user }));
    });

    const unsubUserDisconnected = subscribe('USER_DISCONNECTED', (event: WSEvent) => {
      const { user_id } = event.payload;
      setParticipants((prev) => {
        const next = { ...prev };
        delete next[user_id];
        return next;
      });
    });

    const unsubUserLeft = subscribe('USER_LEFT', (event: WSEvent) => {
      const { user_id } = event.payload;
      setParticipants((prev) => {
        const next = { ...prev };
        delete next[user_id];
        return next;
      });
    });

    const unsubUserState = subscribe('USER_STATE_CHANGED', (event: WSEvent) => {
      const updatedUser: User = event.payload.user;
      setParticipants((prev) => ({ ...prev, [updatedUser.id]: updatedUser }));
    });

    const unsubSettings = subscribe('ROOM_SETTINGS_CHANGED', (event: WSEvent) => {
      setSettings(event.payload.settings);
    });

    const unsubReaction = subscribe('REACTION', (event: WSEvent) => {
      const { emoji, user_name } = event.payload;
      const newReaction: FloatingReaction = {
        id: Math.random().toString(36).substring(2, 9),
        emoji,
        user_name,
        left: 10 + Math.random() * 80,
      };
      setReactions((prev) => [...prev.slice(-15), newReaction]);
      setTimeout(() => {
        setReactions((prev) => prev.filter((r) => r.id !== newReaction.id));
      }, 2800);
    });

    const unsubKicked = subscribe('KICKED', () => {
      alert('You have been removed from the room by the host.');
      onLeave();
    });

    const unsubShareRequest = subscribe('SCREEN_SHARE_REQUEST_FROM_USER', (event: WSEvent) => {
      if (isHost) {
        setPendingShareRequest({
          userId: event.payload.requester_id || event.payload.user_id,
          userName: event.payload.requester_name || event.payload.user_name,
        });
      }
    });

    const unsubShareResponse = subscribe('SCREEN_SHARE_PERMISSION_RESPONSE', (event: WSEvent) => {
      if (event.payload.approved) {
        alert('Host approved your screen share request! Starting screen share...');
        startScreenShare();
      } else {
        alert(`Host denied your screen share request.`);
      }
    });

    return () => {
      unsubInit();
      unsubPlayback();
      unsubMedia();
      unsubUserJoined();
      unsubUserConnected();
      unsubUserDisconnected();
      unsubUserLeft();
      unsubUserState();
      unsubSettings();
      unsubReaction();
      unsubKicked();
      unsubShareRequest();
      unsubShareResponse();
    };
  }, [subscribe, onLeave, isHost, startScreenShare]);

  const handleStartScreenShare = () => {
    if (isHost || settings.allow_screen_share) {
      startScreenShare();
    } else {
      sendEvent('SCREEN_SHARE_REQUEST');
      alert('Screen share permission request sent to host. Waiting for approval...');
    }
  };

  const handleStopScreenShare = () => {
    stopScreenShare();
  };

  const handleSetUrl = async (url: string) => {
    try {
      await setMediaUrl(session.room_id, session.token, url);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleUploadFile = async (file: File) => {
    try {
      // Use P2P captureStream for local files (no upload to server)
      await startVideoShare(file);
    } catch (err: any) {
      // Fall back to server upload if P2P fails
      try {
        await uploadLocalVideo(session.room_id, session.token, file);
      } catch (uploadErr: any) {
        alert(uploadErr.message);
      }
    }
  };

  const handleSendReaction = (emoji: string) => {
    sendEvent('REACTION', { emoji });
  };

  const handleUpdateSettings = (newSettingsPartial: Partial<RoomSettings>) => {
    sendEvent('HOST_SETTINGS_UPDATE', {
      settings: { ...settings, ...newSettingsPartial },
    });
    setSettings((prev) => ({ ...prev, ...newSettingsPartial }));
  };

  const handleKickParticipant = async (targetUserId: string) => {
    try {
      await kickParticipant(session.room_id, session.token, targetUserId);
    } catch (err: any) {
      alert(err.message);
    }
  };

  return (
    <div style={{ padding: '1rem', maxWidth: '1600px', margin: '0 auto', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header Bar */}
      <Header
        roomName={session.room_name || room?.name || `Room ${session.room_id}`}
        roomId={session.room_id}
        userRole={session.role}
        participantCount={Object.keys(participants).length}
        isConnected={isConnected}
        onOpenSettings={() => setShowSettingsModal(true)}
        onLeaveRoom={onLeave}
      />

      {/* Main Container Layout */}
      <div className="room-layout-grid">
        {/* Left Side: Video Player & Reactions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' }}>
          <VideoPlayer
            playbackState={playbackState}
            canControl={canControl}
            selfUserId={session.user_id}
            screenStream={screenStream}
            peerStreams={peerStreams}
            peerScreenStreams={peerScreenStreams}
            sendWSEvent={sendEvent}
            onSetUrl={handleSetUrl}
            onUploadFile={handleUploadFile}
            onStartScreenShare={handleStartScreenShare}
            onStopScreenShare={handleStopScreenShare}
            isVideoSharing={isVideoSharing}
            capturedVideoRef={capturedVideoRef}
            onStopVideoShare={stopVideoShare}
          />
          <ReactionsBar reactions={reactions} onSendReaction={handleSendReaction} />
        </div>

        {/* Right Side: Participant Grid */}
        <div className="participant-grid-sidebar" style={{ height: 'calc(100vh - 120px)', position: 'sticky', top: '1rem' }}>
          <ParticipantGrid
            selfUserId={session.user_id}
            userRole={session.role}
            participants={participants}
            localStream={localStream}
            peerStreams={peerStreams}
            isCamOn={isCamOn}
            isMicOn={isMicOn}
            allowCamera={settings.allow_camera}
            allowMic={settings.allow_microphone}
            onToggleCam={() => toggleCamera()}
            onToggleMic={() => toggleMic()}
            onKickParticipant={handleKickParticipant}
          />
        </div>
      </div>

      {/* Host Settings Modal */}
      {showSettingsModal && (
        <HostControls
          settings={settings}
          onUpdateSettings={handleUpdateSettings}
          onClose={() => setShowSettingsModal(false)}
        />
      )}

      {/* Host Permission Request Modal */}
      {pendingShareRequest && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.8)',
          backdropFilter: 'blur(8px)',
          zIndex: 1100,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem'
        }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '420px', padding: '1.75rem', textAlign: 'center' }}>
            <Monitor size={40} color="#eab308" style={{ margin: '0 auto 1rem' }} />
            <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.2rem', color: 'white', marginBottom: '0.5rem' }}>
              Screen Share Request
            </h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
              <strong>{pendingShareRequest.userName}</strong> is requesting permission to share their screen with internal audio in this room.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
              <button
                className="btn-secondary"
                onClick={() => {
                  sendEvent('SCREEN_SHARE_RESPONSE', { requester_id: pendingShareRequest.userId, approved: false });
                  setPendingShareRequest(null);
                }}
                style={{ flex: 1, justifyContent: 'center' }}
              >
                Deny
              </button>
              <button
                className="btn-primary"
                onClick={() => {
                  sendEvent('SCREEN_SHARE_RESPONSE', { requester_id: pendingShareRequest.userId, approved: true });
                  setPendingShareRequest(null);
                }}
                style={{ flex: 1, justifyContent: 'center' }}
              >
                Approve
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

