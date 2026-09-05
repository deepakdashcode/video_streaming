import React, { useState } from 'react';
import { Copy, Check, Users, LogOut, Settings, Tv } from 'lucide-react';
import type { UserRole } from '../types';

interface HeaderProps {
  roomName: string;
  roomId: string;
  userRole: UserRole;
  participantCount: number;
  isConnected: boolean;
  onOpenSettings: () => void;
  onLeaveRoom: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  roomName,
  roomId,
  userRole,
  participantCount,
  isConnected,
  onOpenSettings,
  onLeaveRoom,
}) => {
  const [copied, setCopied] = useState(false);

  const copyInviteLink = () => {
    const link = `${window.location.origin}?room=${roomId}`;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(link).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }).catch(() => fallbackCopy(link));
    } else {
      fallbackCopy(link);
    }
  };

  const fallbackCopy = (text: string) => {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand('copy');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      alert(`Room Invite Link: ${text}`);
    }
    document.body.removeChild(textArea);
  };

  return (
    <header className="glass-panel header-container">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
        <div style={{
          background: 'var(--accent-gradient)',
          padding: '0.5rem',
          borderRadius: '10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)'
        }}>
          <Tv size={22} color="white" />
        </div>
        <div>
          <h1 className="header-title-text" style={{ fontFamily: 'var(--font-heading)', fontSize: '1.25rem', fontWeight: 700, lineHeight: 1.2 }}>
            {roomName}
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginTop: '0.2rem', flexWrap: 'wrap' }}>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              fontSize: '0.75rem',
              color: isConnected ? '#4ade80' : '#f87171',
              fontWeight: 600
            }}>
              <span style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: isConnected ? '#22c55e' : '#ef4444',
                display: 'inline-block',
                boxShadow: isConnected ? '0 0 8px #22c55e' : 'none'
              }} />
              {isConnected ? 'LIVE' : 'DISCONNECTED'}
            </span>
            <span style={{ color: 'var(--border-color)' }}>•</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Room Code: <strong style={{ color: 'var(--text-main)', letterSpacing: '1px' }}>{roomId}</strong>
            </span>
          </div>
        </div>
      </div>

      <div className="header-actions">
        <button
          className="btn-secondary"
          onClick={copyInviteLink}
          style={{ fontSize: '0.85rem', padding: '0.5rem 0.9rem' }}
          title="Copy Room Link"
        >
          {copied ? <Check size={16} color="#4ade80" /> : <Copy size={16} />}
          {copied ? 'Copied!' : 'Copy Code'}
        </button>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.4rem',
          background: 'rgba(255,255,255,0.05)',
          padding: '0.4rem 0.75rem',
          borderRadius: 'var(--radius-md)',
          fontSize: '0.85rem',
          color: 'var(--text-muted)'
        }}>
          <Users size={16} color="var(--accent-glow)" />
          <strong style={{ color: 'var(--text-main)' }}>{participantCount}</strong>
        </div>

        {userRole === 'HOST' && (
          <button
            className="btn-secondary"
            onClick={onOpenSettings}
            style={{ padding: '0.5rem 0.75rem' }}
            title="Host Settings"
          >
            <Settings size={18} />
          </button>
        )}

        <button
          className="btn-secondary"
          onClick={onLeaveRoom}
          style={{ padding: '0.5rem 0.75rem', color: '#f87171', borderColor: 'rgba(239, 68, 68, 0.2)' }}
          title="Leave Room"
        >
          <LogOut size={18} />
        </button>
      </div>
    </header>
  );
};
