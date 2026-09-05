import React from 'react';
import type { FloatingReaction } from '../types';

interface ReactionsBarProps {
  reactions: FloatingReaction[];
  onSendReaction: (emoji: string) => void;
}

const EMOJIS = ['❤️', '😂', '👍', '😮', '👏', '🔥'];

export const ReactionsBar: React.FC<ReactionsBarProps> = ({ reactions, onSendReaction }) => {
  return (
    <div style={{ position: 'relative', width: '100%' }}>
      {/* Floating particles layer */}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 50 }}>
        {reactions.map((r) => (
          <div
            key={r.id}
            className="reaction-particle"
            style={{ left: `${r.left}%` }}
          >
            {r.emoji}
            <span style={{ fontSize: '0.65rem', display: 'block', textShadow: '0 2px 4px rgba(0,0,0,0.8)', color: 'white', textAlign: 'center', marginTop: '-4px' }}>
              {r.user_name}
            </span>
          </div>
        ))}
      </div>

      {/* Emoji picker bar */}
      <div className="glass-panel" style={{ padding: '0.65rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.85rem' }}>
        {EMOJIS.map((emoji) => (
          <button
            key={emoji}
            onClick={() => onSendReaction(emoji)}
            className="emoji-picker-btn"
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 'var(--radius-md)',
              fontSize: '1.4rem',
              padding: '0.35rem 0.75rem',
              cursor: 'pointer',
              transition: 'transform 0.15s cubic-bezier(0.175, 0.885, 0.32, 1.275), background 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.25) translateY(-4px)';
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1) translateY(0)';
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
            }}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
};
