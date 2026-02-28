// PTT screen — main walkie-talkie UI
import { useState } from 'react';
import { useComms } from '../hooks/useComms';
import { useStore } from '../store';
import { PTTButton } from '../components/PTTButton';
import { SignalBar } from '../components/SignalBar';
import { TalkgroupSelector } from '../components/TalkgroupSelector';
import { TextPanel } from '../components/TextPanel';

export function PTTScreen() {
  const { startPTT, stopPTT } = useComms();
  const { activeTalkgroup, signalStatus, floorStatus } = useStore();
  const [transmitting, setTransmitting] = useState(false);

  const handlePTTDown = () => { setTransmitting(true);  startPTT(activeTalkgroup); };
  const handlePTTUp   = () => { setTransmitting(false); stopPTT(); };

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100vh', padding:16, gap:12, backgroundColor:'#0A1628' }}>
      <SignalBar status={signalStatus} />
      <TalkgroupSelector />
      <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:16 }}>
        {floorStatus.holder && floorStatus.holder !== 'me' &&
          <p style={{ color:'#FFD700', fontSize:16 }}>📡 {floorStatus.holder} is speaking...</p>}
        <PTTButton transmitting={transmitting} onDown={handlePTTDown} onUp={handlePTTUp} />
        <p style={{ color:'#aaa', fontSize:14 }}>{transmitting ? 'TRANSMITTING' : 'Hold to Talk'}</p>
      </div>
      <TextPanel talkgroup={activeTalkgroup} />
    </div>
  );
}
