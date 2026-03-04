import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Device, Router } from '../store';
import { theme } from '../theme';

interface MapPlaceholderProps {
  routers: Router[];
  devices: Device[];
  selectedRouterId: string;
  onSelectRouter: (id: string) => void;
}

const CANVAS_WIDTH = 780;
const CANVAS_HEIGHT = 520;

export function MapPlaceholder({ routers, devices, selectedRouterId, onSelectRouter }: MapPlaceholderProps) {
  const projection = useMemo(() => buildProjection(devices), [devices]);

  return (
    <View style={styles.mapFrame}>
      <View style={styles.mapCanvas}>
        <Text style={styles.mapTitle}>Coverage Surface</Text>

        {routers.map((router, index) => {
          const point = projection.project(router.lat, router.lng, index);
          const selected = selectedRouterId === router.id;
          const style = {
            ...styles.routerMarker,
            left: point.x,
            top: point.y,
            backgroundColor: selected ? theme.colors.accent : theme.colors.background.tertiary,
            borderColor: selected ? theme.colors.borderStrong : theme.colors.border,
          };

          return (
            <Pressable key={router.id} onPress={() => onSelectRouter(router.id)} style={style}>
              <Text style={styles.routerMarkerText}>{router.name}</Text>
            </Pressable>
          );
        })}

        {devices.map((device, index) => {
          const basePoint = projection.project(device.lat, device.lng, index + 20);
          const markerStyle = {
            ...styles.deviceMarker,
            left: basePoint.x + ((index % 3) - 1) * 14,
            top: basePoint.y + 26 + (index % 4) * 8,
            backgroundColor:
              device.status === 'online'
                ? theme.colors.success
                : device.status === 'degraded'
                  ? theme.colors.warning
                  : theme.colors.danger,
          };

          return <View key={device.id} style={markerStyle} />;
        })}
      </View>

      <View style={styles.legend}>
        <Text style={styles.legendText}>Routers: blue-gray blocks</Text>
        <Text style={styles.legendText}>Devices: green / amber / red markers</Text>
        <Text style={styles.legendText}>Map projects last known GPS points</Text>
      </View>
    </View>
  );
}

function buildProjection(devices: Device[]) {
  const withGps = devices.filter((device) => typeof device.lat === 'number' && typeof device.lng === 'number');

  if (withGps.length === 0) {
    return {
      project: (_lat?: number, _lng?: number, index = 0) => {
        const col = index % 4;
        const row = Math.floor(index / 4) % 3;
        return { x: 80 + col * 170, y: 90 + row * 120 };
      },
    };
  }

  const lats = withGps.map((device) => device.lat as number);
  const lngs = withGps.map((device) => device.lng as number);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const latRange = Math.max(maxLat - minLat, 0.005);
  const lngRange = Math.max(maxLng - minLng, 0.005);

  return {
    project: (lat?: number, lng?: number, index = 0) => {
      if (typeof lat !== 'number' || typeof lng !== 'number') {
        const col = index % 4;
        const row = Math.floor(index / 4) % 3;
        return { x: 80 + col * 170, y: 90 + row * 120 };
      }

      const x = ((lng - minLng) / lngRange) * (CANVAS_WIDTH - 120) + 50;
      const y = ((maxLat - lat) / latRange) * (CANVAS_HEIGHT - 140) + 70;
      return { x, y };
    },
  };
}

const styles = StyleSheet.create({
  mapFrame: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.layout.cardRadius,
    backgroundColor: theme.colors.surface,
    overflow: 'hidden',
  },
  mapCanvas: {
    flex: 1,
    minHeight: 520,
    backgroundColor: theme.colors.background.secondary,
    position: 'relative',
  },
  mapTitle: {
    position: 'absolute',
    top: 12,
    left: 12,
    color: theme.colors.textSecondary,
    fontSize: theme.typography.caption,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  routerMarker: {
    position: 'absolute',
    minHeight: 28,
    borderRadius: 6,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
    maxWidth: 160,
  },
  routerMarkerText: {
    color: theme.colors.textPrimary,
    fontSize: 11,
    fontWeight: '700',
  },
  deviceMarker: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legend: {
    minHeight: 42,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.lg,
    paddingHorizontal: theme.spacing.md,
  },
  legendText: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.caption,
  },
});
