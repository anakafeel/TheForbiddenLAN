// useComms — wraps ForbiddenLANComms with mic capture, audio playback, and AES-GCM encryption.
// Requires valid JWT from login. Connects to the configured relay server.
import { useEffect, useRef } from 'react';
import { ForbiddenLANComms, Encryption } from '@forbiddenlan/comms';
import { useStore } from '../store';
import { useAudioCapture } from './useAudioCapture';
import { useAudioPlayback } from './useAudioPlayback';
import { CONFIG } from '../config';

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

  // Initialize comms with configured relay endpoints
  useEffect(() => {
    if (!jwt) return;

    const comms = new ForbiddenLANComms({
      relayUrl: CONFIG.WS_URL,
      dls140Url: CONFIG.DLS140_URL,
      deviceId: CONFIG.DEVICE_ID,
    });

    comms.connect(jwt).then(() => {
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

  const startPTT = async () => {
    commsRef.current?.startPTT();
    await startMic(); // start capturing mic
  };

  const stopPTT = () => {
    stopMic(); // stop capturing mic
    clearPlayback(); // discard any buffered incoming audio (half-duplex)
    commsRef.current?.stopPTT();
  };

  const sendText = (tg: string, text: string) => {
    commsRef.current?.sendText(tg, text);
  };

  const onMessage = (handler: (msg: any) => void) => {
    commsRef.current?.onMessage(handler);
  };

  const sendAudioChunk = async (base64OpusData: string) => {
    await commsRef.current?.sendAudioChunk(base64OpusData);
  };

  return { startPTT, stopPTT, sendText, onMessage, sendAudioChunk, deviceId: DEVICE_ID };
}
