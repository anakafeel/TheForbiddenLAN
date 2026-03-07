// Moving map — shows GPS positions of all talkgroup members via Leaflet
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { useStore } from '../store';

export function MapScreen() {
  const { gps } = useStore();
  const center: [number, number] = gps ? [gps.lat, gps.lng] : [49.28, -123.12];

  return (
    <div style={{ height: '100vh', width: '100%' }}>
      <MapContainer center={center} zoom={13} style={{ height: '100%', width: '100%' }}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {gps && (
          <Marker position={[gps.lat, gps.lng]}>
            <Popup>My position — {gps.alt.toFixed(0)}m</Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
}
