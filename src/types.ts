import { Session, User } from '@supabase/supabase-js';

export interface ChatMessage {
  id?: string;
  session_id?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  ts?: number;
  created_at?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  created: number;
  created_at?: string;
  messages: ChatMessage[];
}

export interface AppState {
  user: any;
  session: any;
}

