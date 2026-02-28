// Supabase client — single instance for the server
import { createClient } from '@supabase/supabase-js';

const url  = process.env.SUPABASE_URL  ?? '';
const key  = process.env.SUPABASE_SERVICE_KEY ?? '';

if (!url || !key) {
  console.warn('[supabase] SUPABASE_URL or SUPABASE_SERVICE_KEY not set');
}

export const supabase = createClient(url, key);
