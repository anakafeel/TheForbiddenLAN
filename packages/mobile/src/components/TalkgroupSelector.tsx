// Talkgroup selector — switch active talkgroup
import { useStore } from '../store';
import { useAppTheme } from '../theme';

export function TalkgroupSelector() {
  const { colors } = useAppTheme();
  const { talkgroups, activeTalkgroup, setActiveTalkgroup } = useStore();
  if (!talkgroups.length) return <p style={{ color:colors.text.muted, textAlign:'center' }}>No talkgroups joined</p>;
  return (
    <select value={activeTalkgroup} onChange={e => setActiveTalkgroup(e.target.value)}
      style={{ padding:10, fontSize:16, borderRadius:8, backgroundColor:colors.background.tertiary,
        color:colors.text.primary, border:`1px solid ${colors.accent.primary}`, width:'100%' }}>
      {talkgroups.map(tg => <option key={tg} value={tg}>{tg}</option>)}
    </select>
  );
}
