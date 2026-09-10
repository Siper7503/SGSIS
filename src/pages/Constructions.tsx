import { apiFetch } from "../lib/api.ts";
import React, { useEffect, useState } from 'react';
import { useAuth } from '../components/AuthProvider.tsx';
import { Plus, Edit2, Search, Building, MapPin, Calendar, HardHat, Layers, LayoutGrid, TrendingUp, TrendingDown, Percent, Clock } from 'lucide-react';
import { ConstructionForm } from '../components/ConstructionForm.tsx';
import { EtablissementForm } from '../components/EtablissementForm.tsx';
import { ModuleWorkflowActions } from '../components/ModuleWorkflowActions.tsx';
import { DSE_ROLES, LOCAL_SCHOOL_ROLES, hasAnyRole } from '../lib/roles.ts';

export default function Constructions() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [convertingItem, setConvertingItem] = useState<any>(null);
  const [viewMode, setViewMode] = useState<'kanban' | 'grid'>('kanban');
  const { token, user } = useAuth();
  const isDse = hasAnyRole(user?.role, DSE_ROLES);
  const isSchoolWriter = hasAnyRole(user?.role, LOCAL_SCHOOL_ROLES);

  const fetchData = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await apiFetch('/api/constructions', {
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

  const filteredData = data.filter((item) =>
    item.intitule?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.arrondissement?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (convertingItem) {
    return (
      <div className="space-y-6">
        <div className="sm:flex sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 font-sans tracking-tight">Convertir le projet en Établissement</h1>
            <p className="mt-1 text-sm text-gray-500">
              Renseignez les informations manquantes pour enregistrer la nouvelle fiche d'établissement actif préremplie.
            </p>
          </div>
        </div>
        <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded-md text-sm">
          <strong>Mode de préremplissage actif :</strong> Cet établissement sera prérempli avec les caractéristiques standards du <strong>Modèle {convertingItem.modeleType || 'A'}</strong> (infrastructures neuves, capacités de salles de classe et mobilier de référence).
        </div>
        <EtablissementForm 
          etablissement={{
            nom: convertingItem.intitule,
            arrondissement: convertingItem.arrondissement || 'Arrondissement 1',
            coordonnees: convertingItem.localisation || '',
            type: convertingItem.modeleType === 'B' ? 'Secondaire' : 'Primaire',
            statut: 'public',
            modeleType: convertingItem.modeleType || 'A'
          }}
          onSuccess={async () => {
            try {
              const response = await apiFetch(`/api/constructions/${convertingItem.id}`, {
                method: 'PUT',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                  ...convertingItem,
                  statut: 'Livré (Converti)'
                })
              });
              if (!response.ok) {
                const result = await response.json().catch(() => ({}));
                throw new Error(result.error || 'La conversion du projet n a pas pu être finalisée.');
              }
            } catch (e) {
              window.alert(e instanceof Error ? e.message : 'La conversion du projet n a pas pu être finalisée.');
              return;
            }
            setConvertingItem(null);
            fetchData();
          }} 
          onCancel={() => setConvertingItem(null)} 
        />
      </div>
    );
  }

  if (isFormOpen || editingItem) {
    return (
      <ConstructionForm
        construction={editingItem}
        requestOnly={isSchoolWriter && !isDse}
        onSuccess={() => {
          setIsFormOpen(false);
          setEditingItem(null);
          fetchData();
        }}
        onCancel={() => {
          setIsFormOpen(false);
          setEditingItem(null);
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="sm:flex sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 font-sans tracking-tight flex items-center gap-2">
            <Building className="h-6 w-6 text-blue-600" />
            Suivi des Chantiers & Réhabilitations
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Suivi des nouvelles constructions, des jalons d'avancement et de l'analyse d'écart budgétaire.
          </p>
        </div>
        <div className="mt-4 sm:mt-0 sm:flex sm:items-center sm:space-x-4">
          {/* View Toggle */}
          <div className="inline-flex rounded-lg border border-gray-200 bg-white p-1 shadow-2xs">
            <button
              onClick={() => setViewMode('kanban')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                viewMode === 'kanban'
                  ? 'bg-blue-50 text-blue-700 shadow-2xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
              title="Vue Kanban par Jalons"
            >
              <Layers className="h-3.5 w-3.5" />
              Jalons (Kanban)
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
                viewMode === 'grid'
                  ? 'bg-blue-50 text-blue-700 shadow-2xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
              title="Vue Liste / Grille"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Grille
            </button>
          </div>

          <button
            onClick={() => setIsFormOpen(true)}
            className="inline-flex items-center justify-center rounded-lg border border-transparent bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 w-full sm:w-auto mt-2 sm:mt-0"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            {isSchoolWriter && !isDse ? 'Signaler un besoin' : 'Nouveau projet'}
          </button>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="relative rounded-md shadow-xs flex-1 max-w-md">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <Search className="h-4 w-4 text-gray-400" aria-hidden="true" />
          </div>
          <input
            type="text"
            className="block w-full rounded-md border-gray-300 pl-10 focus:border-blue-500 focus:ring-blue-500 text-sm p-2 border"
            placeholder="Rechercher par intitulé ou arrondissement..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex gap-4 text-xs font-semibold text-slate-500">
          <span className="flex items-center gap-1">🟢 Économie / Marge</span>
          <span className="flex items-center gap-1">🔴 Dépassement budgétaire</span>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-2 text-sm text-gray-500">Chargement des projets...</p>
        </div>
      ) : filteredData.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <p className="text-gray-500 text-sm italic">Aucun projet trouvé avec les critères de recherche.</p>
        </div>
      ) : viewMode === 'kanban' ? (
        /* KANBAN BOARD / VUE DES JALONS */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 items-start">
          {[
            {
              id: 'planifie',
              title: 'Planifié',
              statusKeys: ['Planifié', 'Demande'],
              bgClass: 'bg-slate-50/80 border-t-4 border-blue-500',
              headerBg: 'bg-blue-50 border-b border-blue-100',
              textClass: 'text-blue-800',
              dotClass: 'bg-blue-500',
              icon: <Clock className="h-4 w-4 text-blue-600" />
            },
            {
              id: 'en_cours',
              title: 'En cours',
              statusKeys: ['En cours'],
              bgClass: 'bg-slate-50/80 border-t-4 border-amber-500',
              headerBg: 'bg-amber-50 border-b border-amber-100',
              textClass: 'text-amber-800',
              dotClass: 'bg-amber-500',
              icon: <Layers className="h-4 w-4 text-amber-600" />
            },
            {
              id: 'livre',
              title: 'Livré',
              statusKeys: ['Livré', 'Livré (Converti)'],
              bgClass: 'bg-slate-50/80 border-t-4 border-emerald-500',
              headerBg: 'bg-emerald-50 border-b border-emerald-100',
              textClass: 'text-emerald-800',
              dotClass: 'bg-emerald-500',
              icon: <Building className="h-4 w-4 text-emerald-600" />
            },
            {
              id: 'autres',
              title: 'Suspendu / Abandonné',
              statusKeys: ['Suspendu', 'Abandonné'],
              bgClass: 'bg-slate-50/80 border-t-4 border-slate-400',
              headerBg: 'bg-slate-100 border-b border-slate-200',
              textClass: 'text-slate-800',
              dotClass: 'bg-slate-500',
              icon: <HardHat className="h-4 w-4 text-slate-600" />
            }
          ].map((col) => {
            const colItems = filteredData.filter(item => col.statusKeys.includes(item.statut || 'Planifié'));
            
            // Calculate column-level stats
            const totalBudget = colItems.reduce((acc, curr) => acc + (curr.budget || 0), 0);
            const totalConsomme = colItems.reduce((acc, curr) => acc + (curr.budgetConsomme || 0), 0);
            const overallEcart = totalBudget - totalConsomme;
            const avgProgress = colItems.length > 0 ? Math.round(colItems.reduce((acc, curr) => acc + (curr.avancement || 0), 0) / colItems.length) : 0;

            return (
              <div key={col.id} className={`rounded-xl border border-gray-200 shadow-2xs overflow-hidden ${col.bgClass} flex flex-col min-h-[500px]`}>
                {/* Column Header */}
                <div className={`p-4 ${col.headerBg}`}>
                  <div className="flex items-center justify-between mb-1.5">
                    <h3 className={`font-bold text-sm tracking-tight flex items-center gap-1.5 ${col.textClass}`}>
                      {col.icon}
                      {col.title}
                    </h3>
                    <span className="inline-flex items-center justify-center bg-white border border-gray-200 rounded-md px-2 py-0.5 text-xs font-bold text-gray-700 shadow-3xs">
                      {colItems.length}
                    </span>
                  </div>
                  
                  {colItems.length > 0 && (
                    <div className="mt-2.5 pt-2 border-t border-dashed border-gray-200/60 space-y-1 text-[11px] text-gray-500">
                      <div className="flex justify-between">
                        <span>Budget cumulé :</span>
                        <span className="font-semibold text-gray-700">{totalBudget.toLocaleString()} F</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Écart cumulé :</span>
                        <span className={`font-bold ${overallEcart >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {overallEcart >= 0 ? '+' : ''}{overallEcart.toLocaleString()} F
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Avancement moyen :</span>
                        <span className="font-semibold text-gray-700">{avgProgress}%</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Column Items */}
                <div className="p-3 space-y-3.5 flex-1 overflow-y-auto max-h-[600px] bg-white/50">
                  {colItems.length === 0 ? (
                    <div className="h-32 flex flex-col items-center justify-center border-2 border-dashed border-gray-200 rounded-xl bg-white/30 text-xs text-gray-400 italic">
                      Aucun projet
                    </div>
                  ) : (
                    colItems.map((item) => {
                      const budgetPrevu = item.budget || 0;
                      const budgetConsomme = item.budgetConsomme || 0;
                      const ecart = budgetPrevu - budgetConsomme;
                      const progress = item.avancement || 0;
                      const modelText = item.modeleType === 'A' ? 'Modèle A (R+1)' : item.modeleType === 'B' ? 'Modèle B (R+2)' : `Modèle ${item.modeleType || 'N/A'}`;

                      return (
                        <div key={item.id} className="bg-white border border-gray-200 hover:border-gray-300 rounded-xl p-4 shadow-3xs hover:shadow-2xs transition-all space-y-3">
                          <div>
                            <div className="flex items-start justify-between gap-1 mb-1">
                              <h4 className="font-bold text-xs text-gray-900 leading-tight line-clamp-2" title={item.intitule}>
                                {item.intitule}
                              </h4>
                              {item.statut === 'Livré (Converti)' && (
                                <span className="bg-emerald-100 text-emerald-800 text-[9px] font-bold px-1.5 py-0.5 rounded flex-shrink-0">
                                  Converti
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] font-medium text-gray-400 bg-gray-50 border border-gray-100 px-1.5 py-0.5 rounded">
                              {modelText}
                            </span>
                          </div>

                          {/* Metadata */}
                          <div className="space-y-1 text-[11px] text-gray-500 border-b border-gray-100 pb-2.5">
                            <div className="flex items-center gap-1.5">
                              <MapPin className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                              <span className="truncate">{item.arrondissement} {item.localisation && `- ${item.localisation}`}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <Calendar className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                              <span className="truncate">{item.datesPrevisionnelles || 'Non défini'}</span>
                            </div>
                          </div>

                          {/* Progress bar */}
                          <div className="space-y-1">
                            <div className="flex justify-between items-center text-[11px]">
                              <span className="text-gray-400 font-medium flex items-center gap-0.5">
                                <Percent className="h-3 w-3 text-blue-500" /> Avancement
                              </span>
                              <span className="font-bold text-gray-800">{progress}%</span>
                            </div>
                            <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden border border-gray-100">
                              <div
                                className={`h-full rounded-full transition-all duration-300 ${
                                  progress === 100 ? 'bg-emerald-500' :
                                  progress >= 50 ? 'bg-amber-500' :
                                  'bg-blue-500'
                                }`}
                                style={{ width: `${progress}%` }}
                              ></div>
                            </div>
                          </div>

                          {/* Budgets & Ecarts */}
                          <div className="bg-slate-50/80 rounded-lg p-2 border border-slate-100 text-[11px] space-y-1">
                            <div className="flex justify-between">
                              <span className="text-gray-400">Prévu :</span>
                              <span className="font-medium text-gray-700">{budgetPrevu.toLocaleString()} F</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-400">Consommé :</span>
                              <span className="font-medium text-gray-700">{budgetConsomme.toLocaleString()} F</span>
                            </div>
                            <div className="flex justify-between border-t border-dashed border-gray-200/80 pt-1">
                              <span className="text-gray-500 font-semibold">Écart :</span>
                              <span className={`font-bold flex items-center gap-0.5 ${ecart >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {ecart >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                                {ecart.toLocaleString()} F
                              </span>
                            </div>
                          </div>

                          {/* Quick Actions */}
                          <div className="flex justify-between items-center pt-2 border-t border-gray-100 gap-2">
                            {isDse && item.statut === 'Livré' ? (
                              <button
                                onClick={() => setConvertingItem(item)}
                                className="text-emerald-600 hover:text-emerald-700 text-[11px] font-bold inline-flex items-center gap-0.5 transition-all"
                              >
                                <Building className="h-3.5 w-3.5" />
                                Convertir
                              </button>
                            ) : (
                              <span className="text-[10px] text-gray-400 font-medium truncate">
                                {item.statut === 'Livré (Converti)' ? 'Établissement actif' : `Statut : ${item.statut}`}
                              </span>
                            )}
                            <ModuleWorkflowActions module="constructions" recordId={item.id} workflowStatus={item.workflowStatus} onUpdated={fetchData} compact />
                            
                            {isDse && (
                              <button
                                onClick={() => setEditingItem(item)}
                                className="text-blue-600 hover:text-blue-900 text-[11px] font-bold inline-flex items-center gap-0.5 ml-auto transition-all bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded"
                              >
                                <Edit2 className="h-3 w-3" />
                                Éditer
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* STANDARD GRID VIEW WITH ALL COLUMNS (INCLUDES AVANCEMENT) */
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filteredData.map((item) => {
            const budgetPrevu = item.budget || 0;
            const budgetConsomme = item.budgetConsomme || 0;
            const ecart = budgetPrevu - budgetConsomme;
            const ecartPercentage = budgetPrevu > 0 ? Math.round((budgetConsomme / budgetPrevu) * 100) : 0;
            const progress = item.avancement || 0;

            return (
              <div key={item.id} className="bg-white overflow-hidden shadow-sm hover:shadow-md rounded-xl border border-gray-200 flex flex-col justify-between transition-all duration-200">
                <div className="px-5 py-5 sm:p-6 space-y-4">
                  <div className="flex items-start justify-between mb-2 gap-2">
                    <h3 className="text-base font-bold leading-6 text-gray-950 truncate" title={item.intitule}>
                      {item.intitule}
                    </h3>
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold border shrink-0 ${
                      item.statut === 'Livré' || item.statut === 'Livré (Converti)' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' :
                      item.statut === 'En cours' ? 'bg-amber-50 text-amber-800 border-amber-200' :
                      item.statut === 'Suspendu' ? 'bg-amber-50 text-amber-800 border-amber-100' :
                      item.statut === 'Abandonné' ? 'bg-red-50 text-red-800 border-red-200' :
                      'bg-gray-50 text-gray-800 border-gray-200'
                    }`}>
                      {item.statut}
                    </span>
                  </div>
                  
                  <dl className="space-y-2 text-xs text-gray-500">
                    <div className="flex items-center">
                      <MapPin className="h-4 w-4 mr-2 text-gray-400" />
                      <span>{item.arrondissement} {item.localisation && `- ${item.localisation}`}</span>
                    </div>
                    <div className="flex items-center">
                      <Calendar className="h-4 w-4 mr-2 text-gray-400" />
                      <span>{item.datesPrevisionnelles || 'Dates non définies'}</span>
                    </div>
                    <div className="flex items-center">
                      <HardHat className="h-4 w-4 mr-2 text-gray-400" />
                      <span className="truncate">{item.maitreOuvrage || 'Non défini'}</span>
                    </div>
                    <div className="flex items-center">
                      <Building className="h-4 w-4 mr-2 text-gray-400" />
                      <span>Modèle {item.modeleType}</span>
                    </div>
                  </dl>

                  {/* Progress percentage bar */}
                  <div className="space-y-1 pt-2 border-t border-gray-100">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-gray-400 font-medium">Pourcentage d'Avancement</span>
                      <span className="font-bold text-gray-900">{progress}%</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden border border-gray-100">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          progress === 100 ? 'bg-emerald-500' :
                          progress >= 50 ? 'bg-amber-500' :
                          'bg-blue-500'
                        }`}
                        style={{ width: `${progress}%` }}
                      ></div>
                    </div>
                  </div>

                  {item.budget != null && (
                    <div className="pt-3 border-t border-gray-150 space-y-2">
                      <div className="flex justify-between text-xs text-gray-500">
                        <span>Budget Prévu :</span>
                        <span className="font-semibold text-gray-900">{budgetPrevu.toLocaleString()} FCFA</span>
                      </div>
                      <div className="flex justify-between text-xs text-gray-500">
                        <span>Budget Consommé :</span>
                        <span className="font-semibold text-blue-600">{budgetConsomme.toLocaleString()} FCFA</span>
                      </div>
                      <div className="flex justify-between text-xs border-t border-dashed pt-1.5">
                        <span className="text-gray-500 font-semibold">Écart Budgétaire :</span>
                        <span className={`font-bold flex items-center gap-0.5 ${ecart >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {ecart >= 0 ? '+' : ''}{ecart.toLocaleString()} FCFA
                          {ecart < 0 && ' (Dépassement)'}
                        </span>
                      </div>

                      {budgetConsomme > 0 && (
                        <div className="mt-2 pt-1">
                          <div className="flex justify-between text-[11px] mb-1">
                            <span className="text-gray-400">Ratio Consommation :</span>
                            <span className={`font-bold ${ecartPercentage > 100 ? 'text-red-600' : 'text-blue-600'}`}>{ecartPercentage}%</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-1.5">
                            <div
                              className={`h-1.5 rounded-full ${ecartPercentage > 100 ? 'bg-red-600' : 'bg-blue-600'}`}
                              style={{ width: `${Math.min(ecartPercentage, 100)}%` }}
                            ></div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="bg-gray-50 px-5 py-3.5 sm:px-6 flex justify-between items-center border-t border-gray-100 mt-auto gap-2">
                  {isDse && item.statut === 'Livré' ? (
                    <button
                      onClick={() => setConvertingItem(item)}
                      className="text-emerald-600 hover:text-emerald-700 text-xs font-bold inline-flex items-center gap-0.5 transition-all"
                    >
                      <Building className="h-4 w-4" />
                      Convertir en Établissement
                    </button>
                  ) : (
                    <span className="text-xs text-gray-400 font-medium">
                      {item.statut === 'Livré (Converti)' ? 'Converti en Établissement' : `Projet ${item.statut}`}
                    </span>
                  )}
                  <ModuleWorkflowActions module="constructions" recordId={item.id} workflowStatus={item.workflowStatus} onUpdated={fetchData} compact />
                  {isDse && (
                    <button
                      onClick={() => setEditingItem(item)}
                      className="text-blue-600 hover:text-blue-900 text-xs font-bold inline-flex items-center gap-0.5 ml-auto transition-all bg-white hover:bg-blue-50 px-3 py-1.5 rounded-lg border border-gray-200"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                      Éditer
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
