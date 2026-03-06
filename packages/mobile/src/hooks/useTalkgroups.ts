// Talkgroup hooks — reads from local SQLite, writes go via WebSocket admin ops or REST shim.
//
// useTalkgroups         — reads talkgroup list from SQLite (re-queries on syncVersion bump)
// useJoinTalkgroup      — REST shim POST (WebSocket REQUEST_JOIN_TALKGROUP once shim is removed)
// useLeaveTalkgroup     — REST shim DELETE
// useTalkgroupMembers   — REST shim GET (users table not cached in SQLite)
// useKeyRotation        — reads rotation_counter from SQLite talkgroups table

import { useState, useCallback, useEffect } from 'react';
import { CONFIG } from '../config';
import { useStore, type AppState } from '../store';
import { getDb } from '../db/client';

interface Talkgroup {
  id: string;
  name: string;
  rotation_counter?: number;
  created_at?: string;
}

interface TalkgroupMember {
  id: string;
  username: string;
  role: string;
}

interface Membership {
  user_id: string;
  talkgroup_id: string;
  site: string;
}

interface TalkgroupState {
  loading: boolean;
  error: string | null;
}

/**
 * useTalkgroups — reads talkgroup list from local SQLite.
 * Re-queries whenever the op log is updated (syncVersion bump).
 * Admins see all talkgroups; regular users see only talkgroups they're a member of.
 */
export function useTalkgroups() {
  const [talkgroups, setTalkgroups] = useState<Talkgroup[]>([]);
  const [state, setState] = useState<TalkgroupState>({ loading: false, error: null });
  const user = useStore((s: AppState) => s.user);
  const syncVersion = useStore((s: AppState) => s.syncVersion);

  const fetchTalkgroups = useCallback(async (): Promise<Talkgroup[]> => {
    if (!user) {
      setState({ loading: false, error: 'Not authenticated' });
      return [];
    }

    setState({ loading: true, error: null });

    try {
      const db = getDb();
      let rows: Talkgroup[];

      if (user.role === 'admin') {
        rows = await db.getAllAsync<Talkgroup>('SELECT * FROM talkgroups ORDER BY created_at ASC');
      } else {
        rows = await db.getAllAsync<Talkgroup>(
          `SELECT t.id, t.name, t.rotation_counter, t.created_at
           FROM talkgroups t
           JOIN memberships m ON t.id = m.talkgroup_id
           WHERE m.user_id = ?
           ORDER BY t.created_at ASC`,
          [user.sub],
        );
      }

      setTalkgroups(rows);
      setState({ loading: false, error: null });
      return rows;
    } catch (err) {
      const errorMsg = 'Failed to read talkgroups from local database';
      setState({ loading: false, error: errorMsg });
      return [];
    }
  }, [user]);

  // Re-query whenever the op log changes (initial sync complete + live ops)
  useEffect(() => {
    if (user) {
      fetchTalkgroups();
    }
  }, [user, syncVersion, fetchTalkgroups]);

  return { talkgroups, fetchTalkgroups, ...state };
}

/**
 * useJoinTalkgroup — POST /talkgroups/:id/join (REST shim)
 * When the shim is removed this will switch to REQUEST_JOIN_TALKGROUP over WebSocket.
 */
export function useJoinTalkgroup() {
  const [state, setState] = useState<TalkgroupState>({ loading: false, error: null });
  const jwt = useStore((s: AppState) => s.jwt);

  const joinTalkgroup = useCallback(async (talkgroupId: string): Promise<{ membership?: Membership; error?: string }> => {
    if (!jwt) {
      return { error: 'Not authenticated' };
    }

    setState({ loading: true, error: null });

    try {
      const res = await fetch(`${CONFIG.API_URL}/talkgroups/${talkgroupId}/join`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${jwt}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await res.json();

      if (!res.ok) {
        setState({ loading: false, error: data.error ?? 'Failed to join talkgroup' });
        return { error: data.error ?? 'Failed to join talkgroup' };
      }

      setState({ loading: false, error: null });
      return { membership: data.membership };
    } catch (err) {
      const errorMsg = 'Cannot reach server';
      setState({ loading: false, error: errorMsg });
      return { error: errorMsg };
    }
  }, [jwt]);

  return { joinTalkgroup, ...state };
}

/**
 * useLeaveTalkgroup — DELETE /talkgroups/:id/leave (REST shim)
 */
export function useLeaveTalkgroup() {
  const [state, setState] = useState<TalkgroupState>({ loading: false, error: null });
  const jwt = useStore((s: AppState) => s.jwt);

  const leaveTalkgroup = useCallback(async (talkgroupId: string): Promise<{ ok?: boolean; error?: string }> => {
    if (!jwt) {
      return { error: 'Not authenticated' };
    }

    setState({ loading: true, error: null });

    try {
      const res = await fetch(`${CONFIG.API_URL}/talkgroups/${talkgroupId}/leave`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${jwt}`,
        },
      });

      const data = await res.json();

      if (!res.ok) {
        setState({ loading: false, error: data.error ?? 'Failed to leave talkgroup' });
        return { error: data.error ?? 'Failed to leave talkgroup' };
      }

      setState({ loading: false, error: null });
      return { ok: true };
    } catch (err) {
      const errorMsg = 'Cannot reach server';
      setState({ loading: false, error: errorMsg });
      return { error: errorMsg };
    }
  }, [jwt]);

  return { leaveTalkgroup, ...state };
}

/**
 * useTalkgroupMembers — GET /talkgroups/:id/members (REST shim)
 * Stays on REST because the users table is not cached in local SQLite.
 */
export function useTalkgroupMembers() {
  const [members, setMembers] = useState<TalkgroupMember[]>([]);
  const [state, setState] = useState<TalkgroupState>({ loading: false, error: null });
  const jwt = useStore((s: AppState) => s.jwt);

  const fetchMembers = useCallback(async (talkgroupId: string): Promise<TalkgroupMember[]> => {
    if (!jwt) {
      setState({ loading: false, error: 'Not authenticated' });
      return [];
    }

    setState({ loading: true, error: null });

    try {
      const res = await fetch(`${CONFIG.API_URL}/talkgroups/${talkgroupId}/members`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${jwt}`,
        },
      });

      const data = await res.json();

      if (!res.ok) {
        setState({ loading: false, error: data.error ?? 'Failed to fetch members' });
        return [];
      }

      setMembers(data.members);
      setState({ loading: false, error: null });
      return data.members;
    } catch (err) {
      const errorMsg = 'Cannot reach server';
      setState({ loading: false, error: errorMsg });
      return [];
    }
  }, [jwt]);

  return { members, fetchMembers, ...state };
}

/**
 * useKeyRotation — reads rotation_counter from local SQLite talkgroups table.
 */
export function useKeyRotation() {
  const [counter, setCounter] = useState<number | null>(null);
  const [state, setState] = useState<TalkgroupState>({ loading: false, error: null });
  const syncVersion = useStore((s: AppState) => s.syncVersion);

  const fetchRotationCounter = useCallback(async (talkgroupId: string): Promise<{ counter?: number; error?: string }> => {
    setState({ loading: true, error: null });

    try {
      const db = getDb();
      const row = await db.getFirstAsync<{ rotation_counter: number }>(
        'SELECT rotation_counter FROM talkgroups WHERE id=?',
        [talkgroupId],
      );

      if (!row) {
        setState({ loading: false, error: 'Talkgroup not found in local database' });
        return { error: 'Talkgroup not found' };
      }

      setCounter(row.rotation_counter);
      setState({ loading: false, error: null });
      return { counter: row.rotation_counter };
    } catch (err) {
      const errorMsg = 'Failed to read rotation counter from local database';
      setState({ loading: false, error: errorMsg });
      return { error: errorMsg };
    }
  }, [syncVersion]); // re-create when op log changes so callers get fresh data

  return { counter, fetchRotationCounter, ...state };
}
