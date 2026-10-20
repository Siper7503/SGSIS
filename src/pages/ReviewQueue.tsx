import React, { useCallback, useEffect, useState } from 'react';
import { Check, Clock3, Eye, FileCheck2, RefreshCw, RotateCcw, X } from 'lucide-react';
import { apiFetch } from '../lib/api.ts';
import { useAuth } from '../components/AuthProvider.tsx';

interface QueueItem {
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
  submittedAt: string | null;
  statut: string;
  commentaire?: string | null;
  donnees: unknown;
}

const MODULE_LABELS: Record<string, string> = {
  infrastructures: 'Infrastructures',
  effectifs: 'Effectifs et personnel',
  mobilier: 'Mobilier scolaire',
  constructions: 'Construction',
  incidents: 'Incident / maintenance',
  wash: 'Cantine et WASH',
  tice: 'Équipements TICE',
};

function fieldLabel(key: string) {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_.-]+/g, ' ')
    .replace(/^./, (letter) => letter.toLocaleUpperCase('fr-FR'));
}

export function ReviewValue({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === '') return <span className="text-slate-400">—</span>;
  if (typeof value === 'boolean') return <span>{value ? 'Oui' : 'Non'}</span>;
  if (typeof value !== 'object') return <span className="break-words">{String(value)}</span>;
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-slate-400">Aucune donnée</span>;
    return <div className="space-y-2">{value.map((item, index) => <details key={index} className="rounded-lg border border-slate-200 bg-white">
      <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-slate-700">Élément {index + 1}</summary>
      <div className="border-t border-slate-100 p-3"><ReviewValue value={item} /></div>
    </details>)}</div>;
  }
  const entries = Object.entries(value as Record<string, unknown>);
  return <dl className="grid gap-2 sm:grid-cols-2">{entries.map(([key, child]) => (
    <div key={key} className="min-w-0 rounded-lg bg-slate-50 p-3">
      <dt className="text-xs font-bold text-slate-500">{fieldLabel(key)}</dt>
      <dd className="mt-1 text-sm text-slate-800">{child !== null && typeof child === 'object' ? <ReviewValue value={child} /> : <ReviewValue value={child} />}</dd>
    </div>
  ))}</dl>;
}

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

export default function ReviewQueue() {
  const { token } = useAuth();
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<QueueItem | null>(null);
  const [rejectTarget, setRejectTarget] = useState<QueueItem | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const loadQueue = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError('');
    try {
      const response = await apiFetch('/api/review-queue', { headers: { Authorization: `Bearer ${token}` } });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Impossible de charger la file d’attente.');
      setItems(Array.isArray(payload) ? payload : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Impossible de charger la file d’attente.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void loadQueue(); }, [loadQueue]);

  const decide = async (item: QueueItem, decision: 'approve' | 'reject', commentaire?: string) => {
    if (!token || busyId) return;
    setBusyId(item.id);
    setError('');
    try {
      const endpoint = item.kind === 'annual-report'
        ? `/api/annual-reports/${item.recordId}/decision`
        : `/api/module-submissions/${encodeURIComponent(item.module)}/${item.recordId}/decision`;
      const action = item.kind === 'annual-report'
        ? (decision === 'approve' ? 'valider' : 'rejeter')
        : (decision === 'approve' ? 'approuver' : 'rejeter');
      const response = await apiFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ decision: action, commentaire }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Impossible de traiter cette transmission.');
      await loadQueue();
      setSelectedItem(null);
      if (decision === 'reject') {
        setRejectTarget(null);
        setRejectReason('');
      }
    } catch (decisionError) {
      setError(decisionError instanceof Error ? decisionError.message : 'Impossible de traiter cette transmission.');
    } finally {
      setBusyId(null);
    }
  };

  return <div className="mx-auto max-w-6xl space-y-6">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="text-xs font-black uppercase tracking-widest text-blue-600">Vérification des transmissions</p>
        <h1 className="mt-1 text-2xl font-black text-slate-900">File d’attente</h1>
        <p className="mt-1 text-sm text-slate-500">Les formulaires et rapports sont classés selon leur date et heure de transmission, du plus ancien au plus récent.</p>
      </div>
      <button type="button" onClick={() => void loadQueue()} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Actualiser
      </button>
    </header>

    {error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>}
    <div className="flex items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-900">
      <Clock3 className="h-5 w-5" /> {loading ? 'Chargement des transmissions…' : `${items.length} document${items.length === 1 ? '' : 's'} en attente`}
    </div>

    {!loading && items.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
      <FileCheck2 className="mx-auto h-10 w-10 text-slate-300" />
      <h2 className="mt-3 font-bold text-slate-800">La file d’attente est vide</h2>
      <p className="mt-1 text-sm text-slate-500">Les documents transmis par les agents apparaîtront ici pour vérification.</p>
    </div> : <div className="space-y-4">{items.map((item, index) => {
      const agentName = [item.agent?.prenom, item.agent?.nom].filter(Boolean).join(' ') || item.agent?.email || 'Agent non identifié';
      const label = item.kind === 'annual-report' ? item.module : MODULE_LABELS[item.module] || fieldLabel(item.module);
      return <article key={item.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-black text-blue-800">{index + 1}</span>
            <div className="min-w-0">
              <h2 className="font-bold text-slate-900">{label}{item.anneeScolaire ? ` · ${item.anneeScolaire}` : ''}</h2>
              <p className="mt-1 text-sm text-slate-700">{item.etablissementNom || `Établissement #${item.etablissementId}`}</p>
              <p className="text-xs text-slate-500">{item.etablissementType || 'Type inconnu'} · {item.arrondissement || 'Arrondissement inconnu'}</p>
              <p className="mt-2 text-xs text-slate-600">Transmis par <strong>{agentName}</strong> · {formatDateTime(item.submittedAt)}</p>
            </div>
          </div>
          <button type="button" onClick={() => { setSelectedItem(item); setError(''); }} disabled={busyId !== null} className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-800 disabled:opacity-50"><Eye className="h-4 w-4" /> Ouvrir / examiner</button>
        </div>
      </article>;
    })}</div>}

    {selectedItem && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-3 sm:p-6">
      <section role="dialog" aria-modal="true" aria-labelledby="review-dialog-title" className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 p-5">
          <div><p className="text-xs font-black uppercase tracking-widest text-blue-600">Examen de la transmission</p>
            <h2 id="review-dialog-title" className="mt-1 text-xl font-black text-slate-900">{selectedItem.kind === 'annual-report' ? selectedItem.module : MODULE_LABELS[selectedItem.module] || fieldLabel(selectedItem.module)}{selectedItem.anneeScolaire ? ` · ${selectedItem.anneeScolaire}` : ''}</h2>
          </div>
          <button type="button" aria-label="Fermer" onClick={() => setSelectedItem(null)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </header>
        <div className="overflow-y-auto p-5">
          <dl className="grid gap-3 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <div><dt className="text-xs font-bold text-slate-500">Établissement</dt><dd className="mt-1 font-semibold text-slate-800">{selectedItem.etablissementNom || `Établissement #${selectedItem.etablissementId}`}</dd></div>
            <div><dt className="text-xs font-bold text-slate-500">Type / arrondissement</dt><dd className="mt-1 font-semibold text-slate-800">{selectedItem.etablissementType || 'Type inconnu'} · {selectedItem.arrondissement || 'Arrondissement inconnu'}</dd></div>
            <div><dt className="text-xs font-bold text-slate-500">Transmis le</dt><dd className="mt-1 font-semibold text-slate-800">{formatDateTime(selectedItem.submittedAt)}</dd></div>
            <div><dt className="text-xs font-bold text-slate-500">Agent</dt><dd className="mt-1 font-semibold text-slate-800">{[selectedItem.agent?.prenom, selectedItem.agent?.nom].filter(Boolean).join(' ') || selectedItem.agent?.email || 'Agent non identifié'}</dd></div>
            <div><dt className="text-xs font-bold text-slate-500">Statut</dt><dd className="mt-1 font-semibold text-amber-700">{selectedItem.statut}</dd></div>
          </dl>
          {selectedItem.commentaire && <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><strong>Commentaire :</strong> {selectedItem.commentaire}</p>}
          <h3 className="mb-3 mt-5 font-bold text-slate-800">Informations renseignées</h3>
          <ReviewValue value={selectedItem.donnees} />
          {error && <p role="alert" className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
        </div>
        <footer className="flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-slate-50 p-4">
          <button type="button" onClick={() => { setRejectTarget(selectedItem); setRejectReason(''); setError(''); }} disabled={busyId !== null} className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-white px-4 py-2.5 text-sm font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-50"><RotateCcw className="h-4 w-4" /> Retourner à l’agent</button>
          <button type="button" onClick={() => void decide(selectedItem, 'approve')} disabled={busyId !== null} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"><Check className="h-4 w-4" /> {busyId === selectedItem.id ? 'Traitement…' : 'Valider le document'}</button>
        </footer>
      </section>
    </div>}

    {rejectTarget && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4">
      <form onSubmit={(event) => { event.preventDefault(); if (rejectReason.trim()) void decide(rejectTarget, 'reject', rejectReason.trim()); }} className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
        <h2 className="text-lg font-black text-slate-900">Motif du rejet</h2>
        <p className="mt-1 text-sm text-slate-600">Le motif sera communiqué à l’agent avec le document retourné.</p>
        {error && <p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
        <textarea autoFocus required minLength={3} maxLength={2000} value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} rows={5} className="mt-4 w-full rounded-lg border border-slate-300 p-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100" placeholder="Expliquez les corrections attendues…" />
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={() => setRejectTarget(null)} disabled={busyId !== null} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700">Annuler</button>
          <button type="submit" disabled={busyId !== null || rejectReason.trim().length < 3} className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Confirmer le rejet</button>
        </div>
      </form>
    </div>}
  </div>;
}
