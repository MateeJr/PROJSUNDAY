import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import type { LatLngExpression, LeafletMouseEvent } from 'leaflet';
import L from 'leaflet';

interface LocationMarkerProps {
  position: { lat: number; lng: number };
  setPosition: (pos: { lat: number; lng: number }) => void;
}

interface MapProps {
  center: LatLngExpression;
  zoom: number;
  style: { height: string; width: string };
  scrollWheelZoom: boolean;
  onLocationSelect: (position: { lat: number; lng: number }) => void;
  selectedLocation: { lat: number; lng: number };
}

function LocationMarker({ position, setPosition }: LocationMarkerProps) {
  const map = useMapEvents({
    click(e: LeafletMouseEvent) {
      setPosition(e.latlng);
    },
  });

  useEffect(() => {
    map.flyTo([position.lat, position.lng], map.getZoom());
  }, [position, map]);

  return position === null ? null : (
    <Marker 
      position={[position.lat, position.lng]}
      eventHandlers={{
        click: () => {
          map.flyTo([position.lat, position.lng], 18);
        },
      }}
    />
  );
}

export default function Map({ center, zoom, style, scrollWheelZoom, onLocationSelect, selectedLocation }: MapProps) {
  // Load Leaflet icon
  useEffect(() => {
    const L = require('leaflet');
    const icon = L.icon({
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
    });
    L.Marker.prototype.options.icon = icon;
  }, []);

  return (
    <MapContainer
      center={center}
      zoom={zoom}
      style={style}
      scrollWheelZoom={scrollWheelZoom}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <LocationMarker
        position={selectedLocation}
        setPosition={onLocationSelect}
      />
    </MapContainer>
  );
} 