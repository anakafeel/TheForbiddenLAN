// Key rotation service — increments counter in Supabase, notifies connected clients
import { supabase } from '../db/supabase.js';

export async function rotateGroupKey(talkgroupId: string): Promise<number> {
  const { data, error } = await supabase
    .rpc('increment_rotation_counter', { tg_id: talkgroupId });
  if (error) throw new Error(error.message);
  await supabase.from('key_rotations')
    .insert({ talkgroup_id: talkgroupId, counter: data });
  return data as number;
}
