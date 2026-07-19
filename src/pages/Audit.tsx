import React, { useEffect, useState } from 'react';
import { useAuth } from '../components/AuthProvider.tsx';
import { apiFetch } from '../lib/api.ts';
import { Shield, Clock, FileJson, User, Activity } from 'lucide-react';

export default function Audit() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { token, user } = useAuth();

  useEffect(() => {
    async function fetchData() {
      if (!token) return;
      try {
        const res = await apiFetch('/api/audit-logs', {
          headers: { Authorization: `Bearer ${token}` }
        });
        const d = await res.json();
        if (Array.isArray(d)) {
          // Sort by date desc
          setData(d.sort((a, b) => new Date(b.log.createdAt).getTime() - new Date(a.log.createdAt).getTime()));
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [token]);

  return (
    <div className="space-y-6">
      <div className="sm:flex sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Journal d'Audit et de Traçabilité</h1>
          <p className="mt-1 text-sm text-gray-500">
            Historique complet des modifications système (Conformité et Sécurité).
          </p>
        </div>
        <div className="mt-4 sm:mt-0 flex items-center text-sm text-green-600 bg-green-50 px-3 py-1.5 rounded-full border border-green-200">
          <Shield className="h-4 w-4 mr-1" />
          Traçabilité active
        </div>
      </div>

      <div className="bg-white shadow rounded-lg border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-6 text-center text-gray-500">Chargement des journaux...</div>
        ) : data.length === 0 ? (
          <div className="p-6 text-center text-gray-500">Aucun journal d'audit trouvé.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date & Heure
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Utilisateur
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Action
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Entité (Table)
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Détails
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {data.map((row, idx) => (
                  <tr key={idx} className="hover:bg-gray-50 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 flex items-center">
                      <Clock className="h-4 w-4 mr-2 text-gray-400" />
                      {new Date(row.log.createdAt).toLocaleString('fr-FR')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      <div className="flex items-center">
                        <User className="h-4 w-4 mr-2 text-gray-400" />
                        {row.user?.email || `ID: ${row.log.userId}`}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        row.log.action === 'CREATE' ? 'bg-green-100 text-green-800' :
                        row.log.action === 'UPDATE' ? 'bg-blue-100 text-blue-800' :
                        row.log.action === 'DELETE' ? 'bg-red-100 text-red-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        <Activity className="h-3 w-3 mr-1" />
                        {row.log.action}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {row.log.entityType} <span className="text-gray-400 ml-1">#{row.log.entityId}</span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      <div className="max-w-xs truncate" title={JSON.stringify(row.log.details)}>
                        {row.log.details ? JSON.stringify(row.log.details) : '-'}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
