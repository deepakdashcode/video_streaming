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
    return state.position + elapsedSeconds * (state.playback_rate || 1.0);
  }, []);

  // Synchronize player with state
  const syncPlayer = useCallback(() => {
    const video = videoRef.current;
    if (!video || !playbackState.media_url) return;

    const expectedPos = calculateExpectedPosition(playbackState);
    const actualPos = video.currentTime;
    const drift = Math.abs(expectedPos - actualPos);

    // 1. Play / Pause state sync
    if (playbackState.playing && video.paused) {
      video.play().catch((err) => console.warn('Autoplay prevented:', err));
    } else if (!playbackState.playing && !video.paused) {
      video.pause();
    }

    // 2. Playback speed sync
    if (video.playbackRate !== playbackState.playback_rate && drift < 0.25) {
      video.playbackRate = playbackState.playback_rate;
    }

    // 3. Drift Correction logic
    if (drift > 1.0) {
      // Large drift: Hard seek
      console.log(`[Sync] Large drift (${drift.toFixed(2)}s). Seeking to ${expectedPos.toFixed(2)}s`);
      video.currentTime = expectedPos;
    } else if (drift > 0.25 && playbackState.playing) {
      // Moderate drift: Smooth rate adjustment
      const catchUpRate = expectedPos > actualPos ? 1.05 : 0.95;
      video.playbackRate = (playbackState.playback_rate || 1.0) * catchUpRate;
    } else {
      // Small drift: Normal rate
      video.playbackRate = playbackState.playback_rate || 1.0;
    }
  }, [videoRef, playbackState, calculateExpectedPosition]);

  // Periodic drift check (every 2 seconds)
  useEffect(() => {
    syncPlayer();
    const interval = setInterval(syncPlayer, 2000);
    return () => clearInterval(interval);
  }, [syncPlayer]);

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
