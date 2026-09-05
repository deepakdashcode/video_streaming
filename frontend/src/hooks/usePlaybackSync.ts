import { useEffect, useRef, useCallback } from 'react';
import type { PlaybackState } from '../types';

interface UsePlaybackSyncOptions {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  playbackState: PlaybackState;
  canControl: boolean;
  sendWSEvent: (type: string, payload?: any) => void;
}

export function usePlaybackSync({
  videoRef,
  playbackState,
  canControl,
  sendWSEvent,
}: UsePlaybackSyncOptions) {
  const isSelfAction = useRef(false);

  // Calculate expected current position in seconds
  const calculateExpectedPosition = useCallback((state: PlaybackState): number => {
    if (!state.playing) return state.position;
    const elapsedSeconds = (Date.now() - state.updated_at) / 1000;
    return Math.max(0, state.position + elapsedSeconds * (state.playback_rate || 1.0));
  }, []);

  // Synchronize player with state
  const syncPlayer = useCallback(() => {
    const video = videoRef.current;
    if (!video || !playbackState.media_url) return;

    const targetRate = playbackState.playback_rate || 1.0;

    // 1. Play / Pause state sync (Applies to both host & viewers)
    if (playbackState.playing && video.paused) {
      video.play().catch((err) => console.warn('[Sync] Autoplay prevented:', err));
    } else if (!playbackState.playing && !video.paused) {
      video.pause();
    }

    // 2. Base playback speed sync
    if (video.playbackRate !== targetRate && !canControl) {
      video.playbackRate = targetRate;
    }

    // 3. Drift Correction — ONLY for Viewers (non-controllers).
    // The Host/Controller is the master clock and MUST NOT be drift-checked or force-seeked!
    if (!canControl) {
      // Do NOT check or correct drift if video is buffering, seeking, or hasn't loaded metadata
      if (video.readyState < 3 || video.seeking) {
        return;
      }

      const expectedPos = calculateExpectedPosition(playbackState);
      const actualPos = video.currentTime;
      const drift = Math.abs(expectedPos - actualPos);

      if (drift > 3.0) {
        // Large drift: hard seek to expected position
        console.log(`[Sync] Large drift (${drift.toFixed(2)}s). Seeking to ${expectedPos.toFixed(2)}s`);
        video.currentTime = expectedPos;
        video.playbackRate = targetRate;
      } else if (drift > 0.6 && playbackState.playing) {
        // Moderate drift: subtle rate adjustment (1.04x or 0.96x) to catch up smoothly without seeking
        const catchUpRate = expectedPos > actualPos ? 1.04 : 0.96;
        video.playbackRate = targetRate * catchUpRate;
      } else {
        // In tight sync: reset to target playback rate
        if (video.playbackRate !== targetRate) {
          video.playbackRate = targetRate;
        }
      }
    }
  }, [videoRef, playbackState, canControl, calculateExpectedPosition]);

  // Sync immediately whenever playback state or control status changes
  useEffect(() => {
    syncPlayer();
  }, [syncPlayer]);

  // Periodic background drift check (every 4 seconds) — only active for viewers while playing
  useEffect(() => {
    if (canControl || !playbackState.playing) return;
    const interval = setInterval(syncPlayer, 4000);
    return () => clearInterval(interval);
  }, [canControl, playbackState.playing, syncPlayer]);

  // Host Action Triggers
  const handlePlay = useCallback(() => {
    if (!canControl || isSelfAction.current) return;
    const video = videoRef.current;
    if (!video) return;

    isSelfAction.current = true;
    sendWSEvent('PLAY', { position: video.currentTime });
    setTimeout(() => { isSelfAction.current = false; }, 300);
  }, [canControl, sendWSEvent, videoRef]);

  const handlePause = useCallback(() => {
    if (!canControl || isSelfAction.current) return;
    const video = videoRef.current;
    if (!video) return;

    isSelfAction.current = true;
    sendWSEvent('PAUSE', { position: video.currentTime });
    setTimeout(() => { isSelfAction.current = false; }, 300);
  }, [canControl, sendWSEvent, videoRef]);

  const handleSeek = useCallback((targetTime: number) => {
    if (!canControl) return;
    isSelfAction.current = true;
    sendWSEvent('SEEK', { position: targetTime });
    setTimeout(() => { isSelfAction.current = false; }, 300);
  }, [canControl, sendWSEvent]);

  const handleRateChange = useCallback((rate: number) => {
    if (!canControl) return;
    sendWSEvent('RATE_CHANGE', { playback_rate: rate });
  }, [canControl, sendWSEvent]);

  return {
    handlePlay,
    handlePause,
    handleSeek,
    handleRateChange,
    syncPlayer,
  };
}
