import React, { useEffect, useRef } from 'react';
import { Camera, CameraOff, Mic, MicOff, Crown, UserX } from 'lucide-react';
import type { User, UserRole } from '../types';

interface ParticipantTileProps {
  user: User;
  isSelf: boolean;
  stream?: MediaStream;
  userRole: UserRole;
  onKick?: (userId: string) => void;
}

export const ParticipantTile: React.FC<ParticipantTileProps> = ({
  user,
  isSelf,
  stream,
  userRole,
  onKick,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const handleVideoRef = (node: HTMLVideoElement | null) => {
    videoRef.current = node;
    if (node && stream) {
      node.srcObject = stream;
      node.play().catch(() => {});
    }
  };

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }
  }, [stream, user.camera_enabled]);

  const isHostUser = user.role === 'HOST';

  return (
    <div className="glass-panel" style={{ position: 'relative', overflow: 'hidden', borderRadius: 'var(--radius-md)', background: '#0a0f1d', aspectRatio: '4/3', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      {/* Video Feed */}
      <video
        ref={handleVideoRef}
        autoPlay
        playsInline
        muted={isSelf}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform: isSelf ? 'scaleX(-1)' : 'none',
          display: user.camera_enabled && stream ? 'block' : 'none'
        }}
      />

      {(!user.camera_enabled || !stream) && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{
            width: 48,
            height: 48,
            borderRadius: '50%',
            background: isHostUser ? 'var(--accent-gradient)' : 'rgba(255,255,255,0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: '1.2rem',
            color: 'white'
          }}>
            {user.display_name.charAt(0).toUpperCase()}
          </div>
        </div>
      )}

      {/* Host Badge */}
      {isHostUser && (
        <div style={{
          position: 'absolute',
          top: '6px',
          left: '6px',
          background: 'rgba(234, 179, 8, 0.2)',
          border: '1px solid rgba(234, 179, 8, 0.4)',
          borderRadius: '12px',
          padding: '2px 8px',
          fontSize: '0.7rem',
          fontWeight: 700,
          color: '#fde047',
          display: 'flex',
          alignItems: 'center',
          gap: '3px'
        }}>
          <Crown size={12} /> HOST
        </div>
      )}

      {/* Host Kick Option */}
      {userRole === 'HOST' && !isSelf && onKick && (
        <button
          onClick={() => onKick(user.id)}
          style={{
            position: 'absolute',
            top: '6px',
            right: '6px',
            background: 'rgba(239, 68, 68, 0.2)',
            border: 'none',
            color: '#f87171',
            borderRadius: '50%',
            width: 24,
            height: 24,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          title="Kick Participant"
        >
          <UserX size={13} />
        </button>
      )}

      {/* Bottom Info Bar */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        background: 'linear-gradient(to top, rgba(0,0,0,0.85), transparent)',
        padding: '0.4rem 0.6rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {user.display_name} {isSelf && '(You)'}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          {user.camera_enabled ? <Camera size={13} color="#4ade80" /> : <CameraOff size={13} color="#94a3b8" />}
          {user.microphone_enabled ? <Mic size={13} color="#4ade80" /> : <MicOff size={13} color="#f87171" />}
        </div>
      </div>
    </div>
  );
};
