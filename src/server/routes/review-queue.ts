import { and, eq, inArray } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { Router, type Response } from 'express';
import { db } from '../../db/index.ts';
import {
  annualReports,
  constructions,
  etablissements,
  effectifs,
  incidents,
  infrastructures,
  moduleSubmissions,
  mobilier,
  tice,
  users,
  wash,
} from '../../db/schema.ts';
import { requireAuth, type AuthRequest } from '../../middleware/auth.ts';
import { DSE_ROLES, LOCAL_SCHOOL_ROLES, hasAnyRole } from '../../lib/roles.ts';

function requireDse(req: AuthRequest, res: Response): boolean {
  if (!req.user || !hasAnyRole(req.user.role, DSE_ROLES)) {
    res.status(403).json({ error: 'Accès refusé : la file d’attente est réservée au Directeur DSE.' });
    return false;
  }
  return true;
}

async function loadModuleRecord(module: string, recordId: number): Promise<unknown> {
  switch (module) {
    case 'infrastructures': return (await db.select().from(infrastructures).where(eq(infrastructures.id, recordId)).limit(1))[0] || null;
    case 'effectifs': return (await db.select().from(effectifs).where(eq(effectifs.id, recordId)).limit(1))[0] || null;
    case 'mobilier': return (await db.select().from(mobilier).where(eq(mobilier.id, recordId)).limit(1))[0] || null;
    case 'constructions': return (await db.select().from(constructions).where(eq(constructions.id, recordId)).limit(1))[0] || null;
    case 'incidents': return (await db.select().from(incidents).where(eq(incidents.id, recordId)).limit(1))[0] || null;
    case 'wash': return (await db.select().from(wash).where(eq(wash.id, recordId)).limit(1))[0] || null;
    case 'tice': return (await db.select().from(tice).where(eq(tice.id, recordId)).limit(1))[0] || null;
    default: return null;
  }
}

export function createReviewQueueRouter(): Router {
  const router = Router();

  router.get('/api/review-queue', requireAuth, async (req: AuthRequest, res) => {
    if (!requireDse(req, res)) return;
    try {
      const [submissions, reports] = await Promise.all([
        db.select({
          id: moduleSubmissions.id,
          module: moduleSubmissions.module,
          recordId: moduleSubmissions.recordId,
          etablissementId: moduleSubmissions.etablissementId,
          statut: moduleSubmissions.statut,
          submittedAt: moduleSubmissions.submittedAt,
          commentaire: moduleSubmissions.commentaire,
          etablissementNom: etablissements.nom,
          etablissementType: etablissements.type,
          arrondissement: etablissements.arrondissement,
          agentNom: users.nom,
          agentPrenom: users.prenom,
          agentEmail: users.email,
        }).from(moduleSubmissions)
          .leftJoin(etablissements, eq(moduleSubmissions.etablissementId, etablissements.id))
          .leftJoin(users, eq(moduleSubmissions.submittedById, users.id))
          .where(eq(moduleSubmissions.statut, 'Soumis au DSE')),
        db.select({
          id: annualReports.id,
          etablissementId: annualReports.etablissementId,
          anneeScolaire: annualReports.anneeScolaire,
          typeRapport: annualReports.typeRapport,
          statut: annualReports.statut,
          donnees: annualReports.donnees,
          submittedAt: annualReports.submittedAt,
          etablissementNom: etablissements.nom,
          etablissementType: etablissements.type,
          arrondissement: etablissements.arrondissement,
          agentNom: users.nom,
          agentPrenom: users.prenom,
          agentEmail: users.email,
        }).from(annualReports)
          .leftJoin(etablissements, eq(annualReports.etablissementId, etablissements.id))
          .leftJoin(users, eq(annualReports.submittedById, users.id))
          .where(eq(annualReports.statut, 'Soumis au DSE')),
      ]);

      const items = await Promise.all([
        ...submissions.map(async (submission) => ({
          id: `module-${submission.id}`,
          kind: 'module' as const,
          module: submission.module,
          recordId: submission.recordId,
          etablissementId: submission.etablissementId,
          etablissementNom: submission.etablissementNom,
          etablissementType: submission.etablissementType,
          arrondissement: submission.arrondissement,
          agent: { nom: submission.agentNom, prenom: submission.agentPrenom, email: submission.agentEmail },
          submittedAt: submission.submittedAt,
          statut: submission.statut,
          commentaire: submission.commentaire,
          donnees: await loadModuleRecord(submission.module, submission.recordId),
        })),
        ...reports.map((report) => ({
          id: `report-${report.id}`,
          kind: 'annual-report' as const,
          module: report.typeRapport === 'entree' ? 'Rapport de rentrée' : 'Rapport de sortie',
          recordId: report.id,
          etablissementId: report.etablissementId,
          etablissementNom: report.etablissementNom,
          etablissementType: report.etablissementType,
          arrondissement: report.arrondissement,
          anneeScolaire: report.anneeScolaire,
          agent: { nom: report.agentNom, prenom: report.agentPrenom, email: report.agentEmail },
          submittedAt: report.submittedAt,
          statut: report.statut,
          donnees: report.donnees,
        })),
      ]);

      items.sort((left, right) => {
        const leftTime = left.submittedAt ? left.submittedAt.getTime() : Number.MAX_SAFE_INTEGER;
        const rightTime = right.submittedAt ? right.submittedAt.getTime() : Number.MAX_SAFE_INTEGER;
        return leftTime - rightTime;
      });
      res.json(items);
    } catch (error: unknown) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Impossible de charger la file d’attente.' });
    }
  });

  router.get('/api/rejections', requireAuth, async (req: AuthRequest, res) => {
    const isDse = hasAnyRole(req.user?.role, DSE_ROLES);
    const isSchoolAgent = hasAnyRole(req.user?.role, LOCAL_SCHOOL_ROLES);
    if (!req.user || (!isDse && !isSchoolAgent)) {
      res.status(403).json({ error: 'Accès refusé : seuls la DSE et les agents d’établissement peuvent consulter les rejets.' });
      return;
    }
    if (!isDse && !req.user.etablissementId) {
      res.json([]);
      return;
    }

    try {
      const submitter = alias(users, 'rejection_submitter');
      const reviewer = alias(users, 'rejection_reviewer');
      const moduleFilter = inArray(moduleSubmissions.statut, ['A corriger', 'Rejete']);
      const reportFilter = inArray(annualReports.statut, ['Rejete', 'A corriger']);
      const [submissions, reports] = await Promise.all([
        db.select({
          id: moduleSubmissions.id,
          module: moduleSubmissions.module,
          recordId: moduleSubmissions.recordId,
          etablissementId: moduleSubmissions.etablissementId,
          statut: moduleSubmissions.statut,
          commentaire: moduleSubmissions.commentaire,
          rejectedAt: moduleSubmissions.reviewedAt,
          etablissementNom: etablissements.nom,
          etablissementType: etablissements.type,
          arrondissement: etablissements.arrondissement,
          agentNom: submitter.nom,
          agentPrenom: submitter.prenom,
          agentEmail: submitter.email,
          reviewerNom: reviewer.nom,
          reviewerPrenom: reviewer.prenom,
          reviewerEmail: reviewer.email,
        }).from(moduleSubmissions)
          .leftJoin(etablissements, eq(moduleSubmissions.etablissementId, etablissements.id))
          .leftJoin(submitter, eq(moduleSubmissions.submittedById, submitter.id))
          .leftJoin(reviewer, eq(moduleSubmissions.reviewedById, reviewer.id))
          .where(isDse ? moduleFilter : and(moduleFilter, eq(moduleSubmissions.etablissementId, req.user.etablissementId!))),
        db.select({
          id: annualReports.id,
          etablissementId: annualReports.etablissementId,
          anneeScolaire: annualReports.anneeScolaire,
          typeRapport: annualReports.typeRapport,
          statut: annualReports.statut,
          donnees: annualReports.donnees,
          commentaireRejet: annualReports.commentaireRejet,
          rejectedAt: annualReports.updatedAt,
          etablissementNom: etablissements.nom,
          etablissementType: etablissements.type,
          arrondissement: etablissements.arrondissement,
          agentNom: submitter.nom,
          agentPrenom: submitter.prenom,
          agentEmail: submitter.email,
          reviewerNom: reviewer.nom,
          reviewerPrenom: reviewer.prenom,
          reviewerEmail: reviewer.email,
        }).from(annualReports)
          .leftJoin(etablissements, eq(annualReports.etablissementId, etablissements.id))
          .leftJoin(submitter, eq(annualReports.submittedById, submitter.id))
          .leftJoin(reviewer, eq(annualReports.validatedById, reviewer.id))
          .where(isDse ? reportFilter : and(reportFilter, eq(annualReports.etablissementId, req.user.etablissementId!))),
      ]);

      const items = await Promise.all([
        ...submissions.map(async (submission) => ({
          id: `module-${submission.id}`,
          kind: 'module' as const,
          module: submission.module,
          recordId: submission.recordId,
          etablissementId: submission.etablissementId,
          etablissementNom: submission.etablissementNom,
          etablissementType: submission.etablissementType,
          arrondissement: submission.arrondissement,
          agent: { nom: submission.agentNom, prenom: submission.agentPrenom, email: submission.agentEmail },
          reviewer: { nom: submission.reviewerNom, prenom: submission.reviewerPrenom, email: submission.reviewerEmail },
          rejectedAt: submission.rejectedAt,
          statut: submission.statut,
          motif: submission.commentaire,
          donnees: await loadModuleRecord(submission.module, submission.recordId),
        })),
        ...reports.map((report) => ({
          id: `report-${report.id}`,
          kind: 'annual-report' as const,
          module: report.typeRapport === 'entree' ? 'Rapport de rentrée' : 'Rapport de sortie',
          recordId: report.id,
          etablissementId: report.etablissementId,
          etablissementNom: report.etablissementNom,
          etablissementType: report.etablissementType,
          arrondissement: report.arrondissement,
          anneeScolaire: report.anneeScolaire,
          agent: { nom: report.agentNom, prenom: report.agentPrenom, email: report.agentEmail },
          reviewer: { nom: report.reviewerNom, prenom: report.reviewerPrenom, email: report.reviewerEmail },
          rejectedAt: report.rejectedAt,
          statut: report.statut,
          motif: report.commentaireRejet,
          donnees: report.donnees,
        })),
      ]);
      items.sort((left, right) => {
        const leftTime = left.rejectedAt ? left.rejectedAt.getTime() : 0;
        const rightTime = right.rejectedAt ? right.rejectedAt.getTime() : 0;
        return rightTime - leftTime;
      });
      res.json(items);
    } catch (error: unknown) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Impossible de charger les rejets.' });
    }
  });

  return router;
}
