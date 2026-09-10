import React, { useEffect, useMemo, useState } from 'react';
import { Building2, FileText, MapPin, Search, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../components/AuthProvider.tsx';
import { apiFetch } from '../lib/api.ts';

function reportTotal(report: any, type: string) {
  const data = report?.donnees || {};
  if (type === 'Primaire') {
    return Number(data.filles || 0) + Number(data.garcons || 0);
  }

  const countCycle = (cycle: any) => (Object.values(cycle || {}) as any[]).reduce((total: number, value: any) => (
    total + Number(value?.filles || 0) + Number(value?.garcons || 0)
  ), 0);
  return countCycle(data.premierCycle) + countCycle(data.secondCycle);
}

export default function VisitorDashboard() {
  const { token, user } = useAuth();
  const [etablissements, setEtablissements] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [type, setType] = useState('Tous');
  const [arrondissement, setArrondissement] = useState('Tous');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    const load = async () => {
      try {
        setLoading(true);
        const [establishmentsResponse, reportsResponse] = await Promise.all([
          apiFetch('/api/etablissements', { headers: { Authorization: `Bearer ${token}` } }),
          apiFetch('/api/annual-reports', { headers: { Authorization: `Bearer ${token}` } })
        ]);
        const establishmentsData = await establishmentsResponse.json();
        const reportsData = await reportsResponse.json();
        if (!establishmentsResponse.ok) throw new Error(establishmentsData.error || 'Impossible de charger les etablissements.');
        if (!reportsResponse.ok) throw new Error(reportsData.error || 'Impossible de charger les rapports annuels.');
        setEtablissements(Array.isArray(establishmentsData) ? establishmentsData : []);
        setReports(Array.isArray(reportsData) ? reportsData : []);
      } catch (loadError: any) {
        setError(loadError.message || 'Erreur de chargement.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [token]);

  const arrondissementOptions = useMemo(() => Array.from(new Set(
    etablissements.map((item) => item.arrondissement).filter(Boolean)
  )).sort(), [etablissements]);

  const filteredEstablishments = useMemo(() => etablissements.filter((item) => {
    const matchesSearch = !search.trim() || String(item.nom || '').toLowerCase().includes(search.trim().toLowerCase());
    const matchesType = type === 'Tous' || item.type === type;
    const matchesArrondissement = arrondissement === 'Tous' || item.arrondissement === arrondissement;
    return matchesSearch && matchesType && matchesArrondissement && !item.archived;
  }), [arrondissement, etablissements, search, type]);

  const visibleReports = reports.filter((row) => row?.report?.statut === 'Valide');

  if (loading) {
    return <div className="flex h-64 items-center justify-center text-sm text-slate-500">Chargement de l'espace public...</div>;
  }

  if (error) {
    return <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>;
  }

  return (
    <div className="space-y-6 pb-10">
      <section className="rounded-2xl bg-gradient-to-r from-sky-800 to-cyan-700 p-6 text-white shadow-lg">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-cyan-100">Portail public de consultation</p>
            <h1 className="mt-2 text-3xl font-black">Etablissements scolaires de Ouagadougou</h1>
            <p className="mt-2 max-w-2xl text-sm text-cyan-50">Bienvenue {user?.prenom || ''} {user?.nom || ''}. Consultez les etablissements disponibles et les rapports annuels valides.</p>
          </div>
          <ShieldCheck className="h-14 w-14 text-cyan-100" />
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900"><Building2 className="h-5 w-5 text-sky-600" />Etablissements disponibles</h2>
            <p className="text-sm text-slate-500">Recherche et consultation en lecture seule.</p>
          </div>
          <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-bold text-sky-700">{filteredEstablishments.length} resultat(s)</span>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher un nom..." className="w-full rounded-lg border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-sky-500" />
          </label>
          <select value={type} onChange={(event) => setType(event.target.value)} className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-sky-500">
            <option value="Tous">Tous les types</option>
            <option value="Primaire">Ecole primaire</option>
            <option value="Secondaire">Etablissement secondaire</option>
          </select>
          <select value={arrondissement} onChange={(event) => setArrondissement(event.target.value)} className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-sky-500">
            <option value="Tous">Tous les arrondissements</option>
            {arrondissementOptions.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>

        <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Nom</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Arrondissement</th><th className="px-4 py-3">Statut</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {filteredEstablishments.map((item) => <tr key={item.id} className="hover:bg-slate-50"><td className="px-4 py-3 font-semibold text-slate-900">{item.nom}</td><td className="px-4 py-3 text-slate-600">{item.type}</td><td className="px-4 py-3 text-slate-600"><span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{item.arrondissement || 'Non renseigne'}</span></td><td className="px-4 py-3"><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">{item.archived ? 'Archive' : 'Actif'}</span></td></tr>)}
              {filteredEstablishments.length === 0 && <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-500">Aucun etablissement ne correspond aux filtres.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 className="flex items-center gap-2 text-lg font-bold text-slate-900"><FileText className="h-5 w-5 text-emerald-600" />Rapports annuels valides</h2><p className="text-sm text-slate-500">Resultats officiellement valides par la DSE.</p></div>
          <Link to="/rapports-annuels" className="text-sm font-bold text-sky-700 hover:text-sky-900">Voir tous les rapports</Link>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {visibleReports.slice(0, 6).map((row) => { const establishment = row.etablissement; return <article key={row.report.id} className="rounded-xl border border-slate-200 p-4"><p className="font-bold text-slate-900">{establishment?.nom || 'Etablissement'}</p><p className="mt-1 text-xs text-slate-500">{row.report.anneeScolaire} | {establishment?.type || 'Type non renseigne'}</p><p className="mt-3 text-sm text-slate-700">Eleves declares : <strong>{reportTotal(row.report, establishment?.type)}</strong></p></article>; })}
          {visibleReports.length === 0 && <p className="col-span-full rounded-xl bg-slate-50 p-5 text-center text-sm text-slate-500">Aucun rapport annuel valide n'est encore disponible.</p>}
        </div>
      </section>
    </div>
  );
}
