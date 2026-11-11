import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = 
  (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_SUPABASE_URL) ||
  'https://brjsoaxvqrtxyofwxgkk.supabase.co';

const supabaseKey = 
  (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) ||
  'sb_publishable_mEQzWNPKvTxqWvzZ8u6XQA_2wlGfyLR';

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export const SUPABASE_PROJECT_URL = supabaseUrl;
export const SUPABASE_IS_CONFIGURED = Boolean(supabaseUrl && supabaseKey);
