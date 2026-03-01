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
    let cleanupPolling: (() => void) | undefined;
    comms.connect(jwt).then(() => {
      commsRef.current = comms;
      cleanupPolling = comms.startSignalPolling(10000, setSignalStatus);
      // We still need to poll GPS manually for now or whenever it updates,
      // but SignalStatus is now handled by the comms package natively.
    });
    
    // GPS Polling (to match what we had before)
    const gpsInterval = setInterval(() => {
      const g = comms.getGPS();
      if (g) setGPS(g);
    }, 10_000);

    return () => { 
      clearInterval(gpsInterval);
      if (cleanupPolling) cleanupPolling();
      comms.disconnect(); 
    };
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
  const onMessage = (handler: (msg: any) => void) => {
    if (MOCK) return;
    commsRef.current?.onMessage(handler);
  };

  return { startPTT, stopPTT, sendText, onMessage };
}
