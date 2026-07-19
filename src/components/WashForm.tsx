import React, { useState, useEffect } from 'react';
import { useAuth } from './AuthProvider.tsx';
import { Save } from 'lucide-react';
import { apiFetch } from '../lib/api.ts';

interface WashFormProps {
  onSuccess: () => void;
  onCancel: () => void;
}

export function WashForm({ onSuccess, onCancel }: WashFormProps) {
  const { token } = useAuth();
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
        setEtablissements(d);
      } catch (e) {
        console.error(e);
      }
    }
    fetchEtablissements();
  }, [token]);

  const [formData, setFormData] = useState({
    etablissementId: '',
    forages: 0,
    foragesFonctionnels: 0,
    latrines: 0,
    latrinesFonctionnelles: 0,
    cantineDisponibilite: false,
    vivresDisponibles: '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData({ ...formData, [name]: checked });
    } else {
      setFormData({
        ...formData,
        [name]: type === 'number' ? Number(value) : value
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    setLoading(true);
    setError(null);

    try {
      const res = await apiFetch('/api/wash', {
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
        <h2 className="text-xl font-medium text-gray-900">Suivi WASH (Cantines et Eau)</h2>
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700">Nombre de forages</label>
            <input
              type="number"
              name="forages"
              min="0"
              value={formData.forages}
              onChange={handleChange}
              className="mt-1 block w-full rounded-md border-gray-300 border p-2 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Forages fonctionnels</label>
            <input
              type="number"
              name="foragesFonctionnels"
              min="0"
              value={formData.foragesFonctionnels}
              onChange={handleChange}
              className="mt-1 block w-full rounded-md border-gray-300 border p-2 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Nombre de latrines</label>
            <input
              type="number"
              name="latrines"
              min="0"
              value={formData.latrines}
              onChange={handleChange}
              className="mt-1 block w-full rounded-md border-gray-300 border p-2 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Latrines fonctionnelles</label>
            <input
              type="number"
              name="latrinesFonctionnelles"
              min="0"
              value={formData.latrinesFonctionnelles}
              onChange={handleChange}
              className="mt-1 block w-full rounded-md border-gray-300 border p-2 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            />
          </div>
        </div>

        <div className="border-t border-gray-200 pt-6">
          <h3 className="text-md font-medium text-gray-900 mb-4">Cantine Scolaire</h3>
          <div className="flex items-center mb-4">
            <input
              id="cantineDisponibilite"
              name="cantineDisponibilite"
              type="checkbox"
              checked={formData.cantineDisponibilite}
              onChange={handleChange}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="cantineDisponibilite" className="ml-2 block text-sm text-gray-900">
              Cantine fonctionnelle disponible
            </label>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700">Détails des vivres disponibles</label>
            <input
              type="text"
              name="vivresDisponibles"
              value={formData.vivresDisponibles}
              onChange={handleChange}
              className="mt-1 block w-full rounded-md border-gray-300 border p-2 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              placeholder="Ex: 50 sacs de riz, 10 bidons d'huile..."
            />
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
