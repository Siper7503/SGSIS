import { apiFetch } from "../lib/api.ts";
import React, { useEffect, useState } from 'react';
import { useAuth } from '../components/AuthProvider.tsx';
import { 
  Briefcase, 
  Edit2, 
  Search, 
  Truck, 
  TrendingDown, 
  CheckCircle2, 
  AlertCircle, 
  SlidersHorizontal, 
  RotateCcw, 
  PlusCircle, 
  Clock, 
  Info,
  Building
} from 'lucide-react';
import { MobilierForm } from '../components/MobilierForm.tsx';

export default function Mobilier() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedArrondissement, setSelectedArrondissement] = useState('Tous');
  const [sortBy, setSortBy] = useState('priority'); // priority | deficit | name | stock
  
  const [editingEtablissement, setEditingEtablissement] = useState<any>(null);
  
  // Dotation Modal State
  const [dotationTarget, setDotationTarget] = useState<any>(null);
  const [dotationForm, setDotationForm] = useState({
    tablesBancs: 0,
    chaisesEleves: 0,
    tablesBureau: 0,
    chaisesBureau: 0,
    motif: 'Dotation ministérielle standard'
  });
  const [dotationLoading, setDotationLoading] = useState(false);
  const [dotationError, setDotationError] = useState<string | null>(null);
  const [dotationSuccess, setDotationSuccess] = useState(false);

  const { token, user } = useAuth();

  const fetchData = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await apiFetch('/api/mobilier', {
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

  // Extract unique arrondissements for the filter
  const uniqueArrondissements = Array.from(new Set(data.map(item => item.arrondissement))).filter(Boolean);

  // Compute stats and enrich data with theoretical needs & deficits
  const enrichedData = data.map((item) => {
    const totalStudents = (item.elevesFilles || 0) + (item.elevesGarcons || 0);
    
    // 1 Table-banc for 2 students
    const theoreticalTablesBancs = Math.ceil(totalStudents / 2);
    const tablesBancsDeficit = Math.max(0, theoreticalTablesBancs - (item.tablesBancs || 0));
    const coveragePercent = theoreticalTablesBancs > 0 
      ? Math.min(100, Math.round(((item.tablesBancs || 0) / theoreticalTablesBancs) * 100)) 
      : 100;

    // Teachers + Admin desks/chairs need
    const totalStaff = (item.enseignants || 0) + (item.personnelsAdmin || 0);
    const theoreticalDesks = totalStaff;
    const desksDeficit = Math.max(0, theoreticalDesks - (item.tablesBureau || 0));

    // Priority assessment
    let priorityScore = 0; // Higher means more urgent
    let priorityLabel = 'Faible';
    let priorityColor = 'bg-slate-100 text-slate-800 border-slate-200';

    if (totalStudents > 0) {
      if (coveragePercent < 35) {
        priorityScore = 4;
        priorityLabel = 'CRITIQUE / URGENT';
        priorityColor = 'bg-rose-50 text-rose-700 border-rose-200 animate-pulse';
      } else if (coveragePercent < 60) {
        priorityScore = 3;
        priorityLabel = 'Priorité Haute';
        priorityColor = 'bg-red-50 text-red-700 border-red-200';
      } else if (coveragePercent < 85) {
        priorityScore = 2;
        priorityLabel = 'Priorité Moyenne';
        priorityColor = 'bg-amber-50 text-amber-700 border-amber-200';
      } else {
        priorityScore = 1;
        priorityLabel = 'Satisfaisant';
        priorityColor = 'bg-emerald-50 text-emerald-700 border-emerald-200';
      }
    }

    return {
      ...item,
      totalStudents,
      theoreticalTablesBancs,
      tablesBancsDeficit,
      coveragePercent,
      totalStaff,
      theoreticalDesks,
      desksDeficit,
      priorityScore,
      priorityLabel,
      priorityColor
    };
  });

  const isArrondissementResp = user?.role === "Responsable d'arrondissement" || user?.role === "Responsable d'Arrondissement";

  // Filter enriched data
  const filteredData = enrichedData.filter((item) => {
    const matchSearch = item.nomEtablissement.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        item.arrondissement.toLowerCase().includes(searchTerm.toLowerCase());
    
    if (isArrondissementResp) {
      // Automatic filtering for the current user's arrondissement
      return matchSearch && user?.arrondissement && item.arrondissement?.toLowerCase() === user.arrondissement.toLowerCase();
    }
    
    const matchArrondissement = selectedArrondissement === 'Tous' || item.arrondissement === selectedArrondissement;
    return matchSearch && matchArrondissement;
  });

  // Sort enriched data
  const sortedData = [...filteredData].sort((a, b) => {
    if (sortBy === 'priority') {
      // Sort by priority score desc, then by absolute deficit desc
      return (b.priorityScore - a.priorityScore) || (b.tablesBancsDeficit - a.tablesBancsDeficit);
    }
    if (sortBy === 'deficit') {
      return b.tablesBancsDeficit - a.tablesBancsDeficit;
    }
    if (sortBy === 'name') {
      return a.nomEtablissement.localeCompare(b.nomEtablissement);
    }
    if (sortBy === 'stock') {
      return b.tablesBancs - a.tablesBancs;
    }
    return 0;
  });

  // Global aggregate metrics for the active filtered selection
  const totalStudentsFiltered = filteredData.reduce((acc, curr) => acc + curr.totalStudents, 0);
  const totalStockFiltered = filteredData.reduce((acc, curr) => acc + (curr.tablesBancs || 0), 0);
  const totalNeedFiltered = filteredData.reduce((acc, curr) => acc + curr.theoreticalTablesBancs, 0);
  const totalDeficitFiltered = filteredData.reduce((acc, curr) => acc + curr.tablesBancsDeficit, 0);
  const globalCoveragePercent = totalNeedFiltered > 0 
    ? Math.round((totalStockFiltered / totalNeedFiltered) * 100) 
    : 100;

  // Handle dotation submission
  const handleDotationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !dotationTarget) return;

    setDotationLoading(true);
    setDotationError(null);
    setDotationSuccess(false);

    try {
      const res = await apiFetch('/api/mobilier/dotation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          etablissementId: dotationTarget.etablissementId,
          tablesBancs: dotationForm.tablesBancs,
          chaisesEleves: dotationForm.chaisesEleves,
          tablesBureau: dotationForm.tablesBureau,
          chaisesBureau: dotationForm.chaisesBureau,
          motif: dotationForm.motif
        })
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Impossible d'enregistrer la dotation.");
      }

      setDotationSuccess(true);
      setTimeout(() => {
        setDotationTarget(null);
        setDotationSuccess(false);
        setDotationForm({
          tablesBancs: 0,
          chaisesEleves: 0,
          tablesBureau: 0,
          chaisesBureau: 0,
          motif: 'Dotation ministérielle standard'
        });
        fetchData(); // Reload stocks & deficits instantly!
      }, 1500);

    } catch (err: any) {
      setDotationError(err.message);
    } finally {
      setDotationLoading(false);
    }
  };

  if (editingEtablissement) {
    return (
      <MobilierForm
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
      
      {/* Header section */}
      <div className="sm:flex sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Gestion du Mobilier Scolaire</h1>
          <p className="mt-1.5 text-sm text-slate-500 max-w-2xl">
            Suivi des dotations, synthèse des besoins en tables-bancs, et calcul en temps réel des déficits basé sur les effectifs d'élèves déclarés.
          </p>
        </div>
      </div>

      {isArrondissementResp && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-emerald-800 flex items-start gap-3 text-sm">
          <Info className="h-5 w-5 text-emerald-600 mt-0.5 shrink-0" />
          <div>
            <span className="font-bold">Espace de consultation filtré :</span> Vous visualisez actuellement la synthèse mobilière et les besoins théoriques en mobilier des établissements de l'arrondissement de <strong className="font-extrabold">{user?.arrondissement}</strong>.
          </div>
        </div>
      )}

      {/* Synthesis Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        
        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center space-x-3.5 shadow-sm">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
            <Briefcase className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Stock Actuel</p>
            <h3 className="text-xl font-extrabold text-slate-800 mt-0.5">{totalStockFiltered}</h3>
            <p className="text-[11px] text-slate-500">Tables-bancs dispo.</p>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center space-x-3.5 shadow-sm">
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg">
            <Info className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Besoin Théorique</p>
            <h3 className="text-xl font-extrabold text-slate-800 mt-0.5">{totalNeedFiltered}</h3>
            <p className="text-[11px] text-slate-500">Ratio: 1 table pour 2 élèves</p>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center space-x-3.5 shadow-sm">
          <div className="p-3 bg-rose-50 text-rose-600 rounded-lg">
            <TrendingDown className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Déficit Mobilier</p>
            <h3 className="text-xl font-extrabold text-rose-600 mt-0.5">{totalDeficitFiltered}</h3>
            <p className="text-[11px] text-slate-500">Total à pourvoir</p>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center space-x-3.5 shadow-sm">
          <div className={`p-3 rounded-lg ${globalCoveragePercent >= 80 ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Taux de Couverture</p>
            <h3 className={`text-xl font-extrabold mt-0.5 ${globalCoveragePercent >= 80 ? 'text-emerald-600' : 'text-amber-600'}`}>{globalCoveragePercent}%</h3>
            <p className="text-[11px] text-slate-500">Enseignement général</p>
          </div>
        </div>

      </div>

      {/* Advanced Filter and Control Bar */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-150 flex flex-col md:flex-row gap-4 items-center justify-between">
        
        {/* Search */}
        <div className="relative w-full md:w-72">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            className="block w-full rounded-lg border-slate-200 pl-9 pr-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500 bg-slate-50 border transition"
            placeholder="Nom d'école ou commune..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Filters and Sorters */}
        <div className="flex flex-wrap gap-3.5 w-full md:w-auto items-center justify-end">
          
          {/* Arrondissement filter */}
          {!isArrondissementResp && (
            <div className="flex items-center space-x-2">
              <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">Zone :</span>
              <select
                value={selectedArrondissement}
                onChange={(e) => setSelectedArrondissement(e.target.value)}
                className="rounded-lg border-slate-200 py-1.5 pl-3 pr-8 text-xs bg-slate-50 border text-slate-700"
              >
                <option value="Tous">Tous les Arrondissements</option>
                {uniqueArrondissements.map(arr => (
                  <option key={arr} value={arr}>{arr}</option>
                ))}
              </select>
            </div>
          )}

          {/* Sorter */}
          <div className="flex items-center space-x-2">
            <span className="text-xs font-semibold text-slate-500 whitespace-nowrap">Trier par :</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="rounded-lg border-slate-200 py-1.5 pl-3 pr-8 text-xs bg-slate-50 border text-slate-700"
            >
              <option value="priority">Priorité d'urgence</option>
              <option value="deficit">Déficit maximal</option>
              <option value="name">Nom de l'école</option>
              <option value="stock">Stock disponible</option>
            </select>
          </div>

          <button 
            onClick={() => {
              setSearchTerm('');
              setSelectedArrondissement('Tous');
              setSortBy('priority');
            }}
            title="Réinitialiser"
            className="p-1.5 border border-slate-200 hover:bg-slate-50 rounded-lg text-slate-500 transition"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>

      </div>

      {/* Main Table / List */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th scope="col" className="py-3.5 pl-4 pr-3 text-xs font-bold text-slate-500 uppercase tracking-wider sm:pl-6">
                  Établissement & Type
                </th>
                <th scope="col" className="px-3 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Effectifs élèves
                </th>
                <th scope="col" className="px-3 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Stock / Besoin Théorique (Tables-bancs)
                </th>
                <th scope="col" className="px-3 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Déficit / Couverture
                </th>
                <th scope="col" className="px-3 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Niveau d'Urgence
                </th>
                {!isArrondissementResp && (
                  <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-6">
                    <span className="sr-only">Actions</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={isArrondissementResp ? 5 : 6} className="py-12 text-center text-sm text-slate-400">
                    Chargement de l'inventaire et des besoins mobiliers...
                  </td>
                </tr>
              ) : sortedData.length === 0 ? (
                <tr>
                  <td colSpan={isArrondissementResp ? 5 : 6} className="py-12 text-center text-sm text-slate-400">
                    Aucun établissement trouvé pour ces filtres.
                  </td>
                </tr>
              ) : (
                sortedData.map((item) => (
                  <tr key={item.etablissementId} className="hover:bg-slate-50/50 transition">
                    
                    {/* Establishment info */}
                    <td className="py-4 pl-4 pr-3 sm:pl-6">
                      <div className="font-extrabold text-slate-900">{item.nomEtablissement}</div>
                      <div className="text-slate-500 text-xs mt-0.5 flex items-center gap-1.5">
                        <Building className="h-3 w-3 text-slate-400" />
                        <span>{item.typeEtablissement} &bull; {item.arrondissement}</span>
                      </div>
                    </td>

                    {/* Effectifs */}
                    <td className="px-3 py-4">
                      {item.totalStudents > 0 ? (
                        <div>
                          <div className="font-bold text-slate-800">{item.totalStudents} élèves</div>
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            F : {item.elevesFilles || 0} &bull; G : {item.elevesGarcons || 0}
                          </div>
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-slate-400 italic text-xs bg-slate-50 border rounded-lg px-2 py-0.5">
                          <AlertCircle className="h-3.5 w-3.5 text-slate-400" />
                          Aucun effectif
                        </span>
                      )}
                    </td>

                    {/* Stock / Needs */}
                    <td className="px-3 py-4">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs max-w-[140px]">
                          <span className="text-slate-400">Stock :</span>
                          <span className="font-bold text-slate-800">{item.tablesBancs || 0}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs max-w-[140px]">
                          <span className="text-slate-400">Requis :</span>
                          <span className="font-semibold text-indigo-600">{item.theoreticalTablesBancs}</span>
                        </div>
                      </div>
                    </td>

                    {/* Deficit / Coverage */}
                    <td className="px-3 py-4">
                      <div>
                        {item.tablesBancsDeficit > 0 ? (
                          <div className="font-black text-rose-600">-{item.tablesBancsDeficit} tables</div>
                        ) : (
                          <div className="font-extrabold text-emerald-600 flex items-center gap-1">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Complet
                          </div>
                        )}
                        <div className="w-24 bg-slate-100 rounded-full h-1.5 mt-1.5 overflow-hidden">
                          <div 
                            className={`h-1.5 rounded-full ${
                              item.coveragePercent < 50 ? 'bg-rose-500' :
                              item.coveragePercent < 85 ? 'bg-amber-500' : 'bg-emerald-500'
                            }`}
                            style={{ width: `${item.coveragePercent}%` }}
                          />
                        </div>
                        <div className="text-[10px] font-bold text-slate-400 mt-0.5">{item.coveragePercent}% couvert</div>
                      </div>
                    </td>

                    {/* Urgent indicator badge */}
                    <td className="px-3 py-4">
                      <span className={`inline-flex items-center border rounded-full px-2.5 py-1 text-xs font-bold leading-4 ${item.priorityColor}`}>
                        {item.priorityLabel}
                      </span>
                    </td>

                    {/* Actions dropdown / buttons */}
                    {!isArrondissementResp && (
                      <td className="py-4 pl-3 pr-4 text-right text-xs font-bold sm:pr-6">
                        <div className="flex justify-end gap-2.5">
                          
                          {/* Dotation action */}
                          <button
                            onClick={() => setDotationTarget(item)}
                            className="bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg px-2.5 py-1.5 flex items-center gap-1 border border-blue-100 transition"
                            title="Enregistrer une livraison"
                          >
                            <Truck className="h-3.5 w-3.5" />
                            <span>Dotation</span>
                          </button>

                          {/* Traditional edit */}
                          <button
                            onClick={() => setEditingEtablissement(item)}
                            className="bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-lg px-2.5 py-1.5 flex items-center gap-1 border border-slate-200 transition"
                            title="Saisir stock"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                            <span>Saisir</span>
                          </button>

                        </div>
                      </td>
                    )}

                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Dotation Modal */}
      {dotationTarget && (
        <div className="fixed inset-0 bg-slate-900/55 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-150 max-w-lg w-full overflow-hidden transform animate-in fade-in zoom-in-95 duration-200">
            
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-5">
              <div className="flex items-center space-x-3">
                <Truck className="h-6 w-6 text-blue-100" />
                <div>
                  <h3 className="font-extrabold text-lg leading-6">Livraison officielle de Mobilier</h3>
                  <p className="text-blue-100 text-xs mt-0.5">Enregistrer une dotation de matériel</p>
                </div>
              </div>
            </div>

            <form onSubmit={handleDotationSubmit} className="p-6 space-y-5">
              
              {/* Recipient school name label */}
              <div className="bg-slate-50 border border-slate-150 rounded-xl p-3">
                <p className="text-[10px] uppercase font-bold text-slate-400">Établissement Bénéficiaire</p>
                <p className="text-sm font-black text-slate-800 mt-0.5">{dotationTarget.nomEtablissement}</p>
                <p className="text-xs text-slate-500">{dotationTarget.typeEtablissement} &bull; Zone : {dotationTarget.arrondissement}</p>
                <div className="mt-2 text-xs bg-indigo-50 border border-indigo-100 rounded text-indigo-800 p-1.5 flex justify-between">
                  <span>Déficit actuel tables-bancs :</span>
                  <strong className="font-bold">{dotationTarget.tablesBancsDeficit} tables</strong>
                </div>
              </div>

              {dotationError && (
                <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs px-3.5 py-2.5 rounded-lg font-medium">
                  {dotationError}
                </div>
              )}

              {dotationSuccess && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs px-3.5 py-2.5 rounded-lg font-bold flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Dotation enregistrée ! Recalcul du déficit en cours...</span>
                </div>
              )}

              {/* Quantities grid */}
              <div className="grid grid-cols-2 gap-4">
                
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide">Tables-Bancs (Élèves) <span className="text-blue-600">*</span></label>
                  <input
                    type="number"
                    min="0"
                    value={dotationForm.tablesBancs}
                    onChange={(e) => setDotationForm(prev => ({ ...prev, tablesBancs: Number(e.target.value) }))}
                    className="mt-1 block w-full rounded-lg border-slate-200 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm p-2 border"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide">Chaises Élèves (Locaux Spéc.)</label>
                  <input
                    type="number"
                    min="0"
                    value={dotationForm.chaisesEleves}
                    onChange={(e) => setDotationForm(prev => ({ ...prev, chaisesEleves: Number(e.target.value) }))}
                    className="mt-1 block w-full rounded-lg border-slate-200 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm p-2 border"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide">Tables de Bureau (Admin/Profs)</label>
                  <input
                    type="number"
                    min="0"
                    value={dotationForm.tablesBureau}
                    onChange={(e) => setDotationForm(prev => ({ ...prev, tablesBureau: Number(e.target.value) }))}
                    className="mt-1 block w-full rounded-lg border-slate-200 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm p-2 border"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide">Chaises Bureau</label>
                  <input
                    type="number"
                    min="0"
                    value={dotationForm.chaisesBureau}
                    onChange={(e) => setDotationForm(prev => ({ ...prev, chaisesBureau: Number(e.target.value) }))}
                    className="mt-1 block w-full rounded-lg border-slate-200 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm p-2 border"
                  />
                </div>

              </div>

              {/* Justification / Motif */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide">Motif ou Source du matériel</label>
                <input
                  type="text"
                  value={dotationForm.motif}
                  onChange={(e) => setDotationForm(prev => ({ ...prev, motif: e.target.value }))}
                  placeholder="Ex: Programme d'Urgence Mobilier 2026, Don de l'ONG..."
                  className="mt-1 block w-full rounded-lg border-slate-200 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm p-2 border"
                />
              </div>

              {/* Actions Footer */}
              <div className="flex justify-end space-x-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setDotationTarget(null)}
                  disabled={dotationLoading}
                  className="rounded-lg border border-slate-300 bg-white py-2 px-4 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={dotationLoading || dotationSuccess}
                  className="inline-flex justify-center items-center rounded-lg bg-blue-600 py-2 px-5 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 transition disabled:opacity-50"
                >
                  {dotationLoading ? "Enregistrement..." : "Confirmer la Livraison"}
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

    </div>
  );
}
