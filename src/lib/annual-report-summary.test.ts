import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  annualReportYears,
  isAnnualReportDashboardRow,
  summarizeAnnualReports,
  type AnnualReportDashboardRow,
} from './annual-report-summary.ts';

function row(options: {
  id: number;
  schoolId: number;
  year?: string;
  schoolType?: string;
  reportType?: string;
  status?: string;
  data?: Record<string, unknown>;
}): AnnualReportDashboardRow {
  return {
    report: {
      id: options.id,
      etablissementId: options.schoolId,
      anneeScolaire: options.year || '2025-2026',
      typeRapport: options.reportType || 'entree',
      statut: options.status || 'Soumis au DSE',
      donnees: options.data || {},
    },
    etablissement: {
      id: options.schoolId,
      nom: `Établissement ${options.schoolId}`,
      type: options.schoolType || 'Primaire',
    },
  };
}

test('annual report summary separates school types, report types, and workflow statuses', () => {
  const summary = summarizeAnnualReports([
    row({
      id: 1,
      schoolId: 11,
      data: { classes: 4, filles: 80, garcons: 70, enseignantsEnClasse: 6 },
    }),
    row({
      id: 2,
      schoolId: 12,
      schoolType: 'Secondaire',
      data: {
        classes: { '6e': 2, '5e': 2 },
        premierCycle: { '6e': { filles: 30, garcons: 20 } },
        enseignants: { hommes: 4, femmes: 5 },
      },
    }),
    row({ id: 3, schoolId: 11, reportType: 'fin_cycle', status: 'Valide', data: {
      cep: { candidatsFilles: 10, candidatsGarcons: 8, admisFilles: 8, admisGarcons: 6 },
    } }),
    row({ id: 4, schoolId: 13, status: 'Brouillon' }),
    row({ id: 5, schoolId: 14, schoolType: 'Secondaire', reportType: 'fin_cycle', status: 'Rejete' }),
    row({ id: 6, schoolId: 15, year: '2024-2025' }),
  ], '2025-2026');

  assert.equal(summary.totalReports, 4);
  assert.equal(summary.primarySchools, 1);
  assert.equal(summary.secondarySchools, 2);
  assert.equal(summary.entryReports, 2);
  assert.equal(summary.finalReports, 2);
  assert.equal(summary.validatedReports, 1);
  assert.equal(summary.awaitingReviewReports, 2);
  assert.equal(summary.rejectedReports, 1);
  assert.deepEqual(summary.enrollment, {
    girls: 110,
    boys: 90,
    students: 200,
    classes: 8,
    teachers: 15,
  });
  assert.deepEqual(summary.examResults, [
    { exam: 'CEP', candidates: 18, admitted: 14, rate: 78 },
  ]);
});

test('secondary exam outcomes use only validated final-cycle reports', () => {
  const summary = summarizeAnnualReports([
    row({
      id: 1,
      schoolId: 22,
      schoolType: 'Secondaire',
      reportType: 'fin_cycle',
      status: 'Valide',
      data: { bepc: { candidatsFilles: 20, candidatsGarcons: 30, admisFilles: 16, admisGarcons: 21 } },
    }),
    row({
      id: 2,
      schoolId: 23,
      schoolType: 'Secondaire',
      reportType: 'fin_cycle',
      status: 'Soumis au DSE',
      data: { bepc: { candidatsFilles: 100, candidatsGarcons: 100, admisFilles: 100, admisGarcons: 100 } },
    }),
  ], '2025-2026');

  assert.deepEqual(summary.examResults, [
    { exam: 'BEPC', candidates: 50, admitted: 37, rate: 74 },
  ]);
});

test('annual report response validation and available years exclude drafts', () => {
  const transmitted = row({ id: 1, schoolId: 1 });
  const draft = row({ id: 2, schoolId: 2, year: '2026-2027', status: 'Brouillon' });
  assert.equal(isAnnualReportDashboardRow(transmitted), true);
  assert.equal(isAnnualReportDashboardRow({ report: null, etablissement: null }), false);
  assert.deepEqual(annualReportYears([draft, transmitted]), ['2025-2026']);
});
