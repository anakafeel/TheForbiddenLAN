// useComms — wraps ForbiddenLANComms with mic capture, audio playback, and AES-GCM encryption.
// IS_MOCK=false uses MockRelaySocket (no backend needed). Set IS_MOCK=true to bypass comms entirely.
import { useEffect, useRef } from 'react';
import { ForbiddenLANComms, Encryption } from '@forbiddenlan/comms';
import { useStore } from '../store';
import { useAudioCapture } from './useAudioCapture';
import { useAudioPlayback } from './useAudioPlayback';

const IS_MOCK = false;
const DEVICE_ID = 'device-placeholder-uuid';

export function useComms() {
  const { setSignalStatus, setFloorStatus, setGPS, jwt, activeTalkgroup } = useStore();
  const commsRef = useRef<ForbiddenLANComms | null>(null);
  const encryption = useRef<Encryption | null>(null);

  const { enqueue: playChunk, clear: clearPlayback } = useAudioPlayback();

  // Init encryption once
  useEffect(() => {
    const enc = new Encryption();
    enc.init().then(() => { encryption.current = enc; });
  }, []);

  const { start: startMic, stop: stopMic } = useAudioCapture(
    async (base64Chunk) => {
      // mic captured a chunk — push to comms layer
      await commsRef.current?.sendAudioChunk(base64Chunk);
    }
  );

  // Initialize comms with MockRelaySocket (no real server needed)
  useEffect(() => {
    const comms = new ForbiddenLANComms({
      relayUrl: import.meta.env.VITE_WS_URL ?? 'ws://localhost:3000',
      dls140Url: import.meta.env.VITE_DLS140_URL,
      deviceId: DEVICE_ID,
      mock: true, // always use MockRelaySocket — swap to false when relay server is live
    });

    comms.connect(jwt ?? 'mock-dev-token').then(() => {
      commsRef.current = comms;

      // Wire incoming audio to playback (must run after commsRef is ready)
      comms.onMessage(async (msg: any) => {
        if (msg.type === 'PTT_AUDIO' && msg.data) {
          // Decrypt if encryption is ready
          const decoded = encryption.current
            ? await encryption.current.decrypt(msg.data)
            : msg.data;
          playChunk(decoded);
        }
        if (msg.type === 'FLOOR_GRANT') {
          setFloorStatus(commsRef.current!.getFloorStatus(activeTalkgroup));
        }
      });
    });

    const cleanupPolling = comms.startSignalPolling(10000, setSignalStatus);

    const gpsInterval = setInterval(() => {
      const g = comms.getGPS();
      if (g) setGPS(g);
    }, 10_000);

    return () => {
      clearInterval(gpsInterval);
      cleanupPolling();
      comms.disconnect();
    };
  }, [jwt]); // eslint-disable-line react-hooks/exhaustive-deps

  const startPTT = async (tg: string) => {
    if (IS_MOCK) {
      console.log('[MOCK] PTT start', tg);
      return;
    }
    commsRef.current?.startPTT();
    await startMic(); // start capturing mic — browser will prompt for permission
  };

  const stopPTT = () => {
    if (IS_MOCK) {
      console.log('[MOCK] PTT stop');
      return;
    }
    stopMic(); // stop capturing mic
    clearPlayback(); // discard any buffered incoming audio (half-duplex)
    commsRef.current?.stopPTT();
  };

  const sendText = (tg: string, text: string) => {
    if (IS_MOCK) { console.log('[MOCK] text', tg, text); return; }
    commsRef.current?.sendText(tg, text);
  };

  const onMessage = (handler: (msg: any) => void) => {
    if (IS_MOCK) return;
    commsRef.current?.onMessage(handler);
  };

  const sendAudioChunk = async (base64OpusData: string) => {
    if (IS_MOCK) return;
    await commsRef.current?.sendAudioChunk(base64OpusData);
  };

  return { startPTT, stopPTT, sendText, onMessage, sendAudioChunk, deviceId: DEVICE_ID };
}
