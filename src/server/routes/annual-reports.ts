import { Router, type Response } from 'express';
import { and, eq } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { annualReports, etablissements, moduleSubmissions } from '../../db/schema.ts';
import { requireAuth, type AuthRequest } from '../../middleware/auth.ts';
import {
  DGSS_ROLES,
  DSE_ROLES,
  LOCAL_SCHOOL_ROLES,
  ROLES,
  SUPER_ADMIN_ROLES,
  hasAnyRole
} from '../../lib/roles.ts';
import { isValidSchoolYear } from '../../lib/schoolYears.ts';
import { getModuleReviewDenial } from '../../lib/authorization.ts';
import { moduleDecisionStatus } from '../module-workflow.ts';

type AuditLogger = (
  userId: number | null | undefined,
  action: string,
  entityType: string,
  entityId: number | null,
  details: unknown
) => Promise<void>;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Une erreur inattendue est survenue.';
}

function isUniqueConstraintViolation(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === '23505',
  );
}

function requireAnyRole(req: AuthRequest, res: Response, allowedRoles: readonly string[], message?: string): boolean {
  if (!req.user || !hasAnyRole(req.user.role, allowedRoles)) {
    res.status(403).json({ error: message || "Accès refusé : droits insuffisants." });
    return false;
  }
  return true;
}

export function createAnnualReportsRouter(logAudit: AuditLogger): Router {
  const router = Router();

  // Annual school reports: structured data with a secondary-school approval workflow.
  router.get("/api/annual-reports", requireAuth, async (req: AuthRequest, res) => {
    if (!requireAnyRole(req, res, [...SUPER_ADMIN_ROLES, ...DSE_ROLES, ...DGSS_ROLES, ...LOCAL_SCHOOL_ROLES, ROLES.USER], "Acces refuse : vous n'avez pas acces aux rapports annuels.")) return;
    try {
      const reports = await db.select({
        report: annualReports,
        etablissement: etablissements
      }).from(annualReports).leftJoin(etablissements, eq(annualReports.etablissementId, etablissements.id));

      const visible = reports.filter((row) => {
        if (hasAnyRole(req.user?.role, [ROLES.USER])) return row.report.statut === "Valide";
        if (hasAnyRole(req.user?.role, [...SUPER_ADMIN_ROLES, ...DSE_ROLES, ...DGSS_ROLES])) return true;
        return Boolean(req.user?.etablissementId && row.report.etablissementId === req.user.etablissementId);
      });
      res.json(visible);
    } catch (error: unknown) {
      res.status(500).json({ error: errorMessage(error) });
    }
  });

  router.post("/api/annual-reports", requireAuth, async (req: AuthRequest, res) => {
    if (!requireAnyRole(req, res, LOCAL_SCHOOL_ROLES, "Acces refuse : la saisie des rapports annuels est reservee aux agents d'etablissement.")) return;
    try {
      const { etablissementId, anneeScolaire, typeRapport = "entree", donnees, action = "save" } = req.body;
      if (action === "submit" && req.body.validated !== true) {
        res.status(400).json({ error: "Le rapport doit être examiné et validé par l'agent avant sa transmission." });
        return;
      }
      const targetId = Number(etablissementId);
      const reportType = String(typeRapport);
      if (!["entree", "fin_cycle"].includes(reportType)) {
        res.status(400).json({ error: "Le type de rapport doit etre 'entree' ou 'fin_cycle'." });
        return;
      }
      if (!isValidSchoolYear(String(anneeScolaire))) {
        res.status(400).json({ error: "L'annee scolaire doit etre comprise entre 2020-2021 et 2099-2100." });
        return;
      }
      if (!targetId || !anneeScolaire || !donnees || typeof donnees !== "object") {
        res.status(400).json({ error: "L'etablissement, l'annee scolaire et les donnees sont obligatoires." });
        return;
      }
      const expectedModel = reportType === "entree" ? "rapport-rentree-complet-v1" : "rapport-sortie-v1";
      if (donnees.modele !== expectedModel) {
        res.status(400).json({ error: "Les donnees ne correspondent pas au modele du rapport selectionne." });
        return;
      }

      const targetRows = await db.select().from(etablissements).where(eq(etablissements.id, targetId));
      if (targetRows.length === 0) {
        res.status(404).json({ error: "Etablissement introuvable." });
        return;
      }
      const target = targetRows[0];
      if (reportType === "entree" && target.type !== "Secondaire") {
        res.status(403).json({ error: "Le formulaire officiel transmis est reserve aux etablissements secondaires." });
        return;
      }
      const isProviseur = hasAnyRole(req.user?.role, [ROLES.PROVISEUR]);
      if (req.user?.etablissementId !== targetId) {
        res.status(403).json({ error: "Vous ne pouvez renseigner que votre propre etablissement." });
        return;
      }
      if (target.type === "Primaire" && !hasAnyRole(req.user?.role, [ROLES.DIRECTEUR_ECOLE])) {
        res.status(403).json({ error: "Pour une ecole primaire, seul le Directeur d'ecole renseigne le rapport." });
        return;
      }
      if (isProviseur && target.type !== "Secondaire") {
        res.status(403).json({ error: "Le proviseur ne peut traiter que les donnees d'un etablissement secondaire." });
        return;
      }

      const existing = await db.select().from(annualReports).where(and(
        eq(annualReports.etablissementId, targetId),
        eq(annualReports.anneeScolaire, String(anneeScolaire)),
        eq(annualReports.typeRapport, reportType)
      )).limit(1);
      let statut = existing[0]?.statut || "Brouillon";
      if (existing[0] && !["Brouillon", "Rejete"].includes(existing[0].statut) && !(isProviseur && existing[0].statut === "Soumis au proviseur")) {
        res.status(409).json({ error: "Ce rapport est deja transmis et ne peut plus etre modifie a ce stade du circuit." });
        return;
      }
      if (action === "save" && statut === "Rejete") {
        statut = "Brouillon";
      }
      if (action === "submit") {
        statut = "Soumis au DSE";
      }

      const values = {
        etablissementId: targetId,
        anneeScolaire: String(anneeScolaire),
        typeRapport: reportType,
        statut,
        donnees,
        createdById: existing[0]?.createdById || req.user?.id || null,
        submittedById: action === "submit" ? req.user?.id || null : existing[0]?.submittedById || null,
        submittedAt: action === "submit" ? new Date() : existing[0]?.submittedAt || null,
        updatedAt: new Date()
      };
      const saved = existing.length > 0
        ? await db.update(annualReports).set(values).where(eq(annualReports.id, existing[0].id)).returning()
        : await db.insert(annualReports).values(values).returning();

      await logAudit(req.user?.id, action === "submit" ? "SOUMISSION_RAPPORT_ANNUEL" : "SAUVEGARDE_RAPPORT_ANNUEL", "annual_reports", saved[0].id, { etablissementId: targetId, anneeScolaire, typeRapport: reportType, statut });
      res.json({ success: true, report: saved[0] });
    } catch (error: unknown) {
      res.status(isUniqueConstraintViolation(error) ? 409 : 500).json({
        error: isUniqueConstraintViolation(error)
          ? 'Un rapport pour cet établissement, cette année et ce type existe déjà.'
          : errorMessage(error),
      });
    }
  });

  router.post("/api/annual-reports/:id/decision", requireAuth, async (req: AuthRequest, res) => {
    if (!requireAnyRole(req, res, [...DSE_ROLES, ROLES.PROVISEUR], "Acces refuse : profil non habilite.")) return;
    try {
      const reportId = Number(req.params.id);
      const { decision, commentaire } = req.body;
      const rows = await db.select().from(annualReports).where(eq(annualReports.id, reportId));
      if (rows.length === 0) {
        res.status(404).json({ error: "Rapport annuel introuvable." });
        return;
      }
      const report = rows[0];
      const isDse = hasAnyRole(req.user?.role, DSE_ROLES);
      const isProviseur = hasAnyRole(req.user?.role, [ROLES.PROVISEUR]);
      if (isProviseur && req.user?.etablissementId !== report.etablissementId) {
        res.status(403).json({ error: "Vous ne pouvez valider que le rapport de votre etablissement." });
        return;
      }
      if (!isDse && !isProviseur) {
        res.status(403).json({ error: "Seul le proviseur ou le Directeur DSE peut traiter ce rapport." });
        return;
      }
      if (decision === "approuver" && isProviseur) {
        if (report.statut !== "Soumis au proviseur") {
          res.status(409).json({ error: "Seul un rapport soumis au proviseur peut etre approuve." });
          return;
        }
        const updated = await db.update(annualReports).set({ statut: "Soumis au DSE", updatedAt: new Date(), validatedById: req.user?.id || null }).where(eq(annualReports.id, reportId)).returning();
        await logAudit(req.user?.id, "APPROBATION_PROVISEUR_RAPPORT", "annual_reports", reportId, {});
        res.json({ success: true, report: updated[0] });
        return;
      }
      if (!isDse) {
        res.status(403).json({ error: "La validation finale est reservee au Directeur DSE." });
        return;
      }
      const nextStatus = decision === "valider" ? "Valide" : decision === "rejeter" ? "Rejete" : null;
      if (!nextStatus) {
        res.status(400).json({ error: "Decision invalide." });
        return;
      }
      if (decision === "rejeter" && (typeof commentaire !== 'string' || !commentaire.trim())) {
        res.status(400).json({ error: "Le motif du rejet est obligatoire." });
        return;
      }
      if (report.statut !== "Soumis au DSE") {
        res.status(409).json({ error: "La decision finale ne peut porter que sur un rapport soumis a la DSE." });
        return;
      }
      const updated = await db.update(annualReports).set({ statut: nextStatus, updatedAt: new Date(), validatedById: req.user?.id || null, validatedAt: decision === "valider" ? new Date() : null, commentaireRejet: decision === "rejeter" ? commentaire.trim() : null }).where(eq(annualReports.id, reportId)).returning();
      await logAudit(req.user?.id, decision === "valider" ? "VALIDATION_RAPPORT_ANNUEL" : "REJET_RAPPORT_ANNUEL", "annual_reports", reportId, { statut: nextStatus, commentaireRejet: decision === "rejeter" ? commentaire.trim() : null });
      res.json({ success: true, report: updated[0] });
    } catch (error: unknown) {
      res.status(500).json({ error: errorMessage(error) });
    }
  });

  // Common review workflow for establishment data modules.
  router.post("/api/module-submissions/:module/:recordId/decision", requireAuth, async (req: AuthRequest, res) => {
    if (!req.user || !hasAnyRole(req.user.role, [...DSE_ROLES, ROLES.PROVISEUR])) {
      res.status(403).json({ error: "Acces refuse : ce circuit de validation est reserve aux profils metier habilites." });
      return;
    }
    if (req.params.module === 'effectifs' && hasAnyRole(req.user.role, DSE_ROLES)) {
      res.status(403).json({ error: "Le module Effectifs est en lecture seule pour les administrateurs." });
      return;
    }
    try {
      const { decision, commentaire } = req.body;
      if (decision !== 'approuver' && decision !== 'rejeter') {
        res.status(400).json({ error: "Decision invalide." });
        return;
      }
      if (decision === 'rejeter' && (typeof commentaire !== 'string' || !commentaire.trim())) {
        res.status(400).json({ error: "Le motif du rejet est obligatoire." });
        return;
      }
      const recordId = Number(req.params.recordId);
      const rows = await db.select().from(moduleSubmissions).where(and(
        eq(moduleSubmissions.module, req.params.module),
        eq(moduleSubmissions.recordId, recordId)
      )).limit(1);
      if (rows.length === 0) {
        res.status(404).json({ error: "Aucune transmission trouvee pour cette donnee." });
        return;
      }
      const submission = rows[0];
      const isDse = hasAnyRole(req.user.role, DSE_ROLES);
      const isProviseur = hasAnyRole(req.user.role, [ROLES.PROVISEUR]);

      const reviewDenial = getModuleReviewDenial({
        role: req.user.role,
        module: req.params.module,
        requesterEstablishmentId: req.user.etablissementId,
        targetEstablishmentId: submission.etablissementId,
      });
      if (reviewDenial === 'establishment') {
        res.status(403).json({ error: "Vous ne pouvez traiter que les donnees de votre etablissement." });
        return;
      }

      const nextStatus = moduleDecisionStatus(req.user.role, submission.statut, decision);
      if (!nextStatus) {
        res.status(409).json({ error: "Cette donnee ne se trouve pas dans un etat compatible avec votre decision." });
        return;
      }

      const updated = await db.update(moduleSubmissions).set({
        statut: nextStatus,
        reviewedById: req.user.id || null,
        reviewedAt: new Date(),
        commentaire: decision === 'rejeter' ? commentaire.trim() : null,
        updatedAt: new Date()
      }).where(eq(moduleSubmissions.id, submission.id)).returning();
      await logAudit(req.user.id, decision === 'approuver' ? 'VALIDATION_DONNEE_ETABLISSEMENT' : 'RETOUR_DONNEE_ETABLISSEMENT', req.params.module, recordId, { statut: nextStatus, commentaire });
      res.json({ success: true, submission: updated[0] });
    } catch (error: unknown) {
      res.status(isUniqueConstraintViolation(error) ? 409 : 500).json({
        error: isUniqueConstraintViolation(error)
          ? 'Cette transmission existe déjà pour ce module et cet enregistrement.'
          : errorMessage(error),
      });
    }
  });

  return router;
}
