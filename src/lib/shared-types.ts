import type { InferSelectModel } from 'drizzle-orm';
import type { annualReports, auditLogs, etablissements, infrastructures, users, wash } from '../db/schema.ts';

type UserRecord = InferSelectModel<typeof users>;
type AnnualReportRecord = InferSelectModel<typeof annualReports>;
type AuditLogRecord = InferSelectModel<typeof auditLogs>;

export type PublicUser = Omit<UserRecord, 'passwordHash' | 'accessToken' | 'otpCode' | 'otpExpiresAt'>;
export type EstablishmentRecord = InferSelectModel<typeof etablissements>;
export type InfrastructureRecord = InferSelectModel<typeof infrastructures>;
export type WashRecord = InferSelectModel<typeof wash>;
export type AnnualReportListItem = {
  report: Pick<AnnualReportRecord, 'id' | 'etablissementId' | 'anneeScolaire' | 'typeRapport' | 'statut' | 'donnees'>;
  etablissement: Pick<EstablishmentRecord, 'id' | 'nom' | 'type' | 'arrondissement'> | null;
};
export type AuditLogView = {
  log: Pick<AuditLogRecord, 'id' | 'userId' | 'action' | 'entityType' | 'entityId' | 'details' | 'createdAt'>;
  user: PublicUser | null;
};

export interface SystemHealthResponse {
  status: 'operational' | 'degraded';
  database: 'connected' | 'unavailable';
  environment?: string;
  error?: string;
  checkedAt: string;
  security?: {
    maxLoginAttempts: number;
    lockDurationMinutes: number;
    twoFactorForAdministrators: boolean;
  };
}

export interface MyEstablishmentWashResponse {
  etablissement: EstablishmentRecord | null;
  wash: WashRecord | null;
}

export interface MyEstablishmentInfrastructureResponse {
  etablissement: EstablishmentRecord | null;
  infrastructure: InfrastructureRecord | null;
}

export type SessionUser = Partial<Pick<
  PublicUser,
  | 'id'
  | 'uid'
  | 'email'
  | 'role'
  | 'etablissementId'
  | 'arrondissement'
  | 'nom'
  | 'prenom'
  | 'telephone'
  | 'rights'
  | 'isActive'
>> & {
  photoURL?: string | null;
  displayName?: string | null;
  accessToken?: string | null;
};

export interface ApiErrorResponse {
  error: string;
  queued?: boolean;
}

export interface AuthApiResponse {
  success?: boolean;
  token?: string;
  accessToken?: string;
  user?: PublicUser;
  requires2FA?: boolean;
  simulatedEmail?: {
    id: string;
    to: string;
    subject: string;
    body: string;
    sentAt: string;
  };
  error?: string;
}

export interface SimulatedEmail {
  id: string;
  to: string;
  subject: string;
  body: string;
  sentAt: string;
}

export function isPublicUser(value: unknown): value is PublicUser {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const user = value as Record<string, unknown>;
  return typeof user.id === 'number' &&
    typeof user.uid === 'string' &&
    typeof user.email === 'string' &&
    typeof user.role === 'string';
}

export function isEstablishmentRecord(value: unknown): value is EstablishmentRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const establishment = value as Record<string, unknown>;
  return typeof establishment.id === 'number' &&
    typeof establishment.nom === 'string' &&
    typeof establishment.type === 'string' &&
    typeof establishment.arrondissement === 'string' &&
    typeof establishment.statut === 'string';
}

export function isAnnualReportListItem(value: unknown): value is AnnualReportListItem {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  const report = row.report;
  if (!report || typeof report !== 'object' || Array.isArray(report)) return false;
  const reportRecord = report as Record<string, unknown>;
  return typeof reportRecord.id === 'number' &&
    typeof reportRecord.etablissementId === 'number' &&
    typeof reportRecord.anneeScolaire === 'string' &&
    typeof reportRecord.statut === 'string' &&
    typeof reportRecord.typeRapport === 'string' &&
    Boolean(reportRecord.donnees && typeof reportRecord.donnees === 'object') &&
    (row.etablissement === null || isEstablishmentRecord(row.etablissement));
}

export function isAuditLogView(value: unknown): value is AuditLogView {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  const log = row.log;
  if (!log || typeof log !== 'object' || Array.isArray(log)) return false;
  const logRecord = log as Record<string, unknown>;
  return typeof logRecord.id === 'number' &&
    typeof logRecord.action === 'string' &&
    typeof logRecord.entityType === 'string' &&
    (row.user === null || isPublicUser(row.user));
}

export function isSystemHealthResponse(value: unknown): value is SystemHealthResponse {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const health = value as Record<string, unknown>;
  return (health.status === 'operational' || health.status === 'degraded') &&
    (health.database === 'connected' || health.database === 'unavailable') &&
    typeof health.checkedAt === 'string';
}

export function isMyEstablishmentWashResponse(value: unknown): value is MyEstablishmentWashResponse {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  const washRecord = result.wash;
  return (result.etablissement === null || isEstablishmentRecord(result.etablissement)) &&
    (washRecord === null || (
      Boolean(washRecord) &&
      typeof washRecord === 'object' &&
      !Array.isArray(washRecord) &&
      typeof (washRecord as Record<string, unknown>).id === 'number' &&
      typeof (washRecord as Record<string, unknown>).etablissementId === 'number'
    ));
}

export function isMyEstablishmentInfrastructureResponse(value: unknown): value is MyEstablishmentInfrastructureResponse {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  const infrastructure = result.infrastructure;
  return (result.etablissement === null || isEstablishmentRecord(result.etablissement)) &&
    (infrastructure === null || (
      Boolean(infrastructure) &&
      typeof infrastructure === 'object' &&
      !Array.isArray(infrastructure) &&
      typeof (infrastructure as Record<string, unknown>).id === 'number' &&
      typeof (infrastructure as Record<string, unknown>).etablissementId === 'number'
    ));
}

export function apiErrorMessage(value: unknown, fallback: string): string {
  if (value && typeof value === 'object' && 'error' in value && typeof value.error === 'string') {
    return value.error;
  }
  return fallback;
}

export function isSessionUser(value: unknown): value is SessionUser {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const user = value as Record<string, unknown>;
  return (
    typeof user.uid === 'string' &&
    (user.id === undefined || typeof user.id === 'number') &&
    (user.etablissementId === undefined || user.etablissementId === null || typeof user.etablissementId === 'number') &&
    (user.isActive === undefined || typeof user.isActive === 'boolean') &&
    (user.email === undefined || typeof user.email === 'string') &&
    (user.role === undefined || typeof user.role === 'string') &&
    ['arrondissement', 'nom', 'prenom', 'telephone', 'rights', 'photoURL', 'displayName', 'accessToken']
      .every((key) => user[key] === undefined || user[key] === null || typeof user[key] === 'string')
  );
}
