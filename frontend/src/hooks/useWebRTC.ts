import { useEffect, useRef, useState, useCallback } from 'react';
import type { User, WSEvent } from '../types';

interface UseWebRTCOptions {
  selfUserId: string;
  participants: Record<string, User>;
  sendWSEvent: (type: string, payload?: any) => void;
  subscribeWS: (type: string, callback: (event: WSEvent) => void) => () => void;
}

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

export function useWebRTC({ selfUserId, participants, sendWSEvent, subscribeWS }: UseWebRTCOptions) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [peerStreams, setPeerStreams] = useState<Record<string, MediaStream>>({});
  const [peerScreenStreams, setPeerScreenStreams] = useState<Record<string, MediaStream>>({});
  const [isCamOn, setIsCamOn] = useState(false);
  const [isMicOn, setIsMicOn] = useState(false);
  const [isVideoSharing, setIsVideoSharing] = useState(false);

  const peerConnectionsRef = useRef<Record<string, RTCPeerConnection>>({});
  const pendingIceCandidatesRef = useRef<Record<string, RTCIceCandidateInit[]>>({});
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const capturedVideoRef = useRef<HTMLVideoElement | null>(null);
  const capturedStreamRef = useRef<MediaStream | null>(null);

  // Track ALL streams per peer by stream ID: { peerId: { streamId: MediaStream } }
  const peerAllStreamsRef = useRef<Record<string, Record<string, MediaStream>>>({});
  // Track which stream IDs are known to be screen/video share streams (not camera)
  const knownScreenStreamIdsRef = useRef<Set<string>>(new Set());
  // Track the local screen stream ID for sender identification
  const localScreenStreamIdRef = useRef<string | null>(null);

  // Helper: derive peerStreams and peerScreenStreams from the ref
  const updatePeerStreamStates = useCallback((peerId: string) => {
    const allStreams = peerAllStreamsRef.current[peerId];
    if (!allStreams) return;

    const streamEntries = Object.entries(allStreams);
    // Filter out dead streams
    const liveEntries = streamEntries.filter(([, stream]) =>
      stream.getTracks().some(t => t.readyState === 'live')
    );

    if (liveEntries.length === 0) {
      setPeerStreams(prev => { const n = { ...prev }; delete n[peerId]; return n; });
      setPeerScreenStreams(prev => { const n = { ...prev }; delete n[peerId]; return n; });
      return;
    }

    // Separate into screen streams and camera streams using known IDs
    let screenStream: MediaStream | null = null;
    let cameraStream: MediaStream | null = null;

    for (const [streamId, stream] of liveEntries) {
      if (knownScreenStreamIdsRef.current.has(streamId)) {
        screenStream = stream;
      } else {
        cameraStream = stream;
      }
    }

    // If we couldn't identify by known IDs and there are multiple streams,
    // the latest one is more likely the screen share (camera was established first)
    if (!screenStream && liveEntries.length >= 2) {
      cameraStream = liveEntries[0][1];
      screenStream = liveEntries[liveEntries.length - 1][1];
    }

    // If only one stream and it's a known screen stream
    if (liveEntries.length === 1) {
      const [streamId, stream] = liveEntries[0];
      if (knownScreenStreamIdsRef.current.has(streamId)) {
        screenStream = stream;
      } else {
        cameraStream = stream;
        // Also set as screen fallback in case we don't know yet
        if (!screenStream) screenStream = stream;
      }
    }

    if (cameraStream) {
      setPeerStreams(prev => ({ ...prev, [peerId]: cameraStream }));
    }
    if (screenStream) {
      setPeerScreenStreams(prev => ({ ...prev, [peerId]: screenStream }));
    }
  }, []);

  // Create PeerConnection for target user
  const createPeerConnection = useCallback((targetUserId: string) => {
    if (peerConnectionsRef.current[targetUserId]) {
      return peerConnectionsRef.current[targetUserId];
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);

    // Add local camera/mic tracks if available
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        const senders = pc.getSenders();
        if (!senders.some((s) => s.track?.id === track.id)) {
          pc.addTrack(track, localStreamRef.current!);
        }
      });
    }

    // Add screen share tracks if available
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => {
        const senders = pc.getSenders();
        if (!senders.some((s) => s.track?.id === track.id)) {
          pc.addTrack(track, screenStreamRef.current!);
        }
      });
    }

    // Add captured video stream tracks if available
    if (capturedStreamRef.current) {
      capturedStreamRef.current.getTracks().forEach((track) => {
        const senders = pc.getSenders();
        if (!senders.some((s) => s.track?.id === track.id)) {
          pc.addTrack(track, capturedStreamRef.current!);
        }
      });
    }

    // Handle remote track arrival — STREAM-ID BASED ROUTING
    pc.ontrack = (event) => {
      const incomingStream = event.streams[0] || new MediaStream([event.track]);
      console.log(`[WebRTC] Track from ${targetUserId}: kind=${event.track.kind}, streamId=${incomingStream.id}, label="${event.track.label}"`);

      // Initialize tracking map for this peer
      if (!peerAllStreamsRef.current[targetUserId]) {
        peerAllStreamsRef.current[targetUserId] = {};
      }

      // Store this stream by its ID (preserves both camera and screen streams independently)
      peerAllStreamsRef.current[targetUserId][incomingStream.id] = incomingStream;

      // Handle track ending — clean up from ref
      event.track.onended = () => {
        console.log(`[WebRTC] Track ended from ${targetUserId}: ${event.track.kind}, streamId=${incomingStream.id}`);
        const peerStreams = peerAllStreamsRef.current[targetUserId];
        if (peerStreams && peerStreams[incomingStream.id]) {
          const remaining = peerStreams[incomingStream.id].getTracks().filter(t => t.readyState === 'live');
          if (remaining.length === 0) {
            delete peerStreams[incomingStream.id];
            knownScreenStreamIdsRef.current.delete(incomingStream.id);
          }
        }
        updatePeerStreamStates(targetUserId);
      };

      // Re-derive state
      updatePeerStreamStates(targetUserId);
    };

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendWSEvent('WEBRTC_ICE_CANDIDATE', {
          target_user_id: targetUserId,
          signal_data: event.candidate,
        });
      }
    };

    peerConnectionsRef.current[targetUserId] = pc;
    return pc;
  }, [sendWSEvent, updatePeerStreamStates]);

  const createAndSendOffer = useCallback(async (targetUserId: string) => {
    try {
      const pc = createPeerConnection(targetUserId);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      sendWSEvent('WEBRTC_OFFER', {
        target_user_id: targetUserId,
        signal_data: offer,
      });
    } catch (err) {
      console.warn(`[WebRTC] Error creating offer for ${targetUserId}:`, err);
    }
  }, [createPeerConnection, sendWSEvent]);

  // ============================================================
  // SCREEN SHARING with System/Internal Audio
  // ============================================================
  const startScreenShare = useCallback(async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      alert('Screen sharing is supported on desktop browsers (Chrome, Edge, Firefox, Brave, Safari 13+).');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { width: { max: 1920 }, height: { max: 1080 }, frameRate: { max: 30 } },
        audio: true,
      });

      screenStreamRef.current = stream;
      localScreenStreamIdRef.current = stream.id;
      setScreenStream(stream);

      // Handle browser's native "Stop Sharing" button
      stream.getVideoTracks()[0].onended = () => {
        stopScreenShare();
      };

      // Broadcast with stream ID for remote identification
      sendWSEvent('SCREEN_SHARE_START', { screen_stream_id: stream.id });

      // Attach to ALL existing peer connections & renegotiate
      Object.entries(peerConnectionsRef.current).forEach(([targetId, pc]) => {
        stream.getTracks().forEach((track) => {
          const senders = pc.getSenders();
          if (!senders.some(s => s.track?.id === track.id)) {
            pc.addTrack(track, stream);
          }
        });
        createAndSendOffer(targetId);
      });

      // Create connections for any peers without one
      Object.keys(participants).forEach((targetId) => {
        if (targetId !== selfUserId && !peerConnectionsRef.current[targetId]) {
          const pc = createPeerConnection(targetId);
          stream.getTracks().forEach((track) => {
            pc.addTrack(track, stream);
          });
          createAndSendOffer(targetId);
        }
      });
    } catch (err: any) {
      console.warn('Screen share canceled or failed:', err);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sendWSEvent, createPeerConnection, createAndSendOffer, participants, selfUserId]);

  const stopScreenShare = useCallback(() => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => {
        track.stop();
        Object.values(peerConnectionsRef.current).forEach((pc) => {
          pc.getSenders().forEach((sender) => {
            if (sender.track === track || sender.track?.id === track.id) {
              try { pc.removeTrack(sender); } catch (e) { console.warn('Remove sender error:', e); }
            }
          });
        });
      });
      screenStreamRef.current = null;
    }
    localScreenStreamIdRef.current = null;
    setScreenStream(null);
    sendWSEvent('SCREEN_SHARE_STOP');

    // Renegotiate to signal track removal
    Object.keys(peerConnectionsRef.current).forEach((targetId) => {
      createAndSendOffer(targetId);
    });
  }, [sendWSEvent, createAndSendOffer]);

  // ============================================================
  // P2P VIDEO SHARING via captureStream()
  // ============================================================
  const startVideoShare = useCallback(async (file: File) => {
    try {
      // Create hidden video element
      const video = document.createElement('video');
      video.muted = true; // mute locally (audio goes through WebRTC)
      video.playsInline = true;
      video.src = URL.createObjectURL(file);
      video.style.position = 'fixed';
      video.style.top = '-9999px';
      document.body.appendChild(video);

      await video.play();

      // Capture stream from the video element
      const stream = (video as any).captureStream() as MediaStream;

      capturedVideoRef.current = video;
      capturedStreamRef.current = stream;
      localScreenStreamIdRef.current = stream.id;
      setScreenStream(stream);
      setIsVideoSharing(true);

      // Handle video ending naturally
      video.onended = () => {
        stopVideoShare();
      };

      sendWSEvent('VIDEO_SHARE_START', {
        screen_stream_id: stream.id,
        title: file.name,
      });

      // Attach to all peers & renegotiate
      Object.entries(peerConnectionsRef.current).forEach(([targetId, pc]) => {
        stream.getTracks().forEach((track) => {
          const senders = pc.getSenders();
          if (!senders.some(s => s.track?.id === track.id)) {
            pc.addTrack(track, stream);
          }
        });
        createAndSendOffer(targetId);
      });

      Object.keys(participants).forEach((targetId) => {
        if (targetId !== selfUserId && !peerConnectionsRef.current[targetId]) {
          const pc = createPeerConnection(targetId);
          stream.getTracks().forEach((track) => {
            pc.addTrack(track, stream);
          });
          createAndSendOffer(targetId);
        }
      });

      return video; // Return so caller can control playback
    } catch (err: any) {
      console.error('P2P video share failed:', err);
      alert('Failed to start video share: ' + err.message);
      return null;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sendWSEvent, createPeerConnection, createAndSendOffer, participants, selfUserId]);

  const stopVideoShare = useCallback(() => {
    if (capturedStreamRef.current) {
      capturedStreamRef.current.getTracks().forEach((track) => {
        track.stop();
        Object.values(peerConnectionsRef.current).forEach((pc) => {
          pc.getSenders().forEach((sender) => {
            if (sender.track === track || sender.track?.id === track.id) {
              try { pc.removeTrack(sender); } catch (e) { console.warn('Remove sender error:', e); }
            }
          });
        });
      });
      capturedStreamRef.current = null;
    }
    if (capturedVideoRef.current) {
      capturedVideoRef.current.pause();
      capturedVideoRef.current.src = '';
      URL.revokeObjectURL(capturedVideoRef.current.src);
      capturedVideoRef.current.remove();
      capturedVideoRef.current = null;
    }
    localScreenStreamIdRef.current = null;
    setScreenStream(null);
    setIsVideoSharing(false);
    sendWSEvent('VIDEO_SHARE_STOP');

    Object.keys(peerConnectionsRef.current).forEach((targetId) => {
      createAndSendOffer(targetId);
    });
  }, [sendWSEvent, createAndSendOffer]);

  // ============================================================
  // CAMERA / MIC TOGGLES — non-destructive during screen share
  // ============================================================
  const toggleCamera = async (enable?: boolean) => {
    const shouldEnable = enable !== undefined ? enable : !isCamOn;

    const isSupported = typeof navigator !== 'undefined' &&
      Boolean(navigator.mediaDevices) &&
      typeof navigator.mediaDevices.getUserMedia === 'function';

    if (shouldEnable && !isSupported) {
      alert('Camera & Microphone access requires HTTPS or localhost.\n\nPlease open the app over HTTPS or on localhost!');
      return;
    }

    try {
      if (shouldEnable) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: isMicOn,
        });
        localStreamRef.current = stream;
        setLocalStream(stream);
        setIsCamOn(true);
        sendWSEvent('CAMERA_TOGGLE', { enabled: true });

        // Add ONLY camera/mic tracks to peers — DO NOT touch screen share senders
        Object.keys(participants).forEach((targetId) => {
          if (targetId !== selfUserId) {
            const pc = createPeerConnection(targetId);
            stream.getTracks().forEach((track) => {
              const senders = pc.getSenders();
              if (!senders.some((s) => s.track?.id === track.id)) {
                pc.addTrack(track, stream);
              }
            });
            createAndSendOffer(targetId);
          }
        });
      } else {
        if (localStreamRef.current) {
          localStreamRef.current.getVideoTracks().forEach((track) => track.stop());
        }
        setIsCamOn(false);
        sendWSEvent('CAMERA_TOGGLE', { enabled: false });
      }
    } catch (err: any) {
      console.error('Failed to toggle camera:', err);
      alert('Could not access camera: ' + (err.message || 'Permission denied'));
    }
  };

  const toggleMic = async (enable?: boolean) => {
    const shouldEnable = enable !== undefined ? enable : !isMicOn;

    const isSupported = typeof navigator !== 'undefined' &&
      Boolean(navigator.mediaDevices) &&
      typeof navigator.mediaDevices.getUserMedia === 'function';

    if (shouldEnable && !isSupported) {
      alert('Camera & Microphone access requires HTTPS or localhost.\n\nPlease open the app over HTTPS or on localhost!');
      return;
    }

    try {
      if (shouldEnable) {
        // If we already have a local stream, just add an audio track to it
        // instead of creating a whole new stream (which would disrupt screen share)
        if (localStreamRef.current && localStreamRef.current.getVideoTracks().some(t => t.readyState === 'live')) {
          // Existing camera stream — add audio track to it
          const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          const audioTrack = audioStream.getAudioTracks()[0];

          // Add to our local stream
          localStreamRef.current.addTrack(audioTrack);
          setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
          setIsMicOn(true);
          sendWSEvent('MIC_TOGGLE', { enabled: true });

          // Add audio track to peers
          Object.keys(participants).forEach((targetId) => {
            if (targetId !== selfUserId) {
              const pc = createPeerConnection(targetId);
              const senders = pc.getSenders();
              if (!senders.some(s => s.track?.id === audioTrack.id)) {
                pc.addTrack(audioTrack, localStreamRef.current!);
              }
              createAndSendOffer(targetId);
            }
          });
        } else {
          // No existing camera stream — create a new audio-only (or audio+video) stream
          const stream = await navigator.mediaDevices.getUserMedia({
            video: isCamOn,
            audio: true,
          });
          localStreamRef.current = stream;
          setLocalStream(stream);
          setIsMicOn(true);
          sendWSEvent('MIC_TOGGLE', { enabled: true });

          Object.keys(participants).forEach((targetId) => {
            if (targetId !== selfUserId) {
              const pc = createPeerConnection(targetId);
              stream.getTracks().forEach((track) => {
                const senders = pc.getSenders();
                if (!senders.some((s) => s.track?.id === track.id)) {
                  pc.addTrack(track, stream);
                }
              });
              createAndSendOffer(targetId);
            }
          });
        }
      } else {
        if (localStreamRef.current) {
          localStreamRef.current.getAudioTracks().forEach((track) => track.stop());
        }
        setIsMicOn(false);
        sendWSEvent('MIC_TOGGLE', { enabled: false });
      }
    } catch (err: any) {
      console.error('Failed to toggle mic:', err);
      alert('Could not access microphone: ' + (err.message || 'Permission denied'));
    }
  };

  // ============================================================
  // SUBSCRIBE to screen stream ID broadcasts
  // ============================================================
  useEffect(() => {
    // When we receive MEDIA_CHANGED with a screen share, learn the stream ID
    const unsubMedia = subscribeWS('MEDIA_CHANGED', (event: WSEvent) => {
      const ps = event.payload?.playback_state;
      if (ps && ps.screen_stream_id) {
        console.log(`[WebRTC] Learned screen stream ID: ${ps.screen_stream_id}`);
        knownScreenStreamIdsRef.current.add(ps.screen_stream_id);
        // Re-derive states for the sharer
        if (ps.sharer_user_id && peerAllStreamsRef.current[ps.sharer_user_id]) {
          updatePeerStreamStates(ps.sharer_user_id);
        }
      }
      // If screen share stopped, clear known IDs
      if (ps && (ps.source_type === 'NONE' || ps.source_type === 'URL' || ps.source_type === 'LOCAL_FILE')) {
        knownScreenStreamIdsRef.current.clear();
      }
    });

    // Direct screen stream ID notification (from SCREEN_SHARE_START broadcast payload)
    const unsubScreenStart = subscribeWS('SCREEN_SHARE_STREAM_ID', (event: WSEvent) => {
      const streamId = event.payload?.screen_stream_id;
      const sharerId = event.payload?.sharer_user_id;
      if (streamId) {
        console.log(`[WebRTC] Received screen stream ID notification: ${streamId}`);
        knownScreenStreamIdsRef.current.add(streamId);
        if (sharerId && peerAllStreamsRef.current[sharerId]) {
          updatePeerStreamStates(sharerId);
        }
      }
    });

    return () => {
      unsubMedia();
      unsubScreenStart();
    };
  }, [subscribeWS, updatePeerStreamStates]);

  // ============================================================
  // AUTO-OFFER to new participants
  // ============================================================
  useEffect(() => {
    if (!selfUserId) return;
    Object.keys(participants).forEach((peerId) => {
      if (peerId !== selfUserId && !peerConnectionsRef.current[peerId]) {
        createAndSendOffer(peerId);
      }
    });
  }, [participants, selfUserId, createAndSendOffer]);

  // ============================================================
  // SIGNALING (offer/answer/ICE)
  // ============================================================
  useEffect(() => {
    const unsubOffer = subscribeWS('WEBRTC_OFFER', async (event) => {
      const { from_user_id, signal_data } = event.payload;
      // For renegotiation: close existing PC and create fresh one
      if (peerConnectionsRef.current[from_user_id]) {
        // Instead of closing, just set remote description on existing PC
        const pc = peerConnectionsRef.current[from_user_id];
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(signal_data));
        } catch {
          // If setRemoteDescription fails (e.g., wrong state), recreate
          pc.close();
          delete peerConnectionsRef.current[from_user_id];
          const newPc = createPeerConnection(from_user_id);
          await newPc.setRemoteDescription(new RTCSessionDescription(signal_data));
        }
      } else {
        const pc = createPeerConnection(from_user_id);
        await pc.setRemoteDescription(new RTCSessionDescription(signal_data));
      }

      const pc = peerConnectionsRef.current[from_user_id];
      if (!pc) return;

      // Flush pending ICE candidates
      if (pendingIceCandidatesRef.current[from_user_id]) {
        for (const candidate of pendingIceCandidatesRef.current[from_user_id]) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(console.warn);
        }
        delete pendingIceCandidatesRef.current[from_user_id];
      }

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      sendWSEvent('WEBRTC_ANSWER', {
        target_user_id: from_user_id,
        signal_data: answer,
      });
    });

    const unsubAnswer = subscribeWS('WEBRTC_ANSWER', async (event) => {
      const { from_user_id, signal_data } = event.payload;
      const pc = peerConnectionsRef.current[from_user_id];
      if (pc) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(signal_data));
        } catch (err) {
          console.warn(`[WebRTC] Error setting remote answer from ${from_user_id}:`, err);
        }

        if (pendingIceCandidatesRef.current[from_user_id]) {
          for (const candidate of pendingIceCandidatesRef.current[from_user_id]) {
            await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(console.warn);
          }
          delete pendingIceCandidatesRef.current[from_user_id];
        }
      }
    });

    const unsubICE = subscribeWS('WEBRTC_ICE_CANDIDATE', async (event) => {
      const { from_user_id, signal_data } = event.payload;
      const pc = peerConnectionsRef.current[from_user_id];
      if (pc && pc.remoteDescription) {
        await pc.addIceCandidate(new RTCIceCandidate(signal_data)).catch(console.warn);
      } else {
        if (!pendingIceCandidatesRef.current[from_user_id]) {
          pendingIceCandidatesRef.current[from_user_id] = [];
        }
        pendingIceCandidatesRef.current[from_user_id].push(signal_data);
      }
    });

    return () => {
      unsubOffer();
      unsubAnswer();
      unsubICE();
    };
  }, [subscribeWS, createPeerConnection, sendWSEvent]);

  // ============================================================
  // CLEANUP departed participants
  // ============================================================
  useEffect(() => {
    const currentIds = new Set(Object.keys(participants));
    Object.keys(peerConnectionsRef.current).forEach((peerId) => {
      if (!currentIds.has(peerId)) {
        peerConnectionsRef.current[peerId].close();
        delete peerConnectionsRef.current[peerId];
        delete pendingIceCandidatesRef.current[peerId];
        delete peerAllStreamsRef.current[peerId];
        setPeerStreams(prev => { const n = { ...prev }; delete n[peerId]; return n; });
        setPeerScreenStreams(prev => { const n = { ...prev }; delete n[peerId]; return n; });
      }
    });
  }, [participants]);

  return {
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
  };
}
