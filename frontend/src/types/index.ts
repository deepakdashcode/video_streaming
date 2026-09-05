export type UserRole = 'HOST' | 'PARTICIPANT';

export type MediaSourceType = 'NONE' | 'URL' | 'LOCAL_FILE' | 'SCREEN_SHARE' | 'P2P_VIDEO';

export interface User {
  id: string;
  display_name: string;
  role: UserRole;
  joined_at: number;
  camera_enabled: boolean;
  microphone_enabled: boolean;
}

export interface PlaybackState {
  media_id?: string | null;
  source_type: MediaSourceType;
  media_url?: string | null;
  title: string;
  playing: boolean;
  position: number; // in seconds
  playback_rate: number;
  updated_at: number; // epoch ms
  sharer_user_id?: string | null;
  sharer_name?: string | null;
  screen_stream_id?: string | null;
}

export interface RoomSettings {
  locked: boolean;
  allow_camera: boolean;
  allow_microphone: boolean;
  allow_participant_control: boolean;
  allow_screen_share: boolean;
}

export interface Room {
  id: string;
  name: string;
  has_password: boolean;
  host_user_id: string;
  created_at: number;
  settings: RoomSettings;
  participants: Record<string, User>;
  playback_state: PlaybackState;
}

export interface SessionData {
  room_id: string;
  user_id: string;
  token: string;
  role: UserRole;
  display_name: string;
  room_name?: string;
}

export interface WSEvent<T = any> {
  type: string;
  requestId?: string;
  timestamp: number;
  payload: T;
}

export interface FloatingReaction {
  id: string;
  emoji: string;
  user_name: string;
  left: number; // percentage
}
