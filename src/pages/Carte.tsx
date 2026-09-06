import { apiFetch } from "../lib/api.ts";
import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../components/AuthProvider.tsx';
import { LayersControl, MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import { Building2, Crosshair, Layers, MapPin } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
// @ts-ignore
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
// @ts-ignore
import markerIcon from 'leaflet/dist/images/marker-icon.png';
// @ts-ignore
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
});

const OUAGA_CENTER: [number, number] = [12.368, -1.527];

const ARRONDISSEMENT_COORDS: Record<string, [number, number]> = {
  'arrondissement 1': [12.371, -1.522],
  'arrondissement 2': [12.382, -1.508],
  'arrondissement 3': [12.394, -1.542],
  'arrondissement 4': [12.381, -1.568],
  'arrondissement 5': [12.356, -1.559],
  'arrondissement 6': [12.338, -1.529],
  'arrondissement 7': [12.342, -1.497],
  'arrondissement 8': [12.362, -1.484],
  'arrondissement 9': [12.396, -1.489],
  'arrondissement 10': [12.411, -1.523],
  'arrondissement 11': [12.329, -1.579],
  'arrondissement 12': [12.314, -1.493],
};

type SchoolMapPoint = {
  id: number;
  nom: string;
  type: string;
  arrondissement: string;
  statut: string;
  coordonnees?: string | null;
  position: [number, number];
  isApproximate: boolean;
  infrastructure?: any;
};

const normalize = (value?: string | null) => (value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim();

const parseCoordinates = (value?: string | null): [number, number] | null => {
  if (!value) return null;
  const parts = value
    .replace(';', ',')
    .split(',')
    .map(part => Number(part.trim()));
  if (parts.length !== 2 || parts.some(Number.isNaN)) return null;
  const [lat, lng] = parts;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return [lat, lng];
};

const stableOffset = (seed: string, index: number) => {
  const hash = Array.from(seed).reduce((acc, char) => acc + char.charCodeAt(0), 0) + index * 17;
  const latOffset = ((hash % 11) - 5) * 0.0025;
  const lngOffset = (((Math.floor(hash / 11)) % 11) - 5) * 0.0025;
  return [latOffset, lngOffset] as const;
};

const estimatePosition = (arrondissement: string, nom: string, index: number): [number, number] => {
  const base = ARRONDISSEMENT_COORDS[normalize(arrondissement)] || OUAGA_CENTER;
  const [latOffset, lngOffset] = stableOffset(`${arrondissement}-${nom}`, index);
  return [base[0] + latOffset, base[1] + lngOffset];
};

const getInfrastructureLine = (label: string, value: unknown) => (
  <div className="flex justify-between gap-4">
    <span className="text-gray-500">{label}</span>
    <span className="font-semibold text-gray-900">{Number(value || 0).toLocaleString('fr-FR')}</span>
  </div>
);

export default function Carte() {
  const [etablissements, setEtablissements] = useState<any[]>([]);
  const [infrastructures, setInfrastructures] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { token } = useAuth();

  useEffect(() => {
    async function fetchMapData() {
      if (!token) return;
      setLoading(true);
      try {
        const [etabRes, infraRes] = await Promise.all([
          apiFetch('/api/etablissements', {
            headers: { Authorization: `Bearer ${token}` }
          }),
          apiFetch('/api/infrastructures', {
            headers: { Authorization: `Bearer ${token}` }
          })
        ]);
        const [etabData, infraData] = await Promise.all([etabRes.json(), infraRes.json()]);
        if (Array.isArray(etabData)) setEtablissements(etabData);
        if (Array.isArray(infraData)) setInfrastructures(infraData);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    fetchMapData();
  }, [token]);

  const points = useMemo(() => {
    const infraByEtab = new Map<number, any>();
    infrastructures.forEach(item => infraByEtab.set(item.etablissementId, item));

    return etablissements
      .filter(etab => !etab.archived)
      .map((etab, index): SchoolMapPoint => {
        const exactPosition = parseCoordinates(etab.coordonnees);
        return {
          id: etab.id,
          nom: etab.nom,
          type: etab.type,
          arrondissement: etab.arrondissement,
          statut: etab.statut,
          coordonnees: etab.coordonnees,
          position: exactPosition || estimatePosition(etab.arrondissement, etab.nom, index),
          isApproximate: !exactPosition,
          infrastructure: infraByEtab.get(etab.id)
        };
      });
  }, [etablissements, infrastructures]);

  const exactCount = points.filter(point => !point.isApproximate).length;
  const approximateCount = points.length - exactCount;

  return (
    <div className="space-y-5 flex flex-col h-[calc(100vh-6rem)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cartographie des établissements</h1>
          <p className="mt-1 text-sm text-gray-500">
            Vue satellite et localisation des écoles primaires et établissements secondaires.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="rounded-md border border-gray-200 bg-white px-3 py-2 shadow-sm">
            <div className="flex items-center gap-1.5 text-gray-500">
              <Building2 className="h-3.5 w-3.5" />
              Total
            </div>
            <p className="mt-1 text-lg font-black text-gray-900">{points.length}</p>
          </div>
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 shadow-sm">
            <div className="flex items-center gap-1.5 text-emerald-700">
              <Crosshair className="h-3.5 w-3.5" />
              GPS
            </div>
            <p className="mt-1 text-lg font-black text-emerald-900">{exactCount}</p>
          </div>
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 shadow-sm">
            <div className="flex items-center gap-1.5 text-amber-700">
              <MapPin className="h-3.5 w-3.5" />
              Auto
            </div>
            <p className="mt-1 text-lg font-black text-amber-900">{approximateCount}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 bg-white shadow rounded-lg overflow-hidden border border-gray-200 relative">
        {loading && (
          <div className="absolute left-4 top-4 z-[1000] rounded-md bg-white px-3 py-2 text-xs font-semibold text-gray-600 shadow border border-gray-100">
            Chargement de la carte...
          </div>
        )}
        <div className="absolute left-4 bottom-4 z-[1000] rounded-md bg-white px-3 py-2 text-xs font-semibold text-gray-700 shadow border border-gray-100 flex items-center gap-2">
          <Layers className="h-3.5 w-3.5 text-blue-600" />
          Satellite disponible
        </div>

        <MapContainer center={OUAGA_CENTER} zoom={12} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
          <LayersControl position="topright">
            <LayersControl.BaseLayer checked name="Satellite">
              <TileLayer
                attribution='Tiles &copy; Esri'
                url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              />
            </LayersControl.BaseLayer>
            <LayersControl.BaseLayer name="Plan">
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
            </LayersControl.BaseLayer>
          </LayersControl>

          {points.map(point => {
            const infra = point.infrastructure;
            const studyRooms = infra?.batimentsEtudes?.total || 0;
            const adminRooms = infra?.batimentsAdmin?.total || 0;

            return (
              <Marker key={point.id} position={point.position}>
                <Popup>
                  <div className="min-w-64 text-sm">
                    <div className="font-bold text-gray-900">{point.nom}</div>
                    <div className="mt-1 text-xs text-gray-500">
                      {point.type} - {point.arrondissement}
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      Statut : <span className="font-semibold text-gray-700">{point.statut}</span>
                    </div>
                    <div className={`mt-3 rounded-md px-2 py-1 text-xs font-semibold ${point.isApproximate ? 'bg-amber-50 text-amber-800 border border-amber-100' : 'bg-emerald-50 text-emerald-800 border border-emerald-100'}`}>
                      {point.isApproximate ? 'Position automatique par arrondissement' : 'Coordonnées GPS renseignées'}
                    </div>

                    <div className="mt-3 border-t border-gray-100 pt-3 space-y-1.5">
                      <div className="text-xs font-bold uppercase text-gray-400">Infrastructures disponibles</div>
                      {infra?.id ? (
                        <>
                          {getInfrastructureLine('Bâtiments études', studyRooms)}
                          {getInfrastructureLine('Bâtiments admin', adminRooms)}
                          {getInfrastructureLine('Laboratoires', infra.laboratoires)}
                          {getInfrastructureLine('Bibliothèques', infra.bibliotheque)}
                          {getInfrastructureLine('Latrines élèves', infra.latrinesEleves)}
                          {getInfrastructureLine('Latrines personnel', infra.latrinesPersonnel)}
                          {getInfrastructureLine('Points d’eau', infra.pointsEau)}
                          <div className="pt-1 text-xs">
                            Conformité : <span className="font-bold text-gray-900">{infra.conformite || 'Non renseignée'}</span>
                          </div>
                        </>
                      ) : (
                        <div className="text-xs text-gray-500">Aucune infrastructure renseignée.</div>
                      )}
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      </div>
    </div>
  );
}
