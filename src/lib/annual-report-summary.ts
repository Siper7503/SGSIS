export interface AnnualReportDashboardRow {
  report: {
    id: number;
    etablissementId: number;
    anneeScolaire: string;
    typeRapport: string;
    statut: string;
    donnees: Record<string, unknown>;
    submittedAt?: string | null;
  };
  etablissement: {
    id: number;
    nom: string;
    type: string;
    arrondissement?: string | null;
  } | null;
}

export interface AnnualReportSummary {
  totalReports: number;
  primarySchools: number;
  secondarySchools: number;
  entryReports: number;
  finalReports: number;
  validatedReports: number;
  awaitingReviewReports: number;
  rejectedReports: number;
  schoolTypeData: Array<{
    type: string;
    rentree: number;
    finCycle: number;
  }>;
  enrollment: {
    girls: number;
    boys: number;
    students: number;
    classes: number;
    teachers: number;
  };
  enrollmentByType: Array<{
    type: string;
    girls: number;
    boys: number;
    students: number;
    classes: number;
    teachers: number;
  }>;
  statusData: Array<{ status: string; count: number }>;
  examResults: Array<{
    exam: string;
    candidates: number;
    admitted: number;
    rate: number;
  }>;
}

const REPORT_TYPES = {
  entry: 'entree',
  final: 'fin_cycle',
} as const;

const EXAMS = [
  { key: 'bepc', label: 'BEPC' },
  { key: 'bep', label: 'BEP' },
  { key: 'cqp', label: 'CQP' },
  { key: 'bac', label: 'Baccalauréat' },
] as const;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function numberValue(value: unknown): number {
  const number = Number(value ?? 0);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function sumRecordValues(value: unknown): number {
  return Object.values(asRecord(value)).reduce<number>((sum, item) => sum + numberValue(item), 0);
}

function sumCycle(value: unknown, gender: 'filles' | 'garcons'): number {
  return Object.values(asRecord(value)).reduce<number>(
    (sum, item) => sum + numberValue(asRecord(item)[gender]),
    0,
  );
}

function normalizedStatus(status: string): string {
  const normalized = status.trim().toLocaleLowerCase('fr');
  if (normalized === 'rejete' || normalized === 'rejeté') return 'Rejeté';
  if (normalized === 'valide' || normalized === 'validé') return 'Validé';
  return status.trim() || 'Inconnu';
}

function isSubmitted(row: AnnualReportDashboardRow): boolean {
  return normalizedStatus(row.report.statut) !== 'Brouillon';
}

function isRejected(row: AnnualReportDashboardRow): boolean {
  return normalizedStatus(row.report.statut) === 'Rejeté';
}

function isValidated(row: AnnualReportDashboardRow): boolean {
  return normalizedStatus(row.report.statut) === 'Validé';
}

function schoolType(row: AnnualReportDashboardRow): 'Primaire' | 'Secondaire' | null {
  if (row.etablissement?.type.toLocaleLowerCase('fr').includes('primaire')) return 'Primaire';
  if (row.etablissement?.type.toLocaleLowerCase('fr').includes('secondaire')) return 'Secondaire';
  return null;
}

export function isAnnualReportDashboardRow(value: unknown): value is AnnualReportDashboardRow {
  const row = asRecord(value);
  const report = asRecord(row.report);
  const establishment = row.etablissement;
  return typeof report.id === 'number' &&
    typeof report.etablissementId === 'number' &&
    typeof report.anneeScolaire === 'string' &&
    typeof report.typeRapport === 'string' &&
    typeof report.statut === 'string' &&
    report.donnees !== null &&
    typeof report.donnees === 'object' &&
    !Array.isArray(report.donnees) &&
    (establishment === null || (
      typeof establishment === 'object' &&
      !Array.isArray(establishment) &&
      typeof asRecord(establishment).id === 'number' &&
      typeof asRecord(establishment).nom === 'string' &&
      typeof asRecord(establishment).type === 'string'
    ));
}

export function annualReportYears(rows: AnnualReportDashboardRow[]): string[] {
  return [...new Set(rows.filter(isSubmitted).map((row) => row.report.anneeScolaire))]
    .sort((left, right) => right.localeCompare(left, 'fr'));
}

export function summarizeAnnualReports(
  rows: AnnualReportDashboardRow[],
  schoolYear: string,
): AnnualReportSummary {
  const reports = rows.filter((row) => row.report.anneeScolaire === schoolYear && isSubmitted(row));
  const primarySchools = new Set<number>();
  const secondarySchools = new Set<number>();
  const entrySchoolIds = {
    Primaire: new Set<number>(),
    Secondaire: new Set<number>(),
  };
  const finalSchoolIds = {
    Primaire: new Set<number>(),
    Secondaire: new Set<number>(),
  };
  const enrollmentByType = {
    Primaire: { type: 'Primaire', girls: 0, boys: 0, students: 0, classes: 0, teachers: 0 },
    Secondaire: { type: 'Secondaire', girls: 0, boys: 0, students: 0, classes: 0, teachers: 0 },
  };
  const statuses = new Map<string, number>();
  const exams = new Map<string, { candidates: number; admitted: number }>();

  reports.forEach((row) => {
    const report = row.report;
    const status = normalizedStatus(report.statut);
    statuses.set(status, (statuses.get(status) || 0) + 1);
    const type = schoolType(row);
    if (!type) return;

    if (type === 'Primaire') primarySchools.add(report.etablissementId);
    else secondarySchools.add(report.etablissementId);

    const isEntryReport = report.typeRapport === REPORT_TYPES.entry;
    const isFinalReport = report.typeRapport === REPORT_TYPES.final;
    if (isEntryReport) entrySchoolIds[type].add(report.etablissementId);
    if (isFinalReport) finalSchoolIds[type].add(report.etablissementId);

    const data = asRecord(report.donnees);
    if (isEntryReport && !isRejected(row)) {
      const summary = enrollmentByType[type];
      if (type === 'Primaire') {
        summary.girls += numberValue(data.filles);
        summary.boys += numberValue(data.garcons);
        summary.classes += numberValue(data.classes);
        summary.teachers += numberValue(data.enseignantsEnClasse);
      } else {
        const girls = sumCycle(data.premierCycle, 'filles') + sumCycle(data.secondCycle, 'filles');
        const boys = sumCycle(data.premierCycle, 'garcons') + sumCycle(data.secondCycle, 'garcons');
        summary.girls += girls;
        summary.boys += boys;
        summary.classes += sumRecordValues(data.classes);
        const teachers = asRecord(data.enseignants);
        summary.teachers += numberValue(teachers.hommes) + numberValue(teachers.femmes);
      }
    }

    if (!isFinalReport || !isValidated(row)) return;
    if (data.modele === 'rapport-sortie-v1') {
      const exitData = asRecord(data.rapportSortie);
      const results = Array.isArray(exitData.resultatsScolaires) ? exitData.resultatsScolaires.map(asRecord) : [];
      const candidates = results.reduce((sum, result) => sum + numberValue(result.effectifExamine), 0);
      const admitted = results.reduce((sum, result) => sum + numberValue(result.fillesAdmis) + numberValue(result.garconsAdmis), 0);
      if (candidates || admitted) exams.set('Bilan scolaire', { candidates, admitted });
    } else if (type === 'Primaire') {
      const cep = asRecord(data.cep);
      const cepCandidates = numberValue(cep.candidatsFilles ?? cep.presentsFilles)
        + numberValue(cep.candidatsGarcons ?? cep.presentsGarcons);
      const cepAdmitted = numberValue(cep.admisFilles) + numberValue(cep.admisGarcons);
      const parts = ['cepAvecLibres', 'cepSansLibres'].map((key) => asRecord(data[key]));
      const partCandidates = parts.reduce((sum, part) => (
        sum + numberValue(part.candidatsFilles ?? part.presentsFilles)
        + numberValue(part.candidatsGarcons ?? part.presentsGarcons)
      ), 0);
      const partAdmitted = parts.reduce((sum, part) => (
        sum + numberValue(part.admisFilles) + numberValue(part.admisGarcons)
      ), 0);
      const candidates = cepCandidates || partCandidates;
      const admitted = cepAdmitted || partAdmitted;
      if (candidates || admitted) {
        const current = exams.get('CEP') || { candidates: 0, admitted: 0 };
        current.candidates += candidates;
        current.admitted += admitted;
        exams.set('CEP', current);
      }
    } else {
      EXAMS.forEach(({ key, label }) => {
        const exam = asRecord(data[key]);
        const candidates = numberValue(exam.candidatsFilles) + numberValue(exam.candidatsGarcons);
        const admitted = numberValue(exam.admisFilles) + numberValue(exam.admisGarcons);
        if (!candidates && !admitted) return;
        const current = exams.get(label) || { candidates: 0, admitted: 0 };
        current.candidates += candidates;
        current.admitted += admitted;
        exams.set(label, current);
      });
    }
  });

  const enrollment = Object.values(enrollmentByType).reduce(
    (total, current) => ({
      girls: total.girls + current.girls,
      boys: total.boys + current.boys,
      students: total.students + current.girls + current.boys,
      classes: total.classes + current.classes,
      teachers: total.teachers + current.teachers,
    }),
    { girls: 0, boys: 0, students: 0, classes: 0, teachers: 0 },
  );

  return {
    totalReports: reports.length,
    primarySchools: primarySchools.size,
    secondarySchools: secondarySchools.size,
    entryReports: reports.filter((row) => row.report.typeRapport === REPORT_TYPES.entry).length,
    finalReports: reports.filter((row) => row.report.typeRapport === REPORT_TYPES.final).length,
    validatedReports: reports.filter(isValidated).length,
    awaitingReviewReports: reports.filter((row) => {
      const status = normalizedStatus(row.report.statut);
      return status !== 'Brouillon' && status !== 'Rejeté' && status !== 'Validé';
    }).length,
    rejectedReports: reports.filter(isRejected).length,
    schoolTypeData: [
      { type: 'Primaire', rentree: entrySchoolIds.Primaire.size, finCycle: finalSchoolIds.Primaire.size },
      { type: 'Secondaire', rentree: entrySchoolIds.Secondaire.size, finCycle: finalSchoolIds.Secondaire.size },
    ],
    enrollment,
    enrollmentByType: Object.values(enrollmentByType).map((item) => ({
      ...item,
      students: item.girls + item.boys,
    })),
    statusData: [...statuses.entries()].map(([status, count]) => ({ status, count })),
    examResults: [...exams.entries()].map(([exam, result]) => ({
      exam,
      ...result,
      rate: result.candidates ? Math.round((result.admitted / result.candidates) * 100) : 0,
    })),
  };
}
