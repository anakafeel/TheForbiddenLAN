// MovingMap component (embeddable version — full screen version is MapScreen.tsx)
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
interface Props { lat: number; lng: number; label?: string; }

export function MovingMap({ lat, lng, label = 'Device' }: Props) {
  return (
    <MapContainer center={[lat, lng]} zoom={14} style={{ height: 300, width: '100%', borderRadius: 8 }}>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <Marker position={[lat, lng]}><Popup>{label}</Popup></Marker>
    </MapContainer>
  );
}
