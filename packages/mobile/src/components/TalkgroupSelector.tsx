// Talkgroup selector — switch active talkgroup
import { useStore } from '../store';

export function TalkgroupSelector() {
  const { talkgroups, activeTalkgroup, setActiveTalkgroup } = useStore();
  if (!talkgroups.length) return <p style={{ color:'#aaa', textAlign:'center' }}>No talkgroups joined</p>;
  return (
    <select value={activeTalkgroup} onChange={e => setActiveTalkgroup(e.target.value)}
      style={{ padding:10, fontSize:16, borderRadius:8, backgroundColor:'#1E3A5F',
        color:'white', border:'1px solid #0D6EFD', width:'100%' }}>
      {talkgroups.map(tg => <option key={tg} value={tg}>{tg}</option>)}
    </select>
  );
}
