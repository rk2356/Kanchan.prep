import { createClient } from '@supabase/supabase-js';

// Fallback to the user provided keys so the app works seamlessly for them
const envUrl = typeof import.meta.env !== 'undefined' ? import.meta.env.VITE_SUPABASE_URL : '';
const envKey = typeof import.meta.env !== 'undefined' ? import.meta.env.VITE_SUPABASE_ANON_KEY : '';

const supabaseUrl = envUrl && envUrl.startsWith('http') ? envUrl : 'https://balrwgdxabjrlswabepa.supabase.co';
const supabaseAnonKey = envKey && envKey.length > 20 ? envKey : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhbHJ3Z2R4YWJqcmxzd2FiZXBhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MTUxMzEsImV4cCI6MjA5NTI5MTEzMX0.R_GOOqEdyPzMNcfB_klDgZY6206o6QikycNf0Z7j0cM';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'kanchan-auth-v2'
  }
});
