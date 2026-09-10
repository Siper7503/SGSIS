import { apiFetch } from "../lib/api.ts";
import React, { useEffect, useState } from 'react';
import { useAuth } from '../components/AuthProvider.tsx';
import { Users, Edit2, Search } from 'lucide-react';
import { EffectifsForm } from '../components/EffectifsForm.tsx';
import { ModuleWorkflowActions } from '../components/ModuleWorkflowActions.tsx';
import { ARRONDISSEMENT_ROLES, DSE_ROLES, LOCAL_SCHOOL_ROLES, hasAnyRole } from '../lib/roles.ts';

export default function Effectifs() {
  const [effectifs, setEffectifs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingEtablissement, setEditingEtablissement] = useState<any>(null);
  const { token, user } = useAuth();
  const userRole = user?.role;
  const canWrite = hasAnyRole(userRole, [...DSE_ROLES, ...LOCAL_SCHOOL_ROLES]);
  const canReview = hasAnyRole(userRole, ARRONDISSEMENT_ROLES);

  const fetchData = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await apiFetch('/api/effectifs', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (Array.isArray(data)) {
        setEffectifs(data);
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

  const filteredData = effectifs.filter((item) =>
    item.nomEtablissement.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.arrondissement.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (editingEtablissement) {
    return (
      <EffectifsForm
        etablissement={editingEtablissement}
        onSuccess={() => {
          setEditingEtablissement(null);
          fetchData();
        }}
        onCancel={() => setEditingEtablissement(null)}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="sm:flex sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Effectifs</h1>
          <p className="mt-1 text-sm text-gray-500">
            Capitalisation des effectifs (élèves, personnels enseignants et administratifs).
          </p>
        </div>
      </div>

      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <div className="relative rounded-md shadow-sm">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <Search className="h-4 w-4 text-gray-400" aria-hidden="true" />
            </div>
            <input
              type="text"
              className="block w-full rounded-md border-gray-300 pl-10 focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
              placeholder="Rechercher un établissement..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col bg-white shadow rounded-lg border border-gray-200">
        <div className="-my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
          <div className="inline-block min-w-full py-2 align-middle md:px-6 lg:px-8">
            <div className="overflow-hidden">
              <table className="min-w-full divide-y divide-gray-300">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6">
                      Établissement
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                      Année Scolaire
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                      Élèves (F/G)
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                      Personnel (Ens/Adm)
                    </th>
                    {(canWrite || canReview) && (
                      <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-6">
                        <span className="sr-only">Actions</span>
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {loading ? (
                    <tr>
                      <td colSpan={canWrite || canReview ? 5 : 4} className="py-10 text-center text-sm text-gray-500">
                        Chargement des effectifs...
                      </td>
                    </tr>
                  ) : filteredData.length === 0 ? (
                    <tr>
                      <td colSpan={canWrite || canReview ? 5 : 4} className="py-10 text-center text-sm text-gray-500">
                        Aucun établissement trouvé.
                      </td>
                    </tr>
                  ) : (
                    filteredData.map((item) => (
                      <tr key={item.etablissementId}>
                        <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm sm:pl-6">
                          <div className="font-medium text-gray-900">{item.nomEtablissement}</div>
                          <div className="text-gray-500">{item.typeEtablissement} - {item.arrondissement}</div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                          {item.id ? (
                            <span className="inline-flex rounded-full bg-blue-100 px-2 text-xs font-semibold leading-5 text-blue-800">
                              {item.anneeScolaire}
                            </span>
                          ) : (
                            <span className="text-gray-400 italic">Non renseigné</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                          {item.id ? (
                            <>
                              <div>Filles: {item.elevesFilles || 0}</div>
                              <div>Garçons: {item.elevesGarcons || 0}</div>
                              <div className="font-medium mt-1">Total: {(item.elevesFilles || 0) + (item.elevesGarcons || 0)}</div>
                            </>
                          ) : (
                            <span className="text-gray-400 italic">-</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                          {item.id ? (
                            <>
                              <div>Enseignants: {item.enseignants || 0}</div>
                              <div>Admin: {item.personnelsAdmin || 0}</div>
                            </>
                          ) : (
                            <span className="text-gray-400 italic">-</span>
                          )}
                        </td>
                        {(canWrite || canReview) && (
                          <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                            {canWrite && <button
                              onClick={() => setEditingEtablissement(item)}
                              className="text-blue-600 hover:text-blue-900 flex items-center justify-end w-full"
                            >
                              <Edit2 className="h-4 w-4 mr-1" />
                              {item.id ? 'Éditer' : 'Saisir'}
                            </button>}
                            <ModuleWorkflowActions module="effectifs" recordId={item.id} workflowStatus={item.workflowStatus} onUpdated={fetchData} compact />
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
