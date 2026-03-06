// useSyncClient — wires SyncClient to ForbiddenLANComms.
//
// How it works:
//   1. When the WebSocket connects, the server echoes a SYNC_TIME message
//      (with serverTime set). useSyncClient uses that as the "connected" signal
//      to fire SYNC_REQUEST.
//   2. Incoming SYNC_BATCH and OP messages are forwarded to SyncClient.
//   3. SyncClient calls the ExpoSQLiteAdapter (which writes to local SQLite).
//   4. After SYNC_BATCH is fully applied, SyncClient fires sync_complete →
//      syncReady flips to true and syncVersion is bumped → useTalkgroups re-reads.
//   5. After each live OP is applied, syncVersion is bumped again.
//
// syncReady should gate any UI that reads talkgroups/memberships from SQLite.

import { useState, useEffect, useRef, type RefObject } from 'react';
import { SyncClient } from '@forbiddenlan/comms';
import type { ForbiddenLANComms } from '@forbiddenlan/comms';
import { getDb } from '../db/client';
import { ExpoSQLiteAdapter } from '../db/ExpoSQLiteAdapter';
import { useStore, type AppState } from '../store';

export function useSyncClient(commsRef: RefObject<ForbiddenLANComms | null>) {
  const [syncReady, setSyncReady] = useState(false);
  const syncClientRef = useRef<SyncClient | null>(null);
  const bumpSyncVersion = useStore((s: AppState) => s.bumpSyncVersion);

  useEffect(() => {
    const db = getDb();
    const adapter = new ExpoSQLiteAdapter(db);
    const syncClient = new SyncClient(adapter);
    syncClientRef.current = syncClient;

    syncClient.onSyncComplete(() => {
      console.log('[useSyncClient] sync_complete — SQLite is up to date');
      setSyncReady(true);
      bumpSyncVersion();
    });

    const comms = commsRef.current;
    if (!comms) return;

    comms.onMessage((msg: any) => {
      if (msg.type === 'SYNC_TIME' && msg.serverTime !== undefined) {
        // WS is connected — kick off the sync
        syncClient
          .startSync((m) => comms.sendRaw(m))
          .catch((e) => console.warn('[useSyncClient] startSync error:', e));
        return;
      }

      if (msg.type === 'SYNC_BATCH') {
        syncClient
          .handleSyncBatch(msg, (m) => comms.sendRaw(m))
          .catch((e) => console.warn('[useSyncClient] handleSyncBatch error:', e));
        return;
      }

      if (msg.type === 'OP' && msg.op) {
        syncClient
          .handleLiveOp(msg.op)
          .then(() => bumpSyncVersion())
          .catch((e) => console.warn('[useSyncClient] handleLiveOp error:', e));
        return;
      }
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { syncReady, syncClientRef };
}
