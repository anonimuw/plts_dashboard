'use client';

import L from 'leaflet';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { PLTS_CONFIG } from '@/lib/api';

// Fix default marker icon (Leaflet + bundler issue)
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

export default function MapInner() {
  return (
    <MapContainer
      center={[PLTS_CONFIG.latitude, PLTS_CONFIG.longitude]}
      zoom={15}
      scrollWheelZoom={true}
      className="h-full w-full"
      style={{ height: '100%', width: '100%' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Marker position={[PLTS_CONFIG.latitude, PLTS_CONFIG.longitude]}>
        <Popup>
          <div className="text-sm">
            <strong>PLTS Off-Grid 400Wp</strong>
            <br />
            {PLTS_CONFIG.panelCount} x {PLTS_CONFIG.panelPowerWp}Wp Panel
            <br />
            Lat: {PLTS_CONFIG.latitude}, Lon: {PLTS_CONFIG.longitude}
          </div>
        </Popup>
      </Marker>
    </MapContainer>
  );
}
