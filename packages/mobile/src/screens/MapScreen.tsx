// Moving map — shows GPS positions via SatelliteGlobe
import { Platform, View, Text } from 'react-native';
import { useStore } from '../store';

let SatelliteGlobe: any;
if (Platform.OS === 'web') {
  SatelliteGlobe = require('../components/SatelliteGlobe').SatelliteGlobe;
}

export function MapScreen() {
  const { gps } = useStore();

  if (Platform.OS !== 'web') {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#05070B' }}>
        <Text style={{ color: '#8FA3C7' }}>Map view is only available on web</Text>
      </View>
    );
  }

  const markers = gps
    ? [{ id: 'self', lat: gps.lat, lng: gps.lng, size: 0.07, color: [0.2, 0.95, 1] }]
    : [];
  const focusPoint = gps ? { lat: gps.lat, lng: gps.lng, zoom: 1.65 } : null;

  return (
    <div style={{ position: 'relative', height: '100vh', width: '100%' }}>
      {SatelliteGlobe ? (
        <SatelliteGlobe markers={markers} focusPoint={focusPoint} dark />
      ) : null}
    </div>
  );
}
