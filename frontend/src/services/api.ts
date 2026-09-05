import type { Room, SessionData } from '../types';

// Dynamic API Base URL using current window location host for LAN support
const getApiBaseUrl = () => {
  const hostname = window.location.hostname || 'localhost';
  return `http://${hostname}:8000/api`;
};

export const API_BASE_URL = getApiBaseUrl();

export async function createRoom(roomName: string, hostName: string, password?: string): Promise<SessionData> {
  const res = await fetch(`${API_BASE_URL}/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      room_name: roomName,
      host_name: hostName,
      password: password || undefined,
    }),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.detail || 'Failed to create room');
  }

  const data = await res.json();
  return {
    room_id: data.room_id,
    user_id: data.user_id,
    token: data.token,
    role: data.role,
    display_name: hostName,
    room_name: roomName || `Room ${data.room_id}`,
  };
}

export async function joinRoom(roomId: string, displayName: string, password?: string): Promise<SessionData> {
  const res = await fetch(`${API_BASE_URL}/rooms/${roomId}/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      display_name: displayName,
      password: password || undefined,
    }),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.detail || 'Failed to join room');
  }

  const data = await res.json();
  return {
    room_id: data.room_id,
    user_id: data.user_id,
    token: data.token,
    role: data.role,
    display_name: displayName,
    room_name: data.room_name,
  };
}

export async function getRoomDetails(roomId: string, token: string): Promise<Room> {
  const res = await fetch(`${API_BASE_URL}/rooms/${roomId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.detail || 'Failed to fetch room details');
  }

  return await res.json();
}

export async function setMediaUrl(roomId: string, token: string, url: string, title?: string) {
  const res = await fetch(`${API_BASE_URL}/rooms/${roomId}/media/url`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ url, title }),
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.detail || 'Failed to set video URL');
  }

  return await res.json();
}

export async function uploadLocalVideo(roomId: string, token: string, file: File) {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${API_BASE_URL}/rooms/${roomId}/media/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.detail || 'Failed to upload video file');
  }

  return await res.json();
}

export async function kickParticipant(roomId: string, token: string, targetUserId: string) {
  const res = await fetch(`${API_BASE_URL}/rooms/${roomId}/participants/${targetUserId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.detail || 'Failed to remove participant');
  }

  return await res.json();
}
