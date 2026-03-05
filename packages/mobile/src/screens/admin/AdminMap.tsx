// Admin Map — GPS positions of all devices via Leaflet (web only).
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, Platform } from 'react-native';
import { api } from '../../lib/api';
import { colors, spacing, typography } from '../../theme';

// Conditionally import Leaflet only on web to prevent native crashes
let MapContainer, TileLayer, Marker, Popup, L;
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
  const [positions, setPositions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchPositions = useCallback(async () => {
    try {
      const devRes = await api.get('/devices');
      const devices = devRes.devices ?? [];

      // Fetch GPS for each device in parallel; allSettled so missing GPS doesn't block others
      const gpsResults = await Promise.allSettled(
        devices.map(async (d) => {
          const gpsRes = await api.get(`/devices/${d.id}/gps`);
          return {
            deviceId: d.id,
            deviceName: d.name ?? d.serial,
            active: d.active,
            lat: gpsRes.gps.lat,
            lng: gpsRes.gps.lng,
            alt: gpsRes.gps.alt ?? 0,
            updated_at: gpsRes.gps.updated_at,
          };
        })
      );

      const valid = gpsResults
        .filter((r) => r.status === 'fulfilled')
        .map((r) => r.value);

      setPositions(valid);
    } catch (e) {
      setError(e.message);
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

  // Custom marker icons: green = active, red = inactive
  const makeIcon = (active) =>
    L.divIcon({
      className: '',
      html: `<div style="
        width: 14px; height: 14px; border-radius: 50%;
        background: ${active ? colors.status.active : colors.status.danger};
        border: 2px solid white;
        box-shadow: 0 0 4px rgba(0,0,0,0.4);
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
        <MapContainer center={center} zoom={10} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; OpenStreetMap contributors'
          />
          {positions.map((p) => (
            <Marker key={p.deviceId} position={[p.lat, p.lng]} icon={makeIcon(p.active)}>
              <Popup>
                <div>
                  <strong>{p.deviceName}</strong><br />
                  Alt: {Number(p.alt).toFixed(0)}m<br />
                  Status: {p.active ? 'Active' : 'Inactive'}<br />
                  Updated: {new Date(p.updated_at).toLocaleTimeString()}
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background.primary },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.background.primary },
  error: { color: colors.status.danger, padding: spacing.sm, textAlign: 'center' },
  noData: { color: colors.text.muted, padding: spacing.lg, textAlign: 'center', fontSize: typography.size.sm },
  fallbackText: { color: colors.text.muted, fontSize: typography.size.md },
});
