import { apiFetch } from "../lib/api.ts";
import React, { useState } from 'react';
import { useAuth } from '../components/AuthProvider.tsx';
import { Sparkles, Loader2, AlertCircle } from 'lucide-react';

export default function Predictions() {
  const { token } = useAuth();
  const [loading, setLoading] = useState(false);
  const [prediction, setPrediction] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const handlePredict = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/predictions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ prompt: "Générer une prédiction sur les besoins en infrastructures des écoles (salles de classe, tables, eau) basée sur les tendances." })
      });
      
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Erreur lors de la génération des prédictions.");
      }
      setPrediction(data.text);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Prédictions & IA</h1>
        <p className="mt-1 text-sm text-gray-500">
          Analyse intelligente des besoins en infrastructures, mobiliers et ressources humaines.
        </p>
      </div>

      <div className="bg-white shadow rounded-lg p-6">
        <div className="text-center max-w-2xl mx-auto py-8">
          <Sparkles className="mx-auto h-12 w-12 text-blue-500 mb-4" />
          <h3 className="text-lg font-medium text-gray-900">Analyse Prédictive</h3>
          <p className="mt-2 text-sm text-gray-500">
            L'intelligence artificielle analyse les données saisies (effectifs, infrastructures actuelles, état du mobilier) pour anticiper les besoins futurs et formuler des recommandations stratégiques.
          </p>
          
          <button
            onClick={handlePredict}
            disabled={loading}
            className="mt-6 inline-flex items-center justify-center rounded-md border border-transparent bg-blue-600 px-6 py-3 text-base font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Génération en cours...
              </>
            ) : (
              'Générer les prédictions'
            )}
          </button>
        </div>

        {error && (
          <div className="mt-6 bg-red-50 p-4 rounded-md flex items-start">
            <AlertCircle className="h-5 w-5 text-red-400 mr-2 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {prediction && (
          <div className="mt-8 border-t border-gray-200 pt-6">
            <h4 className="text-lg font-medium text-gray-900 mb-4">Rapport Prédictif</h4>
            <div className="prose prose-blue max-w-none text-gray-700">
              {prediction.split('\n').map((paragraph, idx) => (
                <p key={idx}>{paragraph}</p>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
