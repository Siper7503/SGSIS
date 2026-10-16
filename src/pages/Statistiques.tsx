import { useCallback, useEffect, useState } from 'react';
import { Activity, AlertTriangle, Building2, CheckCircle2, Hammer, Monitor, RefreshCw, Users, Droplets } from 'lucide-react';
import { useAuth } from '../components/AuthProvider.tsx';
import { apiFetch } from '../lib/api.ts';

interface DashboardStatistics {
  totalEtablissements: number;
  conformiteCounts: { conforme: number; partiel: number; nonConforme: number; nonRenseigne: number };
  constructionStats: { total: number; planifie: number; enCours: number; livre: number; suspendu: number; abandonne: number; totalBudget: number; totalConsomme: number };
  enrollmentStats: { totalFilles: number; totalGarcons: number; totalEnseignants: number; totalEleves: number; byArrondissement: Array<{ arrondissement: string; filles: number; garcons: number; total: number }> };
  washStats: { totalForages: number; totalForagesFonctionnels: number; totalLatrines: number; totalLatrinesFonctionnelles: number; totalCantinesFonctionnelles: number; countEvaluated: number };
  ticeStats: { totalSallesInformatiques: number; totalOrdinateurs: number; totalOrdinateursFonctionnels: number; totalConnectes: number; countEvaluated: number };
  incidentStats: { total: number; signale: number; enCours: number; resolu: number };
}

const emptyStats: DashboardStatistics = {
  totalEtablissements: 0,
  conformiteCounts: { conforme: 0, partiel: 0, nonConforme: 0, nonRenseigne: 0 },
  constructionStats: { total: 0, planifie: 0, enCours: 0, livre: 0, suspendu: 0, abandonne: 0, totalBudget: 0, totalConsomme: 0 },
  enrollmentStats: { totalFilles: 0, totalGarcons: 0, totalEnseignants: 0, totalEleves: 0, byArrondissement: [] },
  washStats: { totalForages: 0, totalForagesFonctionnels: 0, totalLatrines: 0, totalLatrinesFonctionnelles: 0, totalCantinesFonctionnelles: 0, countEvaluated: 0 },
  ticeStats: { totalSallesInformatiques: 0, totalOrdinateurs: 0, totalOrdinateursFonctionnels: 0, totalConnectes: 0, countEvaluated: 0 },
  incidentStats: { total: 0, signale: 0, enCours: 0, resolu: 0 },
};

function number(value: number) {
  return Number(value || 0).toLocaleString('fr-FR');
}

function SummaryCard({ title, value, note, Icon, tone }: { title: string; value: string; note: string; Icon: typeof Building2; tone: string }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className={`flex h-11 w-11 items-center justify-center rounded-lg ${tone}`}><Icon className="h-5 w-5" /></div>
      <p className="mt-4 text-xs font-bold uppercase tracking-wide text-slate-500">{title}</p>
      <p className="mt-1 text-3xl font-black text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{note}</p>
    </article>
  );
}

function ProgressRow({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const percent = total > 0 ? Math.min(100, Math.round((value / total) * 100)) : 0;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-4 text-sm"><span className="font-medium text-slate-700">{label}</span><span className="font-bold text-slate-900">{number(value)} <span className="font-normal text-slate-400">({percent}%)</span></span></div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${color}`} style={{ width: `${percent}%` }} /></div>
    </div>
  );
}

export default function Statistiques() {
  const { token } = useAuth();
  const [stats, setStats] = useState<DashboardStatistics>(emptyStats);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStatistics = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const response = await apiFetch('/api/dashboard/stats', { headers: { Authorization: `Bearer ${token}` } });
      const result: unknown = await response.json();
      if (!response.ok) throw new Error(result && typeof result === 'object' && 'error' in result ? String(result.error) : 'Impossible de charger les statistiques.');
      setStats({ ...emptyStats, ...(result as Partial<DashboardStatistics>) });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Une erreur est survenue lors du chargement des statistiques.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void loadStatistics(); }, [loadStatistics]);

  const complianceTotal = stats.conformiteCounts.conforme + stats.conformiteCounts.partiel + stats.conformiteCounts.nonConforme + stats.conformiteCounts.nonRenseigne;
  const constructionProgress = stats.constructionStats.totalBudget > 0 ? Math.round((stats.constructionStats.totalConsomme / stats.constructionStats.totalBudget) * 100) : 0;

  return (
    <div className="space-y-6 pb-10">
      <header className="flex flex-col gap-4 rounded-xl bg-gradient-to-r from-blue-50 to-slate-50 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="text-xs font-bold uppercase tracking-widest text-blue-700">Pilotage des données</p><h1 className="mt-1 text-2xl font-black text-blue-950 sm:text-3xl">Statistiques SGSIS</h1><p className="mt-1 text-sm text-slate-600">Synthèse des données renseignées par les établissements scolaires.</p></div>
        <button type="button" onClick={() => void loadStatistics()} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Actualiser</button>
      </header>

      {error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}

      <section aria-label="Indicateurs principaux" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard title="Établissements" value={number(stats.totalEtablissements)} note="Écoles du périmètre suivi" Icon={Building2} tone="bg-blue-50 text-blue-700" />
        <SummaryCard title="Élèves" value={number(stats.enrollmentStats.totalEleves)} note={`${number(stats.enrollmentStats.totalFilles)} filles · ${number(stats.enrollmentStats.totalGarcons)} garçons`} Icon={Users} tone="bg-emerald-50 text-emerald-700" />
        <SummaryCard title="Enseignants" value={number(stats.enrollmentStats.totalEnseignants)} note="Effectifs renseignés" Icon={Users} tone="bg-violet-50 text-violet-700" />
        <SummaryCard title="Constructions en cours" value={number(stats.constructionStats.enCours)} note={`${number(stats.constructionStats.total)} projets au total`} Icon={Hammer} tone="bg-amber-50 text-amber-700" />
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-5 flex items-center gap-3"><CheckCircle2 className="h-5 w-5 text-emerald-600" /><div><h2 className="font-bold text-slate-900">Conformité des infrastructures</h2><p className="text-xs text-slate-500">Sur {number(complianceTotal)} dossiers suivis</p></div></div>
          <div className="space-y-5"><ProgressRow label="Conformes" value={stats.conformiteCounts.conforme} total={complianceTotal} color="bg-emerald-500" /><ProgressRow label="Partiellement conformes" value={stats.conformiteCounts.partiel} total={complianceTotal} color="bg-amber-400" /><ProgressRow label="Non conformes" value={stats.conformiteCounts.nonConforme} total={complianceTotal} color="bg-rose-500" /><ProgressRow label="Non renseignées" value={stats.conformiteCounts.nonRenseigne} total={complianceTotal} color="bg-slate-400" /></div>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-5 flex items-center gap-3"><Hammer className="h-5 w-5 text-blue-600" /><div><h2 className="font-bold text-slate-900">Avancement des constructions</h2><p className="text-xs text-slate-500">Budget consommé : {constructionProgress}%</p></div></div>
          <div className="space-y-5"><ProgressRow label="Planifiées" value={stats.constructionStats.planifie} total={stats.constructionStats.total} color="bg-blue-500" /><ProgressRow label="En cours" value={stats.constructionStats.enCours} total={stats.constructionStats.total} color="bg-amber-400" /><ProgressRow label="Livrées" value={stats.constructionStats.livre} total={stats.constructionStats.total} color="bg-emerald-500" /><ProgressRow label="Suspendues ou abandonnées" value={stats.constructionStats.suspendu + stats.constructionStats.abandonne} total={stats.constructionStats.total} color="bg-rose-500" /></div>
          <p className="mt-5 border-t border-slate-100 pt-4 text-sm text-slate-600">Budget : <strong>{number(stats.constructionStats.totalBudget)} FCFA</strong> · Consommé : <strong>{number(stats.constructionStats.totalConsomme)} FCFA</strong></p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-5 flex items-center gap-3"><Droplets className="h-5 w-5 text-cyan-600" /><div><h2 className="font-bold text-slate-900">Eau, hygiène et cantines</h2><p className="text-xs text-slate-500">{number(stats.washStats.countEvaluated)} évaluations renseignées</p></div></div>
          <div className="space-y-5"><ProgressRow label="Forages fonctionnels" value={stats.washStats.totalForagesFonctionnels} total={stats.washStats.totalForages} color="bg-cyan-500" /><ProgressRow label="Latrines fonctionnelles" value={stats.washStats.totalLatrinesFonctionnelles} total={stats.washStats.totalLatrines} color="bg-emerald-500" /><div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-700">Cantines fonctionnelles <strong className="float-right">{number(stats.washStats.totalCantinesFonctionnelles)}</strong></div></div>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="mb-5 flex items-center gap-3"><Monitor className="h-5 w-5 text-indigo-600" /><div><h2 className="font-bold text-slate-900">Équipements numériques (TICE)</h2><p className="text-xs text-slate-500">{number(stats.ticeStats.countEvaluated)} évaluations renseignées</p></div></div>
          <div className="space-y-5"><ProgressRow label="Ordinateurs fonctionnels" value={stats.ticeStats.totalOrdinateursFonctionnels} total={stats.ticeStats.totalOrdinateurs} color="bg-indigo-500" /><div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-700">Salles informatiques <strong className="float-right">{number(stats.ticeStats.totalSallesInformatiques)}</strong></div><div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-700">Établissements connectés <strong className="float-right">{number(stats.ticeStats.totalConnectes)}</strong></div></div>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 xl:col-span-2">
          <div className="mb-5 flex items-center gap-3"><AlertTriangle className="h-5 w-5 text-orange-600" /><div><h2 className="font-bold text-slate-900">Incidents de maintenance</h2><p className="text-xs text-slate-500">{number(stats.incidentStats.total)} signalements enregistrés</p></div></div>
          <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-lg bg-rose-50 p-4 text-rose-800"><p className="text-xs font-bold uppercase">Signalés</p><p className="mt-1 text-2xl font-black">{number(stats.incidentStats.signale)}</p></div><div className="rounded-lg bg-amber-50 p-4 text-amber-800"><p className="text-xs font-bold uppercase">En cours</p><p className="mt-1 text-2xl font-black">{number(stats.incidentStats.enCours)}</p></div><div className="rounded-lg bg-emerald-50 p-4 text-emerald-800"><p className="text-xs font-bold uppercase">Résolus</p><p className="mt-1 text-2xl font-black">{number(stats.incidentStats.resolu)}</p></div></div>
        </article>
      </section>
      {loading && <div className="flex items-center justify-center gap-2 py-2 text-sm text-slate-500"><Activity className="h-4 w-4 animate-pulse" />Chargement des statistiques…</div>}
    </div>
  );
}
