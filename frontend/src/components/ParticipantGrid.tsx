import React from 'react';
import { Camera, CameraOff, Mic, MicOff, Users } from 'lucide-react';
import type { User, UserRole } from '../types';
import { ParticipantTile } from './ParticipantTile';

interface ParticipantGridProps {
  selfUserId: string;
  userRole: UserRole;
  participants: Record<string, User>;
  localStream: MediaStream | null;
  peerStreams: Record<string, MediaStream>;
  isCamOn: boolean;
  isMicOn: boolean;
  allowCamera: boolean;
  allowMic: boolean;
  onToggleCam: () => void;
  onToggleMic: () => void;
  onKickParticipant?: (userId: string) => void;
}

export const ParticipantGrid: React.FC<ParticipantGridProps> = ({
  selfUserId,
  userRole,
  participants,
  localStream,
  peerStreams,
  isCamOn,
  isMicOn,
  allowCamera,
  allowMic,
  onToggleCam,
  onToggleMic,
  onKickParticipant,
}) => {
  const userList = Object.values(participants);

  return (
    <div className="glass-panel" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', height: '100%', gap: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
        <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-main)' }}>
          <Users size={18} color="var(--accent-glow)" /> Participants ({userList.length})
        </h3>

        {/* Cam & Mic Controls */}
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <button
            className="btn-secondary"
            onClick={onToggleCam}
            disabled={!allowCamera && userRole !== 'HOST'}
            style={{ padding: '0.4rem 0.6rem', fontSize: '0.8rem', background: isCamOn ? 'rgba(74, 222, 128, 0.15)' : 'rgba(255,255,255,0.06)' }}
            title={allowCamera ? 'Toggle Camera' : 'Camera disabled by host'}
          >
            {isCamOn ? <Camera size={16} color="#4ade80" /> : <CameraOff size={16} color="#94a3b8" />}
          </button>
          <button
            className="btn-secondary"
            onClick={onToggleMic}
            disabled={!allowMic && userRole !== 'HOST'}
            style={{ padding: '0.4rem 0.6rem', fontSize: '0.8rem', background: isMicOn ? 'rgba(74, 222, 128, 0.15)' : 'rgba(255,255,255,0.06)' }}
            title={allowMic ? 'Toggle Microphone' : 'Mic disabled by host'}
          >
            {isMicOn ? <Mic size={16} color="#4ade80" /> : <MicOff size={16} color="#f87171" />}
          </button>
        </div>
      </div>

      {/* Grid List */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: '0.75rem', overflowY: 'auto', flex: 1, paddingRight: '0.2rem' }}>
        {userList.map((user) => {
          const isSelf = user.id === selfUserId;
          const stream = isSelf ? (localStream || undefined) : peerStreams[user.id];

          return (
            <ParticipantTile
              key={user.id}
              user={user}
              isSelf={isSelf}
              stream={stream}
              userRole={userRole}
              onKick={onKickParticipant}
            />
          );
        })}
      </div>
    </div>
  );
};
