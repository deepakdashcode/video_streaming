import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize, Minimize, Upload, Link, Film, Zap, Monitor, Square } from 'lucide-react';
import type { PlaybackState } from '../types';
import { usePlaybackSync } from '../hooks/usePlaybackSync';

interface VideoPlayerProps {
  playbackState: PlaybackState;
  canControl: boolean;
  selfUserId?: string;
  screenStream?: MediaStream | null;
  peerStreams?: Record<string, MediaStream>;
  peerScreenStreams?: Record<string, MediaStream>;
  sendWSEvent: (type: string, payload?: any) => void;
  onSetUrl: (url: string) => void;
  onUploadFile: (file: File) => void;
  onStartScreenShare?: () => void;
  onStopScreenShare?: () => void;
  isVideoSharing?: boolean;
  capturedVideoRef?: React.MutableRefObject<HTMLVideoElement | null>;
  onStopVideoShare?: () => void;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  playbackState,
  canControl,
  selfUserId,
  screenStream,
  peerStreams = {},
  peerScreenStreams = {},
  sendWSEvent,
  onSetUrl,
  onUploadFile,
  onStartScreenShare,
  onStopScreenShare,
  isVideoSharing = false,
  capturedVideoRef,
  onStopVideoShare,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const activityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  const [showMediaModal, setShowMediaModal] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);

  const { handlePlay, handlePause, handleSeek, handleRateChange } = usePlaybackSync({
    videoRef,
    playbackState,
    canControl,
    sendWSEvent,
  });

  const isScreenShare = playbackState.source_type === 'SCREEN_SHARE';
  const isP2PVideo = playbackState.source_type === 'P2P_VIDEO';
  const isStreamedMedia = isScreenShare || isP2PVideo;
  const isSelfStreaming = isStreamedMedia && playbackState.sharer_user_id === selfUserId;

  // Determine active media stream for Screen Share / P2P Video
  const activeScreenStream = isSelfStreaming
    ? screenStream
    : playbackState.sharer_user_id
    ? (peerScreenStreams[playbackState.sharer_user_id] || peerStreams[playbackState.sharer_user_id])
    : null;

  const playScreenShareVideo = useCallback((node: HTMLVideoElement) => {
    if (!activeScreenStream) return;
    if (node.srcObject !== activeScreenStream) {
      node.srcObject = activeScreenStream;
    }
    const playPromise = node.play();
    if (playPromise !== undefined) {
      playPromise.catch((err) => {
        console.warn('[VideoPlayer] Screen share autoplay interrupted, attempting muted playback:', err);
        node.muted = true;
        setAutoplayBlocked(true);
        node.play().catch(console.error);
      });
    }
  }, [activeScreenStream]);

  // Callback Ref for video element to handle MediaStream assignment reliably
  const handleVideoRef = (node: HTMLVideoElement | null) => {
    videoRef.current = node;
    if (node && isStreamedMedia && !isSelfStreaming && activeScreenStream) {
      playScreenShareVideo(node);
    }
  };

  useEffect(() => {
    if (videoRef.current && isStreamedMedia && !isSelfStreaming && activeScreenStream) {
      playScreenShareVideo(videoRef.current);
    }
  }, [isStreamedMedia, isSelfStreaming, activeScreenStream, playScreenShareVideo]);

  // Track Fullscreen state changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFS = Boolean(document.fullscreenElement || (document as any).webkitFullscreenElement);
      setIsFullscreen(isFS);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, []);

  // Auto-hide controls after 3.5s inactivity while playing
  const handleUserActivity = useCallback(() => {
    setShowControls(true);
    if (activityTimerRef.current) clearTimeout(activityTimerRef.current);

    if (playbackState.playing) {
      activityTimerRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3500);
    }
  }, [playbackState.playing]);

  useEffect(() => {
    if (!playbackState.playing) {
      setShowControls(true);
      if (activityTimerRef.current) clearTimeout(activityTimerRef.current);
    } else {
      handleUserActivity();
    }
  }, [playbackState.playing, handleUserActivity]);

  // Construct absolute video source URL for files / web URLs
  const getVideoSrc = (): string | undefined => {
    if (isStreamedMedia || !playbackState.media_url) return undefined;
    if (playbackState.media_url.startsWith('http://') || playbackState.media_url.startsWith('https://')) {
      return playbackState.media_url;
    }
    const hostname = window.location.hostname || 'localhost';
    return `http://${hostname}:8000${playbackState.media_url}`;
  };

  const videoSrc = getVideoSrc();
  const hasActiveMedia = isStreamedMedia || Boolean(videoSrc);

  // Track time & duration
  const onTimeUpdate = () => {
    if (videoRef.current && !isStreamedMedia) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const onLoadedMetadata = () => {
    if (videoRef.current && !isStreamedMedia) {
      setDuration(videoRef.current.duration);
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const toggleFullscreen = () => {
    if (containerRef.current) {
      if (document.fullscreenElement || (document as any).webkitFullscreenElement) {
        if (document.exitFullscreen) {
          document.exitFullscreen();
        } else if ((document as any).webkitExitFullscreen) {
          (document as any).webkitExitFullscreen();
        }
      } else {
        if (containerRef.current.requestFullscreen) {
          containerRef.current.requestFullscreen().catch(console.warn);
        } else if ((containerRef.current as any).webkitRequestFullscreen) {
          (containerRef.current as any).webkitRequestFullscreen();
        }
      }
    }
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs)) return '00:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (urlInput.trim()) {
      onSetUrl(urlInput.trim());
      setShowMediaModal(false);
      setUrlInput('');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onUploadFile(e.target.files[0]);
      setShowMediaModal(false);
    }
  };

  return (
    <div
      ref={containerRef}
      className="glass-panel"
      onMouseMove={handleUserActivity}
      onTouchStart={handleUserActivity}
      style={{
        position: 'relative',
        borderRadius: isFullscreen ? 0 : 'var(--radius-lg)',
        overflow: 'hidden',
        backgroundColor: '#000',
        width: '100%',
        height: isFullscreen ? '100vh' : 'auto',
        aspectRatio: isFullscreen ? 'auto' : '16/9',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      {/* Video Stream Container */}
      <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#05070c' }}>
        {isStreamedMedia ? (
          isSelfStreaming ? (
            /* Host view: show dashboard for screen share, or local video for P2P video */
            isP2PVideo && capturedVideoRef?.current ? (
              /* P2P Video: show the actual video element with host controls */
              <video
                ref={(node) => {
                  videoRef.current = node;
                  if (node && capturedVideoRef.current) {
                    // Mirror the captured video source for host preview
                    node.src = capturedVideoRef.current.src;
                    node.currentTime = capturedVideoRef.current.currentTime;
                    node.playbackRate = capturedVideoRef.current.playbackRate;
                    if (!capturedVideoRef.current.paused) node.play().catch(() => {});
                  }
                }}
                onTimeUpdate={() => {
                  if (videoRef.current) {
                    setCurrentTime(videoRef.current.currentTime);
                    // Sync the captured (hidden) video
                    if (capturedVideoRef?.current && Math.abs(capturedVideoRef.current.currentTime - videoRef.current.currentTime) > 0.5) {
                      capturedVideoRef.current.currentTime = videoRef.current.currentTime;
                    }
                  }
                }}
                onLoadedMetadata={() => {
                  if (videoRef.current) setDuration(videoRef.current.duration);
                }}
                onPlay={() => {
                  if (capturedVideoRef?.current) capturedVideoRef.current.play().catch(() => {});
                }}
                onPause={() => {
                  if (capturedVideoRef?.current) capturedVideoRef.current.pause();
                }}
                onSeeked={() => {
                  if (videoRef.current && capturedVideoRef?.current) {
                    capturedVideoRef.current.currentTime = videoRef.current.currentTime;
                  }
                }}
                onRateChange={() => {
                  if (videoRef.current && capturedVideoRef?.current) {
                    capturedVideoRef.current.playbackRate = videoRef.current.playbackRate;
                  }
                }}
                playsInline
                onClick={() => {
                  if (canControl && videoRef.current) {
                    videoRef.current.paused ? videoRef.current.play() : videoRef.current.pause();
                  }
                  handleUserActivity();
                }}
                style={{ width: '100%', height: '100%', objectFit: 'contain', cursor: 'pointer' }}
              />
            ) : (
              /* Screen Share: Prevent Infinite Mirror Reflection for the Sharer */
              <div style={{
                textAlign: 'center',
                padding: '2.5rem 1.5rem',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '1rem',
                height: '100%',
                width: '100%',
                background: 'radial-gradient(circle at center, rgba(234, 179, 8, 0.15) 0%, rgba(5, 7, 12, 0.98) 75%)'
              }}>
                <div style={{
                  position: 'relative',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '76px',
                  height: '76px',
                  borderRadius: '50%',
                  background: 'rgba(234, 179, 8, 0.15)',
                  border: '2px solid rgba(234, 179, 8, 0.4)',
                  boxShadow: '0 0 30px rgba(234, 179, 8, 0.3)'
                }}>
                  <Monitor size={38} color="#fde047" />
                </div>

                <div>
                  <h3 style={{ fontSize: '1.3rem', color: 'white', fontWeight: 700, marginBottom: '0.35rem' }}>
                    You Are Sharing Your Screen
                  </h3>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', maxWidth: '440px', margin: '0 auto', lineHeight: '1.5' }}>
                    Local video preview is paused to prevent infinite mirror reflection. All participants in this room can see your live screen and hear internal system audio.
                  </p>
                </div>

                {onStopScreenShare && (
                  <button
                    className="btn-primary"
                    onClick={onStopScreenShare}
                    style={{
                      background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                      borderColor: '#ef4444',
                      padding: '0.6rem 1.3rem',
                      fontSize: '0.88rem',
                      fontWeight: 600,
                      marginTop: '0.5rem',
                      boxShadow: '0 4px 14px rgba(239, 68, 68, 0.4)'
                    }}
                  >
                    <Square size={16} /> Stop Sharing Screen
                  </button>
                )}
              </div>
            )
          ) : (
            <>
              <video
                ref={handleVideoRef}
                autoPlay
                playsInline
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
              {autoplayBlocked && (
                <button
                  className="btn-primary"
                  onClick={() => {
                    if (videoRef.current) {
                      videoRef.current.muted = false;
                      videoRef.current.play();
                      setAutoplayBlocked(false);
                    }
                  }}
                  style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    zIndex: 60,
                    padding: '0.75rem 1.25rem',
                    background: 'rgba(0,0,0,0.88)',
                    backdropFilter: 'blur(8px)',
                    border: '1px solid #fde047',
                    borderRadius: 'var(--radius-md)',
                    boxShadow: '0 0 24px rgba(234,179,8,0.4)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  <Volume2 size={18} color="#fde047" /> Click to Unmute {isP2PVideo ? 'Video' : 'Screen Share'} Audio
                </button>
              )}
            </>
          )
        ) : videoSrc ? (
          <video
            ref={videoRef}
            src={videoSrc}
            onTimeUpdate={onTimeUpdate}
            onLoadedMetadata={onLoadedMetadata}
            playsInline
            onClick={() => {
              if (canControl) {
                playbackState.playing ? handlePause() : handlePlay();
              }
              handleUserActivity();
            }}
            style={{ width: '100%', height: '100%', objectFit: 'contain', cursor: canControl ? 'pointer' : 'default' }}
          />
        ) : (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
            <Film size={56} style={{ margin: '0 auto 1rem', opacity: 0.4, color: 'var(--accent-glow)' }} />
            <h3 style={{ fontSize: '1.2rem', color: 'var(--text-main)', marginBottom: '0.5rem' }}>No Video Loaded</h3>
            <p style={{ fontSize: '0.9rem', marginBottom: '1.5rem' }}>
              {canControl ? 'Click below to load a video URL, local file, or screen share' : 'Waiting for host to share content...'}
            </p>
            {canControl && (
              <button className="btn-primary" onClick={() => setShowMediaModal(true)}>
                <Upload size={18} /> Select Video Source
              </button>
            )}
          </div>
        )}

        {/* Sync / Screen Share Live Badge */}
        {hasActiveMedia && (
          <div style={{
            position: 'absolute',
            top: '12px',
            left: '12px',
            background: 'rgba(0,0,0,0.65)',
            backdropFilter: 'blur(8px)',
            padding: '4px 12px',
            borderRadius: '20px',
            fontSize: '0.75rem',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            color: isStreamedMedia ? '#fde047' : '#a7f3d0',
            zIndex: 40,
            opacity: showControls ? 1 : 0,
            transition: 'opacity 0.3s ease'
          }}>
            {isStreamedMedia ? <Monitor size={14} color="#eab308" /> : <Zap size={13} color="#34d399" />}
            <span>
              {isScreenShare
                ? `LIVE SCREEN: ${playbackState.sharer_name || 'Sharer'}`
                : isP2PVideo
                ? `P2P VIDEO: ${playbackState.sharer_name || 'Sharer'}`
                : `SYNCED (${playbackState.playback_rate}x)`}
            </span>
          </div>
        )}
      </div>

      {/* Control Bar Overlay */}
      {hasActiveMedia && (
        <div style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 50,
          background: 'linear-gradient(to top, rgba(0,0,0,0.92), rgba(0,0,0,0.4) 70%, transparent)',
          padding: '1.25rem 1rem 0.85rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.6rem',
          opacity: showControls ? 1 : 0,
          pointerEvents: showControls ? 'auto' : 'none',
          transition: 'opacity 0.3s ease'
        }}>
          {/* Progress Seek Bar (Only for Videos, disabled during Live Screen Share) */}
          {(!isStreamedMedia || (isP2PVideo && isSelfStreaming)) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                {formatTime(currentTime)}
              </span>
              <input
                type="range"
                min={0}
                max={duration || 100}
                step={0.1}
                value={currentTime}
                disabled={!canControl && !isSelfStreaming}
                onChange={(e) => {
                  const newTime = parseFloat(e.target.value);
                  if (isP2PVideo && isSelfStreaming && videoRef.current) {
                    videoRef.current.currentTime = newTime;
                  } else {
                    handleSeek(newTime);
                  }
                }}
                style={{
                  flex: 1,
                  accentColor: 'var(--accent-primary)',
                  cursor: (canControl || isSelfStreaming) ? 'pointer' : 'not-allowed',
                  height: '6px'
                }}
              />
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                {formatTime(duration)}
              </span>
            </div>
          )}

          {/* Control Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
              {!isStreamedMedia && canControl ? (
                playbackState.playing ? (
                  <button className="btn-secondary" onClick={handlePause} style={{ padding: '0.4rem 0.75rem' }}>
                    <Pause size={18} />
                  </button>
                ) : (
                  <button className="btn-primary" onClick={handlePlay} style={{ padding: '0.4rem 0.75rem' }}>
                    <Play size={18} />
                  </button>
                )
              ) : isP2PVideo && isSelfStreaming ? (
                /* P2P Video host controls */
                <button
                  className="btn-secondary"
                  onClick={() => {
                    if (videoRef.current) {
                      videoRef.current.paused ? videoRef.current.play() : videoRef.current.pause();
                    }
                  }}
                  style={{ padding: '0.4rem 0.75rem' }}
                >
                  {videoRef.current?.paused ? <Play size={18} /> : <Pause size={18} />}
                </button>
              ) : isStreamedMedia ? (
                <span style={{ fontSize: '0.8rem', color: '#fde047', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Monitor size={15} /> {isP2PVideo ? 'P2P Video Live' : 'Screen Share Live'}
                </span>
              ) : (
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {playbackState.playing ? <Play size={14} color="#4ade80" /> : <Pause size={14} color="#f87171" />}
                  <span>{playbackState.playing ? 'Host Playing' : 'Host Paused'}</span>
                </div>
              )}

              <button className="btn-secondary" onClick={toggleMute} style={{ padding: '0.4rem' }}>
                {isMuted ? <VolumeX size={18} color="#f87171" /> : <Volume2 size={18} />}
              </button>

              <span style={{ fontSize: '0.85rem', color: 'var(--text-main)', fontWeight: 600, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {playbackState.title}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              {/* Stop Screen Share / P2P Video Button */}
              {isStreamedMedia && (isSelfStreaming || canControl) && (
                <button
                  className="btn-secondary"
                  onClick={() => {
                    if (isP2PVideo && onStopVideoShare) onStopVideoShare();
                    else if (onStopScreenShare) onStopScreenShare();
                  }}
                  style={{ color: '#f87171', borderColor: 'rgba(239,68,68,0.3)', fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}
                >
                  <Square size={14} /> {isP2PVideo ? 'Stop Video' : 'Stop Sharing'}
                </button>
              )}

              {!isStreamedMedia && canControl && (
                <select
                  value={playbackState.playback_rate}
                  onChange={(e) => handleRateChange(parseFloat(e.target.value))}
                  style={{
                    background: 'rgba(255,255,255,0.1)',
                    color: 'white',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '0.3rem 0.5rem',
                    fontSize: '0.8rem',
                    cursor: 'pointer'
                  }}
                >
                  <option value={0.5} style={{ background: '#111' }}>0.5x</option>
                  <option value={1.0} style={{ background: '#111' }}>1.0x</option>
                  <option value={1.25} style={{ background: '#111' }}>1.25x</option>
                  <option value={1.5} style={{ background: '#111' }}>1.5x</option>
                  <option value={2.0} style={{ background: '#111' }}>2.0x</option>
                </select>
              )}

              {canControl && (
                <button className="btn-secondary" onClick={() => setShowMediaModal(true)} style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem' }}>
                  <Upload size={14} /> Source
                </button>
              )}

              <button className="btn-secondary" onClick={toggleFullscreen} style={{ padding: '0.4rem' }} title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}>
                {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Select Video Source Modal */}
      {showMediaModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.85)',
          backdropFilter: 'blur(8px)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem'
        }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '480px', padding: '1.75rem' }}>
            <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.25rem', marginBottom: '1.25rem', color: 'white' }}>
              Select Video Source
            </h3>

            {/* Option 1: Screen Share with Internal Audio */}
            {onStartScreenShare && (
              <div style={{ marginBottom: '1.25rem' }}>
                <button
                  className="btn-primary"
                  onClick={() => {
                    setShowMediaModal(false);
                    onStartScreenShare();
                  }}
                  style={{ width: '100%', justifyContent: 'center', padding: '0.85rem' }}
                >
                  <Monitor size={20} /> Share Screen with System/Internal Audio
                </button>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', margin: '1rem 0', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
              <div style={{ flex: 1, height: '1px', background: 'var(--border-color)' }} />
              <span>OR SHARE MEDIA FILE / URL</span>
              <div style={{ flex: 1, height: '1px', background: 'var(--border-color)' }} />
            </div>

            {/* Option 2: Web Video URL */}
            <form onSubmit={handleUrlSubmit} style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                Direct Video URL (.mp4 / .webm)
              </label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="url"
                  placeholder="https://example.com/video.mp4"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  style={{
                    flex: 1,
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid var(--border-color)',
                    color: 'white',
                    padding: '0.65rem 0.85rem',
                    borderRadius: 'var(--radius-md)',
                    outline: 'none'
                  }}
                />
                <button type="submit" className="btn-primary">
                  <Link size={16} /> Load
                </button>
              </div>
            </form>

            {/* Option 3: Local Video Upload */}
            <div>
              <input
                type="file"
                ref={fileInputRef}
                accept="video/mp4,video/webm,video/mkv,video/mov"
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
              <button
                className="btn-secondary"
                onClick={() => fileInputRef.current?.click()}
                style={{ width: '100%', justifyContent: 'center', padding: '0.85rem' }}
              >
                <Upload size={18} color="var(--accent-glow)" /> Select Video File (.mp4 / .webm)
              </button>
            </div>

            <div style={{ marginTop: '1.5rem', textAlign: 'right' }}>
              <button className="btn-secondary" onClick={() => setShowMediaModal(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
