import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api.ts';
import { useAuth } from '../components/AuthProvider.tsx';
import { LOCAL_SCHOOL_ROLES, hasAnyRole } from '../lib/roles.ts';
import { ReviewValue } from './ReviewQueue.tsx';

interface RejectedItem {
  id: string;
  kind: 'module' | 'annual-report';
  module: string;
  recordId: number;
  etablissementId: number;
  etablissementNom: string | null;
  etablissementType: string | null;
  arrondissement: string | null;
  anneeScolaire?: string;
  agent: { nom: string | null; prenom: string | null; email: string | null };
  reviewer: { nom: string | null; prenom: string | null; email: string | null };
  rejectedAt: string | null;
  statut: string;
  motif: string | null;
  donnees: unknown;
};

const MODULE_LABELS: Record<string, string> = {
  infrastructures: 'Infrastructures',
  effectifs: 'Effectifs et personnel',
  mobilier: 'Mobilier scolaire',
  constructions: 'Construction',
  incidents: 'Incident / maintenance',
  wash: 'Cantine et WASH',
  tice: 'Équipements TICE',
};

const MODULE_PATHS: Record<string, string> = {
  infrastructures: '/infrastructures',
  effectifs: '/effectifs',
  mobilier: '/mobilier',
  constructions: '/constructions',
  incidents: '/maintenance',
  wash: '/wash',
  tice: '/tice',
};

function formatDateTime(value: string | null) {
  if (!value) return 'Date non disponible';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Date non disponible';
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Africa/Ouagadougou',
  }).format(date);
}

export default function Rejections() {
  const { token, user } = useAuth();
  const [items, setItems] = useState<RejectedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadRejections = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const response = await apiFetch('/api/rejections', { headers: { Authorization: `Bearer ${token}` } });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Impossible de charger les rejets.');
      setItems(Array.isArray(payload) ? payload : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Impossible de charger les rejets.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void loadRejections(); }, [loadRejections]);

  return <div className="mx-auto max-w-6xl space-y-6">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="text-xs font-black uppercase tracking-widest text-rose-600">Documents retournés pour correction</p>
        <h1 className="mt-1 text-2xl font-black text-slate-900">Rejets</h1>
        <p className="mt-1 text-sm text-slate-500">Consultez le motif communiqué par l’administrateur et les informations transmises.</p>
      </div>
      <button type="button" onClick={() => void loadRejections()} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Actualiser
      </button>
    </header>

    {error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>}
    <div className="flex items-center gap-2 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900">
      <AlertTriangle className="h-5 w-5" /> {loading ? 'Chargement des documents…' : `${items.length} document${items.length === 1 ? '' : 's'} à corriger`}
    </div>

    {!loading && items.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
      <AlertTriangle className="mx-auto h-10 w-10 text-slate-300" />
      <h2 className="mt-3 font-bold text-slate-800">Aucun document rejeté</h2>
      <p className="mt-1 text-sm text-slate-500">Les documents retournés par la DSE apparaîtront ici avec leur motif de rejet.</p>
    </div> : <div className="space-y-4">{items.map((item) => {
      const agentName = [item.agent?.prenom, item.agent?.nom].filter(Boolean).join(' ') || item.agent?.email || 'Agent non identifié';
      const reviewerName = [item.reviewer?.prenom, item.reviewer?.nom].filter(Boolean).join(' ') || item.reviewer?.email || 'Administrateur non identifié';
      const label = item.kind === 'annual-report' ? item.module : MODULE_LABELS[item.module] || item.module;
      const formPath = item.kind === 'annual-report'
        ? (item.module === 'Rapport de rentrée' ? '/rapport-rentree' : '/rapport-sortie')
        : MODULE_PATHS[item.module];
      const isAgent = hasAnyRole(user?.role, LOCAL_SCHOOL_ROLES);
      return <article key={item.id} className="overflow-hidden rounded-2xl border border-rose-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3 p-5">
          <div>
            <h2 className="font-bold text-slate-900">{label}{item.anneeScolaire ? ` · ${item.anneeScolaire}` : ''}</h2>
            <p className="mt-1 text-sm text-slate-700">{item.etablissementNom || `Établissement #${item.etablissementId}`}</p>
            <p className="text-xs text-slate-500">{item.etablissementType || 'Type inconnu'} · {item.arrondissement || 'Arrondissement inconnu'}</p>
          </div>
          <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-bold text-rose-800">{item.statut}</span>
        </div>
        <div className="grid gap-3 px-5 pb-5 text-xs text-slate-600 sm:grid-cols-2">
          <p>Agent : <strong>{agentName}</strong></p>
          <p>Rejeté par : <strong>{reviewerName}</strong></p>
          <p>Date du rejet : <strong>{formatDateTime(item.rejectedAt)}</strong></p>
        </div>
        <div className="mx-5 mb-5 rounded-xl border border-rose-200 bg-rose-50 p-4">
          <h3 className="text-xs font-black uppercase tracking-wide text-rose-800">Motif du rejet</h3>
          <p className="mt-2 whitespace-pre-wrap text-sm text-rose-950">{item.motif || 'Aucun motif enregistré.'}</p>
        </div>
        <details className="border-t border-slate-100">
          <summary className="cursor-pointer px-5 py-3 text-sm font-bold text-blue-700 hover:bg-slate-50">Afficher les informations transmises</summary>
          <div className="bg-slate-50 p-5"><ReviewValue value={item.donnees} /></div>
        </details>
        {isAgent && formPath && <div className="border-t border-slate-100 p-4 text-right">
          <Link to={formPath} className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700">Ouvrir le formulaire à corriger</Link>
        </div>}
      </article>;
    })}</div>}
  </div>;
}
