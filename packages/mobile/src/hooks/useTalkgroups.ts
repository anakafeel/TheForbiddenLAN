// Talkgroup API hooks — list, join, leave, members
import { useState, useCallback, useEffect } from 'react';
import { CONFIG } from '../config';
import { useStore, type AppState } from '../store';

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
 * useTalkgroups — GET /talkgroups
 * Fetches talkgroups the authenticated user belongs to
 */
export function useTalkgroups() {
  const [talkgroups, setTalkgroups] = useState<Talkgroup[]>([]);
  const [state, setState] = useState<TalkgroupState>({ loading: false, error: null });
  const jwt = useStore((s: AppState) => s.jwt);

  const fetchTalkgroups = useCallback(async (): Promise<Talkgroup[]> => {
    if (!jwt) {
      setState({ loading: false, error: 'Not authenticated' });
      return [];
    }

    setState({ loading: true, error: null });

    try {
      const res = await fetch(`${CONFIG.API_URL}/talkgroups`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${jwt}`,
        },
      });

      const data = await res.json();

      if (!res.ok) {
        setState({ loading: false, error: data.error ?? 'Failed to fetch talkgroups' });
        return [];
      }

      setTalkgroups(data.talkgroups);
      setState({ loading: false, error: null });
      return data.talkgroups;
    } catch (err) {
      const errorMsg = 'Cannot reach server';
      setState({ loading: false, error: errorMsg });
      return [];
    }
  }, [jwt]);

  // Auto-fetch on mount when JWT is available
  useEffect(() => {
    if (jwt) {
      fetchTalkgroups();
    }
  }, [jwt, fetchTalkgroups]);

  return { talkgroups, fetchTalkgroups, ...state };
}

/**
 * useJoinTalkgroup — POST /talkgroups/:id/join
 * Joins a talkgroup
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
 * useLeaveTalkgroup — DELETE /talkgroups/:id/leave
 * Leaves a talkgroup
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
 * useTalkgroupMembers — GET /talkgroups/:id/members
 * Fetches members of a talkgroup
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
 * useKeyRotation — GET /keys/rotation
 * Gets the current rotation counter for a talkgroup
 */
export function useKeyRotation() {
  const [counter, setCounter] = useState<number | null>(null);
  const [state, setState] = useState<TalkgroupState>({ loading: false, error: null });
  const jwt = useStore((s: AppState) => s.jwt);

  const fetchRotationCounter = useCallback(async (talkgroupId: string): Promise<{ counter?: number; error?: string }> => {
    if (!jwt) {
      return { error: 'Not authenticated' };
    }

    setState({ loading: true, error: null });

    try {
      const res = await fetch(`${CONFIG.API_URL}/keys/rotation?talkgroupId=${talkgroupId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${jwt}`,
        },
      });

      const data = await res.json();

      if (!res.ok) {
        setState({ loading: false, error: data.error ?? 'Failed to fetch rotation counter' });
        return { error: data.error ?? 'Failed to fetch rotation counter' };
      }

      setCounter(data.counter);
      setState({ loading: false, error: null });
      return { counter: data.counter };
    } catch (err) {
      const errorMsg = 'Cannot reach server';
      setState({ loading: false, error: errorMsg });
      return { error: errorMsg };
    }
  }, [jwt]);

  return { counter, fetchRotationCounter, ...state };
}
