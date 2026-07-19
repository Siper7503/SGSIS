import { apiFetch } from "../lib/api.ts";
import React, { useState, useEffect } from 'react';
import { useAuth } from './AuthProvider.tsx';
import { Save, HelpCircle, CheckCircle, AlertTriangle, XCircle, ChevronRight, Info, Award } from 'lucide-react';

interface InfrastructureFormProps {
  etablissement: any;
  onSuccess: () => void;
  onCancel: () => void;
}

interface ComponentState {
  bon: number;
  degrade: number;
  horsService: number;
}

interface Gap {
  name: string;
  required: number;
  current: number;
  status: 'critical' | 'warning' | 'ok';
  message: string;
}

export function InfrastructureForm({ etablissement, onSuccess, onCancel }: InfrastructureFormProps) {
  const { token } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize detailed breakdowns from etablissement's JSON or default them
  const initialEtudes = etablissement.batimentsEtudes || { total: 0, bonEtat: 0, degrade: 0, horsService: 0 };
  const initialAdmin = etablissement.batimentsAdmin || { total: 0, bonEtat: 0, degrade: 0, horsService: 0 };
  
  const savedBreakdown = initialEtudes.breakdown || {};

  const [formData, setFormData] = useState({
    etablissementId: etablissement.etablissementId,
    batimentsEtudes: {
      total: initialEtudes.total || 0,
      bonEtat: initialEtudes.bonEtat || 0,
      degrade: initialEtudes.degrade || 0,
      horsService: initialEtudes.horsService || 0,
    },
    batimentsAdmin: {
      total: initialAdmin.total || 0,
      bonEtat: initialAdmin.bonEtat || 0,
      degrade: initialAdmin.degrade || 0,
      horsService: initialAdmin.horsService || 0,
    },
    laboratoires: etablissement.laboratoires || 0,
    bibliotheque: etablissement.bibliotheque || 0,
    cuisine: etablissement.cuisine || 0,
    parking: etablissement.parking || 0,
    murCloture: etablissement.murCloture || 0,
    latrinesPersonnel: etablissement.latrinesPersonnel || 0,
    latrinesEleves: etablissement.latrinesEleves || 0,
    pointsEau: etablissement.pointsEau || 0,
    infirmerie: etablissement.infirmerie || 0,
    espacesLibres: etablissement.espacesLibres || '',
    conformite: etablissement.conformite || 'Non conforme',
  });

  const [breakdown, setBreakdown] = useState({
    latrinesEleves: {
      bon: savedBreakdown.latrinesEleves?.bon ?? (etablissement.latrinesEleves || 0),
      degrade: savedBreakdown.latrinesEleves?.degrade ?? 0,
      horsService: savedBreakdown.latrinesEleves?.horsService ?? 0,
    },
    latrinesPersonnel: {
      bon: savedBreakdown.latrinesPersonnel?.bon ?? (etablissement.latrinesPersonnel || 0),
      degrade: savedBreakdown.latrinesPersonnel?.degrade ?? 0,
      horsService: savedBreakdown.latrinesPersonnel?.horsService ?? 0,
    },
    pointsEau: {
      bon: savedBreakdown.pointsEau?.bon ?? (etablissement.pointsEau || 0),
      degrade: savedBreakdown.pointsEau?.degrade ?? 0,
      horsService: savedBreakdown.pointsEau?.horsService ?? 0,
    },
    laboratoires: {
      bon: savedBreakdown.laboratoires?.bon ?? (etablissement.laboratoires || 0),
      degrade: savedBreakdown.laboratoires?.degrade ?? 0,
      horsService: savedBreakdown.laboratoires?.horsService ?? 0,
    },
    bibliotheque: {
      bon: savedBreakdown.bibliotheque?.bon ?? (etablissement.bibliotheque || 0),
      degrade: savedBreakdown.bibliotheque?.degrade ?? 0,
      horsService: savedBreakdown.bibliotheque?.horsService ?? 0,
    },
    cuisine: {
      bon: savedBreakdown.cuisine?.bon ?? (etablissement.cuisine || 0),
      degrade: savedBreakdown.cuisine?.degrade ?? 0,
      horsService: savedBreakdown.cuisine?.horsService ?? 0,
    },
  });

  // Handle simple form fields
  const handleSimpleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'number' ? Number(value) : value
    }));
  };

  // Handle JSON fields (Studies and Admin buildings)
  const handleBuildingChange = (field: 'batimentsEtudes' | 'batimentsAdmin', subfield: 'bonEtat' | 'degrade' | 'horsService', val: number) => {
    setFormData(prev => {
      const updatedBuilding = {
        ...prev[field],
        [subfield]: val
      };
      updatedBuilding.total = updatedBuilding.bonEtat + updatedBuilding.degrade + updatedBuilding.horsService;
      return {
        ...prev,
        [field]: updatedBuilding
      };
    });
  };

  // Handle detailed breakdowns
  const handleBreakdownChange = (component: keyof typeof breakdown, subfield: keyof ComponentState, val: number) => {
    setBreakdown(prev => {
      const updatedComp = {
        ...prev[component],
        [subfield]: val
      };
      
      const total = updatedComp.bon + updatedComp.degrade + updatedComp.horsService;
      
      // Keep formData total in sync with our breakdown totals
      setFormData(f => ({
        ...f,
        [component]: total
      }));

      return {
        ...prev,
        [component]: updatedComp
      };
    });
  };

  // Evaluation logic for real-time conformity assessment
  const [conformityReport, setConformityReport] = useState<{ status: string; gaps: Gap[] }>({ status: 'Non conforme', gaps: [] });

  useEffect(() => {
    const isPrimary = etablissement.typeEtablissement === 'Primaire';
    const gaps: Gap[] = [];
    
    // 1. Salles de classe (Bâtiments d'études)
    const studyTotal = formData.batimentsEtudes.total;
    const studyBon = formData.batimentsEtudes.bonEtat;
    const studyRequired = isPrimary ? 6 : 8;
    const studyPctBon = studyTotal > 0 ? (studyBon / studyTotal) * 100 : 0;
    
    if (studyTotal < studyRequired) {
      gaps.push({
        name: "Salles de classe",
        required: studyRequired,
        current: studyTotal,
        status: 'critical',
        message: `Nombre de salles insuffisant : ${studyTotal}/${studyRequired} classes.`
      });
    } else if (studyPctBon < 80) {
      gaps.push({
        name: "État des classes",
        required: 80,
        current: Math.round(studyPctBon),
        status: 'warning',
        message: `Seulement ${Math.round(studyPctBon)}% des salles de classe sont en bon état (seuil : 80%).`
      });
    }

    // 2. Bâtiments administratifs
    const adminTotal = formData.batimentsAdmin.total;
    const adminRequired = isPrimary ? 1 : 2;
    if (adminTotal < adminRequired) {
      gaps.push({
        name: "Bâtiments Admin",
        required: adminRequired,
        current: adminTotal,
        status: 'warning',
        message: `Bureaux administratifs insuffisants : ${adminTotal}/${adminRequired} disponibles.`
      });
    }

    // 3. Latrines élèves
    const latElevesTotal = formData.latrinesEleves;
    const latElevesBon = breakdown.latrinesEleves.bon;
    const latElevesPct = latElevesTotal > 0 ? (latElevesBon / latElevesTotal) * 100 : 0;
    const latElevesRequired = isPrimary ? 4 : 8;
    
    if (latElevesTotal < latElevesRequired) {
      gaps.push({
        name: "Latrines Élèves",
        required: latElevesRequired,
        current: latElevesTotal,
        status: 'critical',
        message: `Nombre de cabines pour élèves insuffisant : ${latElevesTotal}/${latElevesRequired} cabines.`
      });
    } else if (latElevesPct < 50) {
      gaps.push({
        name: "État latrines élèves",
        required: 50,
        current: Math.round(latElevesPct),
        status: 'warning',
        message: `Seulement ${Math.round(latElevesPct)}% des latrines élèves sont fonctionnelles en bon état (seuil : 50%).`
      });
    }

    // 4. Latrines personnel
    const latPersTotal = formData.latrinesPersonnel;
    const latPersRequired = isPrimary ? 2 : 4;
    if (latPersTotal < latPersRequired) {
      gaps.push({
        name: "Latrines Personnel",
        required: latPersRequired,
        current: latPersTotal,
        status: 'warning',
        message: `Cabines de latrines pour le personnel insuffisantes : ${latPersTotal}/${latPersRequired} disponibles.`
      });
    }

    // 5. Points d'eau
    const waterTotal = formData.pointsEau;
    const waterRequired = isPrimary ? 1 : 2;
    if (waterTotal < waterRequired) {
      gaps.push({
        name: "Points d'eau",
        required: waterRequired,
        current: waterTotal,
        status: 'critical',
        message: `Points d'eau potables insuffisants : ${waterTotal}/${waterRequired} fonctionnels.`
      });
    }

    // 6. Cuisine / Cantine
    const kitchenTotal = formData.cuisine;
    if (kitchenTotal < 1) {
      gaps.push({
        name: "Cuisine / Cantine",
        required: 1,
        current: kitchenTotal,
        status: 'warning',
        message: `Absence de local de cuisine ou réfectoire pour la cantine scolaire.`
      });
    }

    // Secondary school additions
    if (!isPrimary) {
      // Laboratoires
      const labTotal = formData.laboratoires;
      if (labTotal < 1) {
        gaps.push({
          name: "Laboratoire",
          required: 1,
          current: labTotal,
          status: 'critical',
          message: `Absence d'un laboratoire scientifique équipé pour l'enseignement secondaire.`
        });
      }
      // Bibliothèque
      const bibTotal = formData.bibliotheque;
      if (bibTotal < 1) {
        gaps.push({
          name: "Bibliothèque",
          required: 1,
          current: bibTotal,
          status: 'warning',
          message: `Absence de bibliothèque ou salle de lecture.`
        });
      }
    }

    // Statut global
    let calculatedStatus = 'Conforme';
    if (gaps.some(g => g.status === 'critical')) {
      calculatedStatus = 'Non conforme';
    } else if (gaps.some(g => g.status === 'warning')) {
      calculatedStatus = 'Partiellement conforme';
    }

    setConformityReport({ status: calculatedStatus, gaps });
    setFormData(prev => ({ ...prev, conformite: calculatedStatus }));

  }, [formData.batimentsEtudes, formData.batimentsAdmin, formData.latrinesEleves, formData.latrinesPersonnel, formData.pointsEau, formData.cuisine, formData.laboratoires, formData.bibliotheque, breakdown]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    setLoading(true);
    setError(null);

    // Save the detailed breakdown inside batimentsEtudes for persistence
    const finalPayload = {
      ...formData,
      batimentsEtudes: {
        ...formData.batimentsEtudes,
        breakdown: breakdown
      }
    };

    try {
      const res = await apiFetch('/api/infrastructures', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(finalPayload)
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Erreur lors de la mise à jour');
      }

      onSuccess();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const isPrimary = etablissement.typeEtablissement === 'Primaire';
  const activeModelName = isPrimary ? "Modèle Type A (Primaire)" : "Modèle Type B (Secondaire)";

  return (
    <div className="space-y-6">
      <div className="bg-white shadow rounded-lg p-6 border border-slate-100">
        <div className="sm:flex sm:items-center sm:justify-between border-b border-slate-150 pb-5">
          <div>
            <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">Saisie de l'inventaire des infrastructures</h2>
            <p className="text-sm text-slate-500 mt-1">
              Établissement : <span className="font-bold text-slate-800">{etablissement.nomEtablissement}</span> ({etablissement.typeEtablissement}) &bull; Zone : {etablissement.arrondissement}
            </p>
          </div>
          <div className="mt-4 sm:mt-0 bg-blue-50 border border-blue-100 rounded-lg py-2 px-3.5 text-xs text-blue-800 flex items-center gap-2">
            <Award className="h-4 w-4 text-blue-600" />
            <span>Référentiel : <strong>{activeModelName}</strong></span>
          </div>
        </div>
        
        {error && (
          <div className="mt-4 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-md text-sm">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-6">
          
          {/* Main Form Content */}
          <form onSubmit={handleSubmit} className="lg:col-span-2 space-y-6">
            
            {/* 1. Salles d'études */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/60 space-y-3.5">
              <div className="flex justify-between items-center border-b pb-2">
                <h3 className="font-bold text-sm text-slate-800">Salles de classe (Bâtiments d'études)</h3>
                <span className="text-xs font-bold text-slate-500">Total : {formData.batimentsEtudes.total}</span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-emerald-700">En Bon état</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.batimentsEtudes.bonEtat}
                    onChange={(e) => handleBuildingChange('batimentsEtudes', 'bonEtat', Number(e.target.value))}
                    className="mt-1 block w-full rounded-md border-gray-300 border p-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-amber-700">Dégradé</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.batimentsEtudes.degrade}
                    onChange={(e) => handleBuildingChange('batimentsEtudes', 'degrade', Number(e.target.value))}
                    className="mt-1 block w-full rounded-md border-gray-300 border p-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-rose-700">Hors service</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.batimentsEtudes.horsService}
                    onChange={(e) => handleBuildingChange('batimentsEtudes', 'horsService', Number(e.target.value))}
                    className="mt-1 block w-full rounded-md border-gray-300 border p-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* 2. Bâtiment Administratif */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/60 space-y-3.5">
              <div className="flex justify-between items-center border-b pb-2">
                <h3 className="font-bold text-sm text-slate-800">Bâtiments administratifs (Bureaux)</h3>
                <span className="text-xs font-bold text-slate-500">Total : {formData.batimentsAdmin.total}</span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-emerald-700">En Bon état</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.batimentsAdmin.bonEtat}
                    onChange={(e) => handleBuildingChange('batimentsAdmin', 'bonEtat', Number(e.target.value))}
                    className="mt-1 block w-full rounded-md border-gray-300 border p-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-amber-700">Dégradé</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.batimentsAdmin.degrade}
                    onChange={(e) => handleBuildingChange('batimentsAdmin', 'degrade', Number(e.target.value))}
                    className="mt-1 block w-full rounded-md border-gray-300 border p-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-rose-700">Hors service</label>
                  <input
                    type="number"
                    min="0"
                    value={formData.batimentsAdmin.horsService}
                    onChange={(e) => handleBuildingChange('batimentsAdmin', 'horsService', Number(e.target.value))}
                    className="mt-1 block w-full rounded-md border-gray-300 border p-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* 3. Latrines élèves */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/60 space-y-3.5">
              <div className="flex justify-between items-center border-b pb-2">
                <h3 className="font-bold text-sm text-slate-800">Sanitaires : Latrines Élèves</h3>
                <span className="text-xs font-bold text-slate-500">Total cabines : {formData.latrinesEleves}</span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-emerald-700">Opérationnel (Bon)</label>
                  <input
                    type="number"
                    min="0"
                    value={breakdown.latrinesEleves.bon}
                    onChange={(e) => handleBreakdownChange('latrinesEleves', 'bon', Number(e.target.value))}
                    className="mt-1 block w-full rounded-md border-gray-300 border p-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-amber-700">Dégradé</label>
                  <input
                    type="number"
                    min="0"
                    value={breakdown.latrinesEleves.degrade}
                    onChange={(e) => handleBreakdownChange('latrinesEleves', 'degrade', Number(e.target.value))}
                    className="mt-1 block w-full rounded-md border-gray-300 border p-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-rose-700">Hors service</label>
                  <input
                    type="number"
                    min="0"
                    value={breakdown.latrinesEleves.horsService}
                    onChange={(e) => handleBreakdownChange('latrinesEleves', 'horsService', Number(e.target.value))}
                    className="mt-1 block w-full rounded-md border-gray-300 border p-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* 4. Latrines personnel */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/60 space-y-3.5">
              <div className="flex justify-between items-center border-b pb-2">
                <h3 className="font-bold text-sm text-slate-800">Sanitaires : Latrines Personnel</h3>
                <span className="text-xs font-bold text-slate-500">Total cabines : {formData.latrinesPersonnel}</span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-emerald-700">Opérationnel (Bon)</label>
                  <input
                    type="number"
                    min="0"
                    value={breakdown.latrinesPersonnel.bon}
                    onChange={(e) => handleBreakdownChange('latrinesPersonnel', 'bon', Number(e.target.value))}
                    className="mt-1 block w-full rounded-md border-gray-300 border p-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-amber-700">Dégradé</label>
                  <input
                    type="number"
                    min="0"
                    value={breakdown.latrinesPersonnel.degrade}
                    onChange={(e) => handleBreakdownChange('latrinesPersonnel', 'degrade', Number(e.target.value))}
                    className="mt-1 block w-full rounded-md border-gray-300 border p-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-rose-700">Hors service</label>
                  <input
                    type="number"
                    min="0"
                    value={breakdown.latrinesPersonnel.horsService}
                    onChange={(e) => handleBreakdownChange('latrinesPersonnel', 'horsService', Number(e.target.value))}
                    className="mt-1 block w-full rounded-md border-gray-300 border p-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* 5. Points d'eau */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/60 space-y-3.5">
              <div className="flex justify-between items-center border-b pb-2">
                <h3 className="font-bold text-sm text-slate-800">Points d'eau (Forages, Robinets)</h3>
                <span className="text-xs font-bold text-slate-500">Total points d'eau : {formData.pointsEau}</span>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-emerald-700">Fonctionnel (Bon)</label>
                  <input
                    type="number"
                    min="0"
                    value={breakdown.pointsEau.bon}
                    onChange={(e) => handleBreakdownChange('pointsEau', 'bon', Number(e.target.value))}
                    className="mt-1 block w-full rounded-md border-gray-300 border p-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-amber-700">Dégradé</label>
                  <input
                    type="number"
                    min="0"
                    value={breakdown.pointsEau.degrade}
                    onChange={(e) => handleBreakdownChange('pointsEau', 'degrade', Number(e.target.value))}
                    className="mt-1 block w-full rounded-md border-gray-300 border p-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-rose-700">En panne / HS</label>
                  <input
                    type="number"
                    min="0"
                    value={breakdown.pointsEau.horsService}
                    onChange={(e) => handleBreakdownChange('pointsEau', 'horsService', Number(e.target.value))}
                    className="mt-1 block w-full rounded-md border-gray-300 border p-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* 6. Locaux Spécifiques */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/60 space-y-3.5">
              <h3 className="font-bold text-sm text-slate-800 border-b pb-2">Locaux & Aménagements complémentaires</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                
                {/* Laboratoires (only relevant if secondary, but fields always in DB) */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Laboratoires {!isPrimary && <span className="text-blue-600 font-bold">*</span>}
                  </label>
                  <input
                    type="number"
                    name="laboratoires"
                    min="0"
                    value={formData.laboratoires}
                    onChange={handleSimpleChange}
                    className="mt-1 block w-full rounded-md border-gray-300 border p-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Nombre de salles de TP ou labos scientifiques.</p>
                </div>

                {/* Infirmerie (Bâtiment Sanitaire) */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Bâtiments Sanitaires (Infirmerie)
                  </label>
                  <input
                    type="number"
                    name="infirmerie"
                    min="0"
                    value={formData.infirmerie}
                    onChange={handleSimpleChange}
                    className="mt-1 block w-full rounded-md border-gray-300 border p-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Nombre de bâtiments ou blocs sanitaires médicaux (infirmerie).</p>
                </div>

                {/* Bibliothèque */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Bibliothèque {!isPrimary && <span className="text-blue-600 font-bold">*</span>}
                  </label>
                  <input
                    type="number"
                    name="bibliotheque"
                    min="0"
                    value={formData.bibliotheque}
                    onChange={handleSimpleChange}
                    className="mt-1 block w-full rounded-md border-gray-300 border p-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Nombre de bibliothèques fonctionnelles.</p>
                </div>

                {/* Cuisine / Cantine */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Cuisines de cantine <span className="text-blue-600 font-bold">*</span>
                  </label>
                  <input
                    type="number"
                    name="cuisine"
                    min="0"
                    value={formData.cuisine}
                    onChange={handleSimpleChange}
                    className="mt-1 block w-full rounded-md border-gray-300 border p-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Cuisines / réfectoires aménagés.</p>
                </div>

                {/* Mur de clôture */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Mur de clôture (Longueur en mètres)</label>
                  <input
                    type="number"
                    name="murCloture"
                    min="0"
                    value={formData.murCloture}
                    onChange={handleSimpleChange}
                    className="mt-1 block w-full rounded-md border-gray-300 border p-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">0 si absent.</p>
                </div>

                {/* Espaces Libres */}
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700">Description des Espaces Libres / Cours</label>
                  <textarea
                    name="espacesLibres"
                    rows={2}
                    value={formData.espacesLibres}
                    onChange={handleSimpleChange}
                    placeholder="Ex: Cour de récréation, plateau omnisports en terre, espace pour futures extensions..."
                    className="mt-1 block w-full rounded-md border-gray-300 border p-2 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="flex justify-end space-x-3 pt-4 border-t">
              <button
                type="button"
                onClick={onCancel}
                className="rounded-lg border border-slate-300 bg-white py-2 px-4 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={loading}
                className="inline-flex justify-center items-center rounded-lg bg-blue-600 py-2 px-5 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 disabled:opacity-50 transition"
              >
                <Save className="h-4 w-4 mr-2" />
                {loading ? 'Mise à jour...' : 'Enregistrer l\'inventaire'}
              </button>
            </div>
          </form>

          {/* Right side: Real-time Compliance Monitor Card */}
          <div className="space-y-6">
            <div className="bg-slate-900 text-white rounded-xl p-5 shadow-lg border border-slate-850 sticky top-4 space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
                <Info className="h-5 w-5 text-blue-400" />
                <div>
                  <h4 className="text-xs uppercase tracking-wider font-bold text-slate-400">Bilan de Conformité</h4>
                  <p className="text-[10px] text-slate-500">Calcul automatique en temps réel</p>
                </div>
              </div>

              {/* General Indicator Badge */}
              <div className="text-center py-4 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
                <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Statut National</span>
                <div className="flex justify-center">
                  {conformityReport.status === 'Conforme' ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-950 border border-emerald-800 px-3 py-1.5 text-xs font-bold text-emerald-400">
                      <CheckCircle className="h-4 w-4" />
                      Établissement Conforme
                    </span>
                  ) : conformityReport.status === 'Partiellement conforme' ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-950 border border-amber-800 px-3 py-1.5 text-xs font-bold text-amber-400">
                      <AlertTriangle className="h-4 w-4" />
                      Partiellement Conforme
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-950 border border-rose-800 px-3 py-1.5 text-xs font-bold text-rose-400">
                      <XCircle className="h-4 w-4" />
                      Non Conforme
                    </span>
                  )}
                </div>
              </div>

              {/* Gaps / Ecarts List */}
              <div className="space-y-3">
                <h5 className="text-xs font-bold text-slate-300">Analyse des écarts identifiés :</h5>
                
                {conformityReport.gaps.length === 0 ? (
                  <div className="text-xs text-emerald-400 bg-emerald-950/40 p-3 rounded-lg border border-emerald-900/50 flex items-center gap-2">
                    <CheckCircle className="h-4 w-4" />
                    <span>Toutes les composantes répondent aux exigences minimales du {activeModelName}.</span>
                  </div>
                ) : (
                  <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                    {conformityReport.gaps.map((gap, idx) => (
                      <div 
                        key={idx} 
                        className={`text-xs p-3 rounded-lg border flex items-start gap-2.5 ${
                          gap.status === 'critical' 
                            ? 'bg-rose-950/40 border-rose-900/50 text-rose-300' 
                            : 'bg-amber-950/40 border-amber-900/50 text-amber-300'
                        }`}
                      >
                        {gap.status === 'critical' ? (
                          <XCircle className="h-4 w-4 text-rose-500 flex-shrink-0 mt-0.5" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
                        )}
                        <div>
                          <strong className="block font-bold text-[11px] uppercase tracking-wide">
                            {gap.name} {gap.status === 'critical' && <span className="text-[9px] bg-rose-900 text-rose-100 rounded px-1 ml-1 font-normal">CRITIQUE</span>}
                          </strong>
                          <p className="mt-1 text-[11px] leading-relaxed text-slate-300">{gap.message}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Reference Thresholds Helper */}
              <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-[11px] text-slate-400 space-y-1.5">
                <span className="font-bold text-slate-300 block text-xs">Exigences minimales de référence :</span>
                {isPrimary ? (
                  <ul className="list-disc pl-4 space-y-1">
                    <li>Salles d'études : <strong>6</strong> classes (dont &ge; 80% en bon état)</li>
                    <li>Bâtiment Administratif : <strong>1</strong> bureau</li>
                    <li>Latrines élèves : <strong>4</strong> cabines (&ge; 50% en bon état)</li>
                    <li>Latrines personnel : <strong>2</strong> cabines</li>
                    <li>Point d'eau potable : <strong>1</strong> point d'eau</li>
                    <li>Cuisine / cantine scolaire : <strong>1</strong> cuisine</li>
                  </ul>
                ) : (
                  <ul className="list-disc pl-4 space-y-1">
                    <li>Salles d'études : <strong>8</strong> classes (dont &ge; 80% en bon état)</li>
                    <li>Bâtiment Administratif : <strong>2</strong> bureaux (Admin/Profs)</li>
                    <li>Laboratoire de sciences : <strong>1</strong> salle TP</li>
                    <li>Bibliothèque équipée : <strong>1</strong> local</li>
                    <li>Latrines élèves : <strong>8</strong> cabines (&ge; 50% en bon état)</li>
                    <li>Latrines personnel : <strong>4</strong> cabines</li>
                    <li>Points d'eau potable : <strong>2</strong> forages/robinets</li>
                    <li>Cuisine / cantine scolaire : <strong>1</strong> cuisine</li>
                  </ul>
                )}
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
