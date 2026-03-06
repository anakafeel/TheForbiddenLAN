// Admin Map — GPS positions of all devices via Leaflet (web only).
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { api } from '../../lib/api';
import { useAppTheme } from '../../theme';

type DeviceLocation = {
  deviceId: string;
  deviceName: string;
  serial?: string;
  site?: string;
  active: boolean;
  lat: number;
  lng: number;
  alt: number;
  updated_at: string;
};

// Conditionally import Leaflet only on web to prevent native crashes
let MapContainer: any;
let TileLayer: any;
let Marker: any;
let Popup: any;
let L: any;
if (Platform.OS === 'web') {
  const rl = require('react-leaflet');
  MapContainer = rl.MapContainer;
  TileLayer = rl.TileLayer;
  Marker = rl.Marker;
  Popup = rl.Popup;
  L = require('leaflet');
  require('leaflet/dist/leaflet.css');
}

export function AdminMap() {
  const { colors, spacing, typography, isDark } = useAppTheme();
  const styles = useMemo(
    () => createStyles(colors, spacing, typography),
    [colors, spacing, typography],
  );
  const [positions, setPositions] = useState<DeviceLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchPositions = useCallback(async () => {
    try {
      setError('');
      const res = await api.get<{ locations?: DeviceLocation[] }>('/devices/locations');
      const valid = (res.locations ?? []).filter(
        (location) => Number.isFinite(location.lat) && Number.isFinite(location.lng),
      );
      setPositions(valid);
    } catch (e: any) {
      setPositions([]);
      setError(e?.message ?? 'Failed to load map locations');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPositions();
    const interval = setInterval(fetchPositions, 15000);
    return () => clearInterval(interval);
  }, [fetchPositions]);

  // Native fallback
  if (Platform.OS !== 'web') {
    return (
      <View style={styles.center}>
        <Text style={styles.fallbackText}>Map view is only available on web</Text>
      </View>
    );
  }

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={colors.status.info} /></View>;
  }

  // Center on first device, or Vancouver as default
  const center = positions.length > 0
    ? [positions[0].lat, positions[0].lng]
    : [49.28, -123.12];

  const tileUrl = isDark
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  const tileAttribution = isDark
    ? '&copy; OpenStreetMap contributors &copy; CARTO'
    : '&copy; OpenStreetMap contributors';
  const mapClassName = isDark ? 'admin-map admin-map--dark' : 'admin-map admin-map--light';

  // Custom marker icons: green = active, red = inactive
  const makeIcon = (active: boolean) =>
    L.divIcon({
      className: '',
      html: `<div style="
        width: 14px; height: 14px; border-radius: 50%;
        background: ${active ? colors.status.active : colors.status.danger};
        border: 2px solid ${colors.text.primary};
        box-shadow: 0 0 4px ${colors.background.overlay};
      "></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });

  return (
    <View style={styles.container}>
      {!!error && <Text style={styles.error}>{error}</Text>}
      {positions.length === 0 && !error && (
        <Text style={styles.noData}>No devices have GPS data. Positions will appear when devices report their location.</Text>
      )}
      <div style={{ flex: 1, height: '100%', width: '100%' }}>
        <MapContainer center={center} zoom={10} style={{ height: '100%', width: '100%' }} className={mapClassName}>
          <TileLayer
            url={tileUrl}
            attribution={tileAttribution}
          />
          {positions.map((p) => (
            <Marker key={p.deviceId} position={[p.lat, p.lng]} icon={makeIcon(p.active)}>
              <Popup>
                <div>
                  <strong>{p.deviceName}</strong><br />
                  {p.site ? <>Site: {p.site}<br /></> : null}
                  Alt: {Number(p.alt).toFixed(0)}m<br />
                  Status: {p.active ? 'Active' : 'Inactive'}<br />
                  Updated: {new Date(p.updated_at).toLocaleString()}
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </View>
  );
}

function createStyles(colors: any, spacing: any, typography: any) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background.primary },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background.primary },
    error: { color: colors.status.danger, padding: spacing.sm, textAlign: 'center' },
    noData: { color: colors.text.muted, padding: spacing.lg, textAlign: 'center', fontSize: typography.size.sm },
    fallbackText: { color: colors.text.muted, fontSize: typography.size.md },
  });
}
