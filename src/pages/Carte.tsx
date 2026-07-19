import { apiFetch } from "../lib/api.ts";
import React, { useEffect, useState } from 'react';
import { useAuth } from '../components/AuthProvider.tsx';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
// @ts-ignore
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
// @ts-ignore
import markerIcon from 'leaflet/dist/images/marker-icon.png';
// @ts-ignore
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

// Fix for default marker icon in react-leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
});

export default function Carte() {
  const [etablissements, setEtablissements] = useState<any[]>([]);
  const { token } = useAuth();

  useEffect(() => {
    async function fetchEtablissements() {
      if (!token) return;
      try {
        const res = await apiFetch('/api/etablissements', {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        if (Array.isArray(data)) {
          setEtablissements(data);
        }
      } catch (e) {
        console.error(e);
      }
    }
    fetchEtablissements();
  }, [token]);

  // Default center: Ouagadougou, Burkina Faso
  const defaultCenter: [number, number] = [12.368, -1.527];

  return (
    <div className="space-y-6 flex flex-col h-[calc(100vh-6rem)]">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Cartographie des Établissements</h1>
        <p className="mt-1 text-sm text-gray-500">
          Visualisation géographique des établissements scolaires.
        </p>
      </div>

      <div className="flex-1 bg-white shadow rounded-lg overflow-hidden border border-gray-200">
        <MapContainer center={defaultCenter} zoom={12} style={{ height: '100%', width: '100%' }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {etablissements.map(etab => {
            if (!etab.coordonnees) return null;
            const parts = etab.coordonnees.split(',').map((p: string) => parseFloat(p.trim()));
            if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
              return (
                <Marker key={etab.id} position={[parts[0], parts[1]]}>
                  <Popup>
                    <div className="text-sm">
                      <strong>{etab.nom}</strong><br/>
                      {etab.type} - {etab.arrondissement}<br/>
                      Statut: {etab.statut}
                    </div>
                  </Popup>
                </Marker>
              );
            }
            return null;
          })}
        </MapContainer>
      </div>
    </div>
  );
}
