import React, { useState, useEffect } from 'react';
import { useAuth } from './AuthProvider.tsx';
import { Save } from 'lucide-react';
import { apiFetch } from '../lib/api.ts';

interface IncidentFormProps {
  onSuccess: () => void;
  onCancel: () => void;
}

export function IncidentForm({ onSuccess, onCancel }: IncidentFormProps) {
  const { token, user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [etablissements, setEtablissements] = useState<any[]>([]);

  useEffect(() => {
    async function fetchEtablissements() {
      if (!token) return;
      try {
        const res = await apiFetch('/api/etablissements', {
          headers: { Authorization: `Bearer ${token}` }
        });
        const d = await res.json();
        setEtablissements(Array.isArray(d) && user?.etablissementId ? d.filter((item: any) => item.id === user.etablissementId) : d);
      } catch (e) {
        console.error(e);
      }
    }
    fetchEtablissements();
  }, [token, user?.etablissementId]);

  const [formData, setFormData] = useState({
    etablissementId: '',
    type: 'Toiture arrachée',
    description: '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    setLoading(true);
    setError(null);

    try {
      const res = await apiFetch('/api/incidents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(formData)
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
        <h2 className="text-xl font-medium text-gray-900">Signaler un incident</h2>
      </div>
      
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-md text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700">Établissement *</label>
          <select
            name="etablissementId"
            required
            value={formData.etablissementId}
            onChange={handleChange}
            className="mt-1 block w-full rounded-md border-gray-300 border p-2 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
          >
            <option value="">Sélectionner un établissement</option>
            {etablissements.map(e => (
              <option key={e.id} value={e.id}>{e.nom} ({e.arrondissement})</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Type d'incident *</label>
          <select
            name="type"
            required
            value={formData.type}
            onChange={handleChange}
            className="mt-1 block w-full rounded-md border-gray-300 border p-2 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
          >
            <option value="Toiture arrachée">Toiture arrachée</option>
            <option value="Tables-bancs cassés">Tables-bancs cassés</option>
            <option value="Problèmes d'eau/électricité">Problèmes d'eau/électricité</option>
            <option value="Murs endommagés">Murs endommagés</option>
            <option value="Autre">Autre</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Description détaillée *</label>
          <textarea
            name="description"
            required
            rows={4}
            value={formData.description}
            onChange={handleChange}
            className="mt-1 block w-full rounded-md border-gray-300 border p-2 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            placeholder="Décrivez le problème..."
          />
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
            className="inline-flex justify-center items-center rounded-md border border-transparent bg-red-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50"
          >
            <Save className="h-4 w-4 mr-2" />
            {loading ? 'Signalement en cours...' : 'Signaler'}
          </button>
        </div>
      </form>
    </div>
  );
}
