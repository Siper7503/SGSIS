import { apiFetch } from "../lib/api.ts";
import React, { useState } from 'react';
import { useAuth } from './AuthProvider.tsx';
import { Save } from 'lucide-react';

interface ConstructionFormProps {
  construction?: any;
  onSuccess: () => void;
  onCancel: () => void;
  requestOnly?: boolean;
}

export function ConstructionForm({ construction, onSuccess, onCancel, requestOnly = false }: ConstructionFormProps) {
  const { token } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditing = !!construction;

  const [formData, setFormData] = useState({
    intitule: construction?.intitule || '',
    localisation: construction?.localisation || '',
    arrondissement: construction?.arrondissement || '',
    datesPrevisionnelles: construction?.datesPrevisionnelles || '',
    maitreOuvrage: construction?.maitreOuvrage || '',
    budget: construction?.budget || '',
    budgetConsomme: construction?.budgetConsomme || 0,
    modeleType: construction?.modeleType || 'A',
    statut: construction?.statut || 'Planifié',
    avancement: construction?.avancement || 0,
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const numericVal = type === 'number' || name === 'avancement' ? (value !== '' ? Number(value) : 0) : value;

    let extra = {};
    if (name === 'statut') {
      if (value === 'Planifié') {
        extra = { avancement: 0 };
      } else if (value === 'Livré' || value === 'Livré (Converti)') {
        extra = { avancement: 100 };
      } else if (value === 'En cours' && (formData.avancement === 0 || formData.avancement === 100)) {
        extra = { avancement: 15 };
      }
    }

    setFormData(prev => ({
      ...prev,
      [name]: numericVal,
      ...extra
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    setLoading(true);
    setError(null);

    try {
      const url = isEditing ? `/api/constructions/${construction.id}` : '/api/constructions';
      const method = isEditing ? 'PUT' : 'POST';

      const res = await apiFetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(requestOnly ? {
          intitule: formData.intitule,
          localisation: formData.localisation,
          arrondissement: formData.arrondissement,
          datesPrevisionnelles: formData.datesPrevisionnelles,
        } : formData)
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Erreur lors de l\'enregistrement');
      }

      onSuccess();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <div className="mb-6">
        <h2 className="text-xl font-medium text-gray-900">
          {requestOnly ? 'Signaler un besoin de construction' : (isEditing ? 'Modifier la construction' : 'Nouveau projet de construction')}
        </h2>
      </div>
      
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-md text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700">Intitulé du projet *</label>
            <input
              type="text"
              name="intitule"
              required
              value={formData.intitule}
              onChange={handleChange}
              className="mt-1 block w-full rounded-md border-gray-300 border p-2 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              placeholder="Ex: Construction du CEG Zogona"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Localisation</label>
            <input
              type="text"
              name="localisation"
              value={formData.localisation}
              onChange={handleChange}
              className="mt-1 block w-full rounded-md border-gray-300 border p-2 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              placeholder="Quartier, Secteur..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Arrondissement</label>
            <select
              name="arrondissement"
              value={formData.arrondissement}
              onChange={handleChange}
              className="mt-1 block w-full rounded-md border-gray-300 border p-2 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            >
              <option value="">Sélectionner</option>
              <option value="Arrondissement 1">Arrondissement 1</option>
              <option value="Arrondissement 2">Arrondissement 2</option>
              <option value="Arrondissement 3">Arrondissement 3</option>
              <option value="Arrondissement 4">Arrondissement 4</option>
              <option value="Arrondissement 5">Arrondissement 5</option>
              <option value="Autre">Autre</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Dates Prévisionnelles</label>
            <input
              type="text"
              name="datesPrevisionnelles"
              value={formData.datesPrevisionnelles}
              onChange={handleChange}
              className="mt-1 block w-full rounded-md border-gray-300 border p-2 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              placeholder="Ex: Janvier 2025 - Décembre 2025"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Maître d'Ouvrage</label>
            <input
              type="text"
              name="maitreOuvrage"
              value={formData.maitreOuvrage}
              onChange={handleChange}
              className="mt-1 block w-full rounded-md border-gray-300 border p-2 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Budget Prévu (FCFA)</label>
            <input
              type="number"
              name="budget"
              min="0"
              value={formData.budget}
              onChange={handleChange}
              className="mt-1 block w-full rounded-md border-gray-300 border p-2 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            />
          </div>

          {isEditing && (
            <div>
              <label className="block text-sm font-medium text-gray-700">Budget Consommé (FCFA)</label>
              <input
                type="number"
                name="budgetConsomme"
                min="0"
                value={formData.budgetConsomme}
                onChange={handleChange}
                className="mt-1 block w-full rounded-md border-gray-300 border p-2 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700">Modèle Type</label>
            <select
              name="modeleType"
              value={formData.modeleType}
              onChange={handleChange}
              className="mt-1 block w-full rounded-md border-gray-300 border p-2 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            >
              <option value="A">Modèle A (Bâtiment R+1 - Primaire)</option>
              <option value="B">Modèle B (Bâtiment R+2 - Secondaire)</option>
              <option value="C">Modèle C (Complexe Scolaire)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Statut du Projet</label>
            <select
              name="statut"
              value={formData.statut}
              onChange={handleChange}
              className="mt-1 block w-full rounded-md border-gray-300 border p-2 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            >
              <option value="Planifié">Planifié</option>
              <option value="En cours">En cours</option>
              <option value="Livré">Livré</option>
              <option value="Suspendu">Suspendu</option>
              <option value="Abandonné">Abandonné</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Pourcentage d'Avancement ({formData.avancement}%)</label>
            <div className="flex items-center space-x-3 mt-1.5">
              <input
                type="range"
                name="avancement"
                min="0"
                max="100"
                step="5"
                value={formData.avancement}
                onChange={handleChange}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
              <span className="text-sm font-bold text-slate-800 min-w-[3rem] text-right">{formData.avancement}%</span>
            </div>
          </div>
        </div>

        {/* Real-time Budget Variance (SF-22) */}
        {(formData.budget || formData.budgetConsomme > 0) && (
          <div className="bg-slate-50 rounded-lg p-4 border border-slate-200 mt-4">
            <h4 className="text-sm font-semibold text-slate-700 mb-2">Analyse Budgétaire en Temps Réel</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-gray-500 block">Budget Prévu :</span>
                <span className="font-semibold text-gray-900">{(Number(formData.budget) || 0).toLocaleString()} FCFA</span>
              </div>
              <div>
                <span className="text-gray-500 block">Budget Consommé :</span>
                <span className="font-semibold text-blue-600">{(Number(formData.budgetConsomme) || 0).toLocaleString()} FCFA</span>
              </div>
              <div>
                <span className="text-gray-500 block">Écart de Financement :</span>
                <span className={`font-semibold ${
                  (Number(formData.budget) || 0) - (Number(formData.budgetConsomme) || 0) >= 0 
                    ? 'text-green-600' 
                    : 'text-red-600'
                }`}>
                  {((Number(formData.budget) || 0) - (Number(formData.budgetConsomme) || 0)).toLocaleString()} FCFA
                  {((Number(formData.budget) || 0) - (Number(formData.budgetConsomme) || 0)) < 0 && ' (Dépassement)'}
                </span>
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end space-x-3 pt-6 border-t">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-gray-300 bg-white py-2 px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={loading}
            className="inline-flex justify-center items-center rounded-md border border-transparent bg-blue-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
          >
            <Save className="h-4 w-4 mr-2" />
            {loading ? 'Enregistrement...' : 'Enregistrer'}
          </button>
        </div>
      </form>
    </div>
  );
}
