import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Device, Router } from '../store';
import { theme } from '../theme';

interface MapPlaceholderProps {
  routers: Router[];
  devices: Device[];
  selectedRouterId: string;
  onSelectRouter: (id: string) => void;
}

const routerCoords: Record<string, { x: number; y: number }> = {
  'rtr-nyc-01': { x: 190, y: 110 },
  'rtr-nyc-02': { x: 340, y: 90 },
  'rtr-nyc-03': { x: 280, y: 220 },
  'rtr-nyc-04': { x: 160, y: 250 },
};

export function MapPlaceholder({ routers, devices, selectedRouterId, onSelectRouter }: MapPlaceholderProps) {
  return (
    <View style={styles.mapFrame}>
      <View style={styles.mapCanvas}>
        <Text style={styles.mapTitle}>Metro Coverage Grid</Text>

        {routers.map((router) => {
          const point = routerCoords[router.id] ?? { x: 100, y: 100 };
          const selected = selectedRouterId === router.id;
          return (
            <Pressable
              key={router.id}
              onPress={() => onSelectRouter(router.id)}
              style={[
                styles.routerMarker,
                {
                  left: point.x,
                  top: point.y,
                  backgroundColor: selected ? '#2f8cff' : '#1f5e9f',
                  borderColor: selected ? '#9bc6ff' : '#3d74a8',
                },
              ]}
            >
              <Text style={styles.routerMarkerText}>{router.name.replace('NYC-', '')}</Text>
            </Pressable>
          );
        })}

        {devices.map((device, index) => {
          const routerPoint = routerCoords[device.routerId] ?? { x: 80, y: 80 };
          const jitterX = (index % 3) * 20 - 20;
          const jitterY = (index % 4) * 12 - 12;
          return (
            <View
              key={device.id}
              style={[
                styles.deviceMarker,
                {
                  left: routerPoint.x + jitterX,
                  top: routerPoint.y + 22 + jitterY,
                  backgroundColor:
                    device.status === 'online' ? '#4abf7b' : device.status === 'degraded' ? '#f3b445' : '#eb5f73',
                },
              ]}
            />
          );
        })}
      </View>

      <View style={styles.legend}>
        <Text style={styles.legendText}>Router Marker: Blue</Text>
        <Text style={styles.legendText}>Device Marker: Green/Amber/Red = online/degraded/offline</Text>
      </View>
    </View>
  );
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
    backgroundColor: '#0e1824',
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
