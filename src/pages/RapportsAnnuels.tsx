import React, { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../lib/api.ts';
import { useAuth } from '../components/AuthProvider.tsx';
import { ARRONDISSEMENT_ROLES, DSE_ROLES, LOCAL_SCHOOL_ROLES, ROLES, SUPER_ADMIN_ROLES, hasAnyRole } from '../lib/roles.ts';
import { BarChart, Bar, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Check, Download, FileSpreadsheet, FileText, Save, Send, X } from 'lucide-react';
import * as XLSX from 'xlsx';

const CLASS_LEVELS = ['6e', '5e', '4e', '3e', '2ndeA', '2ndeC', '1ereA', '1ereD', 'TleA', 'TleD'];
const CYCLE_LEVELS = ['6e', '5e', '4e', '3e'];
const SECOND_CYCLE_LEVELS = ['2ndeA', '2ndeC', '1ereA', '1ereD', 'TleA', 'TleD'];

const emptyReport = (type: string) => type === 'Primaire' ? {
  classes: 0,
  enseignantsEnClasse: 0,
  filles: 0,
  garcons: 0,
  cepAvecLibres: { presentsFilles: 0, presentsGarcons: 0, admisFilles: 0, admisGarcons: 0 },
  cepSansLibres: { presentsFilles: 0, presentsGarcons: 0, admisFilles: 0, admisGarcons: 0 }
} : {
  classes: Object.fromEntries(CLASS_LEVELS.map((level) => [level, 0])),
  premierCycle: Object.fromEntries(CYCLE_LEVELS.map((level) => [level, { filles: 0, garcons: 0 }])),
  secondCycle: Object.fromEntries(SECOND_CYCLE_LEVELS.map((level) => [level, { filles: 0, garcons: 0 }])),
  enseignants: { hommes: 0, femmes: 0 },
  examens: { candidatsFilles: 0, candidatsGarcons: 0, admisFilles: 0, admisGarcons: 0 },
  bep: { candidatsFilles: 0, candidatsGarcons: 0, admisFilles: 0, admisGarcons: 0 }
};

function normalizeReportData(type: string, source: any) {
  const base: any = emptyReport(type);
  if (!source || typeof source !== 'object' || Array.isArray(source)) return base;

  if (type === 'Primaire') {
    return {
      ...base,
      ...source,
      cepAvecLibres: { ...base.cepAvecLibres, ...(source.cepAvecLibres || {}) },
      cepSansLibres: { ...base.cepSansLibres, ...(source.cepSansLibres || {}) },
    };
  }

  const normalizeCycle = (cycle: string[], value: any) => Object.fromEntries(
    cycle.map((level) => [level, {
      filles: numberValue(value?.[level]?.filles),
      garcons: numberValue(value?.[level]?.garcons),
    }])
  );

  return {
    ...base,
    ...source,
    classes: { ...base.classes, ...(source.classes || {}) },
    premierCycle: normalizeCycle(CYCLE_LEVELS, source.premierCycle),
    secondCycle: normalizeCycle(SECOND_CYCLE_LEVELS, source.secondCycle),
    enseignants: { ...base.enseignants, ...(source.enseignants || {}) },
    examens: { ...base.examens, ...(source.examens || {}) },
    bep: { ...base.bep, ...(source.bep || {}) },
  };
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function flatten(value: any, prefix = '', output: Record<string, unknown> = {}) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    Object.entries(value).forEach(([key, nested]) => flatten(nested, prefix ? `${prefix}.${key}` : key, output));
  } else {
    output[prefix] = value ?? 0;
  }
  return output;
}

function setPath(source: any, path: string[], value: number) {
  const next = structuredClone(source);
  let cursor = next;
  path.slice(0, -1).forEach((part) => {
    if (!cursor[part] || typeof cursor[part] !== 'object') cursor[part] = {};
    cursor = cursor[part];
  });
  cursor[path[path.length - 1]] = value;
  return next;
}

function NumericField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return (
    <label className="block text-xs font-semibold text-slate-600">
      {label}
      <input type="number" min="0" value={value || 0} onChange={(event) => onChange(numberValue(event.target.value))} className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
    </label>
  );
}

export default function RapportsAnnuels() {
  const { token, user } = useAuth();
  const isSuperAdmin = hasAnyRole(user?.role, SUPER_ADMIN_ROLES);
  const isDse = hasAnyRole(user?.role, DSE_ROLES);
  const isProviseur = hasAnyRole(user?.role, [ROLES.PROVISEUR]);
  const isPrimaryDirector = hasAnyRole(user?.role, [ROLES.DIRECTEUR_ECOLE]);
  const isSecretary = hasAnyRole(user?.role, [ROLES.SECRETAIRE_ADMIN, ROLES.SECRETAIRE_ADMIN_LEGACY]);
  const isArrondissementResp = hasAnyRole(user?.role, ARRONDISSEMENT_ROLES);
  const canEdit = isDse || isPrimaryDirector || isProviseur || isSecretary;
  const canSeeReports = isSuperAdmin || isDse || isArrondissementResp || hasAnyRole(user?.role, LOCAL_SCHOOL_ROLES);
  const [etablissements, setEtablissements] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [anneeScolaire, setAnneeScolaire] = useState('2025-2026');
  const [donnees, setDonnees] = useState<any>(emptyReport('Primaire'));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const selectedEtablissement = etablissements.find((item) => String(item.id) === selectedId);
  // Normalize before rendering so a type change cannot expose a partial report
  // during the render between selectedId and the synchronization effect.
  const formDonnees = normalizeReportData(selectedEtablissement?.type || 'Primaire', donnees);

  const load = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [etabRes, reportRes] = await Promise.all([
        apiFetch('/api/etablissements', { headers }),
        apiFetch('/api/annual-reports', { headers })
      ]);
      if (!etabRes.ok || !reportRes.ok) throw new Error('Impossible de charger les rapports annuels.');
      const etabs = await etabRes.json();
      const annual = await reportRes.json();
      const visibleEtabs = Array.isArray(etabs) ? etabs.filter((item: any) => !user?.etablissementId || isDse || isSuperAdmin || item.id === user.etablissementId) : [];
      setEtablissements(visibleEtabs);
      setReports(Array.isArray(annual) ? annual.filter((row: any) => row?.report) : []);
      if (!selectedId && visibleEtabs.length > 0) {
        setSelectedId(String(user?.etablissementId || visibleEtabs[0].id));
      }
    } catch (error) {
      console.error(error);
      setMessage('Impossible de charger les rapports annuels.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [token]);

  useEffect(() => {
    const existing = reports.find((row) => row.report?.etablissementId === Number(selectedId) && row.report?.anneeScolaire === anneeScolaire);
    const type = selectedEtablissement?.type || 'Primaire';
    setDonnees(normalizeReportData(type, existing?.report?.donnees));
  }, [selectedId, anneeScolaire, selectedEtablissement?.type, reports]);

  const setValue = (path: string[], value: number) => setDonnees((current: any) => setPath(current, path, value));

  const save = async (action: 'save' | 'submit') => {
    if (!token || !selectedId) return;
    setSaving(true);
    setMessage('');
    try {
      const response = await apiFetch('/api/annual-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ etablissementId: Number(selectedId), anneeScolaire, donnees: formDonnees, action })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Erreur lors de la sauvegarde.');
      setMessage(action === 'submit' ? 'Rapport transmis pour validation.' : 'Brouillon enregistré.');
      await load();
    } catch (error: any) {
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  };

  const decide = async (id: number, decision: 'approuver' | 'valider' | 'rejeter') => {
    if (!token) return;
    const response = await apiFetch(`/api/annual-reports/${id}/decision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ decision })
    });
    const result = await response.json();
    if (!response.ok) return setMessage(result.error || 'Action impossible.');
    setMessage('Workflow mis a jour.');
    await load();
  };

  const exportExcel = () => {
    const rows = reports.map((row) => ({
      Etablissement: row.etablissement?.nom || row.report.etablissementId,
      Type: row.etablissement?.type || '',
      Arrondissement: row.etablissement?.arrondissement || '',
      Annee: row.report.anneeScolaire,
      Statut: row.report.statut,
      Donnees: JSON.stringify(row.report.donnees)
    }));
    const detailRows = reports.map((row) => ({
      Etablissement: row.etablissement?.nom || row.report.etablissementId,
      Type: row.etablissement?.type || '',
      Arrondissement: row.etablissement?.arrondissement || '',
      Annee: row.report.anneeScolaire,
      Statut: row.report.statut,
      ...flatten(row.report.donnees)
    }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), 'Rapports annuels');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(detailRows), 'Donnees detaillees');
    XLSX.writeFile(workbook, `SGSIS_rapports_${anneeScolaire}.xlsx`);
  };

  const chartData = useMemo(() => ['Brouillon', 'Soumis au proviseur', 'Soumis au DSE', 'Valide', 'Rejete'].map((status) => ({
    status,
    total: reports.filter((row) => row.report?.statut === status).length
  })), [reports]);

  if (!canSeeReports) return <div className="p-8 text-center text-slate-500">Acces reserve aux responsables scolaires et a la DSE.</div>;

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-black text-slate-900">Rapports scolaires annuels</h1>
          <p className="mt-1 text-sm text-slate-500">Saisie, validation et synthese des donnees de rentree et de fin d'annee.</p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          {isDse && <button onClick={exportExcel} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white"><FileSpreadsheet className="h-4 w-4" /> Excel</button>}
          {isDse && <button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm font-bold text-white"><FileText className="h-4 w-4" /> PDF</button>}
        </div>
      </div>

      {message && <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">{message}</div>}
      {isArrondissementResp && <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">Consultation territoriale : les rapports de votre arrondissement sont accessibles en lecture seule.</div>}

      {isDse && (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">Suivi des transmissions</h2>
          <div className="mt-4 h-64 w-full"><ResponsiveContainer><BarChart data={chartData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="status" tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="total" fill="#0f766e" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div>
        </section>
      )}

      <fieldset disabled={!canEdit} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm print:hidden">
        <div className="grid gap-4 md:grid-cols-3">
          <label className="text-xs font-bold text-slate-600">Annee scolaire
            <select value={anneeScolaire} onChange={(event) => setAnneeScolaire(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-200 p-2 text-sm"><option>2025-2026</option><option>2026-2027</option><option>2024-2025</option></select>
          </label>
          <label className="text-xs font-bold text-slate-600">Etablissement
            <select value={selectedId} disabled={!isDse && !isSuperAdmin} onChange={(event) => setSelectedId(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-200 p-2 text-sm disabled:bg-slate-100"><option value="">Selectionner</option>{etablissements.map((etab) => <option key={etab.id} value={etab.id}>{etab.nom} - {etab.arrondissement}</option>)}</select>
          </label>
          <div className="flex items-end gap-2"><button disabled={saving || !selectedId || !canEdit} onClick={() => save('save')} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-50"><Save className="h-4 w-4" /> Brouillon</button><button disabled={saving || !selectedId || !canEdit} onClick={() => save('submit')} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"><Send className="h-4 w-4" /> Transmettre</button></div>
        </div>
        {selectedEtablissement?.type === 'Primaire' ? (
          <div className="mt-6 space-y-5">
            <h3 className="font-bold text-slate-900">Ecole primaire : donnees de rentree et CEP</h3>
            <div className="grid gap-4 md:grid-cols-4"><NumericField label="Classes" value={formDonnees.classes} onChange={(value) => setValue(['classes'], value)} /><NumericField label="Enseignants en classe" value={formDonnees.enseignantsEnClasse} onChange={(value) => setValue(['enseignantsEnClasse'], value)} /><NumericField label="Eleves filles" value={formDonnees.filles} onChange={(value) => setValue(['filles'], value)} /><NumericField label="Eleves garcons" value={formDonnees.garcons} onChange={(value) => setValue(['garcons'], value)} /></div>
            {(['cepAvecLibres', 'cepSansLibres'] as const).map((key) => <div key={key} className="rounded-lg bg-slate-50 p-4"><h4 className="mb-3 text-sm font-bold text-slate-800">CEP {key === 'cepAvecLibres' ? 'avec candidats libres' : 'sans candidats libres'}</h4><div className="grid gap-4 md:grid-cols-4"><NumericField label="Presents filles" value={formDonnees[key].presentsFilles} onChange={(value) => setValue([key, 'presentsFilles'], value)} /><NumericField label="Presents garcons" value={formDonnees[key].presentsGarcons} onChange={(value) => setValue([key, 'presentsGarcons'], value)} /><NumericField label="Admis filles" value={formDonnees[key].admisFilles} onChange={(value) => setValue([key, 'admisFilles'], value)} /><NumericField label="Admis garcons" value={formDonnees[key].admisGarcons} onChange={(value) => setValue([key, 'admisGarcons'], value)} /></div></div>)}
          </div>
        ) : selectedEtablissement ? (
          <div className="mt-6 space-y-5">
            <h3 className="font-bold text-slate-900">Etablissement secondaire : classes, effectifs, personnel et examens</h3>
            <div><h4 className="mb-3 text-sm font-bold text-slate-700">Classes ouvertes par niveau</h4><div className="grid gap-4 sm:grid-cols-2 md:grid-cols-5">{CLASS_LEVELS.map((level) => <NumericField key={level} label={level} value={formDonnees.classes[level]} onChange={(value) => setValue(['classes', level], value)} />)}</div></div>
            <div><h4 className="mb-3 text-sm font-bold text-slate-700">Effectifs du premier et du second cycle</h4><div className="grid gap-4 md:grid-cols-2">{[...CYCLE_LEVELS.map((level) => ['premierCycle', level] as string[]), ...SECOND_CYCLE_LEVELS.map((level) => ['secondCycle', level] as string[])].map(([cycle, level]) => <div key={`${cycle}-${level}`} className="grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3"><span className="col-span-2 text-xs font-bold text-slate-700">{level}</span><NumericField label="Filles" value={formDonnees[cycle][level].filles} onChange={(value) => setValue([cycle, level, 'filles'], value)} /><NumericField label="Garcons" value={formDonnees[cycle][level].garcons} onChange={(value) => setValue([cycle, level, 'garcons'], value)} /></div>)}</div></div>
            <div className="grid gap-4 md:grid-cols-2"><NumericField label="Enseignants hommes" value={formDonnees.enseignants.hommes} onChange={(value) => setValue(['enseignants', 'hommes'], value)} /><NumericField label="Enseignantes femmes" value={formDonnees.enseignants.femmes} onChange={(value) => setValue(['enseignants', 'femmes'], value)} /></div>
            {(['examens', 'bep'] as const).map((key) => <div key={key} className="rounded-lg bg-slate-50 p-4"><h4 className="mb-3 text-sm font-bold text-slate-800">Resultats {key === 'bep' ? 'BEP' : 'examens de fin d\'annee'}</h4><div className="grid gap-4 md:grid-cols-4"><NumericField label="Candidats filles" value={formDonnees[key].candidatsFilles} onChange={(value) => setValue([key, 'candidatsFilles'], value)} /><NumericField label="Candidats garcons" value={formDonnees[key].candidatsGarcons} onChange={(value) => setValue([key, 'candidatsGarcons'], value)} /><NumericField label="Admis filles" value={formDonnees[key].admisFilles} onChange={(value) => setValue([key, 'admisFilles'], value)} /><NumericField label="Admis garcons" value={formDonnees[key].admisGarcons} onChange={(value) => setValue([key, 'admisGarcons'], value)} /></div></div>)}
          </div>
        ) : <p className="mt-6 text-sm text-slate-500">Aucun etablissement rattache a ce compte.</p>}
      </fieldset>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4"><h2 className="font-bold text-slate-900">Dossiers transmis</h2></div>
        <div className="divide-y divide-slate-100">{loading ? <p className="p-5 text-sm text-slate-500">Chargement...</p> : reports.length === 0 ? <p className="p-5 text-sm text-slate-500">Aucun rapport annuel.</p> : reports.map((row) => <div key={row.report.id} className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between"><div><p className="font-bold text-slate-900">{row.etablissement?.nom || `Etablissement #${row.report.etablissementId}`}</p><p className="text-xs text-slate-500">{row.report.anneeScolaire} · {row.etablissement?.type} · {row.etablissement?.arrondissement}</p></div><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">{row.report.statut}</span>{isProviseur && row.report.statut === 'Soumis au proviseur' && <button onClick={() => decide(row.report.id, 'approuver')} className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white"><Check className="h-3 w-3" /> Approuver</button>}{isDse && row.report.statut === 'Soumis au DSE' && <><button onClick={() => decide(row.report.id, 'valider')} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white"><Check className="h-3 w-3" /> Valider</button><button onClick={() => decide(row.report.id, 'rejeter')} className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white"><X className="h-3 w-3" /> Rejeter</button></>}</div></div>)}</div>
      </section>
    </div>
  );
}
