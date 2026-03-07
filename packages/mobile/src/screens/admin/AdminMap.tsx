import React, { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View } from 'react-native';
import * as satellite from 'satellite.js';
import {
  getAdminErrorMessage,
  getAdminRouterPosition,
  listAdminMapPositions,
  type AdminMapPosition,
  type AdminRouterPosition,
} from '../../lib/adminApi';
import { api } from '../../lib/api';
import { useAppTheme } from '../../theme';

let SatelliteGlobe: any;
if (Platform.OS === 'web') {
  SatelliteGlobe = require('../../components/SatelliteGlobe').SatelliteGlobe;
}

type MarkerColor = [number, number, number];

type FocusTarget = {
  id: string;
  label: string;
  lat: number;
  lng: number;
  type: 'router' | 'device';
};

type IridiumSatellite = {
  id: string;
  name: string;
  satrec: satellite.SatRec;
};

const DEVICE_REFRESH_MS = 45_000;
const ROUTER_REFRESH_MS = 60_000;
const TLE_REFRESH_MS = 10 * 60_000;
const SATELLITE_MOTION_STEP_MS = 1_000;
const SATELLITE_MARKER_COLOR: MarkerColor = [0.17, 0.94, 1];
const ROUTER_MARKER_COLOR: MarkerColor = [1, 0.66, 0.22];
const DEVICE_ACTIVE_COLOR: MarkerColor = [0.21, 0.92, 0.4];
const DEVICE_INACTIVE_COLOR: MarkerColor = [0.92, 0.35, 0.35];

function splitTleLines(raw: string): string[] {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseIridiumTles(raw: string): IridiumSatellite[] {
  const lines = splitTleLines(raw);
  const output: IridiumSatellite[] = [];

  for (let index = 0; index < lines.length - 2; index += 3) {
    const name = lines[index];
    const line1 = lines[index + 1];
    const line2 = lines[index + 2];
    if (!line1?.startsWith('1 ') || !line2?.startsWith('2 ')) continue;

    try {
      const satrec = satellite.twoline2satrec(line1, line2);
      output.push({
        id: `${name}-${index}`,
        name,
        satrec,
      });
    } catch {
      continue;
    }
  }

  return output;
}

function toDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

function computeSatelliteMarkers(catalog: IridiumSatellite[], now: Date) {
  const gmst = satellite.gstime(now);

  return catalog
    .map((entry) => {
      const propagated = satellite.propagate(entry.satrec, now);
      if (!propagated) return null;
      const position = propagated.position;
      if (!position) return null;

      const geodetic = satellite.eciToGeodetic(position, gmst);
      const lat = toDegrees(geodetic.latitude);
      const lng = toDegrees(geodetic.longitude);

      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

      return {
        id: entry.id,
        lat,
        lng,
        size: 0.022,
        color: SATELLITE_MARKER_COLOR,
      };
    })
    .filter((marker): marker is { id: string; lat: number; lng: number; size: number; color: MarkerColor } => Boolean(marker));
}

export function AdminMap() {
  const { colors, spacing, typography, isDark } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, spacing, typography), [colors, spacing, typography]);

  const webStyles = useMemo(
    () => ({
      panel: {
        display: 'grid',
        gridTemplateColumns: '1fr',
        gap: spacing.md,
        height: '100%',
      } as CSSProperties,
      globeShell: {
        position: 'relative',
        border: `1px solid ${colors.border.subtle}`,
        borderRadius: 16,
        background: isDark
          ? 'radial-gradient(circle at 18% 15%, rgba(7, 37, 55, 0.5), rgba(4, 6, 12, 0.98))'
          : 'radial-gradient(circle at 18% 15%, rgba(194, 233, 255, 0.55), rgba(234, 242, 250, 0.95))',
        minHeight: 460,
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: spacing.md,
      } as CSSProperties,
      statsRow: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: spacing.sm,
      } as CSSProperties,
      statCard: {
        border: `1px solid ${colors.border.subtle}`,
        backgroundColor: colors.background.card,
        borderRadius: 12,
        padding: spacing.sm,
      } as CSSProperties,
      statLabel: {
        color: colors.text.muted,
        fontSize: typography.size.xs,
        marginBottom: 4,
      } as CSSProperties,
      statValue: {
        color: colors.text.primary,
        fontSize: typography.size.sm,
        fontWeight: 700,
      } as CSSProperties,
      listGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: spacing.md,
      } as CSSProperties,
      card: {
        border: `1px solid ${colors.border.subtle}`,
        backgroundColor: colors.background.card,
        borderRadius: 12,
        overflow: 'hidden',
      } as CSSProperties,
      cardHeader: {
        borderBottom: `1px solid ${colors.border.subtle}`,
        color: colors.text.primary,
        padding: spacing.sm,
        fontWeight: 700,
        fontSize: typography.size.sm,
      } as CSSProperties,
      cardBody: {
        padding: spacing.sm,
        display: 'flex',
        flexDirection: 'column',
        gap: spacing.sm,
        maxHeight: 250,
        overflowY: 'auto',
      } as CSSProperties,
      dataButton: {
        border: `1px solid ${colors.border.subtle}`,
        backgroundColor: colors.background.secondary,
        borderRadius: 10,
        padding: spacing.sm,
        textAlign: 'left',
        cursor: 'pointer',
        color: colors.text.primary,
        boxShadow: 'none',
      } as CSSProperties,
      selectedDataButton: {
        borderColor: colors.status.info,
      } as CSSProperties,
      paletteRow: {
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.md,
        padding: `${spacing.xs}px 0`,
      } as CSSProperties,
      paletteItem: {
        display: 'flex',
        alignItems: 'center',
        gap: spacing.xs,
        color: colors.text.muted,
        fontSize: typography.size.xs,
      } as CSSProperties,
      paletteDot: {
        width: 10,
        height: 10,
        borderRadius: 999,
      } as CSSProperties,
      controlsRow: {
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'center',
        gap: spacing.sm,
      } as CSSProperties,
      controlButton: {
        border: `1px solid ${colors.border.subtle}`,
        borderRadius: 10,
        padding: `${spacing.xs}px ${spacing.sm}px`,
        backgroundColor: colors.background.card,
        color: colors.text.primary,
        cursor: 'pointer',
        fontSize: typography.size.xs,
        boxShadow: 'none',
      } as CSSProperties,
      metaText: {
        color: colors.text.muted,
        fontSize: typography.size.xs,
        marginTop: 4,
      } as CSSProperties,
      emptyText: {
        color: colors.text.muted,
        fontSize: typography.size.sm,
      } as CSSProperties,
      helper: {
        color: colors.text.muted,
        fontSize: typography.size.xs,
        textAlign: 'center',
        marginTop: spacing.xs,
      } as CSSProperties,
    }),
    [colors, spacing, typography, isDark],
  );

  const [positions, setPositions] = useState<AdminMapPosition[]>([]);
  const [routerPosition, setRouterPosition] = useState<AdminRouterPosition | null>(null);
  const [iridiumCatalog, setIridiumCatalog] = useState<IridiumSatellite[]>([]);
  const [clock, setClock] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const [positionsError, setPositionsError] = useState('');
  const [routerError, setRouterError] = useState('');
  const [satelliteError, setSatelliteError] = useState('');
  const [lastDataSyncAt, setLastDataSyncAt] = useState<string>('');
  const [lastTleSyncAt, setLastTleSyncAt] = useState<string>('');
  const [focusTarget, setFocusTarget] = useState<FocusTarget | null>(null);
  const [focusToken, setFocusToken] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const syncPositions = useCallback(async () => {
    try {
      const nextPositions = await listAdminMapPositions();
      if (!mountedRef.current) return;
      setPositions(nextPositions);
      setPositionsError('');
      setLastDataSyncAt(new Date().toISOString());
    } catch (err) {
      if (!mountedRef.current) return;
      setPositionsError(getAdminErrorMessage(err, 'Failed to load device positions'));
    } finally {
      setLoading(false);
    }
  }, []);

  const syncRouter = useCallback(async () => {
    try {
      const nextRouter = await getAdminRouterPosition();
      if (!mountedRef.current) return;
      setRouterPosition(nextRouter);
      setRouterError('');
      setLastDataSyncAt(new Date().toISOString());
    } catch (err) {
      if (!mountedRef.current) return;
      setRouterError(getAdminErrorMessage(err, 'Failed to load router location'));
    } finally {
      setLoading(false);
    }
  }, []);

  const syncIridiumTles = useCallback(async () => {
    try {
      const payload = await api.getText('/tle/iridium');
      const nextCatalog = parseIridiumTles(payload);
      if (!mountedRef.current) return;

      setIridiumCatalog(nextCatalog);
      setSatelliteError('');
      setLastTleSyncAt(new Date().toISOString());
    } catch (err) {
      if (!mountedRef.current) return;
      const message = err instanceof Error ? err.message : 'Failed to load Iridium satellites';
      setSatelliteError(message);
    }
  }, []);

  useEffect(() => {
    syncPositions();
    syncRouter();
    syncIridiumTles();

    const deviceTimer = setInterval(syncPositions, DEVICE_REFRESH_MS);
    const routerTimer = setInterval(syncRouter, ROUTER_REFRESH_MS);
    const tleTimer = setInterval(syncIridiumTles, TLE_REFRESH_MS);
    const motionTimer = setInterval(() => setClock(Date.now()), SATELLITE_MOTION_STEP_MS);

    return () => {
      clearInterval(deviceTimer);
      clearInterval(routerTimer);
      clearInterval(tleTimer);
      clearInterval(motionTimer);
    };
  }, [syncPositions, syncRouter, syncIridiumTles]);

  useEffect(() => {
    if (!focusTarget) return;

    if (focusTarget.type === 'router' && routerPosition) {
      setFocusTarget((prev) => (prev ? { ...prev, lat: routerPosition.lat, lng: routerPosition.lng } : prev));
      return;
    }

    if (focusTarget.type === 'device') {
      const match = positions.find((entry) => entry.deviceId === focusTarget.id);
      if (match) {
        setFocusTarget((prev) =>
          prev
            ? {
                ...prev,
                lat: match.lat,
                lng: match.lng,
                label: match.deviceName,
              }
            : prev,
        );
      }
    }
  }, [focusTarget, positions, routerPosition]);

  const focusPoint = useMemo(() => {
    if (!focusTarget) return null;
    return {
      lat: focusTarget.lat,
      lng: focusTarget.lng,
      zoom: 1.92,
      token: focusToken,
    };
  }, [focusTarget, focusToken]);

  const satelliteMarkers = useMemo(
    () => computeSatelliteMarkers(iridiumCatalog, new Date(clock)),
    [iridiumCatalog, clock],
  );

  const deviceMarkers = useMemo(
    () =>
      positions.map((point) => ({
        id: `device-${point.deviceId}`,
        lat: point.lat,
        lng: point.lng,
        size: point.active ? 0.07 : 0.055,
        color: point.active ? DEVICE_ACTIVE_COLOR : DEVICE_INACTIVE_COLOR,
      })),
    [positions],
  );

  const routerMarkers = useMemo(
    () =>
      routerPosition
        ? [
            {
              id: 'router-main',
              lat: routerPosition.lat,
              lng: routerPosition.lng,
              size: 0.095,
              color: ROUTER_MARKER_COLOR,
            },
          ]
        : [],
    [routerPosition],
  );

  const markers = useMemo(() => [...satelliteMarkers, ...routerMarkers, ...deviceMarkers], [satelliteMarkers, routerMarkers, deviceMarkers]);

  const selectRouter = useCallback(() => {
    if (!routerPosition) return;
    if (focusTarget?.type === 'router') {
      setFocusTarget(null);
      setFocusToken((value) => value + 1);
      return;
    }
    setFocusTarget({
      id: 'router-main',
      label: 'DLS Router',
      lat: routerPosition.lat,
      lng: routerPosition.lng,
      type: 'router',
    });
    setFocusToken((value) => value + 1);
  }, [routerPosition, focusTarget]);

  const selectDevice = useCallback((device: AdminMapPosition) => {
    if (focusTarget?.type === 'device' && focusTarget.id === device.deviceId) {
      setFocusTarget(null);
      setFocusToken((value) => value + 1);
      return;
    }
    setFocusTarget({
      id: device.deviceId,
      label: device.deviceName,
      lat: device.lat,
      lng: device.lng,
      type: 'device',
    });
    setFocusToken((value) => value + 1);
  }, [focusTarget]);

  const resetView = useCallback(() => {
    setFocusTarget(null);
    setFocusToken((value) => value + 1);
  }, []);

  const refreshAll = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await Promise.all([syncPositions(), syncRouter(), syncIridiumTles()]);
      if (mountedRef.current) {
        setClock(Date.now());
      }
    } finally {
      if (mountedRef.current) {
        setRefreshing(false);
      }
    }
  }, [refreshing, syncPositions, syncRouter, syncIridiumTles]);

  if (Platform.OS !== 'web') {
    return (
      <View style={styles.center}>
        <Text style={styles.fallbackText}>Map view is only available on web</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.status.info} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {!!positionsError && <Text style={styles.error}>{positionsError}</Text>}
      {!!routerError && <Text style={styles.error}>{routerError}</Text>}
      {!!satelliteError && <Text style={styles.error}>{satelliteError}</Text>}

      <div style={webStyles.panel}>
        <div style={webStyles.statsRow}>
          <div style={webStyles.statCard}>
            <div style={webStyles.statLabel}>Iridium Satellites</div>
            <div style={webStyles.statValue}>{satelliteMarkers.length}</div>
          </div>
          <div style={webStyles.statCard}>
            <div style={webStyles.statLabel}>Devices with GPS</div>
            <div style={webStyles.statValue}>{positions.length}</div>
          </div>
          <div style={webStyles.statCard}>
            <div style={webStyles.statLabel}>Router GPS</div>
            <div style={webStyles.statValue}>{routerPosition ? 'Live' : 'Unavailable'}</div>
          </div>
          <div style={webStyles.statCard}>
            <div style={webStyles.statLabel}>Focus</div>
            <div style={webStyles.statValue}>{focusTarget?.label ?? 'Auto-Rotate'}</div>
          </div>
        </div>

        <div style={webStyles.globeShell}>
          {SatelliteGlobe ? (
            <SatelliteGlobe
              markers={markers}
              dark={isDark}
              focusPoint={focusPoint}
              autoRotateSpeed={0.0042}
              autoRotateEnabled={!focusTarget}
            />
          ) : null}
        </div>

        <div style={webStyles.paletteRow}>
          <div style={webStyles.paletteItem}>
            <span style={{ ...webStyles.paletteDot, backgroundColor: 'rgb(255, 168, 56)' }} />
            Router
          </div>
          <div style={webStyles.paletteItem}>
            <span style={{ ...webStyles.paletteDot, backgroundColor: 'rgb(54, 235, 102)' }} />
            Device (Active)
          </div>
          <div style={webStyles.paletteItem}>
            <span style={{ ...webStyles.paletteDot, backgroundColor: 'rgb(235, 89, 89)' }} />
            Device (Inactive)
          </div>
          <div style={webStyles.paletteItem}>
            <span style={{ ...webStyles.paletteDot, backgroundColor: 'rgb(43, 240, 255)' }} />
            Iridium Satellite
          </div>
        </div>

        <div style={webStyles.controlsRow}>
          <button type="button" style={webStyles.controlButton} onClick={refreshAll} disabled={refreshing}>
            {refreshing ? 'Refreshing...' : 'Refresh Globe Status'}
          </button>
          <button type="button" style={webStyles.controlButton} onClick={resetView}>
            Reset View
          </button>
        </div>

        <div style={webStyles.listGrid}>
          <div style={webStyles.card}>
            <div style={webStyles.cardHeader}>Router</div>
            <div style={webStyles.cardBody}>
              {routerPosition ? (
                <button
                  type="button"
                  onClick={selectRouter}
                  style={{
                    ...webStyles.dataButton,
                    ...(focusTarget?.type === 'router' ? webStyles.selectedDataButton : {}),
                  }}
                >
                  DLS Router
                  <div style={webStyles.metaText}>
                    {routerPosition.lat.toFixed(5)}, {routerPosition.lng.toFixed(5)} • {Math.round(routerPosition.alt)} m
                  </div>
                  <div style={webStyles.metaText}>Updated {new Date(routerPosition.updated_at).toLocaleTimeString()}</div>
                </button>
              ) : (
                <div style={webStyles.emptyText}>
                  Router GPS not available from current API target.
                </div>
              )}
            </div>
          </div>

          <div style={webStyles.card}>
            <div style={webStyles.cardHeader}>Devices</div>
            <div style={webStyles.cardBody}>
              {positions.length === 0 ? (
                <div style={webStyles.emptyText}>No device GPS data yet.</div>
              ) : (
                positions.map((device) => (
                  <button
                    key={device.deviceId}
                    type="button"
                    onClick={() => selectDevice(device)}
                    style={{
                      ...webStyles.dataButton,
                      ...(focusTarget?.type === 'device' && focusTarget.id === device.deviceId
                        ? webStyles.selectedDataButton
                        : {}),
                    }}
                  >
                    {device.deviceName}
                    <div style={webStyles.metaText}>
                      {device.lat.toFixed(5)}, {device.lng.toFixed(5)} • {Math.round(device.alt)} m • {device.active ? 'Active' : 'Inactive'}
                    </div>
                    <div style={webStyles.metaText}>Updated {new Date(device.updated_at).toLocaleTimeString()}</div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        <div style={webStyles.helper}>
          Globe rotates automatically. Click a router/device entry to zoom to its exact latitude/longitude.
          {lastDataSyncAt ? ` Device sync: ${new Date(lastDataSyncAt).toLocaleTimeString()}.` : ''}
          {lastTleSyncAt ? ` TLE sync: ${new Date(lastTleSyncAt).toLocaleTimeString()}.` : ''}
        </div>
      </div>
    </View>
  );
}

function createStyles(colors: any, spacing: any, typography: any) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background.primary,
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.md,
      gap: spacing.sm,
    },
    center: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.background.primary,
    },
    error: {
      color: colors.status.danger,
      textAlign: 'center',
      fontSize: typography.size.sm,
      paddingTop: spacing.xs,
    },
    fallbackText: {
      color: colors.text.muted,
      fontSize: typography.size.md,
    },
  });
}
