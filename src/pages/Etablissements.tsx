import { apiFetch } from "../lib/api.ts";
import React, { useEffect, useState } from 'react';
import { useAuth } from '../components/AuthProvider.tsx';
import { Building2, Plus, Search, Upload } from 'lucide-react';
import { EtablissementForm } from '../components/EtablissementForm.tsx';
import { ImportCsvModal } from '../components/ImportCsvModal.tsx';
import { DSE_ROLES, LOCAL_SCHOOL_ROLES, hasAnyRole } from '../lib/roles.ts';

export default function Etablissements() {
  const [etablissements, setEtablissements] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [editingEtablissement, setEditingEtablissement] = useState<any>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('Tous');
  const [filterArrondissement, setFilterArrondissement] = useState('Tous');
  const [filterStatut, setFilterStatut] = useState('Tous');
  const [showArchived, setShowArchived] = useState(false);

  const { token, user } = useAuth();
  const userRole = user?.role;
  const canWrite = hasAnyRole(userRole, [...DSE_ROLES, ...LOCAL_SCHOOL_ROLES]);

  const fetchEtablissements = async () => {
    if (!token) return;
    setLoading(true);
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
    } finally {
      setLoading(false);
    }
  };

  const handleArchive = async (id: number) => {
    if (!token) return;
    if (!window.confirm("Êtes-vous sûr de vouloir archiver cet établissement ? Cette action est réversible en modifiant le statut de la fiche.")) return;

    try {
      const res = await apiFetch(`/api/etablissements/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        fetchEtablissements();
      } else {
        const data = await res.json();
        alert(data.error || "Erreur lors de l'archivage.");
      }
    } catch (e) {
      console.error(e);
      alert("Erreur réseau lors de l'archivage.");
    }
  };

  useEffect(() => {
    fetchEtablissements();
  }, [token]);

  const filteredEtablissements = etablissements.filter((etab) => {
    const matchSearch = etab.nom.toLowerCase().includes(searchTerm.toLowerCase()) || 
                        (etab.nomDirecteur && etab.nomDirecteur.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchType = filterType === 'Tous' || etab.type === filterType;
    const matchArr = filterArrondissement === 'Tous' || etab.arrondissement === filterArrondissement;
    const matchStatut = filterStatut === 'Tous' || etab.statut === filterStatut;
    const matchArchive = showArchived ? true : !etab.archived;
    return matchSearch && matchType && matchArr && matchStatut && matchArchive;
  });

  const primaryCount = etablissements.filter(e => e.type === 'Primaire' && !e.archived).length;
  const secondaryCount = etablissements.filter(e => e.type === 'Secondaire' && !e.archived).length;
  const totalCount = primaryCount + secondaryCount;

  if (isCreating || editingEtablissement) {
    return (
      <div className="space-y-6">
        <div className="sm:flex sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {editingEtablissement ? "Modifier l'Établissement" : "Nouvel Établissement"}
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              {editingEtablissement 
                ? "Modifiez les informations de l'établissement." 
                : "Renseignez les informations de l'établissement."}
            </p>
          </div>
        </div>
        <EtablissementForm 
          etablissement={editingEtablissement}
          onSuccess={() => {
            setIsCreating(false);
            setEditingEtablissement(null);
            fetchEtablissements();
          }} 
          onCancel={() => {
            setIsCreating(false);
            setEditingEtablissement(null);
          }} 
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="sm:flex sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Établissements</h1>
          <p className="mt-1 text-sm text-gray-500">
            Gestion des fiches établissements Publics (308 primaires + 31 secondaires).
          </p>
        </div>
        {canWrite && (
          <div className="mt-4 flex sm:mt-0 space-x-3">
            <button
              type="button"
              onClick={() => setIsImporting(true)}
              className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              <Upload className="-ml-1 mr-2 h-4 w-4 text-gray-500" aria-hidden="true" />
              Importer CSV
            </button>
            <button
              type="button"
              onClick={() => setIsCreating(true)}
              className="inline-flex items-center justify-center rounded-md border border-transparent bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              <Plus className="-ml-1 mr-2 h-4 w-4" aria-hidden="true" />
              Nouvel établissement
            </button>
          </div>
        )}
      </div>

      <ImportCsvModal 
        isOpen={isImporting}
        onClose={() => setIsImporting(false)}
        onSuccess={() => fetchEtablissements()}
      />

      {/* Quota Progress Tracker */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-xl p-5 mb-6 shadow-sm">
        <h2 className="text-base font-bold text-blue-900 flex items-center gap-2">
          <Building2 className="h-5 w-5 text-blue-600" />
          Suivi du Référentiel National (Quota : 339 Établissements)
        </h2>
        <p className="text-xs text-blue-700 mt-1">
          Suivi de l'enregistrement par rapport aux objectifs officiels de la Commune de Ouagadougou (308 primaires & 31 secondaires).
        </p>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-4">
          {/* Primaires Quota */}
          <div className="bg-white p-3.5 rounded-lg border border-blue-100 shadow-xs">
            <div className="flex justify-between items-center text-xs font-semibold text-gray-500 mb-1">
              <span>Écoles Primaires</span>
              <span className="text-blue-700 font-bold">{primaryCount} / 308</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div 
                className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                style={{ width: `${Math.min((primaryCount / 308) * 100, 100)}%` }}
              ></div>
            </div>
            <span className="text-[10px] text-gray-400 mt-1 block">
              {Math.round((primaryCount / 308) * 100)}% de l'objectif atteint
            </span>
          </div>

          {/* Secondaires Quota */}
          <div className="bg-white p-3.5 rounded-lg border border-blue-100 shadow-xs">
            <div className="flex justify-between items-center text-xs font-semibold text-gray-500 mb-1">
              <span>Écoles Secondaires</span>
              <span className="text-indigo-700 font-bold">{secondaryCount} / 31</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div 
                className="bg-indigo-600 h-2 rounded-full transition-all duration-500"
                style={{ width: `${Math.min((secondaryCount / 31) * 100, 100)}%` }}
              ></div>
            </div>
            <span className="text-[10px] text-gray-400 mt-1 block">
              {Math.round((secondaryCount / 31) * 100)}% de l'objectif atteint
            </span>
          </div>

          {/* Total Quota */}
          <div className="bg-white p-3.5 rounded-lg border border-blue-100 shadow-xs">
            <div className="flex justify-between items-center text-xs font-semibold text-gray-500 mb-1">
              <span>Total Référentiel</span>
              <span className="text-emerald-700 font-bold">{totalCount} / 339</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div 
                className="bg-emerald-600 h-2 rounded-full transition-all duration-500"
                style={{ width: `${Math.min((totalCount / 339) * 100, 100)}%` }}
              ></div>
            </div>
            <span className="text-[10px] text-gray-400 mt-1 block">
              {Math.round((totalCount / 339) * 100)}% de couverture globale
            </span>
          </div>
        </div>
      </div>

      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 mb-6 flex flex-col sm:flex-row gap-4 items-center">
        <div className="flex-1 w-full">
          <div className="relative rounded-md shadow-sm">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
              <Search className="h-4 w-4 text-gray-400" aria-hidden="true" />
            </div>
            <input
              type="text"
              className="block w-full rounded-md border-gray-300 pl-10 focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2 border"
              placeholder="Rechercher un nom..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        <div className="sm:w-48 w-full">
          <select
            className="block w-full rounded-md border-gray-300 py-2 pl-3 pr-10 text-base focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm border"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
          >
            <option value="Tous">Tous les types</option>
            <option value="Primaire">Primaire</option>
            <option value="Secondaire">Secondaire</option>
          </select>
        </div>
        <div className="sm:w-48 w-full">
          <select
            className="block w-full rounded-md border-gray-300 py-2 pl-3 pr-10 text-base focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm border"
            value={filterArrondissement}
            onChange={(e) => setFilterArrondissement(e.target.value)}
          >
            <option value="Tous">Tous les arrondissements</option>
            {Array.from({ length: 12 }, (_, i) => (
              <option key={i + 1} value={`Arrondissement ${i + 1}`}>
                Arrondissement {i + 1}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:w-48 w-full">
          <select
            className="block w-full rounded-md border-gray-300 py-2 pl-3 pr-10 text-base focus:border-blue-500 focus:outline-none focus:ring-blue-500 sm:text-sm border"
            value={filterStatut}
            onChange={(e) => setFilterStatut(e.target.value)}
          >
            <option value="Tous">Tous les statuts</option>
            <option value="public">Public</option>
            <option value="privé">Privé</option>
            <option value="en construction">En construction</option>
          </select>
        </div>
        <div className="flex items-center space-x-2 pl-2">
          <input
            id="showArchived"
            name="showArchived"
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <label htmlFor="showArchived" className="text-sm text-gray-700 whitespace-nowrap">
            Afficher archivés
          </label>
        </div>
      </div>
 
      <div className="flex flex-col">
        <div className="-my-2 -mx-4 overflow-x-auto sm:-mx-6 lg:-mx-8">
          <div className="inline-block min-w-full py-2 align-middle md:px-6 lg:px-8">
            <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
              <table className="min-w-full divide-y divide-gray-300">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6">
                      Nom
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                      Type
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                      Arrondissement
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                      Statut
                    </th>
                    <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                      Directeur/Proviseur
                    </th>
                    {canWrite && (
                      <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-6 text-right text-sm font-semibold text-gray-900">
                        Actions
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-sm text-gray-500">
                        Chargement des établissements...
                      </td>
                    </tr>
                  ) : filteredEtablissements.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-sm text-gray-500">
                        Aucun établissement trouvé. Commencez par en ajouter un ou utilisez l'importation en masse.
                      </td>
                    </tr>
                  ) : (
                    filteredEtablissements.map((etab) => (
                      <tr key={etab.id} className={etab.archived ? "bg-gray-50 text-gray-400" : ""}>
                        <td className={`whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium sm:pl-6 ${etab.archived ? "text-gray-400 line-through" : "text-gray-900"}`}>
                          {etab.nom}
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{etab.type}</td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{etab.arrondissement}</td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                          {etab.archived ? (
                            <span className="inline-flex rounded-full bg-gray-100 px-2 text-xs font-semibold leading-5 text-gray-600">
                              Archivé
                            </span>
                          ) : (
                            <span className="inline-flex rounded-full bg-green-100 px-2 text-xs font-semibold leading-5 text-green-800">
                              {etab.statut}
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{etab.nomDirecteur || '-'}</td>
                        {canWrite && (
                          <td className="whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6 space-x-3">
                            <button
                              onClick={() => setEditingEtablissement(etab)}
                              className="text-blue-600 hover:text-blue-900"
                            >
                              Éditer
                            </button>
                            {!etab.archived && (
                              <button
                                onClick={() => handleArchive(etab.id)}
                                className="text-red-600 hover:text-red-900"
                              >
                                Archiver
                              </button>
                            )}
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
