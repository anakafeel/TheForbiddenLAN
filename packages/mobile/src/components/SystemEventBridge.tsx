import React, { useEffect, useRef } from 'react';
import NetInfo from '@react-native-community/netinfo';
import type { SignalStatus } from '@forbiddenlan/comms';
import { useStore } from '../store';
import { comms } from '../utils/comms';
import { CONFIG } from '../config';
import { getEffectiveApiUrl } from '../lib/api';

type EndpointAuth = 'app' | 'dls' | 'none';

type SignalEndpoint = {
  url: string;
  base: string;
  auth: EndpointAuth;
};

class EndpointError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const dlsJwtCache = new Map<string, string>();

function hasSignalTelemetry(status: SignalStatus) {
  return (
    status.activeLink !== 'none' ||
    status.certusDataBars > 0 ||
    status.cellularSignal > 0 ||
    status.certusDataUsedKB > 0
  );
}

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function certusBarsFromDbm(dbm: number): number {
  if (!Number.isFinite(dbm)) return 0;
  if (dbm >= -70) return 5;
  if (dbm >= -78) return 4;
  if (dbm >= -85) return 3;
  if (dbm >= -92) return 2;
  if (dbm > -100) return 1;
  return 0;
}

function usageToKB(usage: unknown, unit: unknown): number {
  const value = toNumber(usage);
  const normalizedUnit = String(unit || '').toUpperCase();
  if (!value) return 0;

  if (normalizedUnit === 'GB') return value * 1024 * 1024;
  if (normalizedUnit === 'MB') return value * 1024;
  if (normalizedUnit === 'B') return value / 1024;
  return value;
}

function dbmToPercent(dbm: number): number {
  if (!Number.isFinite(dbm)) return 0;
  if (dbm >= -50) return 100;
  if (dbm <= -120) return 0;
  return Math.round(((dbm + 120) / 70) * 100);
}

function normalizeBaseUrl(input: unknown): string {
  const value = String(input || '').trim();
  if (!value) return '';
  return value.replace(/\/+$/, '');
}

function getCandidateBaseUrls(): string[] {
  const unique = new Set<string>();
  [getEffectiveApiUrl(), CONFIG.API_URL, CONFIG.DLS140_URL].forEach((base) => {
    const normalized = normalizeBaseUrl(base);
    if (normalized) unique.add(normalized);
  });
  return Array.from(unique);
}

function inferActiveLink(
  routingPreference: unknown,
  certusBars: number,
  cellularSignal: number,
): SignalStatus['activeLink'] {
  const normalized = String(routingPreference || '').toLowerCase();
  if (normalized === 'satellite') return 'satellite';
  if (normalized === 'cellular') return 'cellular';

  if (cellularSignal > 40) return 'cellular';
  if (certusBars > 0) return 'satellite';
  return 'none';
}

async function fetchJson(url: string, jwt: string): Promise<any> {
  const response = await fetch(url, {
    headers: jwt ? { Authorization: `Bearer ${jwt}` } : undefined,
  });
  if (!response.ok) {
    throw new EndpointError(response.status, `Signal endpoint failed (${response.status})`);
  }
  return response.json().catch(() => ({}));
}

async function loginDls(base: string): Promise<string> {
  const cached = dlsJwtCache.get(base);
  if (cached) return cached;

  const response = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: CONFIG.DLS140_USER,
      password: CONFIG.DLS140_PASS,
    }),
  });
  if (!response.ok) {
    throw new EndpointError(response.status, `DLS auth failed (${response.status})`);
  }
  const data = await response.json().catch(() => ({}));
  const token = String(data?.jwt ?? data?.token ?? '').trim();
  if (!token) throw new Error('DLS auth response missing token');
  dlsJwtCache.set(base, token);
  return token;
}

async function fetchEndpoint(endpoint: SignalEndpoint, appJwt: string): Promise<any> {
  if (endpoint.auth === 'none') return fetchJson(endpoint.url, '');
  if (endpoint.auth === 'app') return fetchJson(endpoint.url, appJwt);

  // DLS auth endpoint.
  const token = await loginDls(endpoint.base);
  try {
    return await fetchJson(endpoint.url, token);
  } catch (err) {
    if (err instanceof EndpointError && err.status === 401) {
      dlsJwtCache.delete(endpoint.base);
      const refreshed = await loginDls(endpoint.base);
      return fetchJson(endpoint.url, refreshed);
    }
    throw err;
  }
}

async function fetchFirstSuccessfulJson(
  endpoints: SignalEndpoint[],
  jwt: string,
): Promise<any> {
  let lastError: Error | null = null;
  for (const endpoint of endpoints) {
    try {
      return await fetchEndpoint(endpoint, jwt);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error('Request failed');
    }
  }
  throw lastError ?? new Error('All signal endpoints failed');
}

function parseCertusBars(status: any): number {
  const bars = toNumber(
    status?.certusDataBars ??
    status?.certus_data_bars ??
    status?.certus?.dataBars ??
    status?.certus?.bars,
  );
  if (bars > 0) return bars;

  const dbm = toNumber(
    status?.certusSignalStrength ??
    status?.certus_signal_strength ??
    status?.certus?.signalStrength ??
    status?.certus?.dbm,
  );
  return certusBarsFromDbm(dbm);
}

function parseCellularSignal(status: any): number {
  const raw = toNumber(
    status?.cellularSignal ??
    status?.cellular_signal ??
    status?.cellularSignalStrength ??
    status?.cellular_signal_strength ??
    status?.cellular?.signal ??
    status?.cellular?.signalStrength ??
    status?.cellular?.strength ??
    status?.cell?.signalStrength ??
    status?.lte?.signalStrength,
  );

  // Some firmware returns RSSI in dBm (negative).
  if (raw < 0) return dbmToPercent(raw);
  // Some payloads return 0..1 ratio.
  if (raw > 0 && raw <= 1) return Math.round(raw * 100);
  return Math.max(0, Math.min(100, raw));
}

function parseCertusUsageKB(usage: any): number {
  const certusTxRxKb =
    usageToKB(usage?.certus?.txusage, usage?.certus?.txunit) +
    usageToKB(usage?.certus?.rxusage, usage?.certus?.rxunit);
  if (certusTxRxKb > 0) return certusTxRxKb;

  const bytesUsed = toNumber(usage?.bytesUsed ?? usage?.bytes_used ?? usage?.certus?.bytesUsed);
  if (bytesUsed > 0) return bytesUsed / 1024;

  const flatTxRxKb =
    usageToKB(usage?.txusage, usage?.txunit) +
    usageToKB(usage?.rxusage, usage?.rxunit);
  return flatTxRxKb;
}

async function fetchSignalFromApi(jwt: string): Promise<SignalStatus> {
  const dlsBase = normalizeBaseUrl(CONFIG.DLS140_URL);
  const statusEndpoints: SignalEndpoint[] = getCandidateBaseUrls().flatMap((base) => ([
    { url: `${base}/device/status`, base, auth: 'app' as const },
    ...(base === dlsBase ? [{ url: `${base}/device/status`, base, auth: 'dls' as const }] : []),
    ...(base === dlsBase ? [{ url: `${base}/device/status`, base, auth: 'none' as const }] : []),
  ]));
  const usageEndpoints: SignalEndpoint[] = getCandidateBaseUrls().flatMap((base) => ([
    { url: `${base}/device/data-usage?period=24h`, base, auth: 'app' as const },
    ...(base === dlsBase ? [{ url: `${base}/device/data-usage?period=24h`, base, auth: 'dls' as const }] : []),
    ...(base === dlsBase ? [{ url: `${base}/device/data-usage?period=24h`, base, auth: 'none' as const }] : []),
  ]));
  const routingEndpoints: SignalEndpoint[] = getCandidateBaseUrls().flatMap((base) => ([
    { url: `${base}/network/routing`, base, auth: 'app' as const },
    ...(base === dlsBase ? [{ url: `${base}/network/routing`, base, auth: 'dls' as const }] : []),
    ...(base === dlsBase ? [{ url: `${base}/network/routing`, base, auth: 'none' as const }] : []),
  ]));

  const status = await fetchFirstSuccessfulJson(statusEndpoints, jwt);

  const [usageResult, routingResult] = await Promise.allSettled([
    fetchFirstSuccessfulJson(usageEndpoints, jwt),
    fetchFirstSuccessfulJson(routingEndpoints, jwt),
  ]);

  const usage = usageResult.status === 'fulfilled' ? usageResult.value : {};
  const routing = routingResult.status === 'fulfilled' ? routingResult.value : {};

  const certusBars = parseCertusBars(status);
  const cellularSignal = parseCellularSignal(status);
  const certusUsageKb = parseCertusUsageKB(usage);
  const preferredRoute =
    routing?.preference ??
    routing?.prefer ??
    routing?.activeLink ??
    routing?.active_link ??
    status?.activeLink ??
    status?.active_link;

  return {
    certusDataBars: Math.max(0, Math.min(5, Math.round(certusBars))),
    cellularSignal: Math.round(cellularSignal),
    activeLink: inferActiveLink(preferredRoute, certusBars, cellularSignal),
    certusDataUsedKB: Math.max(0, Math.round(certusUsageKb)),
  };
}

interface SystemEventBridgeProps {
  profileHydrated?: boolean;
}

export default function SystemEventBridge({ profileHydrated = true }: SystemEventBridgeProps) {
  const jwt = useStore((s) => s.jwt);
  const role = useStore((s) => s.user?.role);
  const profile = useStore((s) => s.profile);
  const preferredConnection = useStore((s) => s.preferredConnection);
  const signalStatus = useStore((s) => s.signalStatus);
  const setSignalStatus = useStore((s) => s.setSignalStatus);
  const pushNotification = useStore((s) => s.pushNotification);

  const netConnectedRef = useRef<boolean | null>(null);
  const prevSignalRef = useRef<SignalStatus | null>(null);
  const skipFirstProfileSyncRef = useRef(true);

  useEffect(() => {
    skipFirstProfileSyncRef.current = true;
  }, [jwt]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const connected = Boolean(state.isConnected && state.isInternetReachable !== false);
      const previous = netConnectedRef.current;

      if (previous === null) {
        netConnectedRef.current = connected;
        return;
      }

      if (previous && !connected) {
        pushNotification({
          title: 'Network Disconnected',
          message: 'Device lost internet connectivity.',
          severity: 'warning',
          source: 'network',
          dedupeKey: 'network-offline',
        });
      }

      if (!previous && connected) {
        pushNotification({
          title: 'Network Restored',
          message: 'Internet connectivity restored.',
          severity: 'info',
          source: 'network',
          dedupeKey: 'network-online',
        });
      }

      netConnectedRef.current = connected;
    });

    return unsubscribe;
  }, [pushNotification]);

  useEffect(() => {
    if (!jwt || role === 'admin') return undefined;

    let disposed = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const pollSignal = async () => {
      let nextStatus: SignalStatus | null = null;

      try {
        nextStatus = await fetchSignalFromApi(jwt);
      } catch (err) {
        console.warn('[Signal] Router telemetry fetch failed:', err);
        try {
          nextStatus = await comms.getSignalStatus();
        } catch {
          nextStatus = null;
        }
      }

      if (!disposed && nextStatus) {
        setSignalStatus(nextStatus);
      } else if (!disposed) {
        pushNotification({
          title: 'Signal Telemetry Unavailable',
          message: 'Cannot reach router telemetry endpoints. Check DLS connection and credentials.',
          severity: 'warning',
          source: 'signal',
          dedupeKey: 'signal-telemetry-unavailable',
        });
      }
    };

    pollSignal();
    timer = setInterval(pollSignal, 10_000);

    return () => {
      disposed = true;
      if (timer) clearInterval(timer);
    };
  }, [jwt, role, setSignalStatus, pushNotification]);

  useEffect(() => {
    if (!jwt || role === 'admin') return;

    let disposed = false;
    const prefer = preferredConnection === 'satellite' ? 'satellite' : 'cellular';
    const dlsBase = normalizeBaseUrl(CONFIG.DLS140_URL);
    const candidateBases = getCandidateBaseUrls();

    const applyRoutingPreference = async () => {
      try {
        let updated = false;

        for (const base of candidateBases) {
          const variants: Array<{ auth: EndpointAuth; body: Record<string, string> }> = [
            { auth: 'app', body: { preference: prefer } },
            { auth: 'app', body: { prefer } },
          ];
          if (base === dlsBase) {
            variants.push(
              { auth: 'dls', body: { preference: prefer } },
              { auth: 'dls', body: { prefer } },
              { auth: 'none', body: { preference: prefer } },
              { auth: 'none', body: { prefer } },
            );
          }

          for (const variant of variants) {
            let authHeader: Record<string, string> = {};
            if (variant.auth === 'app') {
              authHeader = { Authorization: `Bearer ${jwt}` };
            } else if (variant.auth === 'dls') {
              try {
                const dlsJwt = await loginDls(base);
                authHeader = { Authorization: `Bearer ${dlsJwt}` };
              } catch {
                continue;
              }
            }

            const response = await fetch(`${base}/network/routing`, {
              method: 'PUT',
              headers: {
                'Content-Type': 'application/json',
                ...authHeader,
              },
              body: JSON.stringify(variant.body),
            });
            if (response.ok) {
              updated = true;
              break;
            }
          }

          if (updated) break;
        }

        if (!updated) throw new Error('Routing update failed');

        // Refresh immediately after route change so dashboard cards reflect hardware state quickly.
        const refreshed = await fetchSignalFromApi(jwt).catch(() => null);
        if (!disposed && refreshed) setSignalStatus(refreshed);
        return;
      } catch {
        // Best-effort fallback for legacy comms SDKs that expose setTransportMode.
        const legacy = comms as unknown as {
          setTransportMode?: (mode: 'satcom' | 'cellular') => Promise<void> | void;
        };
        if (typeof legacy.setTransportMode === 'function') {
          try {
            await legacy.setTransportMode(prefer === 'satellite' ? 'satcom' : 'cellular');
            return;
          } catch {
            // Fall through to notification.
          }
        }
      }

      if (!disposed) {
        pushNotification({
          title: 'Routing Update Failed',
          message: `Could not switch preferred link to ${prefer.toUpperCase()}.`,
          severity: 'warning',
          source: 'signal',
          dedupeKey: `routing-update-failed-${prefer}`,
        });
      }
    };

    applyRoutingPreference();

    return () => {
      disposed = true;
    };
  }, [jwt, role, preferredConnection, pushNotification, setSignalStatus]);

  useEffect(() => {
    if (!jwt || role === 'admin' || !profileHydrated) return;

    if (skipFirstProfileSyncRef.current) {
      skipFirstProfileSyncRef.current = false;
      return;
    }

    const syncProfile = async () => {
      try {
        await fetch(`${CONFIG.API_URL}/users/me/profile`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${jwt}`,
          },
          body: JSON.stringify({
            display_name: profile.displayName,
            callsign: profile.callsign,
            photo_url: profile.photoUrl,
            status_message: profile.statusMessage,
          }),
        });
      } catch {
        // Best effort sync; local profile remains source of truth on device.
      }
    };

    syncProfile();
  }, [jwt, role, profileHydrated, profile.displayName, profile.callsign, profile.photoUrl, profile.statusMessage]);

  useEffect(() => {
    const previous = prevSignalRef.current;
    const current = signalStatus;

    if (!previous) {
      prevSignalRef.current = current;
      return;
    }

    const prevHasTelemetry = hasSignalTelemetry(previous);
    const curHasTelemetry = hasSignalTelemetry(current);

    if (prevHasTelemetry || curHasTelemetry) {
      if (previous.activeLink !== current.activeLink) {
        if (previous.activeLink !== 'none' && current.activeLink === 'none') {
          pushNotification({
            title: 'Connection Lost',
            message: `${previous.activeLink.toUpperCase()} link dropped.`,
            severity: 'warning',
            source: 'signal',
            dedupeKey: 'signal-link-lost',
          });
        } else if (previous.activeLink === 'none' && current.activeLink !== 'none') {
          pushNotification({
            title: 'Connection Restored',
            message: `${current.activeLink.toUpperCase()} link is back online.`,
            severity: 'info',
            source: 'signal',
            dedupeKey: 'signal-link-restored',
          });
        } else if (previous.activeLink === 'satellite' && current.activeLink === 'cellular') {
          pushNotification({
            title: 'Fallback Engaged',
            message: 'Traffic switched from SATCOM to cellular.',
            severity: 'warning',
            source: 'signal',
            dedupeKey: 'signal-fallback-cellular',
          });
        } else if (previous.activeLink === 'cellular' && current.activeLink === 'satellite') {
          pushNotification({
            title: 'SATCOM Active',
            message: 'Traffic switched from cellular to SATCOM.',
            severity: 'info',
            source: 'signal',
            dedupeKey: 'signal-satcom-active',
          });
        }
      }

      if (current.activeLink === 'satellite') {
        if (previous.certusDataBars >= 2 && current.certusDataBars === 0) {
          pushNotification({
            title: 'Satellite Signal Lost',
            message: 'Certus data bars dropped to 0.',
            severity: 'warning',
            source: 'signal',
            dedupeKey: 'signal-sat-lost',
          });
        } else if (previous.certusDataBars >= 4 && current.certusDataBars <= 2) {
          pushNotification({
            title: 'Satellite Signal Degraded',
            message: `Certus dropped to ${current.certusDataBars}/5 bars.`,
            severity: 'warning',
            source: 'signal',
            dedupeKey: 'signal-sat-degraded',
          });
        }
      }

      if (current.activeLink === 'cellular') {
        if (previous.cellularSignal >= 30 && current.cellularSignal < 15) {
          pushNotification({
            title: 'Cellular Signal Weak',
            message: `Cellular signal dropped to ${current.cellularSignal}%.`,
            severity: 'warning',
            source: 'signal',
            dedupeKey: 'signal-cell-weak',
          });
        } else if (previous.cellularSignal < 15 && current.cellularSignal >= 30) {
          pushNotification({
            title: 'Cellular Signal Recovered',
            message: `Cellular signal recovered to ${current.cellularSignal}%.`,
            severity: 'info',
            source: 'signal',
            dedupeKey: 'signal-cell-recovered',
          });
        }
      }

      if (preferredConnection === 'satellite' && current.activeLink === 'cellular') {
        pushNotification({
          title: 'Preferred Link Unavailable',
          message: 'Preferred SATCOM link unavailable, using cellular.',
          severity: 'warning',
          source: 'signal',
          dedupeKey: 'signal-preferred-satellite-unavailable',
        });
      }
    }

    prevSignalRef.current = current;
  }, [signalStatus, preferredConnection, pushNotification]);

  return null;
}
