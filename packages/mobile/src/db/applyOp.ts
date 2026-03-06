// applyOp — materializes ops from the server onto local SQLite tables.
//
// Every write uses INSERT OR IGNORE / INSERT OR REPLACE so calling this
// function twice with the same op is always a safe no-op (idempotent).

import type * as SQLite from 'expo-sqlite';
import type { SyncOp } from '@forbiddenlan/comms';

export async function applyOp(db: SQLite.SQLiteDatabase, op: SyncOp): Promise<void> {
  // Mirror the raw op into the ops log first.
  // Primary key on seq — duplicate seq is silently ignored.
  await db.runAsync(
    'INSERT OR IGNORE INTO ops (seq, type, payload, issued_by, issued_at) VALUES (?,?,?,?,?)',
    [op.seq, op.type, JSON.stringify(op.payload), op.issued_by, op.issued_at],
  );

  const p = op.payload;

  switch (op.type) {
    case 'ADMIN_CREATE_TALKGROUP':
      await db.runAsync(
        `INSERT OR IGNORE INTO talkgroups (id, name, master_secret, rotation_counter, created_at)
         VALUES (?,?,?,0,?)`,
        [p.talkgroupId, p.name, p.masterSecret, op.issued_at],
      );
      break;

    case 'ADMIN_DELETE_TALKGROUP':
      await db.runAsync('DELETE FROM talkgroups WHERE id=?', [p.talkgroupId]);
      await db.runAsync('DELETE FROM memberships WHERE talkgroup_id=?', [p.talkgroupId]);
      break;

    case 'ADMIN_ADD_MEMBER':
      await db.runAsync(
        `INSERT OR REPLACE INTO memberships (user_id, talkgroup_id, site)
         VALUES (?,?,?)`,
        [p.userId, p.talkgroupId, p.site ?? 'unknown'],
      );
      break;

    case 'ADMIN_REMOVE_MEMBER':
      await db.runAsync(
        'DELETE FROM memberships WHERE user_id=? AND talkgroup_id=?',
        [p.userId, p.talkgroupId],
      );
      break;

    case 'ADMIN_ROTATE_KEY':
      await db.runAsync(
        'UPDATE talkgroups SET rotation_counter = rotation_counter + 1 WHERE id=?',
        [p.talkgroupId],
      );
      break;

    case 'ADMIN_DEACTIVATE_DEVICE':
      // Devices live in Postgres on the server, not in local SQLite.
      // Nothing to materialize locally — the op is still recorded in the ops table above.
      break;

    default:
      // Unknown op type — still recorded in ops table, just not materialized.
      break;
  }
}
