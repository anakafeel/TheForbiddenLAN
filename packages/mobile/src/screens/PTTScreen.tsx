// PTT screen — main walkie-talkie UI
import { useState } from 'react';
import { useComms } from '../hooks/useComms';
import { useStore } from '../store';
import { PTTButton } from '../components/PTTButton';
import { SignalBar } from '../components/SignalBar';
import { TalkgroupSelector } from '../components/TalkgroupSelector';
import { TextPanel } from '../components/TextPanel';

export function PTTScreen() {
  const { startPTT, stopPTT, deviceId } = useComms();
  const { activeTalkgroup, signalStatus, floorStatus } = useStore();
  const [transmitting, setTransmitting] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0); // 0-100

  const handlePTTDown = () => {
    setTransmitting(true);
    startPTT(activeTalkgroup);
    // Simulate a non-zero audio level while transmitting
    setAudioLevel(Math.floor(Math.random() * 60) + 30);
  };

  const handlePTTUp = () => {
    setTransmitting(false);
    setAudioLevel(0);
    stopPTT();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', padding: 16, gap: 12, backgroundColor: '#0A1628' }}>
      <SignalBar status={signalStatus} />
      <TalkgroupSelector />

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>

        {/* Incoming transmission banner — shown when someone else holds the floor */}
        {floorStatus.holder && floorStatus.holder !== deviceId && (
          <div style={{
            color: '#FFD700',
            fontSize: 18,
            textAlign: 'center',
            padding: 12,
            backgroundColor: '#1E3A5F',
            borderRadius: 8,
          }}>
            📡 Incoming transmission...
          </div>
        )}

        <PTTButton transmitting={transmitting} onDown={handlePTTDown} onUp={handlePTTUp} />
        <p style={{ color: '#aaa', fontSize: 14 }}>{transmitting ? 'TRANSMITTING' : 'Hold to Talk'}</p>

        {/* Audio level indicator — shown while transmitting */}
        {transmitting && (
          <div style={{
            width: '100%',
            height: 8,
            backgroundColor: '#333',
            borderRadius: 4,
            overflow: 'hidden',
          }}>
            <div style={{
              width: `${audioLevel}%`,
              height: '100%',
              backgroundColor: '#E74C3C',
              transition: 'width 0.1s',
            }} />
          </div>
        )}

      </div>

      <TextPanel talkgroup={activeTalkgroup} />
    </div>
  );
}
