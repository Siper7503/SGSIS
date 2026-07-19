import React, { useState, useEffect } from 'react';
import { useAuth } from './AuthProvider.tsx';
import { Save } from 'lucide-react';
import { apiFetch } from '../lib/api.ts';

interface TiceFormProps {
  onSuccess: () => void;
  onCancel: () => void;
}

export function TiceForm({ onSuccess, onCancel }: TiceFormProps) {
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
    sallesInformatiques: 0,
    ordinateurs: 0,
    ordinateursFonctionnels: 0,
    connectiviteInternet: false,
    typeConnexion: '',
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
      const res = await apiFetch('/api/tice', {
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
        <h2 className="text-xl font-medium text-gray-900">Suivi TICE (Informatique)</h2>
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
            <label className="block text-sm font-medium text-gray-700">Salles informatiques (Nb)</label>
            <input
              type="number"
              name="sallesInformatiques"
              min="0"
              value={formData.sallesInformatiques}
              onChange={handleChange}
              className="mt-1 block w-full rounded-md border-gray-300 border p-2 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Nombre total d'ordinateurs</label>
            <input
              type="number"
              name="ordinateurs"
              min="0"
              value={formData.ordinateurs}
              onChange={handleChange}
              className="mt-1 block w-full rounded-md border-gray-300 border p-2 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Ordinateurs fonctionnels</label>
            <input
              type="number"
              name="ordinateursFonctionnels"
              min="0"
              value={formData.ordinateursFonctionnels}
              onChange={handleChange}
              className="mt-1 block w-full rounded-md border-gray-300 border p-2 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            />
          </div>
        </div>

        <div className="border-t border-gray-200 pt-6">
          <div className="flex items-center mb-4">
            <input
              id="connectiviteInternet"
              name="connectiviteInternet"
              type="checkbox"
              checked={formData.connectiviteInternet}
              onChange={handleChange}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="connectiviteInternet" className="ml-2 block text-sm text-gray-900">
              Connexion Internet disponible
            </label>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700">Type de connexion</label>
            <select
              name="typeConnexion"
              value={formData.typeConnexion}
              onChange={handleChange}
              className="mt-1 block w-full rounded-md border-gray-300 border p-2 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            >
              <option value="">Sélectionner</option>
              <option value="Fibre Optique">Fibre Optique</option>
              <option value="ADSL">ADSL</option>
              <option value="4G/LTE">4G/LTE</option>
              <option value="VSAT (Satellite)">VSAT (Satellite)</option>
              <option value="Autre">Autre</option>
            </select>
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
