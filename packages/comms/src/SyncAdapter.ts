// SyncAdapter — platform-agnostic interface for the local op log store.
// Implemented by ExpoSQLiteAdapter on mobile. No expo-sqlite import here —
// this file is safe to import in tests or server-side code.

export interface SyncOp {
  seq: number;
  type: string;
  payload: any;
  issued_by: string;
  issued_at: string;
}

export interface SyncAdapter {
  /** Return the last persisted seq number (0 if no ops stored yet) */
  getLastSeq(): Promise<number>;

  /** Persist a single op. Must be idempotent — duplicate calls with same seq are a no-op */
  applyOp(op: SyncOp): Promise<void>;

  /** Update the sync cursor after a SYNC_BATCH is fully applied */
  setLastSeq(seq: number): Promise<void>;
}
