import { apiFetch } from "../lib/api.ts";
import React, { useState } from 'react';
import { useAuth } from './AuthProvider.tsx';
import { AlertTriangle, CheckCircle, HelpCircle } from 'lucide-react';

interface EtablissementFormProps {
  etablissement?: any;
  onSuccess: () => void;
  onCancel: () => void;
}

export function EtablissementForm({ etablissement, onSuccess, onCancel }: EtablissementFormProps) {
  const { token } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConflict, setShowConflict] = useState(false);
  const [conflictMessage, setConflictMessage] = useState('');

  const isEditing = !!(etablissement && etablissement.id);

  const [formData, setFormData] = useState({
    nom: etablissement?.nom || '',
    type: etablissement?.type || 'Primaire',
    arrondissement: etablissement?.arrondissement || 'Arrondissement 1',
    statut: etablissement?.statut || 'public',
    nomDirecteur: etablissement?.nomDirecteur || '',
    coordonnees: etablissement?.coordonnees || '',
    archived: etablissement?.archived || false,
    modeleType: etablissement?.modeleType || ''
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e: React.FormEvent, forceSubmit = false) => {
    if (e) e.preventDefault();
    if (!token) return;

    if (!formData.nom.trim()) {
      setError("Le nom de l'établissement est requis.");
      return;
    }
    if (!formData.arrondissement) {
      setError("L'arrondissement est obligatoire.");
      return;
    }

    // Format validation for coordonnees (latitude, longitude)
    if (formData.coordonnees && formData.coordonnees.trim()) {
      const coordRegex = /^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/;
      if (!coordRegex.test(formData.coordonnees.trim())) {
        setError("Format des coordonnées géographiques invalide. Attendu: 'Latitude, Longitude' (ex: 12.368, -1.527).");
        return;
      }
    }

    setLoading(true);
    setError(null);
    setShowConflict(false);

    try {
      const url = isEditing ? `/api/etablissements/${etablissement.id}` : '/api/etablissements';
      const method = isEditing ? 'PUT' : 'POST';

      const res = await apiFetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          ...formData,
          force: forceSubmit
        })
      });

      if (res.status === 409) {
        const data = await res.json();
        if (data.error === "CONFLIT_DOUBLON") {
          setConflictMessage(data.message);
          setShowConflict(true);
          setLoading(false);
          return;
        }
      }

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
      <h2 className="text-xl font-medium text-gray-900 mb-6">
        {isEditing ? `Modifier l'établissement : ${etablissement.nom}` : 'Nouvel Établissement'}
      </h2>
      
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-md text-sm">
          {error}
        </div>
      )}

      {showConflict && (
        <div className="mb-6 bg-amber-50 border-l-4 border-amber-500 p-4 rounded-md">
          <div className="flex">
            <div className="flex-shrink-0">
              <AlertTriangle className="h-5 w-5 text-amber-500" aria-hidden="true" />
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-amber-800">Conflit de Doublon Détecté</h3>
              <div className="mt-2 text-sm text-amber-700">
                <p>{conflictMessage}</p>
                <p className="mt-1 font-medium text-amber-800">Souhaitez-vous quand même forcer la création de cette fiche d'établissement ?</p>
              </div>
              <div className="mt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => handleSubmit(null as any, true)}
                  className="rounded bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-amber-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600"
                >
                  Forcer l'enregistrement
                </button>
                <button
                  type="button"
                  onClick={() => setShowConflict(false)}
                  className="rounded bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 shadow-sm ring-1 ring-inset ring-amber-300 hover:bg-amber-50"
                >
                  Modifier les informations
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <form onSubmit={(e) => handleSubmit(e)} className="space-y-6">
        <div className="grid grid-cols-1 gap-y-6 gap-x-4 sm:grid-cols-2">
          
          <div className="sm:col-span-2">
            <label htmlFor="nom" className="block text-sm font-medium text-gray-700">
              Nom de l'établissement *
            </label>
            <div className="mt-1">
              <input
                type="text"
                name="nom"
                id="nom"
                required
                value={formData.nom}
                onChange={handleChange}
                className="block w-full rounded-md border-gray-300 border p-2 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              />
            </div>
          </div>

          <div>
            <label htmlFor="type" className="block text-sm font-medium text-gray-700">
              Type d'établissement *
            </label>
            <div className="mt-1">
              <select
                id="type"
                name="type"
                value={formData.type}
                onChange={handleChange}
                className="block w-full rounded-md border-gray-300 border p-2 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              >
                <option value="Primaire">Primaire</option>
                <option value="Secondaire">Secondaire</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="statut" className="block text-sm font-medium text-gray-700">
              Statut juridique *
            </label>
            <div className="mt-1">
              <select
                id="statut"
                name="statut"
                value={formData.statut}
                onChange={handleChange}
                className="block w-full rounded-md border-gray-300 border p-2 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              >
                <option value="public">Public</option>
                <option value="privé">Privé</option>
                <option value="en construction">En construction</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="arrondissement" className="block text-sm font-medium text-gray-700">
              Arrondissement *
            </label>
            <div className="mt-1">
              <select
                id="arrondissement"
                name="arrondissement"
                value={formData.arrondissement}
                onChange={handleChange}
                className="block w-full rounded-md border-gray-300 border p-2 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              >
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i + 1} value={`Arrondissement ${i + 1}`}>
                    Arrondissement {i + 1}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="nomDirecteur" className="block text-sm font-medium text-gray-700">
              Directeur / Proviseur (Responsable)
            </label>
            <div className="mt-1">
              <input
                type="text"
                name="nomDirecteur"
                id="nomDirecteur"
                value={formData.nomDirecteur}
                onChange={handleChange}
                className="block w-full rounded-md border-gray-300 border p-2 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              />
            </div>
          </div>

          <div className={`${isEditing ? 'sm:col-span-1' : 'sm:col-span-2'}`}>
            <label htmlFor="coordonnees" className="block text-sm font-medium text-gray-700">
              Coordonnées géographiques (Lat, Lng) - Optionnel
            </label>
            <div className="mt-1">
              <input
                type="text"
                name="coordonnees"
                id="coordonnees"
                placeholder="Ex: 12.368, -1.527"
                value={formData.coordonnees}
                onChange={handleChange}
                className="block w-full rounded-md border-gray-300 border p-2 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              />
            </div>
          </div>

          {isEditing && (
            <div>
              <label htmlFor="archived" className="block text-sm font-medium text-gray-700">
                Statut de la fiche (Archivage logique)
              </label>
              <div className="mt-1">
                <select
                  id="archived"
                  name="archived"
                  value={formData.archived ? 'true' : 'false'}
                  onChange={(e) => setFormData({ ...formData, archived: e.target.value === 'true' })}
                  className="block w-full rounded-md border-gray-300 border p-2 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                >
                  <option value="false">Actif</option>
                  <option value="true">Archivé (Inactif)</option>
                </select>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-gray-300 bg-white py-2 px-4 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={loading || showConflict}
            className="inline-flex justify-center rounded-md border border-transparent bg-blue-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
          >
            {loading ? 'Enregistrement...' : isEditing ? 'Sauvegarder les modifications' : 'Créer l\'établissement'}
          </button>
        </div>
      </form>
    </div>
  );
}
