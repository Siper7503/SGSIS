import React, { useEffect, useMemo, useState } from 'react';
import { FileText, Search, ShieldCheck } from 'lucide-react';
import { useAuth } from '../components/AuthProvider.tsx';
import { apiFetch } from '../lib/api.ts';

function sumCycle(cycle: any) {
  return (Object.values(cycle || {}) as any[]).reduce((total: number, value: any) => total + Number(value?.filles || 0) + Number(value?.garcons || 0), 0);
}

function reportSummary(report: any, type: string) {
  const data = report?.donnees || {};
  if (type === 'Primaire') {
    return `Classes : ${Number(data.classes || 0)} | Eleves : ${Number(data.filles || 0) + Number(data.garcons || 0)} | Enseignants : ${Number(data.enseignantsEnClasse || 0)}`;
  }
  const classes = (Object.values(data.classes || {}) as any[]).reduce((total: number, value: any) => total + Number(value || 0), 0);
  const eleves = sumCycle(data.premierCycle) + sumCycle(data.secondCycle);
  const enseignants = Number(data.enseignants?.hommes || 0) + Number(data.enseignants?.femmes || 0);
  return `Classes : ${classes} | Eleves : ${eleves} | Enseignants : ${enseignants}`;
}

export default function PublicAnnualReports() {
  const { token } = useAuth();
  const [reports, setReports] = useState<any[]>([]);
  const [etablissements, setEtablissements] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [etablissementId, setEtablissementId] = useState('Tous');
  const [annee, setAnnee] = useState('Toutes');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    Promise.all([
      apiFetch('/api/annual-reports', { headers: { Authorization: `Bearer ${token}` } }),
      apiFetch('/api/etablissements', { headers: { Authorization: `Bearer ${token}` } })
    ]).then(async ([reportsResponse, establishmentsResponse]) => {
      const reportsData = await reportsResponse.json();
      const establishmentsData = await establishmentsResponse.json();
      if (!reportsResponse.ok) throw new Error(reportsData.error || 'Impossible de charger les rapports.');
      if (!establishmentsResponse.ok) throw new Error(establishmentsData.error || 'Impossible de charger les etablissements.');
      setReports(Array.isArray(reportsData) ? reportsData.filter((row) => row?.report?.statut === 'Valide') : []);
      setEtablissements(Array.isArray(establishmentsData) ? establishmentsData : []);
    }).catch((loadError: any) => setError(loadError.message || 'Erreur de chargement.')).finally(() => setLoading(false));
  }, [token]);

  const years = useMemo(() => Array.from(new Set(reports.map((row) => row.report.anneeScolaire).filter(Boolean))).sort().reverse(), [reports]);
  const filteredReports = reports.filter((row) => {
    const establishment = row.etablissement;
    const matchesSearch = !search.trim() || String(establishment?.nom || '').toLowerCase().includes(search.trim().toLowerCase());
    return matchesSearch && (etablissementId === 'Tous' || String(row.report.etablissementId) === etablissementId) && (annee === 'Toutes' || row.report.anneeScolaire === annee);
  });

  if (loading) return <div className="flex h-64 items-center justify-center text-sm text-slate-500">Chargement des rapports annuels...</div>;
  if (error) return <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>;

  return (
    <div className="space-y-6 pb-10">
      <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
        <div className="flex items-center gap-3"><ShieldCheck className="h-8 w-8 text-emerald-600" /><div><p className="text-xs font-bold uppercase tracking-widest text-emerald-700">Consultation publique</p><h1 className="text-2xl font-black text-slate-950">Rapports scolaires annuels</h1></div></div>
        <p className="mt-3 text-sm text-slate-600">Seuls les rapports valides par la Direction des Services de l'Education sont visibles.</p>
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid gap-3 md:grid-cols-3">
          <label className="relative block"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher un etablissement..." className="w-full rounded-lg border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500" /></label>
          <select value={etablissementId} onChange={(event) => setEtablissementId(event.target.value)} className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500"><option value="Tous">Tous les etablissements</option>{etablissements.map((item) => <option key={item.id} value={item.id}>{item.nom}</option>)}</select>
          <select value={annee} onChange={(event) => setAnnee(event.target.value)} className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500"><option value="Toutes">Toutes les annees</option>{years.map((item) => <option key={item} value={item}>{item}</option>)}</select>
        </div>
      </section>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filteredReports.map((row) => <article key={row.report.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between gap-3"><div><h2 className="flex items-center gap-2 font-bold text-slate-900"><FileText className="h-4 w-4 text-emerald-600" />{row.etablissement?.nom || 'Etablissement'}</h2><p className="mt-1 text-xs text-slate-500">{row.etablissement?.type || 'Type non renseigne'} | {row.etablissement?.arrondissement || 'Arrondissement non renseigne'}</p></div><span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-bold text-emerald-700">Valide</span></div><div className="mt-4 border-t border-slate-100 pt-3 text-sm text-slate-700"><p><strong>Annee scolaire :</strong> {row.report.anneeScolaire}</p><p className="mt-2">{reportSummary(row.report, row.etablissement?.type)}</p></div></article>)}
        {filteredReports.length === 0 && <div className="col-span-full rounded-xl bg-slate-50 p-8 text-center text-sm text-slate-500">Aucun rapport valide ne correspond aux filtres.</div>}
      </section>
    </div>
  );
}
