export interface User {
  id: string;
  username: string;
  display_name: string;
  password_hash: string;
  profile_picture_url?: string;
  bio?: string;
  is_online: boolean;
  last_seen: Date;
  created_at: Date;
  updated_at: Date;
}

export interface Session {
  id: string;
  user_id: string;
  refresh_token: string;
  device_name?: string;
  ip_address?: string;
  user_agent?: string;
  created_at: Date;
  expires_at: Date;
}

export interface Message {
  id: string;
  sender_id: string;
  chat_id: string;
  content: string;
  encrypted_payload?: string;
  reply_to?: string;
  message_type: 'text' | 'image' | 'video' | 'file' | 'call';
  media_url?: string;
  media_expiration?: Date;
  expires_at: Date;
  is_deleted: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface Chat {
  id: string;
  name?: string;
  chat_type: 'direct' | 'group';
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

export interface ChatParticipant {
  chat_id: string;
  user_id: string;
  joined_at: Date;
  left_at?: Date;
}

export interface Group {
  id: string;
  chat_id: string;
  name: string;
  description?: string;
  owner_id: string;
  icon_url?: string;
  created_at: Date;
  updated_at: Date;
}

export interface Call {
  id: string;
  initiator_id: string;
  receiver_id?: string;
  call_type: 'voice' | 'video';
  status: 'pending' | 'active' | 'ended' | 'missed';
  started_at?: Date;
  ended_at?: Date;
  duration_seconds?: number;
  created_at: Date;
}

export interface JwtPayload {
  userId: string;
  username: string;
  sessionId: string;
}

export interface MessageReaction {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: Date;
}

export interface ReadReceipt {
  id: string;
  message_id: string;
  user_id: string;
  read_at: Date;
}
