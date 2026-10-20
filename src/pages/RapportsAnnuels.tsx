import React, { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '../lib/api.ts';
import { useAuth } from '../components/AuthProvider.tsx';
import { DGSS_ROLES, DSE_ROLES, LOCAL_SCHOOL_ROLES, ROLES, SUPER_ADMIN_ROLES, hasAnyRole } from '../lib/roles.ts';
import { BarChart, Bar, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Check, Download, Eye, FileSpreadsheet, FileText, Pencil, Printer, Save, Send, X, Plus, Trash2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { DEFAULT_SCHOOL_YEAR, SCHOOL_YEARS } from '../lib/schoolYears.ts';
import appLogo from '../../assets/sgsis-logo.png';
import { emptyAnnualReportComplement, mergeAnnualReportComplement } from '../lib/annual-report-template.ts';
import { emptyAnnualExitReport, mergeAnnualExitReport } from '../lib/annual-exit-report-template.ts';

const CLASS_LEVELS = ['6e', '5e', '4e', '3e', '2ndeA', '2ndeC', '1ereA', '1ereD', 'TleA', 'TleD'];
const CYCLE_LEVELS = ['6e', '5e', '4e', '3e'];
const SECOND_CYCLE_LEVELS = ['2ndeA', '2ndeC', '1ereA', '1ereD', 'TleA', 'TleD'];
const REPORT_TYPES = ['entree', 'fin_cycle'] as const;
type ReportType = typeof REPORT_TYPES[number];
const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  entree: 'Rapport de rentrée',
  fin_cycle: 'Rapport de sortie',
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
  cepSansLibres: { presentsFilles: 0, presentsGarcons: 0, admisFilles: 0, admisGarcons: 0 },
  rapportSortie: emptyAnnualExitReport(),
} : {
  classes: Object.fromEntries(CLASS_LEVELS.map((level) => [level, 0])),
  premierCycle: Object.fromEntries(CYCLE_LEVELS.map((level) => [level, { filles: 0, garcons: 0 }])),
  secondCycle: Object.fromEntries(SECOND_CYCLE_LEVELS.map((level) => [level, { filles: 0, garcons: 0 }])),
  enseignants: { hommes: 0, femmes: 0 },
  bepc: { candidatsFilles: 0, candidatsGarcons: 0, admisFilles: 0, admisGarcons: 0 },
  bep: { candidatsFilles: 0, candidatsGarcons: 0, admisFilles: 0, admisGarcons: 0 },
  cqp: { candidatsFilles: 0, candidatsGarcons: 0, admisFilles: 0, admisGarcons: 0 },
  bac: { candidatsFilles: 0, candidatsGarcons: 0, admisFilles: 0, admisGarcons: 0 },
  rapportComplet: emptyAnnualReportComplement(),
  rapportSortie: emptyAnnualExitReport(),
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
      rapportSortie: mergeAnnualExitReport(source.rapportSortie),
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
    rapportComplet: mergeAnnualReportComplement(source.rapportComplet),
    rapportSortie: mergeAnnualExitReport(source.rapportSortie),
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

function escapeHtml(value: string) {
  const entities: Record<string, string> = {
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  };
  return value.replace(/[&<>"']/g, (character) => entities[character] || character);
}

function sanitizeReportData(source: any, reportType: ReportType) {
  const normalized = normalizeReportData('Secondaire', source);
  if (reportType === 'fin_cycle') {
    return { modele: 'rapport-sortie-v1', rapportSortie: mergeAnnualExitReport(normalized.rapportSortie) };
  }
  const full = normalized.rapportComplet;
  const general = full.III_informationsGenerales;
  const classes = Object.fromEntries([
    ...general.postPrimaire.map((row: any) => [row.niveau, numberValue(row.nombreClasses)]),
    ...general.secondaire.map((row: any) => [row.niveau, numberValue(row.nombreClasses)]),
  ]);
  const cycleSummary = (rows: any[]) => Object.fromEntries(rows.map((row: any) => [row.niveau, {
    filles: numberValue(row.filles), garcons: numberValue(row.garcons),
  }]));
  const teachingTotal = [...full.IV_personnelEnseignant.public, ...full.IV_personnelEnseignant.prive]
    .reduce((sum: number, row: any) => sum + numberValue(row.totalPourvu), 0);
  return {
    modele: 'rapport-rentree-complet-v1',
    rapportComplet: full,
    classes,
    premierCycle: cycleSummary(general.postPrimaire),
    secondCycle: cycleSummary(general.secondaire),
    enseignants: { hommes: teachingTotal, femmes: 0 },
  };
}

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function flatten(value: any, prefix = '', output: Record<string, unknown> = {}) {
  if (Array.isArray(value)) {
    value.forEach((nested, index) => flatten(nested, prefix ? `${prefix}.${index + 1}` : String(index + 1), output));
  } else if (value && typeof value === 'object') {
    Object.entries(value).forEach(([key, nested]) => flatten(nested, prefix ? `${prefix}.${key}` : key, output));
  } else {
    output[prefix] = value ?? 0;
  }
  return output;
}

function setPath(source: any, path: string[], value: unknown) {
  const next = structuredClone(source);
  let cursor = next;
  path.slice(0, -1).forEach((part) => {
    if (!cursor[part] || typeof cursor[part] !== 'object') cursor[part] = {};
    cursor = cursor[part];
  });
  cursor[path[path.length - 1]] = value;
  return next;
}

const REPORT_FIELD_LABELS: Record<string, string> = {
  F: 'Femmes', H: 'Hommes', T: 'Total', boitPostale: 'Boîte postale',
  public: 'Établissement public', prive: 'Établissement privé',
  exerciceAnterieur: 'Exercice antérieur', exerciceEnCours: 'Exercice en cours',
  DPESFPT: 'DPESFPT', CESFPT: 'CESFPT',
};

function reportFieldLabel(value: string) {
  return REPORT_FIELD_LABELS[value] || value.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ').replace(/^./, (letter) => letter.toUpperCase());
}

function blankLike(value: any): any {
  if (Array.isArray(value)) return [];
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, blankLike(nested)]));
  if (typeof value === 'number') return 0;
  if (typeof value === 'boolean') return false;
  return '';
}

function setNestedValue(source: any, path: string[], value: unknown): any {
  const next = structuredClone(source);
  let cursor = next;
  path.slice(0, -1).forEach((part) => { cursor = cursor[part]; });
  cursor[path[path.length - 1]] = value;
  return next;
}

function DynamicReportFields({ value, path, onChange }: { value: any; path: string[]; onChange: (path: string[], value: unknown) => void }) {
  if (Array.isArray(value)) {
    const isObjectList = value.some((item) => item && typeof item === 'object' && !Array.isArray(item));
    const tableRows = isObjectList && value.every((item) => item && typeof item === 'object' && !Array.isArray(item)
      && Object.values(item).every((cell) => cell === null || ['string', 'number', 'boolean'].includes(typeof cell)));
    if (tableRows) {
      const columns = Object.keys(value[0] || {});
      return (
        <div className="space-y-3">
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full border-collapse text-xs">
              <thead><tr className="bg-slate-100">{columns.map((key) => <th key={key} className="border-b border-r border-slate-200 px-3 py-2 text-left font-bold text-slate-700">{reportFieldLabel(key)}</th>)}<th className="border-b border-slate-200 px-3 py-2" /></tr></thead>
              <tbody>{value.map((item, rowIndex) => <tr key={`${path.join('.')}-${rowIndex}`} className="align-top odd:bg-white even:bg-slate-50">{columns.map((key) => {
                const cell = item[key];
                const multiline = /observation|commentaire|precisions|difficultes|solutions|besoins|mouvements/i.test(key);
                const calculated = /^total|^tauxReussite$/i.test(key);
                return <td key={key} className="min-w-32 border-r border-slate-100 p-1.5">{typeof cell === 'boolean'
                  ? <input type="checkbox" checked={cell} onChange={(event) => onChange([...path, String(rowIndex), key], event.target.checked)} aria-label={reportFieldLabel(key)} />
                  : typeof cell === 'number'
                    ? <input type="number" min="0" value={cell} readOnly={calculated} onChange={(event) => onChange([...path, String(rowIndex), key], numberValue(event.target.value))} className="w-24 rounded border border-slate-200 px-2 py-1.5 read-only:bg-slate-100 read-only:text-slate-500" aria-label={reportFieldLabel(key)} />
                    : multiline
                      ? <textarea value={String(cell ?? '')} onChange={(event) => onChange([...path, String(rowIndex), key], event.target.value)} rows={2} className="min-w-40 rounded border border-slate-200 px-2 py-1.5" aria-label={reportFieldLabel(key)} />
                      : <input value={String(cell ?? '')} onChange={(event) => onChange([...path, String(rowIndex), key], event.target.value)} className="min-w-28 rounded border border-slate-200 px-2 py-1.5" aria-label={reportFieldLabel(key)} />}</td>;
              })}<td className="px-2 py-1.5"><button type="button" disabled={value.length <= 1} onClick={() => onChange(path, value.filter((_: unknown, index: number) => index !== rowIndex))} className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30" aria-label="Supprimer cette ligne"><Trash2 className="h-4 w-4" /></button></td></tr>)}</tbody>
            </table>
          </div>
          <button type="button" onClick={() => onChange(path, [...value, blankLike(value[0])])} className="inline-flex items-center gap-1 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs font-bold text-slate-600 hover:border-blue-300 hover:text-blue-700"><Plus className="h-3.5 w-3.5" /> Ajouter une ligne</button>
        </div>
      );
    }
    return (
      <div className="space-y-3">
        {value.map((item, index) => (
          isObjectList ? (
            <fieldset key={`${path.join('.')}-${index}`} className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
              <div className="mb-3 flex items-center justify-between gap-3"><legend className="text-xs font-bold text-slate-700">Ligne {index + 1}{typeof item?.niveau === 'string' ? ` — ${item.niveau}` : ''}{typeof item?.discipline === 'string' ? ` — ${item.discipline}` : ''}{typeof item?.fonction === 'string' ? ` — ${item.fonction}` : ''}{typeof item?.emploi === 'string' ? ` — ${item.emploi}` : ''}{typeof item?.activite === 'string' ? ` — ${item.activite}` : ''}{typeof item?.concours === 'string' ? ` — ${item.concours}` : ''}</legend><button type="button" onClick={() => onChange(path, value.filter((_: unknown, rowIndex: number) => rowIndex !== index))} className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label="Supprimer cette ligne"><Trash2 className="h-4 w-4" /></button></div>
              <DynamicReportFields value={item} path={[...path, String(index)]} onChange={(nestedPath, next) => { const rows = [...value]; rows[index] = setNestedValue(rows[index], nestedPath.slice(path.length + 1), next); onChange(path, rows); }} />
            </fieldset>
          ) : (
            <div key={`${path.join('.')}-${index}`} className="flex items-center gap-2"><input value={String(item ?? '')} onChange={(event) => { const rows = [...value]; rows[index] = event.target.value; onChange(path, rows); }} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" /><button type="button" onClick={() => onChange(path, value.filter((_: unknown, rowIndex: number) => rowIndex !== index))} className="rounded p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label="Supprimer cette ligne"><Trash2 className="h-4 w-4" /></button></div>
          )
        ))}
        <button type="button" onClick={() => onChange(path, [...value, value.length ? blankLike(value[0]) : ''])} className="inline-flex items-center gap-1 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-xs font-bold text-slate-600 hover:border-blue-300 hover:text-blue-700"><Plus className="h-3.5 w-3.5" /> Ajouter une ligne</button>
      </div>
    );
  }

  if (value && typeof value === 'object') {
    return (
      <div className="grid gap-3 md:grid-cols-2">
        {Object.entries(value).map(([key, nested]) => {
          const label = reportFieldLabel(key);
          if (Array.isArray(nested)) return <div key={key} className="md:col-span-2"><p className="mb-2 text-xs font-bold text-slate-700">{label}</p><DynamicReportFields value={nested} path={[...path, key]} onChange={onChange} /></div>;
          if (nested && typeof nested === 'object') return <fieldset key={key} className="rounded-lg border border-slate-200 p-3 md:col-span-2"><legend className="px-1 text-xs font-bold text-slate-700">{label}</legend><DynamicReportFields value={nested} path={[...path, key]} onChange={onChange} /></fieldset>;
          if (typeof nested === 'boolean') return <label key={key} className="flex items-center gap-2 rounded-lg border border-slate-100 px-3 py-2 text-sm text-slate-700"><input type="checkbox" checked={nested} onChange={(event) => onChange([...path, key], event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-blue-600" />{label}</label>;
          const multiline = /observation|commentaire|precisions|compteRendu|difficultes|solutions|domainesAction|enseignantsParMatiere|devise/i.test(key);
          const calculated = /^total|^tauxReussite$/i.test(key);
          return <label key={key} className="block text-xs font-semibold text-slate-600">{label}{typeof nested === 'number' ? <input type="number" min="0" value={nested} readOnly={calculated} onChange={(event) => onChange([...path, key], numberValue(event.target.value))} className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm read-only:bg-slate-100 read-only:text-slate-500" /> : multiline ? <textarea value={String(nested ?? '')} onChange={(event) => onChange([...path, key], event.target.value)} rows={3} className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" /> : <input value={String(nested ?? '')} onChange={(event) => onChange([...path, key], event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />}</label>;
        })}
      </div>
    );
  }
  return null;
}

function StructuredReportPreview({ value, label }: { value: any; label?: string }) {
  if (Array.isArray(value)) {
    const isTable = value.length > 0 && value.every((item) => item && typeof item === 'object' && !Array.isArray(item)
      && Object.values(item).every((cell) => cell === null || ['string', 'number', 'boolean'].includes(typeof cell)));
    if (isTable) {
      const columns = Object.keys(value[0]);
      return <section className="mt-4"><h3 className="mb-2 text-sm font-bold">{label}</h3><table className="w-full border-collapse text-xs"><thead><tr className="bg-slate-100">{columns.map((key) => <th key={key} className="border border-slate-500 px-2 py-1 text-left">{reportFieldLabel(key)}</th>)}</tr></thead><tbody>{value.map((row, index) => <tr key={index}>{columns.map((key) => <td key={key} className="border border-slate-500 px-2 py-1">{typeof row[key] === 'boolean' ? (row[key] ? 'Oui' : 'Non') : String(row[key] ?? '')}</td>)}</tr>)}</tbody></table></section>;
    }
    return <section className="mt-4"><h3 className="mb-2 text-sm font-bold">{label}</h3>{value.map((item, index) => <StructuredReportPreview key={index} value={item} label={`${label || 'Ligne'} ${index + 1}`} />)}</section>;
  }
  if (value && typeof value === 'object') {
    return <section className="mt-4"><h3 className="mb-2 text-sm font-bold">{label}</h3><div className="space-y-3">{Object.entries(value).map(([key, nested]) => (
      nested && typeof nested === 'object'
        ? <StructuredReportPreview key={key} value={nested} label={reportFieldLabel(key)} />
        : <p key={key} className="text-xs"><strong>{reportFieldLabel(key)} :</strong> {typeof nested === 'boolean' ? (nested ? 'Oui' : 'Non') : String(nested ?? '')}</p>
    ))}</div></section>;
  }
  return <p className="text-xs"><strong>{label} :</strong> {String(value ?? '')}</p>;
}

function structuredReportHtml(value: any, label = ''): string {
  if (Array.isArray(value)) {
    const isTable = value.length > 0 && value.every((item) => item && typeof item === 'object' && !Array.isArray(item)
      && Object.values(item).every((cell) => cell === null || ['string', 'number', 'boolean'].includes(typeof cell)));
    if (isTable) {
      const columns = Object.keys(value[0]);
      return `<section><h2>${escapeHtml(label)}</h2><table><thead><tr>${columns.map((key) => `<th>${escapeHtml(reportFieldLabel(key))}</th>`).join('')}</tr></thead><tbody>${value.map((row) => `<tr>${columns.map((key) => `<td>${escapeHtml(typeof row[key] === 'boolean' ? (row[key] ? 'Oui' : 'Non') : String(row[key] ?? ''))}</td>`).join('')}</tr>`).join('')}</tbody></table></section>`;
    }
    return `<section><h2>${escapeHtml(label)}</h2>${value.map((item, index) => structuredReportHtml(item, `${label || 'Ligne'} ${index + 1}`)).join('')}</section>`;
  }
  if (value && typeof value === 'object') {
    return `<section><h2>${escapeHtml(label)}</h2>${Object.entries(value).map(([key, nested]) => (
      nested && typeof nested === 'object'
        ? structuredReportHtml(nested, reportFieldLabel(key))
        : `<p><b>${escapeHtml(reportFieldLabel(key))} :</b> ${escapeHtml(typeof nested === 'boolean' ? (nested ? 'Oui' : 'Non') : String(nested ?? ''))}</p>`
    )).join('')}</section>`;
  }
  return `<p><b>${escapeHtml(label)} :</b> ${escapeHtml(String(value ?? ''))}</p>`;
}

const COMPLETE_REPORT_SECTION_TITLES: Record<string, string> = {
  I_identification: 'I. Identification', II_localisation: 'II. Localisation', III_informationsGenerales: 'III. Informations générales sur l’établissement',
  IV_personnelEnseignant: 'IV. Personnel enseignant', V_personnelDirection: 'V. Personnel de direction', V_personnelAdministrationVieScolaire: 'V. Personnel d’administration et de la vie scolaire',
  VI_personnelsSpecifiques: 'VI. Personnels spécifiques', VII_personnelsAppuiSoutien: 'VII. Personnels d’appui et de soutien', VIII_preparationDeroulementRentree: 'VIII. Préparation et déroulement de la rentrée',
  IX_organesGestion: 'IX. Organes de gestion', X_structuresStatutaires: 'X. Organes et structures statutaires', XI_autresStructures: 'XI. Autres structures', XII_organisationPedagogique: 'XII. Organisation pédagogique',
  XIII_identificationProfesseurs: 'XIII. Identification et emploi du temps des professeurs', XIV_professeursPrincipaux: 'XIV. Professeurs principaux', XV_matieresSpecifiques: 'XV. Matières spécifiques enseignées',
  XVI_coursDuSoir: 'XVI. Situation des cours du soir', XVII_situationFinancierePublic: 'XVII. Situation financière (public uniquement)', XVIII_resultatsConcours: 'XVIII. Résultats aux concours', XIX_difficultesSolutions: 'XIX. Difficultés rencontrées et solutions envisagées',
};

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
  const isFullTemplateReport = data.modele === 'rapport-rentree-complet-v1';
  const isFullExitReport = data.modele === 'rapport-sortie-v1';
  const isPrimary = establishment.type === 'Primaire' && !isFullTemplateReport && !isFullExitReport;
  const totalStudents = isPrimary
    ? Number(data.filles || 0) + Number(data.garcons || 0)
    : totalCycle(data.premierCycle) + totalCycle(data.secondCycle);
  const totalClasses = isPrimary ? Number(data.classes || 0) : totalObjectNumbers(data.classes);
  const totalTeachers = isPrimary ? Number(data.enseignantsEnClasse || 0) : Number(data.enseignants?.hommes || 0) + Number(data.enseignants?.femmes || 0);
  const reportSections = isFullExitReport ? data.rapportSortie : data.rapportComplet;
  const completedFields = reportSections
    ? Object.entries(flatten(reportSections)).filter(([, value]) => value !== '' && value !== 0 && value !== false && value !== null && value !== undefined)
    : [];

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
          <img src={appLogo} alt="Logo SGSIS" />
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
        <h1 className="text-xl font-black uppercase tracking-wide">{isFullTemplateReport ? 'Rapport de rentrée de l’établissement' : isFullExitReport ? 'Rapport de sortie de l’année scolaire' : 'Rapport scolaire annuel'}</h1>
        <p className="mt-2 text-sm font-bold text-blue-800">{REPORT_TYPE_LABELS[reportType]}</p>
        <p className="mt-1 text-xs text-slate-500">{report.statut === 'Récapitulatif à vérifier' ? 'Vérification par l’agent avant transmission' : 'Document transmis aux Directeurs DGSS et DSE pour examen administratif'}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-lg border border-slate-300 p-3"><span className="font-bold">Etablissement : </span>{establishment.nom || 'Non renseigne'}</div>
        <div className="rounded-lg border border-slate-300 p-3"><span className="font-bold">Type : </span>{establishment.type || 'Non renseigne'}</div>
        <div className="rounded-lg border border-slate-300 p-3"><span className="font-bold">Arrondissement : </span>{establishment.arrondissement || 'Non renseigne'}</div>
        <div className="rounded-lg border border-slate-300 p-3"><span className="font-bold">Annee scolaire : </span>{report.anneeScolaire}</div>
        <div className="rounded-lg border border-slate-300 p-3"><span className="font-bold">Statut : </span>{report.statut}</div>
        <div className="rounded-lg border border-slate-300 p-3"><span className="font-bold">Date de transmission : </span>{submissionDate}</div>
      </div>

      {!isFullTemplateReport && !isFullExitReport && <><h2 className="mt-8 border-b border-slate-300 pb-2 text-sm font-black uppercase">Synthese generale</h2>
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

      </>}

      {isFullTemplateReport && <section className="mt-8">{Object.entries(data.rapportComplet).map(([key, section]) => <StructuredReportPreview key={key} value={section} label={COMPLETE_REPORT_SECTION_TITLES[key] || reportFieldLabel(key)} />)}</section>}
      {isFullExitReport && <section className="mt-8">{Object.entries(data.rapportSortie).map(([key, section]) => <StructuredReportPreview key={key} value={section} label={reportFieldLabel(key)} />)}</section>}
      {!isFullTemplateReport && !isFullExitReport && completedFields.length > 0 && <section className="mt-8">
        <h2 className="border-b border-slate-300 pb-2 text-sm font-black uppercase">{isFullTemplateReport ? 'Rapport de rentrée officiel' : isFullExitReport ? 'Bilan de sortie' : 'Complément du rapport de rentrée'}</h2>
        <table className="mt-3 w-full border-collapse text-xs"><tbody>{completedFields.map(([field, value]) => <tr key={field}><td className="w-1/2 border border-slate-500 px-2 py-1 font-semibold">{String(field).replace(/^\w+\./, '').replace(/[._]/g, ' ')}</td><td className="border border-slate-500 px-2 py-1">{String(value)}</td></tr>)}</tbody></table>
      </section>}

      <div className="mt-12 flex justify-between text-sm">
        <div><p className="font-bold underline">Agent declarant</p><p className="mt-2 text-slate-500">Signature electronique</p></div>
        <div className="text-right"><p className="font-bold underline">Administration DGSS / DSE</p><p className="mt-2 text-slate-500">Visa et examen du rapport</p></div>
      </div>
    </div>
  );
}

export default function RapportsAnnuels({ initialType = 'entree' }: { initialType?: ReportType }) {
  const { token, user } = useAuth();
  const isSuperAdmin = hasAnyRole(user?.role, SUPER_ADMIN_ROLES);
  const isDse = hasAnyRole(user?.role, DSE_ROLES);
  const isDgss = hasAnyRole(user?.role, DGSS_ROLES);
  const isProviseur = hasAnyRole(user?.role, [ROLES.PROVISEUR]);
  const isPrimaryDirector = hasAnyRole(user?.role, [ROLES.DIRECTEUR_ECOLE]);
  const canEdit = isPrimaryDirector || isProviseur;
  const canAdminExport = isSuperAdmin || isDse || isDgss;
  const canSeeReports = isSuperAdmin || isDse || isDgss || hasAnyRole(user?.role, LOCAL_SCHOOL_ROLES);
  const [etablissements, setEtablissements] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [anneeScolaire, setAnneeScolaire] = useState(DEFAULT_SCHOOL_YEAR);
  const [typeRapport, setTypeRapport] = useState<ReportType>(initialType);
  const [donnees, setDonnees] = useState<any>(emptyReport('Primaire'));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [pdfReport, setPdfReport] = useState<any | null>(null);
  const [recapOpen, setRecapOpen] = useState(false);
  const [reviewValidated, setReviewValidated] = useState(false);
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
  useEffect(() => { setTypeRapport(initialType); }, [initialType]);
  useEffect(() => { setReviewValidated(false); }, [selectedId, anneeScolaire, typeRapport, donnees]);

  useEffect(() => {
    const existing = reports.find((row) => row.report?.etablissementId === Number(selectedId) && row.report?.anneeScolaire === anneeScolaire && reportTypeOf(row) === typeRapport);
    const type = selectedEtablissement?.type || 'Primaire';
    setDonnees(normalizeReportData(type, existing?.report?.donnees));
  }, [selectedId, anneeScolaire, typeRapport, selectedEtablissement?.type, reports]);

  const setComplementValue = (path: string[], value: unknown) => setDonnees((current: any) => {
    const next = setPath(current, ['rapportComplet', ...path], value);
    const [section, group, rowIndex, field] = path;
    if (section === 'III_informationsGenerales' && ['postPrimaire', 'secondaire'].includes(group) && /^\d+$/.test(rowIndex || '')) {
      const rows = next.rapportComplet[section][group];
      const row = rows[Number(rowIndex)];
      if (row) row.total = numberValue(row.filles) + numberValue(row.garcons);
      const totals = rows.reduce((sum: any, item: any) => ({
        filles: sum.filles + numberValue(item.filles), garcons: sum.garcons + numberValue(item.garcons),
        total: sum.total + numberValue(item.total), nombreClasses: sum.nombreClasses + numberValue(item.nombreClasses),
      }), { filles: 0, garcons: 0, total: 0, nombreClasses: 0 });
      next.rapportComplet[section].recapitulatif[group] = { ...next.rapportComplet[section].recapitulatif[group], ...totals };
    }
    if (section === 'IV_personnelEnseignant' && ['public', 'prive'].includes(group) && /^\d+$/.test(rowIndex || '') && field !== 'totalPourvu') {
      const row = next.rapportComplet[section][group][Number(rowIndex)];
      row.permanentsTotal = numberValue(row.permanentsF) + numberValue(row.permanentsH);
      row.nonPermanentsTotal = numberValue(row.nonPermanentsF) + numberValue(row.nonPermanentsH);
      row.vacatairesTotal = numberValue(row.vacatairesF) + numberValue(row.vacatairesH);
      row.totalPourvu = numberValue(row.permanentsTotal) + numberValue(row.nonPermanentsTotal) + numberValue(row.vacatairesTotal);
    }
    return next;
  });
  const setExitValue = (path: string[], value: unknown) => setDonnees((current: any) => {
    const next = setPath(current, ['rapportSortie', ...path], value);
    const [group, list, rowIndex] = path;
    if (/^\d+$/.test(rowIndex || '') || (group === 'resultatsScolaires' && /^\d+$/.test(list || ''))) {
      const row = group === 'resultatsScolaires'
        ? next.rapportSortie[group][Number(list)]
        : next.rapportSortie[group]?.[list]?.[Number(rowIndex)];
      if (row && group === 'effectifsFinaux' && list === 'parNiveau') {
        row.totalInscrits = numberValue(row.fillesInscrites) + numberValue(row.garconsInscrits);
        row.totalPresents = numberValue(row.fillesPresentes) + numberValue(row.garconsPresents);
        row.totalDeparts = numberValue(row.departsFilles) + numberValue(row.departsGarcons);
      }
      if (row && group === 'resultatsScolaires') {
        row.totalAdmis = numberValue(row.fillesAdmis) + numberValue(row.garconsAdmis);
        row.totalRedoublants = numberValue(row.fillesRedoublantes) + numberValue(row.garconsRedoublants);
        row.totalExclus = numberValue(row.fillesExclues) + numberValue(row.garconsExclus);
        row.tauxReussite = row.effectifExamine ? Math.round((row.totalAdmis / row.effectifExamine) * 10000) / 100 : 0;
      }
      if (row && ['enseignants', 'administrationEtAppui'].includes(list)) row.total = numberValue(row.femmes) + numberValue(row.hommes);
    }
    return next;
  });

  const save = async (action: 'save' | 'submit') => {
    if (!token || !selectedId) return;
    if (action === 'submit' && !reviewValidated) {
      setMessage('Ouvrez le récapitulatif et validez les informations avant de transmettre le rapport.');
      return;
    }
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
          donnees: sanitizeReportData(formDonnees, typeRapport),
          action,
          validated: action === 'submit' && reviewValidated
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Erreur lors de la sauvegarde.');
      setMessage(action === 'submit' ? 'Rapport transmis pour validation.' : 'Brouillon enregistre.');
      if (action === 'submit') {
        setRecapOpen(false);
        setReviewValidated(false);
      }
      await load();
    } catch (error: any) {
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  };

  const decide = async (id: number, decision: 'approuver' | 'valider' | 'rejeter') => {
    if (!token) return;
    const commentaire = decision === 'rejeter' ? window.prompt('Indiquez le motif du rejet et les corrections attendues :') : null;
    if (decision === 'rejeter' && !commentaire?.trim()) return;
    const response = await apiFetch(`/api/annual-reports/${id}/decision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ decision, commentaire: commentaire?.trim() })
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

  const exportWordReport = (row: any) => {
    const report = row.report;
    const establishment = row.etablissement || {};
    const reportType = reportTypeOf(row);
    const reportData = normalizeReportData(establishment.type || 'Primaire', report.donnees);
    const isFullReport = reportData.modele === 'rapport-rentree-complet-v1' || reportData.modele === 'rapport-sortie-v1';
    const sections = reportType === 'entree' ? reportData.rapportComplet : reportData.rapportSortie;
    const values = isFullReport
      ? Object.entries(sections || {}).map(([key, section]) => structuredReportHtml(section, COMPLETE_REPORT_SECTION_TITLES[key] || reportFieldLabel(key))).join('')
      : `<table>${Object.entries(flatten(reportData)).filter(([key]) => key !== 'modele').map(([key, value]) => `<tr><th>${escapeHtml(key.replace(/[._]/g, ' '))}</th><td>${escapeHtml(String(value ?? ''))}</td></tr>`).join('')}</table>`;
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(REPORT_TYPE_LABELS[reportType])}</title><style>body{font-family:Arial,sans-serif;color:#172033}h1{text-align:center}h2{margin-top:24px;background:#eef2f7;padding:8px}table{border-collapse:collapse;width:100%;margin:10px 0}th,td{border:1px solid #555;padding:6px;text-align:left;vertical-align:top}th{background:#eef2f7}</style></head><body><h1>${escapeHtml(REPORT_TYPE_LABELS[reportType])}</h1><p><b>Établissement :</b> ${escapeHtml(establishment.nom || '')} | <b>Année scolaire :</b> ${escapeHtml(String(report.anneeScolaire || ''))} | <b>Statut :</b> ${escapeHtml(report.statut || '')}</p>${values}</body></html>`;
    const blob = new Blob([html], { type: 'application/msword;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `SGSIS_${reportType}_${safeFileName(establishment.nom || '')}_${safeFileName(String(report.anneeScolaire || 'annee'))}.doc`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
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
          <p className="mt-1 text-sm text-slate-500">Saisie, transmission, validation et export des rapports de rentrée et de sortie.</p>
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

      <fieldset disabled={!canEdit || (typeRapport === 'entree' && selectedEtablissement?.type !== 'Secondaire')} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm print:hidden">
        <div className="grid gap-4 md:grid-cols-4">
          <label className="text-xs font-bold text-slate-600">Année scolaire
            <select value={anneeScolaire} onChange={(event) => setAnneeScolaire(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-200 p-2 text-sm">{SCHOOL_YEARS.map((schoolYear) => <option key={schoolYear} value={schoolYear}>{schoolYear}</option>)}</select>
          </label>
          <label className="text-xs font-bold text-slate-600">Rapport
            <select value={typeRapport} onChange={(event) => setTypeRapport(event.target.value as ReportType)} className="mt-1 block w-full rounded-lg border border-slate-200 p-2 text-sm">{REPORT_TYPES.map((key) => <option key={key} value={key}>{REPORT_TYPE_LABELS[key]}</option>)}</select>
          </label>
          <label className="text-xs font-bold text-slate-600">Établissement
            <select value={selectedId} disabled={!isDse && !isSuperAdmin} onChange={(event) => setSelectedId(event.target.value)} className="mt-1 block w-full rounded-lg border border-slate-200 p-2 text-sm disabled:bg-slate-100"><option value="">Sélectionner</option>{etablissements.map((etab) => <option key={etab.id} value={etab.id}>{etab.nom} - {etab.arrondissement}</option>)}</select>
          </label>
          <div className="flex flex-wrap items-end gap-2"><button disabled={saving || !selectedId || !canEdit || (typeRapport === 'entree' && selectedEtablissement?.type !== 'Secondaire')} onClick={() => save('save')} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-50"><Save className="h-4 w-4" /> Brouillon</button><button disabled={saving || !selectedId || !canEdit || (typeRapport === 'entree' && selectedEtablissement?.type !== 'Secondaire')} onClick={() => setRecapOpen(true)} className="inline-flex items-center gap-2 rounded-lg border border-indigo-300 px-4 py-2 text-sm font-bold text-indigo-800 disabled:opacity-50"><Eye className="h-4 w-4" /> Récapitulatif</button><button disabled={saving || !selectedId || !canEdit || !reviewValidated || (typeRapport === 'entree' && selectedEtablissement?.type !== 'Secondaire')} onClick={() => save('submit')} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"><Send className="h-4 w-4" /> Transmettre</button></div>
        </div>
        {typeRapport === 'entree' && selectedEtablissement?.type === 'Secondaire' ? (
          <section className="mt-6 space-y-4">
            <div><h2 className="text-lg font-black text-slate-900">Rapport de rentrée de l’établissement</h2><p className="mt-1 text-sm text-slate-500">Formulaire basé sur le document officiel transmis. Renseignez chaque rubrique et ajoutez les lignes nécessaires dans les tableaux.</p></div>
            {Object.entries(formDonnees.rapportComplet || {}).map(([sectionKey, sectionData], index) => (
              <details key={sectionKey} open={index === 0} className="group rounded-xl border border-slate-200 bg-white">
                <summary className="cursor-pointer list-none px-4 py-3 font-bold text-slate-800 marker:hidden hover:bg-slate-50">{COMPLETE_REPORT_SECTION_TITLES[sectionKey] || reportFieldLabel(sectionKey)}</summary>
                <div className="border-t border-slate-100 p-4"><DynamicReportFields value={sectionData} path={[sectionKey]} onChange={setComplementValue} /></div>
              </details>
            ))}
          </section>
        ) : typeRapport === 'fin_cycle' && selectedEtablissement ? (
          <section className="mt-6 space-y-4">
            <div><h2 className="text-lg font-black text-slate-900">Bilan de sortie de l’année scolaire</h2><p className="mt-1 text-sm text-slate-500">Formulaire de bilan proposé dans SGSIS, en attendant un modèle officiel de rapport de sortie. Les totaux et taux sont conservés par rubrique pour faciliter leur exploitation.</p></div>
            {Object.entries(formDonnees.rapportSortie || {}).map(([sectionKey, sectionData], index) => (
              <details key={sectionKey} open={index === 0} className="group rounded-xl border border-slate-200 bg-white">
                <summary className="cursor-pointer list-none px-4 py-3 font-bold text-slate-800 marker:hidden hover:bg-slate-50">{reportFieldLabel(sectionKey)}</summary>
                <div className="border-t border-slate-100 p-4"><DynamicReportFields value={sectionData} path={[sectionKey]} onChange={setExitValue} /></div>
              </details>
            ))}
          </section>
        ) : selectedEtablissement ? (
          <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Le formulaire transmis concerne les établissements secondaires. Les anciens rapports des écoles primaires restent consultables dans l’historique.</div>
        ) : <p className="mt-6 text-sm text-slate-500">Aucun établissement rattaché à ce compte.</p>}
      </fieldset>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4"><h2 className="font-bold text-slate-900">Dossiers transmis</h2></div>
        <div className="divide-y divide-slate-100">{loading ? <p className="p-5 text-sm text-slate-500">Chargement...</p> : reports.length === 0 ? <p className="p-5 text-sm text-slate-500">Aucun rapport annuel.</p> : reports.map((row) => <div key={row.report.id} className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between"><div><p className="font-bold text-slate-900">{row.etablissement?.nom || `Etablissement #${row.report.etablissementId}`}</p><p className="text-xs text-slate-500">{row.report.anneeScolaire} · {REPORT_TYPE_LABELS[reportTypeOf(row)]} · {row.etablissement?.type} · {row.etablissement?.arrondissement}</p></div><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">{row.report.statut}</span><button onClick={() => { setPdfReport(row); setTimeout(printPdfReport, 100); }} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"><Download className="h-3 w-3" /> PDF</button><button onClick={() => exportWordReport(row)} className="inline-flex items-center gap-1 rounded-lg border border-blue-300 px-3 py-1.5 text-xs font-bold text-blue-800 hover:bg-blue-50"><FileText className="h-3 w-3" /> Word</button><button onClick={() => exportExcelReport(row)} className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 px-3 py-1.5 text-xs font-bold text-emerald-800 hover:bg-emerald-50"><FileSpreadsheet className="h-3 w-3" /> Excel</button>{isProviseur && row.report.statut === 'Soumis au proviseur' && <button onClick={() => decide(row.report.id, 'approuver')} className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white"><Check className="h-3 w-3" /> Approuver</button>}{isDse && row.report.statut === 'Soumis au DSE' && <><button onClick={() => decide(row.report.id, 'valider')} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white"><Check className="h-3 w-3" /> Valider</button><button onClick={() => decide(row.report.id, 'rejeter')} className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-bold text-white"><X className="h-3 w-3" /> Rejeter</button></>}</div></div>)}</div>
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
                <button onClick={() => exportWordReport(pdfReport)} className="inline-flex items-center gap-2 rounded-lg border border-blue-300 px-4 py-2 text-sm font-bold text-blue-800"><FileText className="h-4 w-4" /> Word</button><button onClick={() => exportExcelReport(pdfReport)} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white">
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

      {recapOpen && selectedEtablissement && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/70 p-3 sm:p-6 print:hidden">
          <div className="flex max-h-[96vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div>
                <h3 className="font-bold text-slate-900">Récapitulatif avant transmission</h3>
                <p className="text-xs text-slate-500">Relisez toutes les rubriques et corrigez les données avant de confirmer.</p>
              </div>
              <button onClick={() => setRecapOpen(false)} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700"><X className="h-4 w-4" /> Fermer</button>
            </div>
            <div className="overflow-auto bg-slate-100 p-4 sm:p-6">
              <AnnualReportPdfPreview row={{
                etablissement: selectedEtablissement,
                report: {
                  id: 'BROUILLON',
                  etablissementId: Number(selectedId),
                  anneeScolaire,
                  typeRapport,
                  statut: 'Récapitulatif à vérifier',
                  donnees: sanitizeReportData(formDonnees, typeRapport),
                  submittedAt: null,
                },
              }} />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-4">
              <button onClick={() => { setReviewValidated(false); setRecapOpen(false); }} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700"><Pencil className="h-4 w-4" /> Modifier les informations</button>
              <div className="flex flex-wrap items-center gap-2">
                {reviewValidated && <span className="inline-flex items-center gap-1 text-sm font-bold text-emerald-700"><Check className="h-4 w-4" /> Informations validées</span>}
                <button onClick={() => setReviewValidated(true)} disabled={reviewValidated} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"><Check className="h-4 w-4" /> Valider les informations</button>
                <button onClick={() => save('submit')} disabled={saving || !reviewValidated} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"><Send className="h-4 w-4" /> Transmettre à la DSE</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
