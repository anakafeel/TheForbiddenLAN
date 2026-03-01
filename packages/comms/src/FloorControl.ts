// FloorControl — deterministic PTT floor arbitration
// Collision window: 50 ms. Tiebreak: lowest timestamp, then lexically smallest sender UUID.
import type { PTTMessage, FloorStatus } from './types';

interface Candidate {
  sender: string;
  timestamp: number;
}

export class FloorControl {
  private floors = new Map<string, FloorStatus>();
  private pending = new Map<string, Candidate[]>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();

  arbitrate(msg: PTTMessage): void {
    if (msg.type !== 'PTT_START') return;
    const { talkgroup, sender, timestamp } = msg;

    const candidates = this.pending.get(talkgroup) ?? [];
    candidates.push({ sender, timestamp });
    this.pending.set(talkgroup, candidates);

    if (!this.timers.has(talkgroup)) {
      const timer = setTimeout(() => this.resolve(talkgroup), 50);
      this.timers.set(talkgroup, timer);
    }
  }

  private resolve(talkgroup: string): void {
    this.timers.delete(talkgroup);
    const candidates = this.pending.get(talkgroup) ?? [];
    this.pending.delete(talkgroup);
    if (candidates.length === 0) return;

    const winner = candidates.reduce((a, b) => {
      if (a.timestamp !== b.timestamp) return a.timestamp < b.timestamp ? a : b;
      return a.sender < b.sender ? a : b;
    });

    this.floors.set(talkgroup, { holder: winner.sender, talkgroup, timestamp: winner.timestamp });
  }

  getFloor(talkgroup: string): FloorStatus {
    return this.floors.get(talkgroup) ?? { holder: null, talkgroup, timestamp: 0 };
  }
}
