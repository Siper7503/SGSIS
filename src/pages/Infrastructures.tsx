import { apiFetch } from "../lib/api.ts";
import React, { useEffect, useState } from 'react';
import { useAuth } from '../components/AuthProvider.tsx';
import { Hammer, Edit2, Search } from 'lucide-react';
import { InfrastructureForm } from '../components/InfrastructureForm.tsx';
import { ModuleWorkflowActions } from '../components/ModuleWorkflowActions.tsx';
import { DSE_ROLES, LOCAL_SCHOOL_ROLES, hasAnyRole } from '../lib/roles.ts';

export default function Infrastructures() {
  const [infrastructures, setInfrastructures] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingEtablissement, setEditingEtablissement] = useState<any>(null);
  const { token, user } = useAuth();

  const fetchInfrastructures = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await apiFetch('/api/infrastructures', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (Array.isArray(data)) {
        setInfrastructures(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInfrastructures();
  }, [token]);

  const isLocalActor = hasAnyRole(user?.role, LOCAL_SCHOOL_ROLES);
  const canWrite = hasAnyRole(user?.role, [...DSE_ROLES, ...LOCAL_SCHOOL_ROLES]);

  const enrichedData = infrastructures.map((item) => {
    const userFullName = `${user?.prenom || ''} ${user?.nom || ''}`.trim().toLowerCase();
    const dirName = (item.nomDirecteur || '').trim().toLowerCase();
    const isMySchool = !!(dirName && userFullName && (userFullName.includes(dirName) || dirName.includes(userFullName) || (user?.nom && dirName.includes(user.nom.toLowerCase()))));
    return {
      ...item,
      isMySchool
    };
  });

  const filteredData = enrichedData.filter((item) => {
    const matchSearch = item.nomEtablissement.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        item.arrondissement.toLowerCase().includes(searchTerm.toLowerCase());
    
    if (isLocalActor) {
      const isMyArrondissement = user?.arrondissement && item.arrondissement === user.arrondissement;
      
      const hasExactDirectorMatch = enrichedData.some(e => e.isMySchool);

      if (hasExactDirectorMatch) {
        return item.isMySchool && matchSearch;
      } else {
        return isMyArrondissement && matchSearch;
      }
    }
    
    return matchSearch;
  });

  if (editingEtablissement) {
    return (
      <InfrastructureForm
        etablissement={editingEtablissement}
        onSuccess={() => {
          setEditingEtablissement(null);
          fetchInfrastructures();
        }}
        onCancel={() => setEditingEtablissement(null)}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="sm:flex sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Infrastructures</h1>
          <p className="mt-1 text-sm text-gray-500">
            Gestion et suivi des infrastructures par établissement.
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
                      Bâtiments
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                      Sanitaires
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                      Conformité
                    </th>
                    <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-6">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="py-10 text-center text-sm text-gray-500">
                        Chargement des infrastructures...
                      </td>
                    </tr>
                  ) : filteredData.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-10 text-center text-sm text-gray-500">
                        Aucun établissement trouvé.
                      </td>
                    </tr>
                  ) : (
                    filteredData.map((item) => (
                      <tr key={item.etablissementId}>
                        <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm sm:pl-6">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-gray-900">{item.nomEtablissement}</span>
                            {item.isMySchool && (
                              <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 ring-1 ring-inset ring-blue-700/10">
                                Votre Établissement
                              </span>
                            )}
                          </div>
                          <div className="text-gray-500 mt-0.5 text-xs">{item.typeEtablissement} - {item.arrondissement}</div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                          {item.id ? (
                            <>
                              <div>Études: {item.batimentsEtudes?.total || 0} ({item.batimentsEtudes?.bonEtat || 0} BE)</div>
                              <div>Admin: {item.batimentsAdmin?.total || 0}</div>
                              {(item.laboratoires || 0) > 0 && <div>Labos: {item.laboratoires}</div>}
                              {(item.infirmerie || 0) > 0 && <div>Infirmerie: {item.infirmerie}</div>}
                            </>
                          ) : (
                            <span className="text-gray-400 italic">Non renseigné</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                          {item.id ? (
                            <>
                              <div>Élèves: {item.latrinesEleves || 0}</div>
                              <div>Personnel: {item.latrinesPersonnel || 0}</div>
                            </>
                          ) : (
                            <span className="text-gray-400 italic">-</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                          {item.id ? (
                            <span className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                              item.conformite === 'Conforme' ? 'bg-green-100 text-green-800' :
                              item.conformite === 'Non conforme' ? 'bg-red-100 text-red-800' :
                              'bg-yellow-100 text-yellow-800'
                            }`}>
                              {item.conformite}
                            </span>
                          ) : (
                            <span className="text-gray-400 italic">N/A</span>
                          )}
                        </td>
                        <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                          <div className="flex flex-col items-end gap-2">
                            <ModuleWorkflowActions module="infrastructures" recordId={item.id} workflowStatus={item.workflowStatus} onUpdated={fetchInfrastructures} compact />
                            {canWrite && <button
                              onClick={() => setEditingEtablissement(item)}
                              className="text-blue-600 hover:text-blue-900 flex items-center justify-end"
                            >
                              <Edit2 className="h-4 w-4 mr-1" />
                              {item.id ? 'Éditer' : 'Saisir'}
                            </button>}
                          </div>
                        </td>
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
