// Store-and-forward — buffer audio for temporarily offline devices (in-memory, 30s TTL)
interface BufferedMessage { payload: string; expires: number; }

const buffer = new Map<string, BufferedMessage[]>();

export function bufferMessage(talkgroup: string, raw: string): void {
  const msgs = buffer.get(talkgroup) ?? [];
  msgs.push({ payload: raw, expires: Date.now() + 30_000 });
  buffer.set(talkgroup, msgs);
  // Prune expired
  buffer.set(talkgroup, msgs.filter(m => m.expires > Date.now()));
}

export function flushBuffer(talkgroup: string): string[] {
  const msgs = (buffer.get(talkgroup) ?? []).filter(m => m.expires > Date.now());
  buffer.delete(talkgroup);
  return msgs.map(m => m.payload);
}
