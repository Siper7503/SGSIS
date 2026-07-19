import { apiFetch } from "../lib/api.ts";
import React, { useState } from 'react';
import { useAuth } from './AuthProvider.tsx';
import { Save } from 'lucide-react';

interface EffectifsFormProps {
  etablissement: any;
  onSuccess: () => void;
  onCancel: () => void;
}

export function EffectifsForm({ etablissement, onSuccess, onCancel }: EffectifsFormProps) {
  const { token } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    etablissementId: etablissement.etablissementId,
    anneeScolaire: etablissement.anneeScolaire || '2024-2025',
    elevesFilles: etablissement.elevesFilles || 0,
    elevesGarcons: etablissement.elevesGarcons || 0,
    enseignants: etablissement.enseignants || 0,
    personnelsAdmin: etablissement.personnelsAdmin || 0,
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.type === 'number' ? Number(e.target.value) : e.target.value
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    setLoading(true);
    setError(null);

    try {
      const res = await apiFetch('/api/effectifs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(formData)
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

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <div className="mb-6">
        <h2 className="text-xl font-medium text-gray-900">Saisie des Effectifs</h2>
        <p className="text-sm text-gray-500 mt-1">
          {etablissement.nomEtablissement} ({etablissement.typeEtablissement}) - {etablissement.arrondissement}
        </p>
      </div>
      
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-md text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700">Année Scolaire</label>
            <select
              name="anneeScolaire"
              value={formData.anneeScolaire}
              onChange={handleChange}
              className="mt-1 block w-full rounded-md border-gray-300 border p-2 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              required
            >
              <option value="2023-2024">2023-2024</option>
              <option value="2024-2025">2024-2025</option>
              <option value="2025-2026">2025-2026</option>
            </select>
          </div>
          
          <div className="col-span-1 md:col-span-2 grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Élèves (Filles)</label>
              <input
                type="number"
                name="elevesFilles"
                min="0"
                value={formData.elevesFilles}
                onChange={handleChange}
                className="mt-1 block w-full rounded-md border-gray-300 border p-2 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Élèves (Garçons)</label>
              <input
                type="number"
                name="elevesGarcons"
                min="0"
                value={formData.elevesGarcons}
                onChange={handleChange}
                className="mt-1 block w-full rounded-md border-gray-300 border p-2 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Enseignants</label>
              <input
                type="number"
                name="enseignants"
                min="0"
                value={formData.enseignants}
                onChange={handleChange}
                className="mt-1 block w-full rounded-md border-gray-300 border p-2 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Personnels Admin</label>
              <input
                type="number"
                name="personnelsAdmin"
                min="0"
                value={formData.personnelsAdmin}
                onChange={handleChange}
                className="mt-1 block w-full rounded-md border-gray-300 border p-2 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              />
            </div>
          </div>
        </div>

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
