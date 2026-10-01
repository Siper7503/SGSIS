import React, { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../lib/api.ts';
import { useAuth } from '../components/AuthProvider.tsx';
import { DGSS_ROLES, DSE_ROLES, LOCAL_SCHOOL_ROLES, ROLES, SUPER_ADMIN_ROLES, hasAnyRole } from '../lib/roles.ts';
import { BarChart, Bar, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Check, Download, Eye, FileSpreadsheet, FileText, Printer, Save, Send, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import { DEFAULT_SCHOOL_YEAR, SCHOOL_YEARS } from '../lib/schoolYears.ts';
import mairieLogo from '../../assets/mairie-ouagadougou-logo.jpg';

const CLASS_LEVELS = ['6e', '5e', '4e', '3e', '2ndeA', '2ndeC', '1ereA', '1ereD', 'TleA', 'TleD'];
const CYCLE_LEVELS = ['6e', '5e', '4e', '3e'];
const SECOND_CYCLE_LEVELS = ['2ndeA', '2ndeC', '1ereA', '1ereD', 'TleA', 'TleD'];
const REPORT_TYPES = ['entree', 'fin_cycle'] as const;
type ReportType = typeof REPORT_TYPES[number];
const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  entree: 'Rapport de rentrée',
  fin_cycle: 'Rapport de fin de cycle / sortie',
};
const SECONDARY_EXAMS = ['bepc', 'bep', 'cqp', 'bac'] as const;
const SECONDARY_EXAM_LABELS: Record<typeof SECONDARY_EXAMS[number], string> = {
  bepc: '3e - BEPC',
  bep: '3e - BEP',
  cqp: '3e - CQP',
  bac: 'Terminale - Bac',
};

const emptyReport = (type: string) => type === 'Primaire' ? {
  classes: 0,
  enseignantsEnClasse: 0,
  filles: 0,
  garcons: 0,
  cep: { candidatsFilles: 0, candidatsGarcons: 0, admisFilles: 0, admisGarcons: 0 },
  cepAvecLibres: { presentsFilles: 0, presentsGarcons: 0, admisFilles: 0, admisGarcons: 0 },
  cepSansLibres: { presentsFilles: 0, presentsGarcons: 0, admisFilles: 0, admisGarcons: 0 }
} : {
  classes: Object.fromEntries(CLASS_LEVELS.map((level) => [level, 0])),
  premierCycle: Object.fromEntries(CYCLE_LEVELS.map((level) => [level, { filles: 0, garcons: 0 }])),
  secondCycle: Object.fromEntries(SECOND_CYCLE_LEVELS.map((level) => [level, { filles: 0, garcons: 0 }])),
  enseignants: { hommes: 0, femmes: 0 },
  bepc: { candidatsFilles: 0, candidatsGarcons: 0, admisFilles: 0, admisGarcons: 0 },
  bep: { candidatsFilles: 0, candidatsGarcons: 0, admisFilles: 0, admisGarcons: 0 },
  cqp: { candidatsFilles: 0, candidatsGarcons: 0, admisFilles: 0, admisGarcons: 0 },
  bac: { candidatsFilles: 0, candidatsGarcons: 0, admisFilles: 0, admisGarcons: 0 }
};

function normalizeReportData(type: string, source: any) {
  const base: any = emptyReport(type);
  if (!source || typeof source !== 'object' || Array.isArray(source)) return base;

  if (type === 'Primaire') {
    return {
      ...base,
      ...source,
      cep: { ...base.cep, ...(source.cep || {}) },
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
    bepc: { ...base.bepc, ...(source.bepc || source.examens || {}) },
    bep: { ...base.bep, ...(source.bep || {}) },
    cqp: { ...base.cqp, ...(source.cqp || {}) },
    bac: { ...base.bac, ...(source.bac || {}) },
  };
}

function reportTypeOf(row: any): ReportType {
  return REPORT_TYPES.includes(row?.report?.typeRapport) ? row.report.typeRapport : 'entree';
}

function formatSubmissionDate(value: unknown) {
  if (!value) return 'Non transmise';
  const date = value instanceof Date
    ? new Date(value.getTime())
    : new Date(value as string | number);
  if (!Number.isFinite(date.getTime())) return 'Non transmise';
  return date.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Africa/Ouagadougou',
  });
}

function safeFileName(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'etablissement';
}

function sanitizeReportData(type: string, reportType: ReportType, source: any) {
  const normalized = normalizeReportData(type, source);
  if (type === 'Primaire') {
    const base: any = {
      classes: normalized.classes,
      enseignantsEnClasse: normalized.enseignantsEnClasse,
      filles: normalized.filles,
      garcons: normalized.garcons,
    };
    if (reportType === 'fin_cycle') {
      base.cep = normalized.cep;
      base.cepAvecLibres = normalized.cepAvecLibres;
      base.cepSansLibres = normalized.cepSansLibres;
    }
    return base;
  }

  const base: any = {
    classes: normalized.classes,
    premierCycle: normalized.premierCycle,
    secondCycle: normalized.secondCycle,
    enseignants: normalized.enseignants,
  };
  if (reportType === 'fin_cycle') {
    SECONDARY_EXAMS.forEach((key) => {
      base[key] = normalized[key];
    });
  }
  return base;
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

function totalCycle(cycle: any) {
  return (Object.values(cycle || {}) as any[]).reduce((total: number, item: any) => (
    total + Number(item?.filles || 0) + Number(item?.garcons || 0)
  ), 0);
}

function totalObjectNumbers(value: any) {
  return (Object.values(value || {}) as any[]).reduce((total: number, item: any) => total + Number(item || 0), 0);
}

function examRate(exam: any) {
  const candidates = Number(exam?.candidatsFilles || exam?.presentsFilles || 0) + Number(exam?.candidatsGarcons || exam?.presentsGarcons || 0);
  const admitted = Number(exam?.admisFilles || 0) + Number(exam?.admisGarcons || 0);
  if (!candidates) return '0%';
  return `${Math.round((admitted / candidates) * 100)}%`;
}

function AnnualReportPdfPreview({ row }: { row: any }) {
  const establishment = row?.etablissement || {};
  const report = row?.report || {};
  const reportType = reportTypeOf(row);
  const submissionDate = formatSubmissionDate(report.submittedAt);
  const data = normalizeReportData(establishment.type || 'Primaire', report.donnees);
  const isPrimary = establishment.type === 'Primaire';
  const totalStudents = isPrimary
    ? Number(data.filles || 0) + Number(data.garcons || 0)
    : totalCycle(data.premierCycle) + totalCycle(data.secondCycle);
  const totalClasses = isPrimary ? Number(data.classes || 0) : totalObjectNumbers(data.classes);
  const totalTeachers = isPrimary ? Number(data.enseignantsEnClasse || 0) : Number(data.enseignants?.hommes || 0) + Number(data.enseignants?.femmes || 0);

  return (
    <div className="page mx-auto min-h-[297mm] w-[210mm] bg-white p-10 text-slate-950 shadow-sm">
      <div className="annual-letterhead">
        <div className="annual-letterhead-cell annual-letterhead-left">
          <p>COMMUNE DE OUAGADOUGOU</p>
          <p>MAIRIE</p>
          <p>SECRÉTARIAT GÉNÉRAL</p>
          <p>DIRECTION GÉNÉRALE DES SERVICES SOCIAUX</p>
          <p>DIRECTION DES SERVICES DE L’ÉDUCATION</p>
        </div>
        <div className="annual-letterhead-cell annual-letterhead-center">
          <img src={mairieLogo} alt="Blason de la Commune de Ouagadougou" />
        </div>
        <div className="annual-letterhead-cell annual-letterhead-right">
          <p className="annual-letterhead-country">BURKINA FASO</p>
          <p>La Patrie ou la Mort,</p>
          <p>Nous Vaincrons</p>
        </div>
      </div>
      <div className="annual-report-date">
        <p>Ouagadougou, le {submissionDate}</p>
        <p>Réf. : RAS-{report.id}-{reportType.toUpperCase()}</p>
      </div>

      <div className="my-8 text-center">
        <h1 className="text-xl font-black uppercase tracking-wide">Rapport scolaire annuel</h1>
        <p className="mt-2 text-sm font-bold text-blue-800">{REPORT_TYPE_LABELS[reportType]}</p>
        <p className="mt-1 text-xs text-slate-500">Document transmis aux Directeurs DGSS et DSE pour examen administratif</p>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-lg border border-slate-300 p-3"><span className="font-bold">Etablissement : </span>{establishment.nom || 'Non renseigne'}</div>
        <div className="rounded-lg border border-slate-300 p-3"><span className="font-bold">Type : </span>{establishment.type || 'Non renseigne'}</div>
        <div className="rounded-lg border border-slate-300 p-3"><span className="font-bold">Arrondissement : </span>{establishment.arrondissement || 'Non renseigne'}</div>
        <div className="rounded-lg border border-slate-300 p-3"><span className="font-bold">Annee scolaire : </span>{report.anneeScolaire}</div>
        <div className="rounded-lg border border-slate-300 p-3"><span className="font-bold">Statut : </span>{report.statut}</div>
        <div className="rounded-lg border border-slate-300 p-3"><span className="font-bold">Date de transmission : </span>{submissionDate}</div>
      </div>

      <h2 className="mt-8 border-b border-slate-300 pb-2 text-sm font-black uppercase">Synthese generale</h2>
      <table className="mt-3 w-full border-collapse text-sm">
        <thead><tr className="bg-slate-100"><th className="border border-slate-700 px-3 py-2 text-left">Indicateur</th><th className="border border-slate-700 px-3 py-2 text-left">Valeur</th></tr></thead>
        <tbody>
          <tr><td className="border border-slate-700 px-3 py-2 font-bold">Classes ouvertes</td><td className="border border-slate-700 px-3 py-2">{totalClasses}</td></tr>
          <tr><td className="border border-slate-700 px-3 py-2 font-bold">Eleves declares</td><td className="border border-slate-700 px-3 py-2">{totalStudents}</td></tr>
          <tr><td className="border border-slate-700 px-3 py-2 font-bold">Personnel enseignant</td><td className="border border-slate-700 px-3 py-2">{totalTeachers}</td></tr>
        </tbody>
      </table>

      {isPrimary ? (
        <table className="mt-6 w-full border-collapse text-sm">
          <thead><tr className="bg-slate-100"><th className="border border-slate-700 px-3 py-2 text-left">Donnee primaire</th><th className="border border-slate-700 px-3 py-2">Filles</th><th className="border border-slate-700 px-3 py-2">Garcons</th><th className="border border-slate-700 px-3 py-2">Total / Taux</th></tr></thead>
          <tbody>
            <tr><td className="border border-slate-700 px-3 py-2 font-bold">Effectifs eleves</td><td className="border border-slate-700 px-3 py-2 text-center">{data.filles}</td><td className="border border-slate-700 px-3 py-2 text-center">{data.garcons}</td><td className="border border-slate-700 px-3 py-2 text-center">{totalStudents}</td></tr>
            {reportType === 'fin_cycle' && <tr><td className="border border-slate-700 px-3 py-2 font-bold">CM2 - CEP admis</td><td className="border border-slate-700 px-3 py-2 text-center">{data.cep.admisFilles}</td><td className="border border-slate-700 px-3 py-2 text-center">{data.cep.admisGarcons}</td><td className="border border-slate-700 px-3 py-2 text-center">{examRate(data.cep)}</td></tr>}
          </tbody>
        </table>
      ) : (
        <>
          <table className="mt-6 w-full border-collapse text-sm">
            <thead><tr className="bg-slate-100"><th className="border border-slate-700 px-3 py-2 text-left">Niveau</th><th className="border border-slate-700 px-3 py-2">Classes</th><th className="border border-slate-700 px-3 py-2">Filles</th><th className="border border-slate-700 px-3 py-2">Garcons</th></tr></thead>
            <tbody>
              {[...CYCLE_LEVELS.map((level) => ['premierCycle', level] as string[]), ...SECOND_CYCLE_LEVELS.map((level) => ['secondCycle', level] as string[])].map(([cycle, level]) => (
                <tr key={`${cycle}-${level}`}><td className="border border-slate-700 px-3 py-2 font-bold">{level}</td><td className="border border-slate-700 px-3 py-2 text-center">{data.classes[level]}</td><td className="border border-slate-700 px-3 py-2 text-center">{data[cycle][level].filles}</td><td className="border border-slate-700 px-3 py-2 text-center">{data[cycle][level].garcons}</td></tr>
              ))}
            </tbody>
          </table>
          {reportType === 'fin_cycle' && <table className="mt-6 w-full border-collapse text-sm">
            <thead><tr className="bg-slate-100"><th className="border border-slate-700 px-3 py-2 text-left">Examen</th><th className="border border-slate-700 px-3 py-2">Candidats filles</th><th className="border border-slate-700 px-3 py-2">Candidats garcons</th><th className="border border-slate-700 px-3 py-2">Admis filles</th><th className="border border-slate-700 px-3 py-2">Admis garcons</th><th className="border border-slate-700 px-3 py-2">Taux</th></tr></thead>
            <tbody>
              {SECONDARY_EXAMS.map((key) => <tr key={key}><td className="border border-slate-700 px-3 py-2 font-bold">{SECONDARY_EXAM_LABELS[key]}</td><td className="border border-slate-700 px-3 py-2 text-center">{data[key].candidatsFilles}</td><td className="border border-slate-700 px-3 py-2 text-center">{data[key].candidatsGarcons}</td><td className="border border-slate-700 px-3 py-2 text-center">{data[key].admisFilles}</td><td className="border border-slate-700 px-3 py-2 text-center">{data[key].admisGarcons}</td><td className="border border-slate-700 px-3 py-2 text-center">{examRate(data[key])}</td></tr>)}
            </tbody>
          </table>}
        </>
      )}

      <div className="mt-12 flex justify-between text-sm">
        <div><p className="font-bold underline">Agent declarant</p><p className="mt-2 text-slate-500">Signature electronique</p></div>
        <div className="text-right"><p className="font-bold underline">Administration DGSS / DSE</p><p className="mt-2 text-slate-500">Visa et examen du rapport</p></div>
      </div>
    </div>
  );
}

export default function RapportsAnnuels() {
  const { token, user } = useAuth();
  const isSuperAdmin = hasAnyRole(user?.role, SUPER_ADMIN_ROLES);
  const isDse = hasAnyRole(user?.role, DSE_ROLES);
  const isDgss = hasAnyRole(user?.role, DGSS_ROLES);
  const isProviseur = hasAnyRole(user?.role, [ROLES.PROVISEUR]);
  const isPrimaryDirector = hasAnyRole(user?.role, [ROLES.DIRECTEUR_ECOLE]);
  const canEdit = isDse || isPrimaryDirector || isProviseur;
  const canAdminExport = isSuperAdmin || isDse || isDgss;
  const canSeeReports = isSuperAdmin || isDse || isDgss || hasAnyRole(user?.role, LOCAL_SCHOOL_ROLES);
  const [etablissements, setEtablissements] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [anneeScolaire, setAnneeScolaire] = useState(DEFAULT_SCHOOL_YEAR);
  const [typeRapport, setTypeRapport] = useState<ReportType>('entree');
  const [donnees, setDonnees] = useState<any>(emptyReport('Primaire'));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [pdfReport, setPdfReport] = useState<any | null>(null);
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
      const visibleEtabs = Array.isArray(etabs) ? etabs.filter((item: any) => !user?.etablissementId || isDse || isDgss || isSuperAdmin || item.id === user.etablissementId) : [];
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
    const existing = reports.find((row) => row.report?.etablissementId === Number(selectedId) && row.report?.anneeScolaire === anneeScolaire && reportTypeOf(row) === typeRapport);
    const type = selectedEtablissement?.type || 'Primaire';
    setDonnees(normalizeReportData(type, existing?.report?.donnees));
  }, [selectedId, anneeScolaire, typeRapport, selectedEtablissement?.type, reports]);

  const setValue = (path: string[], value: number) => setDonnees((current: any) => setPath(current, path, value));

  const save = async (action: 'save' | 'submit') => {
    if (!token || !selectedId) return;
    setSaving(true);
    setMessage('');
    try {
      const response = await apiFetch('/api/annual-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          etablissementId: Number(selectedId),
          anneeScolaire,
          typeRapport,
          donnees: sanitizeReportData(selectedEtablissement?.type || 'Primaire', typeRapport, formDonnees),
          action
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Erreur lors de la sauvegarde.');
      setMessage(action === 'submit' ? 'Rapport transmis pour validation.' : 'Brouillon enregistre.');
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
      Rapport: REPORT_TYPE_LABELS[reportTypeOf(row)],
      Statut: row.report.statut,
      Donnees: JSON.stringify(row.report.donnees)
    }));
    const detailRows = reports.map((row) => ({
      Etablissement: row.etablissement?.nom || row.report.etablissementId,
      Type: row.etablissement?.type || '',
      Arrondissement: row.etablissement?.arrondissement || '',
      Annee: row.report.anneeScolaire,
      Rapport: REPORT_TYPE_LABELS[reportTypeOf(row)],
      Statut: row.report.statut,
      ...flatten(row.report.donnees)
    }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), 'Rapports annuels');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(detailRows), 'Donnees detaillees');
    XLSX.writeFile(workbook, `SGSIS_rapports_${anneeScolaire}.xlsx`);
  };

  const exportExcelReport = (row: any) => {
    const report = row.report;
    const establishment = row.etablissement || {};
    const reportType = reportTypeOf(row);
    const reportData = normalizeReportData(establishment.type || 'Primaire', report.donnees);
    const workbook = XLSX.utils.book_new();
    const information = [
      { Champ: 'Établissement', Valeur: establishment.nom || `Établissement #${report.etablissementId}` },
      { Champ: 'Type d’établissement', Valeur: establishment.type || 'Non renseigné' },
      { Champ: 'Arrondissement', Valeur: establishment.arrondissement || 'Non renseigné' },
      { Champ: 'Année scolaire', Valeur: report.anneeScolaire },
      { Champ: 'Type de rapport', Valeur: REPORT_TYPE_LABELS[reportType] },
      { Champ: 'Statut', Valeur: report.statut },
      { Champ: 'Date de transmission', Valeur: formatSubmissionDate(report.submittedAt) },
    ];
    const detailRows = Object.entries(flatten(reportData)).map(([indicator, value]) => ({
      Indicateur: indicator,
      Valeur: value,
    }));

    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(information), 'Identification');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(detailRows), 'Données détaillées');
    XLSX.writeFile(
      workbook,
      `SGSIS_${reportType}_${safeFileName(establishment.nom || '')}_${safeFileName(String(report.anneeScolaire || 'annee'))}.xlsx`,
    );
  };

  const printPdfReport = async () => {
    const printable = document.getElementById('annual-report-pdf');
    if (!printable) return window.print();
    const printWindow = window.open('', '_blank', 'width=900,height=1200');
    if (!printWindow) return window.print();
    printWindow.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>Rapport scolaire annuel</title>
          <style>
            body { margin: 0; background: #f8fafc; font-family: Arial, sans-serif; color: #0f172a; }
            @page { size: A4 portrait; margin: 14mm; }
            * { box-sizing: border-box; }
            .page { width: 100%; min-height: 0; margin: 0 auto; background: white; padding: 0; color: #0f172a; font-size: 11pt; line-height: 1.45; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid #334155; padding: 2.4mm 2.5mm; font-size: 10pt; text-align: left; vertical-align: middle; }
            th { background: #f1f5f9 !important; text-transform: uppercase; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            h1, h2, h3, p { margin: 0; }
            .annual-letterhead { display: grid; grid-template-columns: 2fr 1fr 1.1fr; border: 1px solid #111827; min-height: 38mm; font-family: "Times New Roman", serif; break-inside: avoid; }
            .annual-letterhead-cell { display: flex; flex-direction: column; justify-content: center; padding: 2.5mm; text-align: center; }
            .annual-letterhead-cell + .annual-letterhead-cell { border-left: 1px solid #111827; }
            .annual-letterhead-left { gap: 1.5mm; font-size: 8pt; font-weight: 700; line-height: 1.35; }
            .annual-letterhead-center img { display: block; width: 30mm; height: 30mm; object-fit: contain; margin: 0 auto; }
            .annual-letterhead-right { gap: 2mm; font-size: 11pt; font-weight: 700; line-height: 1.35; }
            .annual-letterhead-right .annual-letterhead-country { margin-bottom: 2mm; font-size: 13pt; }
            .annual-report-date { margin-top: 3mm; text-align: right; font-size: 9pt; line-height: 1.6; }
            .page .my-8 { margin-top: 10mm; margin-bottom: 9mm; }
            .page .mt-1 { margin-top: 1mm; }
            .page .mt-2 { margin-top: 2mm; }
            .page .mt-3 { margin-top: 3mm; }
            .page .mt-6 { margin-top: 5mm; }
            .page .mt-8 { margin-top: 8mm; }
            .page .mt-12 { margin-top: 9mm; }
            .page .text-center { text-align: center; }
            .page .text-right { text-align: right; }
            .page .text-xl { font-size: 21pt; line-height: 1.25; }
            .page .text-sm { font-size: 10.5pt; }
            .page .text-xs { font-size: 10pt; }
            .page .font-black { font-weight: 800; }
            .page .font-bold { font-weight: 700; }
            .page .uppercase { text-transform: uppercase; }
            .page .tracking-wide { letter-spacing: .04em; }
            .page .text-blue-800 { color: #1e40af; }
            .page .text-slate-500 { color: #64748b; }
            .page .grid { display: grid; }
            .page .grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
            .page .gap-3 { gap: 2.5mm; }
            .page .rounded-lg { border-radius: 2mm; }
            .page .border { border: 1px solid #cbd5e1; }
            .page .border-b { border-bottom: 1px solid #cbd5e1; }
            .page .border-slate-300 { border-color: #cbd5e1; }
            .page .border-slate-700 { border-color: #334155; }
            .page .p-3 { padding: 2.5mm; }
            .page .px-3 { padding-left: 2mm; padding-right: 2mm; }
            .page .py-2 { padding-top: 1.5mm; padding-bottom: 1.5mm; }
            .page .pb-2 { padding-bottom: 2mm; }
            .page .bg-slate-100 { background: #f1f5f9 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .page .w-full { width: 100%; }
            .page table { margin-top: 3mm; }
            .page .text-left { text-align: left; }
            .page .text-center { text-align: center; }
            .page tr { break-inside: avoid; }
            .page h1, .page h2, .page h3 { break-after: avoid; }
            .page .flex { display: flex; }
            .page .justify-between { justify-content: space-between; }
            .page .underline { text-decoration: underline; }
            @media print {
              html, body { width: 100%; min-width: 0; margin: 0; background: white; }
              .page { margin: 0; box-shadow: none; }
            }
          </style>
        </head>
        <body>${printable.innerHTML}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    await Promise.all(Array.from(printWindow.document.images, (image) => (
      image.decode().then(() => undefined, () => undefined)
    )));
    await printWindow.document.fonts.ready;
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    printWindow.print();
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
          {canAdminExport && <button onClick={exportExcel} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white"><FileSpreadsheet className="h-4 w-4" /> Excel</button>}
          {canAdminExport && <button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm font-bold text-white"><FileText className="h-4 w-4" /> PDF</button>}
        </div>
      </div>

      {message && <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">{message}</div>}
      {canAdminExport && (
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">Suivi des transmissions</h2>
          <div className="mt-4 h-64 w-full"><ResponsiveContainer><BarChart data={chartData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="status" tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="total" fill="#0f766e" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div>
        </section>
      )}

      <fieldset disabled={!canEdit} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm print:hidden">
        <div className="grid gap-4 md:grid-cols-4">
          <label className="text-xs font-bold text-slate-600">Annee scolaire
            <select value={anneeScolaire} onChange={(event) => setAnneeScolaire(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-200 p-2 text-sm">{SCHOOL_YEARS.map((schoolYear) => <option key={schoolYear} value={schoolYear}>{schoolYear}</option>)}</select>
          </label>
          <label className="text-xs font-bold text-slate-600">Type de rapport
            <select value={typeRapport} onChange={(event) => setTypeRapport(event.target.value as ReportType)} className="mt-1 block w-full rounded-lg border border-slate-200 p-2 text-sm">{REPORT_TYPES.map((reportType) => <option key={reportType} value={reportType}>{REPORT_TYPE_LABELS[reportType]}</option>)}</select>
          </label>
          <label className="text-xs font-bold text-slate-600">Etablissement
            <select value={selectedId} disabled={!isDse && !isSuperAdmin} onChange={(event) => setSelectedId(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-200 p-2 text-sm disabled:bg-slate-100"><option value="">Selectionner</option>{etablissements.map((etab) => <option key={etab.id} value={etab.id}>{etab.nom} - {etab.arrondissement}</option>)}</select>
          </label>
          <div className="flex items-end gap-2"><button disabled={saving || !selectedId || !canEdit} onClick={() => save('save')} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-50"><Save className="h-4 w-4" /> Brouillon</button><button disabled={saving || !selectedId || !canEdit} onClick={() => save('submit')} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"><Send className="h-4 w-4" /> Transmettre</button></div>
        </div>
        {selectedEtablissement?.type === 'Primaire' ? (
          <div className="mt-6 space-y-5">
            <h3 className="font-bold text-slate-900">{typeRapport === 'entree' ? "Ecole primaire : rapport d'entree" : 'Ecole primaire : rapport de fin de cycle et CEP'}</h3>
            <div className="grid gap-4 md:grid-cols-4"><NumericField label="Classes" value={formDonnees.classes} onChange={(value) => setValue(['classes'], value)} /><NumericField label="Enseignants en classe" value={formDonnees.enseignantsEnClasse} onChange={(value) => setValue(['enseignantsEnClasse'], value)} /><NumericField label="Eleves filles" value={formDonnees.filles} onChange={(value) => setValue(['filles'], value)} /><NumericField label="Eleves garcons" value={formDonnees.garcons} onChange={(value) => setValue(['garcons'], value)} /></div>
            {typeRapport === 'fin_cycle' && <>
              <div className="rounded-lg bg-slate-50 p-4"><h4 className="mb-3 text-sm font-bold text-slate-800">Resultats CM2 - CEP</h4><div className="grid gap-4 md:grid-cols-4"><NumericField label="Candidats filles" value={formDonnees.cep.candidatsFilles} onChange={(value) => setValue(['cep', 'candidatsFilles'], value)} /><NumericField label="Candidats garcons" value={formDonnees.cep.candidatsGarcons} onChange={(value) => setValue(['cep', 'candidatsGarcons'], value)} /><NumericField label="Admis filles" value={formDonnees.cep.admisFilles} onChange={(value) => setValue(['cep', 'admisFilles'], value)} /><NumericField label="Admis garcons" value={formDonnees.cep.admisGarcons} onChange={(value) => setValue(['cep', 'admisGarcons'], value)} /></div></div>
              {(['cepAvecLibres', 'cepSansLibres'] as const).map((key) => <div key={key} className="rounded-lg bg-slate-50 p-4"><h4 className="mb-3 text-sm font-bold text-slate-800">Detail CEP {key === 'cepAvecLibres' ? 'avec candidats libres' : 'sans candidats libres'}</h4><div className="grid gap-4 md:grid-cols-4"><NumericField label="Presents filles" value={formDonnees[key].presentsFilles} onChange={(value) => setValue([key, 'presentsFilles'], value)} /><NumericField label="Presents garcons" value={formDonnees[key].presentsGarcons} onChange={(value) => setValue([key, 'presentsGarcons'], value)} /><NumericField label="Admis filles" value={formDonnees[key].admisFilles} onChange={(value) => setValue([key, 'admisFilles'], value)} /><NumericField label="Admis garcons" value={formDonnees[key].admisGarcons} onChange={(value) => setValue([key, 'admisGarcons'], value)} /></div></div>)}
            </>}
          </div>
        ) : selectedEtablissement ? (
          <div className="mt-6 space-y-5">
            <h3 className="font-bold text-slate-900">{typeRapport === 'entree' ? "Etablissement secondaire : rapport d'entree" : 'Etablissement secondaire : rapport de fin de cycle et examens'}</h3>
            <div><h4 className="mb-3 text-sm font-bold text-slate-700">Classes ouvertes par niveau</h4><div className="grid gap-4 sm:grid-cols-2 md:grid-cols-5">{CLASS_LEVELS.map((level) => <NumericField key={level} label={level} value={formDonnees.classes[level]} onChange={(value) => setValue(['classes', level], value)} />)}</div></div>
            <div><h4 className="mb-3 text-sm font-bold text-slate-700">Effectifs du premier et du second cycle</h4><div className="grid gap-4 md:grid-cols-2">{[...CYCLE_LEVELS.map((level) => ['premierCycle', level] as string[]), ...SECOND_CYCLE_LEVELS.map((level) => ['secondCycle', level] as string[])].map(([cycle, level]) => <div key={`${cycle}-${level}`} className="grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3"><span className="col-span-2 text-xs font-bold text-slate-700">{level}</span><NumericField label="Filles" value={formDonnees[cycle][level].filles} onChange={(value) => setValue([cycle, level, 'filles'], value)} /><NumericField label="Garcons" value={formDonnees[cycle][level].garcons} onChange={(value) => setValue([cycle, level, 'garcons'], value)} /></div>)}</div></div>
            <div className="grid gap-4 md:grid-cols-2"><NumericField label="Enseignants hommes" value={formDonnees.enseignants.hommes} onChange={(value) => setValue(['enseignants', 'hommes'], value)} /><NumericField label="Enseignantes femmes" value={formDonnees.enseignants.femmes} onChange={(value) => setValue(['enseignants', 'femmes'], value)} /></div>
            {typeRapport === 'fin_cycle' && SECONDARY_EXAMS.map((key) => <div key={key} className="rounded-lg bg-slate-50 p-4"><h4 className="mb-3 text-sm font-bold text-slate-800">Resultats {SECONDARY_EXAM_LABELS[key]}</h4><div className="grid gap-4 md:grid-cols-4"><NumericField label="Candidats filles" value={formDonnees[key].candidatsFilles} onChange={(value) => setValue([key, 'candidatsFilles'], value)} /><NumericField label="Candidats garcons" value={formDonnees[key].candidatsGarcons} onChange={(value) => setValue([key, 'candidatsGarcons'], value)} /><NumericField label="Admis filles" value={formDonnees[key].admisFilles} onChange={(value) => setValue([key, 'admisFilles'], value)} /><NumericField label="Admis garcons" value={formDonnees[key].admisGarcons} onChange={(value) => setValue([key, 'admisGarcons'], value)} /></div></div>)}
          </div>
        ) : <p className="mt-6 text-sm text-slate-500">Aucun etablissement rattache a ce compte.</p>}
      </fieldset>

      {canAdminExport && (
        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-2 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-bold text-slate-900">Rapports reçus par les administrateurs à examiner</h2>
              <p className="text-xs text-slate-500">Chaque rapport transmis par une structure scolaire peut être téléchargé individuellement au format PDF ou Excel.</p>
            </div>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">{reports.filter((row) => row.report?.statut !== 'Brouillon').length} recu(s)</span>
          </div>
          <div className="divide-y divide-slate-100">
            {loading ? (
              <p className="p-5 text-sm text-slate-500">Chargement...</p>
            ) : reports.filter((row) => row.report?.statut !== 'Brouillon').length === 0 ? (
              <p className="p-5 text-sm text-slate-500">Aucun rapport transmis aux admins.</p>
            ) : reports.filter((row) => row.report?.statut !== 'Brouillon').map((row) => (
              <div key={`pdf-${row.report.id}`} className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="font-bold text-slate-900">{row.etablissement?.nom || `Etablissement #${row.report.etablissementId}`}</p>
                  <p className="text-xs text-slate-500">{row.report.anneeScolaire} - {REPORT_TYPE_LABELS[reportTypeOf(row)]} - {row.etablissement?.type || 'Type non renseigne'} - {row.etablissement?.arrondissement || 'Arrondissement non renseigne'}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">{row.report.statut}</span>
                  <button onClick={() => setPdfReport(row)} className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-800">
                    <Eye className="h-3 w-3" /> Ouvrir / examiner
                  </button>
                  <button onClick={() => { setPdfReport(row); setTimeout(printPdfReport, 100); }} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50">
                    <Download className="h-3 w-3" /> Télécharger PDF
                  </button>
                  <button onClick={() => exportExcelReport(row)} className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 px-3 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-50">
                    <FileSpreadsheet className="h-3 w-3" /> Télécharger Excel
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4"><h2 className="font-bold text-slate-900">Dossiers transmis</h2></div>
        <div className="divide-y divide-slate-100">{loading ? <p className="p-5 text-sm text-slate-500">Chargement...</p> : reports.length === 0 ? <p className="p-5 text-sm text-slate-500">Aucun rapport annuel.</p> : reports.map((row) => <div key={row.report.id} className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between"><div><p className="font-bold text-slate-900">{row.etablissement?.nom || `Etablissement #${row.report.etablissementId}`}</p><p className="text-xs text-slate-500">{row.report.anneeScolaire} · {REPORT_TYPE_LABELS[reportTypeOf(row)]} · {row.etablissement?.type} · {row.etablissement?.arrondissement}</p></div><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">{row.report.statut}</span><button onClick={() => { setPdfReport(row); setTimeout(printPdfReport, 100); }} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"><Download className="h-3 w-3" /> PDF</button><button onClick={() => exportExcelReport(row)} className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 px-3 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-50"><FileSpreadsheet className="h-3 w-3" /> Excel</button>{isProviseur && row.report.statut === 'Soumis au proviseur' && <button onClick={() => decide(row.report.id, 'approuver')} className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white"><Check className="h-3 w-3" /> Approuver</button>}{isDse && row.report.statut === 'Soumis au DSE' && <><button onClick={() => decide(row.report.id, 'valider')} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white"><Check className="h-3 w-3" /> Valider</button><button onClick={() => decide(row.report.id, 'rejeter')} className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white"><X className="h-3 w-3" /> Rejeter</button></>}</div></div>)}</div>
      </section>

      {pdfReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 print:hidden">
          <div className="flex max-h-[94vh] w-full max-w-6xl flex-col rounded-xl bg-white shadow-2xl">
            <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-bold text-slate-900">Examen du rapport PDF</h3>
                <p className="text-xs text-slate-500">{pdfReport.etablissement?.nom || 'Etablissement'} - {REPORT_TYPE_LABELS[reportTypeOf(pdfReport)]} - {pdfReport.report?.anneeScolaire}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={printPdfReport} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-bold text-white">
                  <Printer className="h-4 w-4" /> Imprimer
                </button>
                <button onClick={printPdfReport} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white">
                  <Download className="h-4 w-4" /> Telecharger PDF
                </button>
                <button onClick={() => exportExcelReport(pdfReport)} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white">
                  <FileSpreadsheet className="h-4 w-4" /> Télécharger Excel
                </button>
                <button onClick={() => setPdfReport(null)} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700">
                  <X className="h-4 w-4" /> Fermer
                </button>
              </div>
            </div>
            <div className="overflow-auto bg-slate-100 p-5">
              <div id="annual-report-pdf">
                <AnnualReportPdfPreview row={pdfReport} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
