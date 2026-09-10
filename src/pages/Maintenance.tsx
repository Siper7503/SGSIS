import React, { useEffect, useState } from 'react';
import { useAuth } from '../components/AuthProvider.tsx';
import { apiFetch } from '../lib/api.ts';
import { Plus, Search, AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import { IncidentForm } from '../components/IncidentForm.tsx';
import { DSE_ROLES, hasAnyRole } from '../lib/roles.ts';

export default function Maintenance() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const { token, user } = useAuth();
  const canResolve = hasAnyRole(user?.role, DSE_ROLES);

  const fetchData = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await apiFetch('/api/incidents', {
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

  const updateStatus = async (id: number, statut: string) => {
    if (!token || actionLoading !== null) return;
    setActionLoading(id);
    setActionError(null);
    try {
      const res = await apiFetch(`/api/incidents/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ statut, dateResolution: statut === 'Résolu' ? new Date().toISOString() : null })
      });
      if (!res.ok) {
        const result = await res.json().catch(() => ({}));
        throw new Error(result.error || 'Impossible de mettre à jour le statut de l incident.');
      }
      await fetchData();
    } catch (e: any) {
      setActionError(e.message || 'Une erreur est survenue pendant la mise à jour.');
    } finally {
      setActionLoading(null);
    }
  };

  const filteredData = data.filter((item) =>
    item.type?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (isFormOpen) {
    return (
      <IncidentForm
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
          <h1 className="text-2xl font-bold text-gray-900">Maintenance & Incidents</h1>
          <p className="mt-1 text-sm text-gray-500">
            Signalement et suivi des problèmes d'infrastructures.
          </p>
        </div>
        <div className="mt-4 sm:mt-0 sm:ml-16 sm:flex-none">
          <button
            onClick={() => setIsFormOpen(true)}
            className="inline-flex items-center justify-center rounded-md border border-transparent bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-700"
          >
            <Plus className="h-4 w-4 mr-2" />
            Signaler un incident
          </button>
        </div>
      </div>

      {actionError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {actionError}
        </div>
      )}

      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
        <div className="relative rounded-md shadow-sm">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <Search className="h-4 w-4 text-gray-400" />
          </div>
          <input
            type="text"
            className="block w-full rounded-md border-gray-300 pl-10 focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
            placeholder="Rechercher..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {loading ? (
          <p className="text-gray-500 p-4">Chargement...</p>
        ) : filteredData.length === 0 ? (
          <p className="text-gray-500 p-4 col-span-full">Aucun incident trouvé.</p>
        ) : (
          filteredData.map((item) => (
            <div key={item.id} className={`bg-white overflow-hidden shadow-sm rounded-lg border-l-4 ${item.statut === 'Résolu' ? 'border-green-500' : item.statut === 'En cours' ? 'border-yellow-500' : 'border-red-500'}`}>
              <div className="px-4 py-5 sm:p-6">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-lg font-medium text-gray-900 truncate">
                    {item.type}
                  </h3>
                  <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    item.statut === 'Résolu' ? 'bg-green-100 text-green-800' :
                    item.statut === 'En cours' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {item.statut}
                  </span>
                </div>
                <p className="text-sm text-gray-500 mb-4">{item.description}</p>
                <div className="text-xs text-gray-400 flex items-center mb-1">
                  <Clock className="h-3 w-3 mr-1" />
                  Signalé le: {new Date(item.dateSignalement).toLocaleDateString()}
                </div>
                {item.dateResolution && (
                  <div className="text-xs text-gray-400 flex items-center">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Résolu le: {new Date(item.dateResolution).toLocaleDateString()}
                  </div>
                )}
              </div>
              <div className="bg-gray-50 px-4 py-3 sm:px-6 flex justify-end space-x-2">
                {canResolve && item.statut === 'Signalé' && (
                  <button disabled={actionLoading !== null} onClick={() => updateStatus(item.id, 'En cours')} className="text-yellow-600 hover:text-yellow-900 text-xs font-medium disabled:opacity-50">
                    Passer en cours
                  </button>
                )}
                {canResolve && item.statut !== 'Résolu' && (
                  <button disabled={actionLoading !== null} onClick={() => updateStatus(item.id, 'Résolu')} className="text-green-600 hover:text-green-900 text-xs font-medium disabled:opacity-50">
                    Marquer résolu
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
