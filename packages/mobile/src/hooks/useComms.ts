// useComms — wraps ForbiddenLANComms with mic capture, audio playback, AES-GCM encryption,
// and SQLite sync (SyncClient wired in the connect callback).
//
// syncReady is exposed so screens can gate talkgroup-dependent UI behind it.
// JOIN_TALKGROUP should only be sent after syncReady is true (failure #4 mitigation).

import { useEffect, useRef, useState } from 'react';
import { ForbiddenLANComms, SyncClient } from '@forbiddenlan/comms';
import { Encryption } from '@forbiddenlan/comms';
import { useStore } from '../store';
import { useAudioCapture } from './useAudioCapture';
import { useAudioPlayback } from './useAudioPlayback';
import { CONFIG } from '../config';
import { getDb } from '../db/client';
import { ExpoSQLiteAdapter } from '../db/ExpoSQLiteAdapter';

const DEVICE_ID = 'device-placeholder-uuid';

export function useComms() {
  const { setSignalStatus, setFloorStatus, setGPS, jwt, activeTalkgroup, bumpSyncVersion } = useStore();
  const commsRef = useRef<ForbiddenLANComms | null>(null);
  const encryption = useRef<Encryption | null>(null);
  const [syncReady, setSyncReady] = useState(false);

  const { enqueue: playChunk, clear: clearPlayback } = useAudioPlayback();

  // Init encryption once
  useEffect(() => {
    const enc = new Encryption();
    enc.init().then(() => { encryption.current = enc; });
  }, []);

  const { start: startMic, stop: stopMic } = useAudioCapture(
    async (base64Chunk) => {
      await commsRef.current?.sendAudioChunk(base64Chunk);
    }
  );

  useEffect(() => {
    if (!jwt) return;

    setSyncReady(false);

    const comms = new ForbiddenLANComms({
      relayUrl: CONFIG.WS_URL,
      dls140Url: CONFIG.DLS140_URL,
      deviceId: CONFIG.DEVICE_ID,
      mock: CONFIG.MOCK_MODE,
    });

    // Set up SyncClient before registering onMessage so no messages are missed
    const db = getDb();
    const adapter = new ExpoSQLiteAdapter(db);
    const syncClient = new SyncClient(adapter);

    syncClient.onSyncComplete(() => {
      console.log('[useComms] sync_complete — SQLite is up to date');
      setSyncReady(true);
      bumpSyncVersion();
    });

    comms.connect(jwt).then(() => {
      commsRef.current = comms;

      comms.onMessage(async (msg: any) => {
        // ── Sync messages ───────────────────────────────────────────────
        if (msg.type === 'SYNC_TIME' && msg.serverTime !== undefined) {
          // WS connected — fire SYNC_REQUEST with our current cursor
          syncClient
            .startSync((m) => comms.sendRaw(m))
            .catch((e) => console.warn('[useComms] startSync error:', e));
          return;
        }

        if (msg.type === 'SYNC_BATCH') {
          syncClient
            .handleSyncBatch(msg, (m) => comms.sendRaw(m))
            .catch((e) => console.warn('[useComms] handleSyncBatch error:', e));
          return;
        }

        if (msg.type === 'OP' && msg.op) {
          syncClient
            .handleLiveOp(msg.op)
            .then(() => bumpSyncVersion())
            .catch((e) => console.warn('[useComms] handleLiveOp error:', e));
          return;
        }

        // ── PTT audio ───────────────────────────────────────────────────
        if (msg.type === 'PTT_AUDIO' && msg.data) {
          const decoded = encryption.current
            ? await encryption.current.decrypt(msg.data)
            : msg.data;
          playChunk(decoded);
          return;
        }

        // ── Floor control ───────────────────────────────────────────────
        if (msg.type === 'FLOOR_GRANT') {
          setFloorStatus(commsRef.current!.getFloorStatus(activeTalkgroup));
          return;
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
      commsRef.current = null;
    };
  }, [jwt]); // eslint-disable-line react-hooks/exhaustive-deps

  const startPTT = async (tg: string) => {
    commsRef.current?.startPTT();
    await startMic();
  };

  const stopPTT = () => {
    stopMic();
    clearPlayback();
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

  // Gate joinTalkgroup behind syncReady — caller must check syncReady first
  const joinTalkgroup = (talkgroupId: string) => {
    if (!syncReady) {
      console.warn('[useComms] joinTalkgroup called before sync_complete — ignoring');
      return;
    }
    commsRef.current?.joinTalkgroup(talkgroupId);
  };

  return { startPTT, stopPTT, sendText, onMessage, sendAudioChunk, joinTalkgroup, syncReady, deviceId: DEVICE_ID };
}
