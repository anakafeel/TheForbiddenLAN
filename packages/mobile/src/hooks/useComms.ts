// useComms — wraps ForbiddenLANComms. Swap mock for real by changing the import only.
import { useEffect, useRef } from 'react';
import { ForbiddenLANComms } from '@forbiddenlan/comms';
import { useStore } from '../store';

// ── MOCK: remove this block and uncomment real config when Saim's package is ready ──
const MOCK = true;
// ──────────────────────────────────────────────────────────────────────────────────

export function useComms() {
  const { setSignalStatus, setFloorStatus, setGPS, jwt } = useStore();
  const commsRef = useRef<ForbiddenLANComms | null>(null);

  useEffect(() => {
    if (MOCK || !jwt) return;
    const comms = new ForbiddenLANComms({
      relayUrl: import.meta.env.VITE_WS_URL ?? 'ws://localhost:3000',
      dls140Url: import.meta.env.VITE_DLS140_URL,
      deviceId: 'device-placeholder-uuid',
    });
    comms.connect(jwt).then(() => {
      commsRef.current = comms;
    });
    const interval = setInterval(async () => {
      const s = await comms.getSignalStatus();
      setSignalStatus(s);
      const g = comms.getGPS();
      if (g) setGPS(g);
    }, 10_000);
    return () => { clearInterval(interval); comms.disconnect(); };
  }, [jwt]);

  const startPTT = (tg: string) => {
    if (MOCK) { console.log('[MOCK] PTT start', tg); return; }
    commsRef.current?.startPTT();
  };
  const stopPTT = () => {
    if (MOCK) { console.log('[MOCK] PTT stop'); return; }
    commsRef.current?.stopPTT();
  };
  const sendText = (tg: string, text: string) => {
    if (MOCK) { console.log('[MOCK] text', tg, text); return; }
    commsRef.current?.sendText(tg, text);
  };

  return { startPTT, stopPTT, sendText };
}
