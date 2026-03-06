// ExpoSQLiteAdapter — implements SyncAdapter using expo-sqlite.
// Passed to SyncClient so the comms package stays platform-agnostic.

import type * as SQLite from 'expo-sqlite';
import type { SyncAdapter, SyncOp } from '@forbiddenlan/comms';
import { applyOp } from './applyOp';

export class ExpoSQLiteAdapter implements SyncAdapter {
  constructor(private db: SQLite.SQLiteDatabase) {}

  async getLastSeq(): Promise<number> {
    const row = await this.db.getFirstAsync<{ last_seq: number }>(
      'SELECT last_seq FROM sync_cursor WHERE id=1',
    );
    return row?.last_seq ?? 0;
  }

  async applyOp(op: SyncOp): Promise<void> {
    await applyOp(this.db, op);
  }

  async setLastSeq(seq: number): Promise<void> {
    await this.db.runAsync(
      'UPDATE sync_cursor SET last_seq=? WHERE id=1',
      [seq],
    );
  }
}
