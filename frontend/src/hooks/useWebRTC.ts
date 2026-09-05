import { useEffect, useRef, useState, useCallback } from 'react';
import type { User, WSEvent } from '../types';

interface UseWebRTCOptions {
  selfUserId: string;
  participants: Record<string, User>;
  sendWSEvent: (type: string, payload?: any) => void;
  subscribeWS: (type: string, callback: (event: WSEvent) => void) => () => void;
}

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export function useWebRTC({ selfUserId, participants, sendWSEvent, subscribeWS }: UseWebRTCOptions) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [peerStreams, setPeerStreams] = useState<Record<string, MediaStream>>({});
  const [isCamOn, setIsCamOn] = useState(false);
  const [isMicOn, setIsMicOn] = useState(false);

  const peerConnectionsRef = useRef<Record<string, RTCPeerConnection>>({});
  const pendingIceCandidatesRef = useRef<Record<string, RTCIceCandidateInit[]>>({});
  const localStreamRef = useRef<MediaStream | null>(null);

  // Create PeerConnection for target user
  const createPeerConnection = useCallback((targetUserId: string) => {
    if (peerConnectionsRef.current[targetUserId]) {
      return peerConnectionsRef.current[targetUserId];
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);

    // Add local tracks if available
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        const senders = pc.getSenders();
        if (!senders.some((s) => s.track?.id === track.id)) {
          pc.addTrack(track, localStreamRef.current!);
        }
      });
    }

    // Handle remote track arrival
    pc.ontrack = (event) => {
      console.log(`[WebRTC] Received remote stream from ${targetUserId}`);
      const remoteStream = event.streams[0] || new MediaStream([event.track]);
      setPeerStreams((prev) => ({
        ...prev,
        [targetUserId]: remoteStream,
      }));
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
  }, [sendWSEvent]);

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

  // Initialize or stop local media stream
  const toggleCamera = async (enable?: boolean) => {
    const shouldEnable = enable !== undefined ? enable : !isCamOn;
    
    // Validate mediaDevices availability
    const isSupported = typeof navigator !== 'undefined' && 
      Boolean(navigator.mediaDevices) && 
      typeof navigator.mediaDevices.getUserMedia === 'function';

    if (shouldEnable && !isSupported) {
      alert('Camera & Microphone access requires HTTPS or localhost in mobile browsers. HTTP LAN access blocks webcams.\n\nPlease open the app over HTTPS or on localhost!');
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

        // Broadcast new tracks & offer to all participants
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
      alert('Camera & Microphone access requires HTTPS or localhost in mobile browsers. HTTP LAN access blocks webcams.\n\nPlease open the app over HTTPS or on localhost!');
      return;
    }

    try {
      if (shouldEnable) {
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

  // Automatically offer to new participants
  useEffect(() => {
    if (!selfUserId) return;
    Object.keys(participants).forEach((peerId) => {
      if (peerId !== selfUserId && !peerConnectionsRef.current[peerId]) {
        createAndSendOffer(peerId);
      }
    });
  }, [participants, selfUserId, createAndSendOffer]);

  // Handle incoming signaling messages
  useEffect(() => {
    const unsubscribeOffer = subscribeWS('WEBRTC_OFFER', async (event) => {
      const { from_user_id, signal_data } = event.payload;
      const pc = createPeerConnection(from_user_id);
      await pc.setRemoteDescription(new RTCSessionDescription(signal_data));
      
      // Process any queued candidates
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

    const unsubscribeAnswer = subscribeWS('WEBRTC_ANSWER', async (event) => {
      const { from_user_id, signal_data } = event.payload;
      const pc = peerConnectionsRef.current[from_user_id];
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(signal_data));
        
        if (pendingIceCandidatesRef.current[from_user_id]) {
          for (const candidate of pendingIceCandidatesRef.current[from_user_id]) {
            await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(console.warn);
          }
          delete pendingIceCandidatesRef.current[from_user_id];
        }
      }
    });

    const unsubscribeICE = subscribeWS('WEBRTC_ICE_CANDIDATE', async (event) => {
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
      unsubscribeOffer();
      unsubscribeAnswer();
      unsubscribeICE();
    };
  }, [subscribeWS, createPeerConnection, sendWSEvent]);

  // Clean up left participants
  useEffect(() => {
    const currentParticipantIds = new Set(Object.keys(participants));
    Object.keys(peerConnectionsRef.current).forEach((peerId) => {
      if (!currentParticipantIds.has(peerId)) {
        peerConnectionsRef.current[peerId].close();
        delete peerConnectionsRef.current[peerId];
        delete pendingIceCandidatesRef.current[peerId];
        setPeerStreams((prev) => {
          const next = { ...prev };
          delete next[peerId];
          return next;
        });
      }
    });
  }, [participants]);

  return {
    localStream,
    peerStreams,
    isCamOn,
    isMicOn,
    toggleCamera,
    toggleMic,
  };
}
