// Text messaging panel within a talkgroup
import { useState } from 'react';
import { useComms } from '../hooks/useComms';
interface Props { talkgroup: string; }

export function TextPanel({ talkgroup }: Props) {
  const [text, setText] = useState('');
  const { sendText } = useComms();
  const send = () => { if (text.trim()) { sendText(talkgroup, text); setText(''); } };
  return (
    <div style={{ display:'flex', gap:8 }}>
      <input value={text} onChange={e=>setText(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && send()}
        placeholder="Type a message..."
        style={{ flex:1, padding:10, borderRadius:8, border:'1px solid #0D6EFD',
          backgroundColor:'#1E3A5F', color:'white', fontSize:14 }} />
      <button onClick={send}
        style={{ padding:'10px 20px', backgroundColor:'#0D6EFD', color:'white',
          border:'none', borderRadius:8, cursor:'pointer' }}>Send</button>
    </div>
  );
}
