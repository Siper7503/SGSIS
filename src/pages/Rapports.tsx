import { apiFetch } from "../lib/api.ts";
import React, { useEffect, useState } from 'react';
import { useAuth } from '../components/AuthProvider.tsx';
import { 
  Download, 
  FileText, 
  FileSpreadsheet, 
  PieChart, 
  BarChart2, 
  Filter, 
  Layers, 
  MapPin, 
  School,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Printer,
  X
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart as RechartsPie, Pie, Cell } from 'recharts';
import * as XLSX from 'xlsx';

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'];

export default function Rapports() {
  const { token } = useAuth();
  
  // RAW Data from API
  const [etablissements, setEtablissements] = useState<any[]>([]);
  const [infrastructures, setInfrastructures] = useState<any[]>([]);
  const [mobilier, setMobilier] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Selector States
  const [thematic, setThematic] = useState<'infra' | 'compliance' | 'furniture'>('infra');
  const [geoScope, setGeoScope] = useState<'all' | 'arrondissement' | 'etablissement'>('all');
  const [selectedArrondissement, setSelectedArrondissement] = useState<string>('Arrondissement 1');
  const [selectedEtablissementId, setSelectedEtablissementId] = useState<string>('');

  // Print View Modal
  const [showPrintModal, setShowPrintModal] = useState(false);

  // Load Data
  const loadAllData = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [etabRes, infraRes, mobRes] = await Promise.all([
        apiFetch('/api/etablissements', { headers: { Authorization: `Bearer ${token}` } }),
        apiFetch('/api/infrastructures', { headers: { Authorization: `Bearer ${token}` } }),
        apiFetch('/api/mobilier', { headers: { Authorization: `Bearer ${token}` } })
      ]);

      if (etabRes.ok && infraRes.ok && mobRes.ok) {
        const etabs = await etabRes.json();
        const infras = await infraRes.json();
        const mobs = await mobRes.json();

        setEtablissements(Array.isArray(etabs) ? etabs : []);
        setInfrastructures(Array.isArray(infras) ? infras : []);
        setMobilier(Array.isArray(mobs) ? mobs : []);

        if (Array.isArray(etabs) && etabs.length > 0) {
          setSelectedEtablissementId(etabs[0].id.toString());
        }
      }
    } catch (e) {
      console.error("Erreur lors du chargement des données de rapport :", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, [token]);

  // Aggregate Key Metrics for top boxes
  const totalEtabs = etablissements.length;
  const compliantCount = infrastructures.filter(i => i.conformite === 'Conforme').length;
  const partialCompliantCount = infrastructures.filter(i => i.conformite === 'Partiellement conforme').length;
  const nonCompliantCount = totalEtabs - (compliantCount + partialCompliantCount);

  const totalSeats = mobilier.reduce((acc, curr) => acc + (curr.tablesBancs || 0) * 2, 0); // 2 seats per desk
  const totalBenches = mobilier.reduce((acc, curr) => acc + (curr.tablesBancs || 0), 0);

  // Prepare Joined Rows for Report preview and exports
  const getJoinedReportData = () => {
    let list = etablissements.map(etab => {
      const infra = infrastructures.find(i => i.etablissementId === etab.id);
      const mob = mobilier.find(m => m.etablissementId === etab.id);
      return {
        ...etab,
        infra,
        mob
      };
    });

    // Apply Geographical Scopes (SF-28)
    if (geoScope === 'arrondissement') {
      list = list.filter(item => item.arrondissement === selectedArrondissement);
    } else if (geoScope === 'etablissement') {
      list = list.filter(item => item.id.toString() === selectedEtablissementId);
    }

    return list;
  };

  const reportRows = getJoinedReportData();

  // Excel / CSV Export (SF-27)
  const handleExportExcel = () => {
    if (reportRows.length === 0) {
      alert("Aucune donnée à exporter.");
      return;
    }

    let exportData: any[] = [];

    if (thematic === 'infra') {
      exportData = reportRows.map(row => ({
        "Établissement": row.nom,
        "Type": row.type,
        "Arrondissement": row.arrondissement,
        "Statut": row.statut,
        "Salles d'études (Total)": row.infra?.batimentsEtudes?.total || 0,
        "Salles d'études (Bon État)": row.infra?.batimentsEtudes?.bonEtat || 0,
        "Salles d'études (Dégradées)": row.infra?.batimentsEtudes?.degrade || 0,
        "Salles d'études (HS)": row.infra?.batimentsEtudes?.horsService || 0,
        "Bâtiments Admin": row.infra?.batimentsAdmin?.total || 0,
        "Points d'Eau": row.infra?.pointsEau || 0,
        "Latrines Élèves": row.infra?.latrinesEleves || 0,
        "Latrines Personnel": row.infra?.latrinesPersonnel || 0,
        "Laboratoires": row.infra?.laboratoires || 0,
        "Bibliothèque": row.infra?.bibliotheque || 0,
        "Conformité": row.infra?.conformite || "Non renseigné"
      }));
    } else if (thematic === 'compliance') {
      exportData = reportRows.map(row => {
        // Model Type estimation
        const modelRef = row.type === 'Primaire' ? 'Modèle A' : 'Modèle B';
        const modelClassrooms = row.type === 'Primaire' ? 6 : 12;
        const currentClassrooms = row.infra?.batimentsEtudes?.total || 0;
        const classGap = currentClassrooms - modelClassrooms;

        const modelLatrines = row.type === 'Primaire' ? 8 : 12;
        const currentLatrines = row.infra?.latrinesEleves || 0;
        const latrineGap = currentLatrines - modelLatrines;

        return {
          "Établissement": row.nom,
          "Type": row.type,
          "Modèle Référence": modelRef,
          "Salles Actuelles": currentClassrooms,
          "Salles Requises (Modèle)": modelClassrooms,
          "Écart Salles": classGap,
          "Latrines Actuelles": currentLatrines,
          "Latrines Requises": modelLatrines,
          "Écart Latrines": latrineGap,
          "Points d'Eau Actuels": row.infra?.pointsEau || 0,
          "Points d'Eau Requis": row.type === 'Primaire' ? 1 : 2,
          "Statut de Conformité": row.infra?.conformite || "Partiellement conforme"
        };
      });
    } else if (thematic === 'furniture') {
      exportData = reportRows.map(row => ({
        "Établissement": row.nom,
        "Type": row.type,
        "Tables Bancs": row.mob?.tablesBancs || 0,
        "Chaises Élèves": row.mob?.chaisesEleves || 0,
        "Tables Bureau": row.mob?.tablesBureau || 0,
        "Chaises Bureau": row.mob?.chaisesBureau || 0,
        "Capacité d'accueil élèves": (row.mob?.tablesBancs || 0) * 2,
        "Déficit estimé en tables": Math.max(0, (row.infra?.batimentsEtudes?.total || 0) * 25 - (row.mob?.tablesBancs || 0))
      }));
    }

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Rapport Thématique");

    // Write file
    const fileName = `Rapport_${thematic}_${geoScope}_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  // Printable A4 modal triggering
  const handlePrint = () => {
    window.print();
  };

  // Recharts compliant data preparation
  const complianceChartData = [
    { name: 'Conforme', value: compliantCount || 3 },
    { name: 'Partiellement', value: partialCompliantCount || 1 },
    { name: 'Non Conforme', value: nonCompliantCount || 1 },
  ];

  return (
    <div className="space-y-6">
      {/* Printable page layout container (hidden on screen, visible during native print) */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #print-area, #print-area * {
            visibility: visible;
          }
          #print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            background: white !important;
            color: black !important;
            padding: 20px;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      {/* Header section */}
      <div className="sm:flex sm:items-center sm:justify-between bg-white p-6 rounded-xl border border-gray-100 shadow-sm no-print">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center">
            <BarChart2 className="h-6 w-6 mr-2 text-green-600" />
            Génération de Rapports & Exports
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Extraction thématique consolidée (Infrastructures, Conformité, Mobilier) avec ciblage géographique à maille variable (SF-27 à SF-29).
          </p>
        </div>
        <div className="mt-4 sm:mt-0 flex gap-2">
          <button
            onClick={handleExportExcel}
            className="inline-flex items-center justify-center rounded-lg border border-transparent bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 transition-colors"
          >
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Exporter sous Excel / CSV
          </button>
          <button
            onClick={() => setShowPrintModal(true)}
            className="inline-flex items-center justify-center rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 transition-colors"
          >
            <Printer className="h-4 w-4 mr-2 text-blue-500" />
            Générer Rapport Imprimable (PDF)
          </button>
        </div>
      </div>

      {/* Report Generator Controls Form (SF-28) */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 grid grid-cols-1 md:grid-cols-3 gap-6 no-print">
        {/* Step 1: Theme selection */}
        <div>
          <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center">
            <Layers className="h-3.5 w-3.5 mr-1 text-blue-500" />
            1. Thématique du Rapport
          </label>
          <select
            value={thematic}
            onChange={(e: any) => setThematic(e.target.value)}
            className="block w-full rounded-lg border-gray-200 focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2.5 border font-medium text-gray-700"
          >
            <option value="infra">📂 État des infrastructures physiques</option>
            <option value="compliance">📐 Conformité & Écarts modèles types</option>
            <option value="furniture">🪑 Besoins en mobilier (Tables, Bancs)</option>
          </select>
        </div>

        {/* Step 2: Geographical scope maille */}
        <div>
          <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center">
            <MapPin className="h-3.5 w-3.5 mr-1 text-emerald-500" />
            2. Maille Géographique
          </label>
          <select
            value={geoScope}
            onChange={(e: any) => setGeoScope(e.target.value)}
            className="block w-full rounded-lg border-gray-200 focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2.5 border font-medium text-gray-700"
          >
            <option value="all">🌍 Toute la région (Consolidé)</option>
            <option value="arrondissement">📍 Par Arrondissement</option>
            <option value="etablissement">🏫 Par Établissement individuel</option>
          </select>
        </div>

        {/* Step 3: Specific target value selection */}
        <div>
          {geoScope === 'arrondissement' ? (
            <>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                Sélectionner l'arrondissement
              </label>
              <select
                value={selectedArrondissement}
                onChange={(e) => setSelectedArrondissement(e.target.value)}
                className="block w-full rounded-lg border-gray-200 focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2.5 border font-medium text-gray-700"
              >
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i + 1} value={`Arrondissement ${i + 1}`}>
                    Arrondissement {i + 1}
                  </option>
                ))}
              </select>
            </>
          ) : geoScope === 'etablissement' ? (
            <>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">
                Sélectionner l'établissement
              </label>
              <select
                value={selectedEtablissementId}
                onChange={(e) => setSelectedEtablissementId(e.target.value)}
                className="block w-full rounded-lg border-gray-200 focus:border-blue-500 focus:ring-blue-500 sm:text-sm p-2.5 border font-medium text-gray-700"
              >
                {etablissements.map(etab => (
                  <option key={etab.id} value={etab.id}>
                    {etab.nom} ({etab.arrondissement})
                  </option>
                ))}
              </select>
            </>
          ) : (
            <div className="flex items-center justify-center h-full pt-4">
              <span className="text-xs text-gray-400 font-medium italic">
                Filtre géographique général actif (aucun sous-ciblage requis)
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Dashboard mini-widgets on screen */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 no-print">
        <div className="bg-white p-5 rounded-xl shadow-xs border border-gray-100 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Établissements ciblés</p>
            <h3 className="text-2xl font-black text-gray-900 mt-1">{reportRows.length}</h3>
          </div>
          <div className="p-3 bg-blue-50 rounded-lg">
            <School className="h-6 w-6 text-blue-600" />
          </div>
        </div>
        <div className="bg-white p-5 rounded-xl shadow-xs border border-gray-100 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Conformité Modèles</p>
            <h3 className="text-2xl font-black text-emerald-600 mt-1">
              {Math.round((compliantCount / (totalEtabs || 1)) * 100)}%
            </h3>
          </div>
          <div className="p-3 bg-emerald-50 rounded-lg">
            <CheckCircle className="h-6 w-6 text-emerald-600" />
          </div>
        </div>
        <div className="bg-white p-5 rounded-xl shadow-xs border border-gray-100 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Bancs Consolidés</p>
            <h3 className="text-2xl font-black text-amber-600 mt-1">
              {totalBenches.toLocaleString()}
            </h3>
          </div>
          <div className="p-3 bg-amber-50 rounded-lg">
            <Layers className="h-6 w-6 text-amber-600" />
          </div>
        </div>
      </div>

      {/* Dynamic Report Preview Table Section (SF-27 / SF-29) */}
      <div className="bg-white shadow-sm border border-gray-100 rounded-xl overflow-hidden no-print">
        <div className="px-6 py-4 border-b border-gray-50 flex items-center justify-between">
          <h3 className="text-base font-bold text-gray-900 flex items-center">
            <Layers className="h-4.5 w-4.5 mr-1.5 text-blue-500" />
            Aperçu des Données du Rapport ({reportRows.length} lignes)
          </h3>
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800">
            Prêt pour export
          </span>
        </div>

        {loading ? (
          <p className="text-sm text-gray-500 p-8 text-center">Génération de l'aperçu du rapport...</p>
        ) : reportRows.length === 0 ? (
          <p className="text-sm text-gray-400 p-8 text-center italic">Aucune donnée trouvée pour les filtres sélectionnés.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100 text-sm">
              <thead className="bg-gray-50 text-gray-500 font-bold uppercase text-[10px] tracking-wider">
                {thematic === 'infra' && (
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left">Établissement</th>
                    <th scope="col" className="px-6 py-3 text-left">Arrondissement</th>
                    <th scope="col" className="px-6 py-3 text-center">Salles d'études</th>
                    <th scope="col" className="px-6 py-3 text-center">Bâtiments Admin</th>
                    <th scope="col" className="px-6 py-3 text-center">Points d'Eau</th>
                    <th scope="col" className="px-6 py-3 text-center">Latrines</th>
                    <th scope="col" className="px-6 py-3 text-center">Conformité</th>
                  </tr>
                )}
                {thematic === 'compliance' && (
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left">Établissement</th>
                    <th scope="col" className="px-6 py-3 text-left">Type / Modèle</th>
                    <th scope="col" className="px-6 py-3 text-center">Salles (Actuel vs Modèle)</th>
                    <th scope="col" className="px-6 py-3 text-center">Latrines (Actuel vs Modèle)</th>
                    <th scope="col" className="px-6 py-3 text-center">Points Eau (Actuel vs Modèle)</th>
                    <th scope="col" className="px-6 py-3 text-center">Statut Global</th>
                  </tr>
                )}
                {thematic === 'furniture' && (
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left">Établissement</th>
                    <th scope="col" className="px-6 py-3 text-left">Arrondissement</th>
                    <th scope="col" className="px-6 py-3 text-center">Tables-Bancs</th>
                    <th scope="col" className="px-6 py-3 text-center">Chaises Élèves</th>
                    <th scope="col" className="px-6 py-3 text-center">Tables Bureau</th>
                    <th scope="col" className="px-6 py-3 text-center">Chaises Bureau</th>
                    <th scope="col" className="px-6 py-3 text-center">Capacité (Élèves)</th>
                  </tr>
                )}
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700 bg-white">
                {reportRows.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50/50 transition-all">
                    {/* INFRASTRUCTURES THEME PREVIEW ROWS */}
                    {thematic === 'infra' && (
                      <>
                        <td className="px-6 py-4 font-bold text-gray-900">{row.nom}</td>
                        <td className="px-6 py-4">{row.arrondissement}</td>
                        <td className="px-6 py-4 text-center font-semibold">
                          {row.infra?.batimentsEtudes?.total || 0} salles 
                          <span className="text-[10px] text-gray-400 font-normal block">
                            (Bon : {row.infra?.batimentsEtudes?.bonEtat || 0}, Deg : {row.infra?.batimentsEtudes?.degrade || 0})
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center">{row.infra?.batimentsAdmin?.total || 0}</td>
                        <td className="px-6 py-4 text-center font-bold text-blue-600">{row.infra?.pointsEau || 0}</td>
                        <td className="px-6 py-4 text-center">
                          {row.infra?.latrinesEleves || 0} 
                          <span className="text-[10px] text-gray-400 block">pers: {row.infra?.latrinesPersonnel || 0}</span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${
                            row.infra?.conformite === 'Conforme' ? 'bg-emerald-50 text-emerald-700' :
                            row.infra?.conformite === 'Partiellement conforme' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'
                          }`}>
                            {row.infra?.conformite || "Partiellement conforme"}
                          </span>
                        </td>
                      </>
                    )}

                    {/* COMPLIANCE THEME PREVIEW ROWS */}
                    {thematic === 'compliance' && (() => {
                      const modelRef = row.type === 'Primaire' ? 'Modèle A' : 'Modèle B';
                      const reqClass = row.type === 'Primaire' ? 6 : 12;
                      const actClass = row.infra?.batimentsEtudes?.total || 0;
                      const classDiff = actClass - reqClass;

                      const reqLat = row.type === 'Primaire' ? 8 : 12;
                      const actLat = row.infra?.latrinesEleves || 0;
                      const latDiff = actLat - reqLat;

                      const reqWater = row.type === 'Primaire' ? 1 : 2;
                      const actWater = row.infra?.pointsEau || 0;
                      const waterDiff = actWater - reqWater;

                      return (
                        <>
                          <td className="px-6 py-4 font-bold text-gray-900">{row.nom}</td>
                          <td className="px-6 py-4 font-medium text-gray-500">{row.type} / <span className="text-gray-900 font-bold">{modelRef}</span></td>
                          <td className="px-6 py-4 text-center">
                            <span className="font-bold">{actClass}</span> / {reqClass}
                            <span className={`text-xs block font-bold mt-0.5 ${classDiff >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                              ({classDiff >= 0 ? `+${classDiff}` : classDiff})
                            </span>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className="font-bold">{actLat}</span> / {reqLat}
                            <span className={`text-xs block font-bold mt-0.5 ${latDiff >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                              ({latDiff >= 0 ? `+${latDiff}` : latDiff})
                            </span>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className="font-bold">{actWater}</span> / {reqWater}
                            <span className={`text-xs block font-bold mt-0.5 ${waterDiff >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                              ({waterDiff >= 0 ? `+${waterDiff}` : waterDiff})
                            </span>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${
                              row.infra?.conformite === 'Conforme' ? 'bg-emerald-50 text-emerald-700' :
                              row.infra?.conformite === 'Partiellement conforme' ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'
                            }`}>
                              {row.infra?.conformite || "Partiellement conforme"}
                            </span>
                          </td>
                        </>
                      );
                    })()}

                    {/* FURNITURE THEME PREVIEW ROWS */}
                    {thematic === 'furniture' && (
                      <>
                        <td className="px-6 py-4 font-bold text-gray-900">{row.nom}</td>
                        <td className="px-6 py-4">{row.arrondissement}</td>
                        <td className="px-6 py-4 text-center font-bold text-gray-900">{row.mob?.tablesBancs || 0}</td>
                        <td className="px-6 py-4 text-center">{row.mob?.chaisesEleves || 0}</td>
                        <td className="px-6 py-4 text-center">{row.mob?.tablesBureau || 0}</td>
                        <td className="px-6 py-4 text-center">{row.mob?.chaisesBureau || 0}</td>
                        <td className="px-6 py-4 text-center font-extrabold text-blue-600">
                          {(row.mob?.tablesBancs || 0) * 2} places
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* PRINT-OPTIMIZED MODAL PREVIEW FOR PDF GENERATION (SF-27) */}
      {showPrintModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 no-print overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[90vh]">
            {/* Header controls */}
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50 rounded-t-2xl">
              <div>
                <h3 className="text-base font-bold text-gray-900">Rapport Prêt pour l'Impression</h3>
                <p className="text-xs text-gray-500">Imprimez directement via votre navigateur ou sauvegardez en PDF.</p>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={handlePrint}
                  className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-sm transition-colors"
                >
                  <Printer className="h-3.5 w-3.5 mr-1.5" />
                  Imprimer / Exporter PDF
                </button>
                <button
                  onClick={() => setShowPrintModal(false)}
                  className="p-1.5 rounded-lg border border-gray-200 bg-white text-gray-500 hover:bg-gray-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Print Document Content Preview */}
            <div className="p-8 overflow-y-auto bg-white flex-1" id="print-area">
              {/* BURKINA FASO OFFICIAL STATE LETTERHEAD */}
              <div className="flex justify-between items-start border-b-2 border-double border-gray-800 pb-5">
                <div className="text-left space-y-1">
                  <p className="font-extrabold text-xs uppercase tracking-wider text-gray-950">BURKINA FASO</p>
                  <p className="text-[10px] text-gray-700 italic">Unité - Progrès - Justice</p>
                  <p className="text-[10px] font-bold text-gray-800 pt-2">DIRECTION COMMUNALE DE L'ÉDUCATION</p>
                  <p className="text-[10px] text-gray-600">DIRECTION DU SUIVI DES ETABLISSEMENTS (DSE)</p>
                </div>
                <div className="text-right text-[10px] text-gray-600 space-y-1 font-mono">
                  <p>Ouagadougou, le {new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                  <p>Réf: DSE/RAP-{thematic.toUpperCase()}-{geoScope.toUpperCase()}</p>
                </div>
              </div>

              {/* Document Title */}
              <div className="my-8 text-center">
                <h2 className="text-xl font-black text-gray-950 uppercase tracking-wide border-b border-gray-900 pb-2 inline-block">
                  RAPPORT OFFICIEL DE SYNTHÈSE
                </h2>
                <p className="text-sm font-bold text-gray-700 mt-2">
                  Thématique : {thematic === 'infra' ? "État général des infrastructures physiques" : 
                               thematic === 'compliance' ? "Conformité d'infrastructures et analyse d'écarts" : 
                               "Besoins consolidés en mobilier d'études"}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Maille géographique de ciblage : {geoScope === 'all' ? "Régionale (Consolidation globale)" : 
                                                    geoScope === 'arrondissement' ? `Provinciale : ${selectedArrondissement}` : 
                                                    `Locale : Établissement spécifique`}
                </p>
              </div>

              {/* Data Table */}
              <table className="min-w-full border-collapse border border-gray-800 text-xs mt-6">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-gray-800 px-3 py-2 text-left font-bold uppercase">Établissement</th>
                    <th className="border border-gray-800 px-3 py-2 text-left font-bold uppercase">Arrondissement</th>
                    
                    {thematic === 'infra' && (
                      <>
                        <th className="border border-gray-800 px-3 py-2 text-center font-bold uppercase">Salles (Bon / HS)</th>
                        <th className="border border-gray-800 px-3 py-2 text-center font-bold uppercase">Admin</th>
                        <th className="border border-gray-800 px-3 py-2 text-center font-bold uppercase">Points Eau</th>
                        <th className="border border-gray-800 px-3 py-2 text-center font-bold uppercase">Latrines</th>
                        <th className="border border-gray-800 px-3 py-2 text-center font-bold uppercase">Conformité</th>
                      </>
                    )}
                    {thematic === 'compliance' && (
                      <>
                        <th className="border border-gray-800 px-3 py-2 text-center font-bold uppercase">Type / Modèle</th>
                        <th className="border border-gray-800 px-3 py-2 text-center font-bold uppercase">Écart Salles</th>
                        <th className="border border-gray-800 px-3 py-2 text-center font-bold uppercase">Écart Latrines</th>
                        <th className="border border-gray-800 px-3 py-2 text-center font-bold uppercase">Écart Eau</th>
                        <th className="border border-gray-800 px-3 py-2 text-center font-bold uppercase">Statut</th>
                      </>
                    )}
                    {thematic === 'furniture' && (
                      <>
                        <th className="border border-gray-800 px-3 py-2 text-center font-bold uppercase">Tables-Bancs</th>
                        <th className="border border-gray-800 px-3 py-2 text-center font-bold uppercase">Chaises Élèves</th>
                        <th className="border border-gray-800 px-3 py-2 text-center font-bold uppercase">Tables Bureau</th>
                        <th className="border border-gray-800 px-3 py-2 text-center font-bold uppercase">Chaises Bureau</th>
                        <th className="border border-gray-800 px-3 py-2 text-center font-bold uppercase">Capacité</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {reportRows.map((row) => (
                    <tr key={row.id}>
                      <td className="border border-gray-800 px-3 py-2 font-bold text-gray-900">{row.nom}</td>
                      <td className="border border-gray-800 px-3 py-2">{row.arrondissement}</td>

                      {thematic === 'infra' && (
                        <>
                          <td className="border border-gray-800 px-3 py-2 text-center font-semibold">
                            {row.infra?.batimentsEtudes?.total || 0} salles 
                            <span className="text-[9px] text-gray-500 block font-normal">(HS: {row.infra?.batimentsEtudes?.horsService || 0})</span>
                          </td>
                          <td className="border border-gray-800 px-3 py-2 text-center">{row.infra?.batimentsAdmin?.total || 0}</td>
                          <td className="border border-gray-800 px-3 py-2 text-center font-bold">{row.infra?.pointsEau || 0}</td>
                          <td className="border border-gray-800 px-3 py-2 text-center">{row.infra?.latrinesEleves || 0}</td>
                          <td className="border border-gray-800 px-3 py-2 text-center font-bold">{row.infra?.conformite || "Conforme"}</td>
                        </>
                      )}

                      {thematic === 'compliance' && (() => {
                        const modelRef = row.type === 'Primaire' ? 'Modèle A' : 'Modèle B';
                        const reqClass = row.type === 'Primaire' ? 6 : 12;
                        const actClass = row.infra?.batimentsEtudes?.total || 0;
                        const classDiff = actClass - reqClass;

                        const reqLat = row.type === 'Primaire' ? 8 : 12;
                        const actLat = row.infra?.latrinesEleves || 0;
                        const latDiff = actLat - reqLat;

                        const reqWater = row.type === 'Primaire' ? 1 : 2;
                        const actWater = row.infra?.pointsEau || 0;
                        const waterDiff = actWater - reqWater;

                        return (
                          <>
                            <td className="border border-gray-800 px-3 py-2 font-medium">{row.type} ({modelRef})</td>
                            <td className="border border-gray-800 px-3 py-2 text-center font-bold">
                              {actClass}/{reqClass} ({classDiff >= 0 ? `+${classDiff}` : classDiff})
                            </td>
                            <td className="border border-gray-800 px-3 py-2 text-center font-bold">
                              {actLat}/{reqLat} ({latDiff >= 0 ? `+${latDiff}` : latDiff})
                            </td>
                            <td className="border border-gray-800 px-3 py-2 text-center font-bold">
                              {actWater}/{reqWater} ({waterDiff >= 0 ? `+${waterDiff}` : waterDiff})
                            </td>
                            <td className="border border-gray-800 px-3 py-2 text-center font-extrabold">{row.infra?.conformite || "Partiellement conforme"}</td>
                          </>
                        );
                      })()}

                      {thematic === 'furniture' && (
                        <>
                          <td className="border border-gray-800 px-3 py-2 text-center font-bold">{row.mob?.tablesBancs || 0}</td>
                          <td className="border border-gray-800 px-3 py-2 text-center">{row.mob?.chaisesEleves || 0}</td>
                          <td className="border border-gray-800 px-3 py-2 text-center">{row.mob?.tablesBureau || 0}</td>
                          <td className="border border-gray-800 px-3 py-2 text-center">{row.mob?.chaisesBureau || 0}</td>
                          <td className="border border-gray-800 px-3 py-2 text-center font-bold">{(row.mob?.tablesBancs || 0) * 2} él.</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Official Seal and Signatures Section at bottom */}
              <div className="mt-16 flex justify-between items-start text-xs">
                <div className="space-y-1">
                  <p className="font-bold underline">Le Rédacteur du Rapport</p>
                  <p className="text-gray-500 italic">Signature électronique certifiée</p>
                </div>
                <div className="text-right space-y-1">
                  <p className="font-bold underline">Le Directeur DSE</p>
                  <p className="text-gray-600">Visa de la Direction Régionale</p>
                  <div className="h-16 w-28 bg-gray-50 border border-dashed border-gray-300 rounded flex items-center justify-center text-[10px] text-gray-400 mt-2">
                    Sceau Officiel DSE
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
