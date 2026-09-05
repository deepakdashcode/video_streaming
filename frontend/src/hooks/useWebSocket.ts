import { useEffect, useRef, useState, useCallback } from 'react';
import type { WSEvent } from '../types';

export function useWebSocket(roomId: string | null, token: string | null) {
  const [isConnected, setIsConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<WSEvent | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const listenersRef = useRef<Map<string, Set<(event: WSEvent) => void>>>(new Map());

  const getWsUrl = useCallback(() => {
    if (!roomId || !token) return null;
    const hostname = window.location.hostname || 'localhost';
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${hostname}:8000/ws/rooms/${roomId}?token=${encodeURIComponent(token)}`;
  }, [roomId, token]);

  useEffect(() => {
    const wsUrl = getWsUrl();
    if (!wsUrl) return;

    let socket: WebSocket | null = new WebSocket(wsUrl);
    wsRef.current = socket;

    socket.onopen = () => {
      console.log('WebSocket connected to room:', roomId);
      setIsConnected(true);
    };

    socket.onmessage = (messageEvent) => {
      try {
        const event: WSEvent = JSON.parse(messageEvent.data);
        setLastEvent(event);

        // Notify specific type listeners
        const typeListeners = listenersRef.current.get(event.type);
        if (typeListeners) {
          typeListeners.forEach((cb) => cb(event));
        }

        // Notify wildcard listeners
        const wildcardListeners = listenersRef.current.get('*');
        if (wildcardListeners) {
          wildcardListeners.forEach((cb) => cb(event));
        }
      } catch (err) {
        console.error('Failed to parse WebSocket message:', err);
      }
    };

    socket.onclose = (event) => {
      console.warn('WebSocket closed:', event.reason);
      setIsConnected(false);
    };

    socket.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    return () => {
      if (socket) {
        socket.close();
      }
    };
  }, [getWsUrl, roomId]);

  const sendEvent = useCallback((type: string, payload: any = {}) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      const event: WSEvent = {
        type,
        timestamp: Date.now(),
        payload,
      };
      wsRef.current.send(JSON.stringify(event));
    } else {
      console.warn('Cannot send WebSocket message: Socket not open');
    }
  }, []);

  const subscribe = useCallback((type: string, callback: (event: WSEvent) => void) => {
    if (!listenersRef.current.has(type)) {
      listenersRef.current.set(type, new Set());
    }
    listenersRef.current.get(type)!.add(callback);

    return () => {
      const set = listenersRef.current.get(type);
      if (set) {
        set.delete(callback);
        if (set.size === 0) {
          listenersRef.current.delete(type);
        }
      }
    };
  }, []);

  return {
    isConnected,
    lastEvent,
    sendEvent,
    subscribe,
  };
}
