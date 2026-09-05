import React from 'react';
import { Lock, Unlock, Camera, Mic, Sliders, X } from 'lucide-react';
import type { RoomSettings } from '../types';

interface HostControlsProps {
  settings: RoomSettings;
  onUpdateSettings: (newSettings: Partial<RoomSettings>) => void;
  onClose: () => void;
}

export const HostControls: React.FC<HostControlsProps> = ({
  settings,
  onUpdateSettings,
  onClose,
}) => {
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: 'rgba(0,0,0,0.75)',
      backdropFilter: 'blur(8px)',
      zIndex: 1000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1rem'
    }}>
      <div className="glass-panel" style={{ width: '100%', maxWidth: '440px', padding: '1.75rem', position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'white' }}>
            <Sliders size={20} color="var(--accent-glow)" /> Host Controls
          </h3>
          <button className="btn-secondary" onClick={onClose} style={{ padding: '0.35rem' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
          {/* Lock Room Toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem', background: 'rgba(255,255,255,0.04)', borderRadius: 'var(--radius-md)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              {settings.locked ? <Lock size={20} color="#f87171" /> : <Unlock size={20} color="#4ade80" />}
              <div>
                <strong style={{ fontSize: '0.9rem', display: 'block', color: 'white' }}>Lock Room</strong>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Prevent new users from joining</span>
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.locked}
              onChange={(e) => onUpdateSettings({ locked: e.target.checked })}
              style={{ width: 18, height: 18, accentColor: 'var(--accent-primary)', cursor: 'pointer' }}
            />
          </div>

          {/* Allow Camera */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem', background: 'rgba(255,255,255,0.04)', borderRadius: 'var(--radius-md)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <Camera size={20} color="var(--accent-glow)" />
              <div>
                <strong style={{ fontSize: '0.9rem', display: 'block', color: 'white' }}>Participant Webcams</strong>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Allow participants to enable cameras</span>
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.allow_camera}
              onChange={(e) => onUpdateSettings({ allow_camera: e.target.checked })}
              style={{ width: 18, height: 18, accentColor: 'var(--accent-primary)', cursor: 'pointer' }}
            />
          </div>

          {/* Allow Mic */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem', background: 'rgba(255,255,255,0.04)', borderRadius: 'var(--radius-md)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <Mic size={20} color="var(--accent-glow)" />
              <div>
                <strong style={{ fontSize: '0.9rem', display: 'block', color: 'white' }}>Participant Microphones</strong>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Allow participants to speak</span>
              </div>
            </div>
            <input
              type="checkbox"
              checked={settings.allow_microphone}
              onChange={(e) => onUpdateSettings({ allow_microphone: e.target.checked })}
              style={{ width: 18, height: 18, accentColor: 'var(--accent-primary)', cursor: 'pointer' }}
            />
          </div>

          {/* Allow Participant Playback Control */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem', background: 'rgba(255,255,255,0.04)', borderRadius: 'var(--radius-md)' }}>
            <div>
              <strong style={{ fontSize: '0.9rem', display: 'block', color: 'white' }}>Shared Playback Control</strong>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Allow participants to pause/play/seek</span>
            </div>
            <input
              type="checkbox"
              checked={settings.allow_participant_control}
              onChange={(e) => onUpdateSettings({ allow_participant_control: e.target.checked })}
              style={{ width: 18, height: 18, accentColor: 'var(--accent-primary)', cursor: 'pointer' }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
