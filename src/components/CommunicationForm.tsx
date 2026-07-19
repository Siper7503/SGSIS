import { apiFetch } from "../lib/api.ts";
import React, { useState } from 'react';
import { useAuth } from './AuthProvider.tsx';
import { Save, Send } from 'lucide-react';

interface CommunicationFormProps {
  onSuccess: () => void;
  onCancel: () => void;
}

export function CommunicationForm({ onSuccess, onCancel }: CommunicationFormProps) {
  const { token } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    titre: '',
    contenu: '',
    ciblage: 'Tous les établissements',
    delaiHeures: '24',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
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
      const res = await apiFetch('/api/communications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          ...formData,
          delaiHeures: Number(formData.delaiHeures)
        })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Erreur lors de l\'envoi');
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
        <h2 className="text-xl font-medium text-gray-900">Nouvelle Communication</h2>
      </div>
      
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-md text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700">Ciblage (Destinataires)</label>
            <select
              name="ciblage"
              value={formData.ciblage}
              onChange={handleChange}
              className="mt-1 block w-full rounded-md border-gray-300 border p-2 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            >
              <option value="Tous les établissements">Tous les établissements</option>
              <option value="Écoles Primaires Uniquement">Écoles Primaires Uniquement</option>
              <option value="Lycées et Collèges Uniquement">Lycées et Collèges Uniquement</option>
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={`Arrondissement ${i + 1}`}>
                  Arrondissement {i + 1}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Délai limite d'accusé (Heures) *</label>
            <select
              name="delaiHeures"
              value={formData.delaiHeures}
              onChange={handleChange}
              className="mt-1 block w-full rounded-md border-gray-300 border p-2 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            >
              <option value="1">1 Heure (Idéal pour démo / test rapide)</option>
              <option value="6">6 Heures</option>
              <option value="12">12 Heures</option>
              <option value="24">24 Heures (1 Jour)</option>
              <option value="48">48 Heures (2 Jours)</option>
              <option value="72">72 Heures (3 Jours)</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Titre (Objet)</label>
          <input
            type="text"
            name="titre"
            required
            value={formData.titre}
            onChange={handleChange}
            className="mt-1 block w-full rounded-md border-gray-300 border p-2 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            placeholder="Objet de la communication"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Contenu du message</label>
          <textarea
            name="contenu"
            required
            rows={6}
            value={formData.contenu}
            onChange={handleChange}
            className="mt-1 block w-full rounded-md border-gray-300 border p-2 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            placeholder="Rédigez votre message ou circulaire ministérielle ici..."
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
            className="inline-flex justify-center items-center rounded-md border border-transparent bg-blue-600 py-2 px-4 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
          >
            <Send className="h-4 w-4 mr-2" />
            {loading ? 'Envoi...' : 'Envoyer'}
          </button>
        </div>
      </form>
    </div>
  );
}
