// Native stub — cobe uses WebGL canvas which is web-only.
// Metro picks this file automatically over SatelliteGlobe.tsx on Android/iOS.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export interface SatelliteGlobeMarker {
  id?: string;
  lat: number;
  lng: number;
  size?: number;
  color?: [number, number, number];
}

export interface SatelliteGlobeFocusPoint {
  lat: number;
  lng: number;
  zoom?: number;
  token?: number;
}

interface Props {
  markers?: SatelliteGlobeMarker[];
  className?: string;
  autoRotateSpeed?: number;
  autoRotateEnabled?: boolean;
  dark?: boolean;
  focusPoint?: SatelliteGlobeFocusPoint | null;
}

export function SatelliteGlobe({ markers = [] }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>🌍 Globe view (web only)</Text>
      <Text style={styles.sub}>{markers.length} marker{markers.length !== 1 ? 's' : ''}</Text>
    </View>
  );
}

export default SatelliteGlobe;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0D1117',
  },
  label: {
    color: '#8B949E',
    fontSize: 16,
    marginBottom: 4,
  },
  sub: {
    color: '#484F58',
    fontSize: 12,
  },
});
