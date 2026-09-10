import { and, eq } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { moduleSubmissions } from '../db/schema.ts';
import { AuthRequest } from '../middleware/auth.ts';
import { DSE_ROLES, LOCAL_SCHOOL_ROLES, ROLES, SUPER_ADMIN_ROLES, hasAnyRole } from '../lib/roles.ts';

export type ModuleWorkflowAction = 'save' | 'submit';

export function isSchoolDataWriter(role?: string | null): boolean {
  return hasAnyRole(role, [...DSE_ROLES, ...LOCAL_SCHOOL_ROLES]);
}

export function workflowStatusForSave(requester: AuthRequest['user'], action: ModuleWorkflowAction): string {
  if (hasAnyRole(requester?.role, [...SUPER_ADMIN_ROLES, ...DSE_ROLES])) return 'Valide';
  if (action === 'submit' && hasAnyRole(requester?.role, [ROLES.SECRETAIRE_ADMIN, ROLES.SECRETAIRE_ADMIN_LEGACY])) {
    return 'Soumis au proviseur';
  }
  if (action === 'submit') return 'Soumis au DSE';
  return 'Brouillon';
}

export async function saveModuleWorkflow(options: {
  module: string;
  recordId: number;
  etablissementId: number;
  requester: AuthRequest['user'];
  action?: ModuleWorkflowAction;
  commentaire?: string | null;
}) {
  const action = options.action || 'save';
  const existing = await db.select().from(moduleSubmissions).where(and(
    eq(moduleSubmissions.module, options.module),
    eq(moduleSubmissions.recordId, options.recordId)
  )).limit(1);
  const statut = workflowStatusForSave(options.requester, action);
  const submitted = action === 'submit';
  const values = {
    module: options.module,
    recordId: options.recordId,
    etablissementId: options.etablissementId,
    statut,
    createdById: existing[0]?.createdById || options.requester?.id || null,
    submittedById: submitted ? options.requester?.id || null : existing[0]?.submittedById || null,
    reviewedById: null,
    commentaire: options.commentaire || null,
    updatedAt: new Date(),
    submittedAt: submitted ? new Date() : existing[0]?.submittedAt || null,
    reviewedAt: null,
  };

  if (existing.length > 0) {
    return (await db.update(moduleSubmissions).set(values).where(eq(moduleSubmissions.id, existing[0].id)).returning())[0];
  }
  return (await db.insert(moduleSubmissions).values({ ...values, createdAt: new Date() }).returning())[0];
}

export async function attachModuleWorkflow<T extends Record<string, any>>(rows: T[], module: string): Promise<(T & {
  workflowStatus: string;
  workflowComment: string | null;
})[]> {
  if (rows.length === 0) return [];
  const workflows = await db.select().from(moduleSubmissions).where(eq(moduleSubmissions.module, module));
  const byRecord = new Map(workflows.map((workflow) => [workflow.recordId, workflow]));
  return rows.map((row) => {
    const workflow = row.id ? byRecord.get(Number(row.id)) : undefined;
    return {
      ...row,
      workflowStatus: workflow?.statut || (row.id ? 'Non soumis' : 'Non renseigne'),
      workflowComment: workflow?.commentaire || null,
    };
  });
}
