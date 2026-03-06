// SyncClient — cursor-based op log sync state machine.
//
// Protocol:
//   client → server:  SYNC_REQUEST { lastSeq }
//   server → client:  SYNC_BATCH   { ops: SyncOp[], upToSeq: number }
//   client → server:  SYNC_ACK     { lastSeq: number }
//
// Live broadcast (while connected):
//   server → client:  OP { op: SyncOp }
//
// Duplicate-op safety:
//   When a SYNC_REQUEST is in-flight, any live OP with seq <= pendingUpToSeq is
//   dropped — it will arrive inside the SYNC_BATCH.  Ops that arrive with a seq
//   higher than the batch ceiling are queued and flushed after the batch lands.
//   The adapter's applyOp must also use INSERT OR IGNORE so double-applying any
//   op that slips through is still a safe no-op.

import type { SyncAdapter, SyncOp } from './SyncAdapter';

type SendFn = (msg: object) => void;
type SyncCompleteCallback = () => void;

export class SyncClient {
  private syncInFlight = false;
  private pendingUpToSeq = 0;
  private liveOpQueue: SyncOp[] = [];
  private syncCompleteCallbacks: SyncCompleteCallback[] = [];

  constructor(private adapter: SyncAdapter) {}

  // ── Registration ────────────────────────────────────────────────────────────

  /** Register a callback that fires once after the first SYNC_BATCH is fully applied. */
  onSyncComplete(cb: SyncCompleteCallback): void {
    this.syncCompleteCallbacks.push(cb);
  }

  // ── Outbound ─────────────────────────────────────────────────────────────────

  /** Send SYNC_REQUEST with the device's current cursor position. */
  async startSync(sendFn: SendFn): Promise<void> {
    const lastSeq = await this.adapter.getLastSeq();
    this.syncInFlight = true;
    this.pendingUpToSeq = 0;
    this.liveOpQueue = [];
    sendFn({ type: 'SYNC_REQUEST', lastSeq });
    console.log(`[SyncClient] SYNC_REQUEST sent (lastSeq=${lastSeq})`);
  }

  // ── Inbound ──────────────────────────────────────────────────────────────────

  /**
   * Handle SYNC_BATCH from the server.
   * Applies all ops to the adapter, updates cursor, sends SYNC_ACK, then
   * flushes any queued live ops whose seq is beyond the batch ceiling.
   */
  async handleSyncBatch(
    batch: { ops: SyncOp[]; upToSeq: number },
    sendFn: SendFn,
  ): Promise<void> {
    const { ops, upToSeq } = batch;
    this.pendingUpToSeq = upToSeq;

    console.log(`[SyncClient] SYNC_BATCH received — ${ops.length} op(s), upToSeq=${upToSeq}`);

    for (const op of ops) {
      try {
        await this.adapter.applyOp(op);
      } catch (e) {
        console.warn(`[SyncClient] applyOp failed for seq=${op.seq}:`, e);
      }
    }

    await this.adapter.setLastSeq(upToSeq);
    sendFn({ type: 'SYNC_ACK', lastSeq: upToSeq });

    this.syncInFlight = false;

    // Notify consumers that local state is ready
    for (const cb of this.syncCompleteCallbacks) {
      try { cb(); } catch {}
    }

    // Flush queued live ops that arrived during the batch (seq > upToSeq only)
    const toFlush = this.liveOpQueue.filter(op => op.seq > upToSeq);
    this.liveOpQueue = [];
    for (const op of toFlush) {
      await this._applyLiveOp(op);
    }
  }

  /**
   * Handle a live OP message broadcast by the server when a new op is appended.
   * Deduplicates against an in-flight SYNC_BATCH.
   */
  async handleLiveOp(op: SyncOp): Promise<void> {
    if (this.syncInFlight) {
      if (this.pendingUpToSeq > 0 && op.seq <= this.pendingUpToSeq) {
        // Will arrive in the SYNC_BATCH — drop
        console.log(`[SyncClient] Dropping live OP seq=${op.seq} (covered by batch up to ${this.pendingUpToSeq})`);
        return;
      }
      // Arrived before we know the batch ceiling — queue it
      this.liveOpQueue.push(op);
      console.log(`[SyncClient] Queued live OP seq=${op.seq} (batch in-flight)`);
      return;
    }
    await this._applyLiveOp(op);
  }

  // ── Internal ─────────────────────────────────────────────────────────────────

  private async _applyLiveOp(op: SyncOp): Promise<void> {
    try {
      await this.adapter.applyOp(op);
      await this.adapter.setLastSeq(op.seq);
      console.log(`[SyncClient] Applied live OP seq=${op.seq} type=${op.type}`);
    } catch (e) {
      console.warn(`[SyncClient] Failed to apply live OP seq=${op.seq}:`, e);
    }
  }
}
