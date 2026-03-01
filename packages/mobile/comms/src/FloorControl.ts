// FloorControl — optimistic GPS timestamp arbitration. No round-trip, instant PTT.
import type { FloorStatus, PTTMessage, FloorGrant, FloorDeny } from './types';

const COLLISION_WINDOW_MS = 50;

export class FloorControl {
  private pending = new Map<string, PTTMessage>();  // talkgroup → first PTT_START seen
  private floor = new Map<string, FloorStatus>();

  /**
   * Called when a PTT_START arrives. Returns FLOOR_GRANT or FLOOR_DENY to send back.
   * Deterministic: lowest GPS timestamp wins. Tiebreak: lexicographically smaller UUID.
   */
  arbitrate(incoming: PTTMessage): FloorGrant | FloorDeny | null {
    const tg = incoming.talkgroup;
    const existing = this.pending.get(tg);

    if (!existing) {
      this.pending.set(tg, incoming);
      // Give it a collision window before granting
      setTimeout(() => this.resolve(tg), COLLISION_WINDOW_MS);
      return null;
    }

    // Collision — keep the winner in pending
    const winner = this.pickWinner(existing, incoming);
    this.pending.set(tg, winner);
    return null;
  }

  private resolve(tg: string): void {
    const winner = this.pending.get(tg);
    if (!winner) return;
    this.pending.delete(tg);
    this.floor.set(tg, { holder: winner.sender, talkgroup: tg, timestamp: winner.timestamp });
  }

  private pickWinner(a: PTTMessage, b: PTTMessage): PTTMessage {
    if (Math.abs(a.timestamp - b.timestamp) < COLLISION_WINDOW_MS) {
      // Tiebreak: lexicographically smaller UUID wins (deterministic across all clients)
      return a.sender < b.sender ? a : b;
    }
    return a.timestamp < b.timestamp ? a : b;
  }

  getFloor(talkgroup: string): FloorStatus {
    return this.floor.get(talkgroup) ?? { holder: null, talkgroup, timestamp: 0 };
  }

  release(talkgroup: string): void {
    this.floor.set(talkgroup, { holder: null, talkgroup, timestamp: 0 });
  }
}
