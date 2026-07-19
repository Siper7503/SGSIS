import React, { useEffect, useState } from 'react';
import { useAuth } from '../components/AuthProvider.tsx';
import { apiFetch } from '../lib/api.ts';
import { Plus, Droplets, Utensils } from 'lucide-react';
import { WashForm } from '../components/WashForm.tsx';

export default function Wash() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const { token } = useAuth();

  const fetchData = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await apiFetch('/api/wash', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const d = await res.json();
      if (Array.isArray(d)) {
        setData(d);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [token]);

  if (isFormOpen) {
    return (
      <WashForm
        onSuccess={() => {
          setIsFormOpen(false);
          fetchData();
        }}
        onCancel={() => setIsFormOpen(false)}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="sm:flex sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cantines & WASH</h1>
          <p className="mt-1 text-sm text-gray-500">
            Suivi des points d'eau, latrines et vivres scolaires.
          </p>
        </div>
        <div className="mt-4 sm:mt-0 sm:ml-16 sm:flex-none">
          <button
            onClick={() => setIsFormOpen(true)}
            className="inline-flex items-center justify-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
          >
            <Plus className="h-4 w-4 mr-2" />
            Nouvelle évaluation
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {loading ? (
          <p className="text-gray-500 p-4">Chargement...</p>
        ) : data.length === 0 ? (
          <p className="text-gray-500 p-4 col-span-full">Aucune donnée trouvée.</p>
        ) : (
          data.map((item) => (
            <div key={item.id} className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-100">
                 <h3 className="text-sm font-bold text-gray-900 flex items-center">
                   ID Établissement: {item.etablissementId}
                 </h3>
                 <span className="text-xs text-gray-400">{new Date(item.createdAt).toLocaleDateString()}</span>
              </div>
              
              <div className="space-y-4">
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center mb-2">
                    <Droplets className="h-4 w-4 mr-1 text-blue-500" /> Eau & Assainissement
                  </h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>Forages: <span className="font-medium">{item.foragesFonctionnels}/{item.forages}</span></div>
                    <div>Latrines: <span className="font-medium">{item.latrinesFonctionnelles}/{item.latrines}</span></div>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center mb-2">
                    <Utensils className="h-4 w-4 mr-1 text-orange-500" /> Cantine
                  </h4>
                  <div className="text-sm">
                    <div>Disponibilité: <span className={`font-medium ${item.cantineDisponibilite ? 'text-green-600' : 'text-red-600'}`}>{item.cantineDisponibilite ? 'Oui' : 'Non'}</span></div>
                    {item.cantineDisponibilite && (
                      <div className="mt-1 text-gray-600 text-xs italic">{item.vivresDisponibles || 'Non renseigné'}</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
