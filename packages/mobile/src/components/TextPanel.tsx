// Text messaging panel within a talkgroup
import { useState } from 'react';
import { useComms } from '../hooks/useComms';
import { useAppTheme } from '../theme';
interface Props { talkgroup: string; }

export function TextPanel({ talkgroup }: Props) {
  const { colors } = useAppTheme();
  const [text, setText] = useState('');
  const { sendText } = useComms();
  const send = () => { if (text.trim()) { sendText(talkgroup, text); setText(''); } };
  return (
    <div style={{ display:'flex', gap:8 }}>
      <input value={text} onChange={e=>setText(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && send()}
        placeholder="Type a message..."
        style={{ flex:1, padding:10, borderRadius:8, border:`1px solid ${colors.accent.primary}`,
          backgroundColor:colors.background.tertiary, color:colors.text.primary, fontSize:14 }} />
      <button onClick={send}
        style={{ padding:'10px 20px', backgroundColor:colors.accent.primary, color:colors.text.primary,
          border:'none', borderRadius:8, cursor:'pointer' }}>Send</button>
    </div>
  );
}
