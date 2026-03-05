// materialize.ts — replays the operation log to compute current state.
// This is the "read model" — it scans all operations and derives what the
// current talkgroups, memberships, and key rotation counters are.
// Used by the REST shim routes to serve the same response shapes the mobile app expects.
import prisma from '../db/client.js';

export interface Talkgroup {
  id: string;
  name: string;
  master_secret: string; // base64
  rotation_counter: number;
  created_at: string;    // ISO timestamp (from the op that created it)
}

export interface MaterializedState {
  talkgroups: Map<string, Talkgroup>;
  memberships: Map<string, Set<string>>; // talkgroupId → Set<userId>
  memberSites: Map<string, string>;      // "userId:talkgroupId" → site
}

export async function materializeState(): Promise<MaterializedState> {
  const ops = await prisma.operation.findMany({ orderBy: { seq: 'asc' } });

  const talkgroups = new Map<string, Talkgroup>();
  const memberships = new Map<string, Set<string>>();
  const memberSites = new Map<string, string>();

  for (const op of ops) {
    const p = op.payload as any;

    switch (op.type) {
      case 'ADMIN_CREATE_TALKGROUP': {
        talkgroups.set(p.talkgroupId, {
          id: p.talkgroupId,
          name: p.name,
          master_secret: p.masterSecret ?? '',
          rotation_counter: 0,
          created_at: op.issued_at.toISOString(),
        });
        memberships.set(p.talkgroupId, new Set());
        break;
      }

      case 'ADMIN_DELETE_TALKGROUP': {
        talkgroups.delete(p.talkgroupId);
        const members = memberships.get(p.talkgroupId);
        if (members) {
          for (const uid of members) {
            memberSites.delete(`${uid}:${p.talkgroupId}`);
          }
        }
        memberships.delete(p.talkgroupId);
        break;
      }

      case 'ADMIN_ADD_MEMBER': {
        if (!memberships.has(p.talkgroupId)) {
          memberships.set(p.talkgroupId, new Set());
        }
        memberships.get(p.talkgroupId)!.add(p.userId);
        memberSites.set(`${p.userId}:${p.talkgroupId}`, p.site ?? 'unknown');
        break;
      }

      case 'ADMIN_REMOVE_MEMBER': {
        memberships.get(p.talkgroupId)?.delete(p.userId);
        memberSites.delete(`${p.userId}:${p.talkgroupId}`);
        break;
      }

      case 'ADMIN_ROTATE_KEY': {
        const tg = talkgroups.get(p.talkgroupId);
        if (tg) {
          tg.rotation_counter = p.newCounter ?? tg.rotation_counter + 1;
        }
        break;
      }

      case 'ADMIN_SNAPSHOT': {
        // Snapshot replaces all materialized state
        talkgroups.clear();
        memberships.clear();
        memberSites.clear();

        if (p.state?.talkgroups) {
          for (const tg of p.state.talkgroups) {
            talkgroups.set(tg.id, {
              id: tg.id,
              name: tg.name,
              master_secret: tg.master_secret ?? '',
              rotation_counter: tg.rotation_counter ?? 0,
              created_at: tg.created_at ?? op.issued_at.toISOString(),
            });
            memberships.set(tg.id, new Set());
          }
        }
        if (p.state?.memberships) {
          for (const m of p.state.memberships) {
            if (!memberships.has(m.talkgroup_id)) {
              memberships.set(m.talkgroup_id, new Set());
            }
            memberships.get(m.talkgroup_id)!.add(m.user_id);
            memberSites.set(`${m.user_id}:${m.talkgroup_id}`, m.site ?? 'unknown');
          }
        }
        break;
      }
    }
  }

  return { talkgroups, memberships, memberSites };
}
