import { Router } from 'express';
import { db } from '../../db/index.ts';
import { etablissements, incidents, tice, wash } from '../../db/schema.ts';
import { eq } from 'drizzle-orm';
import { requireAuth, AuthRequest } from '../../middleware/auth.ts';
import { ARRONDISSEMENT_ROLES, DSE_ROLES, LOCAL_SCHOOL_ROLES, SUPER_ADMIN_ROLES, hasAnyRole } from '../../lib/roles.ts';
import { attachModuleWorkflow, saveModuleWorkflow, isSchoolDataWriter } from '../module-workflow.ts';

type AuditLogger = (
  userId: number | null | undefined,
  action: string,
  entityType: string,
  entityId: number | null,
  details: unknown
) => Promise<void>;

function parseNonNegativeInteger(value: unknown, fieldName: string): number {
  const parsed = typeof value === 'number' ? value : Number(value ?? 0);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`${fieldName} doit être un entier positif ou nul.`);
  }
  return parsed;
}

function requireDseRole(req: AuthRequest, res: import('express').Response): boolean {
  if (!hasAnyRole(req.user?.role, DSE_ROLES)) {
    res.status(403).json({ error: 'Accès refusé : cette opération est réservée à la DSE.' });
    return false;
  }
  return true;
}

function requireIncidentReporter(req: AuthRequest, res: import('express').Response): boolean {
  if (!hasAnyRole(req.user?.role, [...DSE_ROLES, ...LOCAL_SCHOOL_ROLES])) {
    res.status(403).json({ error: "Acces refuse : seuls les responsables d'etablissement et la DSE peuvent signaler un incident." });
    return false;
  }
  return true;
}

function requireSchoolDataWriter(req: AuthRequest, res: import('express').Response): boolean {
  if (!isSchoolDataWriter(req.user?.role)) {
    res.status(403).json({ error: "Acces refuse : seuls la DSE et les responsables d'etablissement peuvent renseigner ce module." });
    return false;
  }
  return true;
}

export function createFacilitiesRouter(logAudit: AuditLogger): Router {
  const router = Router();

  router.get('/api/incidents', requireAuth, async (req: AuthRequest, res) => {
    try {
      const results = await db.select().from(incidents).orderBy(incidents.dateSignalement);
      if (hasAnyRole(req.user?.role, [...DSE_ROLES, ...SUPER_ADMIN_ROLES])) {
        res.json(await attachModuleWorkflow(results, 'incidents'));
      } else if (hasAnyRole(req.user?.role, ARRONDISSEMENT_ROLES) && req.user?.arrondissement) {
        const scopedEstablishments = await db.select({ id: etablissements.id })
          .from(etablissements)
          .where(eq(etablissements.arrondissement, req.user.arrondissement));
        const allowedIds = new Set(scopedEstablishments.map((etablissement) => etablissement.id));
        res.json(await attachModuleWorkflow(results.filter((incident) => incident.etablissementId && allowedIds.has(incident.etablissementId)), 'incidents'));
      } else if (req.user?.etablissementId) {
        res.json(await attachModuleWorkflow(results.filter((incident) => incident.etablissementId === req.user?.etablissementId), 'incidents'));
      } else {
        res.json([]);
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/api/incidents', requireAuth, async (req: AuthRequest, res) => {
    if (!requireIncidentReporter(req, res)) return;
    try {
      const { etablissementId, type, description } = req.body;
      const workflowAction = req.body.workflowAction === 'save' ? 'save' : 'submit';
      if (!type || typeof type !== 'string' || !description || typeof description !== 'string') {
        res.status(400).json({ error: "Le type et la description de l'incident sont obligatoires." });
        return;
      }
      if (hasAnyRole(req.user?.role, LOCAL_SCHOOL_ROLES) && Number(etablissementId) !== req.user?.etablissementId) {
        res.status(403).json({ error: "Vous ne pouvez signaler un incident que dans votre propre etablissement." });
        return;
      }
      const inserted = await db.insert(incidents).values({
        etablissementId: parseNonNegativeInteger(etablissementId, "L'établissement"),
        type,
        description,
        signaleParId: req.user?.id || null
      }).returning();
      const workflow = await saveModuleWorkflow({
        module: 'incidents',
        recordId: inserted[0].id,
        etablissementId: Number(etablissementId),
        requester: req.user,
        action: workflowAction
      });
      await logAudit(req.user?.id, 'CREATE', 'incidents', inserted[0].id, { type, description });
      res.json({ ...inserted[0], workflowStatus: workflow.statut });
    } catch (error: any) {
      res.status(error.message?.includes('doit être') ? 400 : 500).json({ error: error.message });
    }
  });

  router.put('/api/incidents/:id', requireAuth, async (req: AuthRequest, res) => {
    if (!requireDseRole(req, res)) return;
    try {
      const incidentId = parseNonNegativeInteger(req.params.id, "L'identifiant");
      const { statut, dateResolution } = req.body;
      if (!statut || typeof statut !== 'string') {
        res.status(400).json({ error: "Le statut de l'incident est obligatoire." });
        return;
      }
      const updated = await db.update(incidents).set({
        statut,
        dateResolution: dateResolution ? new Date(dateResolution) : null
      }).where(eq(incidents.id, incidentId)).returning();
      if (updated.length === 0) {
        res.status(404).json({ error: 'Incident introuvable.' });
        return;
      }
      await logAudit(req.user?.id, 'UPDATE', 'incidents', updated[0].id, { statut });
      res.json(updated[0]);
    } catch (error: any) {
      res.status(error.message?.includes('doit être') ? 400 : 500).json({ error: error.message });
    }
  });

  router.get('/api/wash', requireAuth, async (req: AuthRequest, res) => {
    try {
      const rows = await db.select({ record: wash, arrondissement: etablissements.arrondissement })
        .from(wash)
        .leftJoin(etablissements, eq(wash.etablissementId, etablissements.id));
      const visible = hasAnyRole(req.user?.role, [...DSE_ROLES, ...SUPER_ADMIN_ROLES])
        ? rows
        : rows.filter((row) => hasAnyRole(req.user?.role, ARRONDISSEMENT_ROLES)
          ? row.arrondissement === req.user?.arrondissement
          : row.record.etablissementId === req.user?.etablissementId);
      res.json(await attachModuleWorkflow(visible.map((row) => ({ ...row.record, arrondissement: row.arrondissement })), 'wash'));
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/api/wash', requireAuth, async (req: AuthRequest, res) => {
    if (!requireSchoolDataWriter(req, res)) return;
    try {
      const { etablissementId, forages, foragesFonctionnels, latrines, latrinesFonctionnelles, cantineDisponibilite, vivresDisponibles } = req.body;
      const workflowAction = req.body.workflowAction === 'save' ? 'save' : 'submit';
      const totalForages = parseNonNegativeInteger(forages, 'Le nombre de forages');
      const functionalForages = parseNonNegativeInteger(foragesFonctionnels, 'Le nombre de forages fonctionnels');
      const totalLatrines = parseNonNegativeInteger(latrines, 'Le nombre de latrines');
      const functionalLatrines = parseNonNegativeInteger(latrinesFonctionnelles, 'Le nombre de latrines fonctionnelles');
      if (functionalForages > totalForages || functionalLatrines > totalLatrines) {
        res.status(400).json({ error: "Le nombre d'équipements fonctionnels ne peut pas dépasser le total." });
        return;
      }
      if (hasAnyRole(req.user?.role, LOCAL_SCHOOL_ROLES) && Number(etablissementId) !== req.user?.etablissementId) {
        res.status(403).json({ error: "Vous ne pouvez renseigner que le WASH de votre etablissement." });
        return;
      }
      const existing = await db.select().from(wash).where(eq(wash.etablissementId, Number(etablissementId))).limit(1);
      const saved = existing.length > 0
        ? await db.update(wash).set({
          forages: totalForages,
          foragesFonctionnels: functionalForages,
          latrines: totalLatrines,
          latrinesFonctionnelles: functionalLatrines,
          cantineDisponibilite: Boolean(cantineDisponibilite),
          vivresDisponibles
        }).where(eq(wash.id, existing[0].id)).returning()
        : await db.insert(wash).values({
          etablissementId: parseNonNegativeInteger(etablissementId, "L'etablissement"),
          forages: totalForages,
          foragesFonctionnels: functionalForages,
          latrines: totalLatrines,
          latrinesFonctionnelles: functionalLatrines,
          cantineDisponibilite: Boolean(cantineDisponibilite),
          vivresDisponibles
        }).returning();
      const workflow = await saveModuleWorkflow({
        module: 'wash',
        recordId: saved[0].id,
        etablissementId: Number(etablissementId),
        requester: req.user,
        action: workflowAction
      });
      await logAudit(req.user?.id, 'CREATE', 'wash', saved[0].id, req.body);
      res.json({ ...saved[0], workflowStatus: workflow.statut });
      return;
    } catch (error: any) {
      res.status(error.message?.includes('doit être') ? 400 : 500).json({ error: error.message });
    }
  });

  router.get('/api/tice', requireAuth, async (req: AuthRequest, res) => {
    try {
      const rows = await db.select({ record: tice, arrondissement: etablissements.arrondissement })
        .from(tice)
        .leftJoin(etablissements, eq(tice.etablissementId, etablissements.id));
      const visible = hasAnyRole(req.user?.role, [...DSE_ROLES, ...SUPER_ADMIN_ROLES])
        ? rows
        : rows.filter((row) => hasAnyRole(req.user?.role, ARRONDISSEMENT_ROLES)
          ? row.arrondissement === req.user?.arrondissement
          : row.record.etablissementId === req.user?.etablissementId);
      res.json(await attachModuleWorkflow(visible.map((row) => ({ ...row.record, arrondissement: row.arrondissement })), 'tice'));
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/api/tice', requireAuth, async (req: AuthRequest, res) => {
    if (!requireSchoolDataWriter(req, res)) return;
    try {
      const { etablissementId, sallesInformatiques, ordinateurs, ordinateursFonctionnels, connectiviteInternet, typeConnexion } = req.body;
      const workflowAction = req.body.workflowAction === 'save' ? 'save' : 'submit';
      const totalComputers = parseNonNegativeInteger(ordinateurs, 'Le nombre d\'ordinateurs');
      const functionalComputers = parseNonNegativeInteger(ordinateursFonctionnels, 'Le nombre d\'ordinateurs fonctionnels');
      if (functionalComputers > totalComputers) {
        res.status(400).json({ error: "Le nombre d'ordinateurs fonctionnels ne peut pas dépasser le total." });
        return;
      }
      if (hasAnyRole(req.user?.role, LOCAL_SCHOOL_ROLES) && Number(etablissementId) !== req.user?.etablissementId) {
        res.status(403).json({ error: "Vous ne pouvez renseigner que les equipements TICE de votre etablissement." });
        return;
      }
      const existing = await db.select().from(tice).where(eq(tice.etablissementId, Number(etablissementId))).limit(1);
      const saved = existing.length > 0
        ? await db.update(tice).set({
          sallesInformatiques: parseNonNegativeInteger(sallesInformatiques, 'Le nombre de salles informatiques'),
          ordinateurs: totalComputers,
          ordinateursFonctionnels: functionalComputers,
          connectiviteInternet: Boolean(connectiviteInternet),
          typeConnexion
        }).where(eq(tice.id, existing[0].id)).returning()
        : await db.insert(tice).values({
          etablissementId: parseNonNegativeInteger(etablissementId, "L'etablissement"),
          sallesInformatiques: parseNonNegativeInteger(sallesInformatiques, 'Le nombre de salles informatiques'),
          ordinateurs: totalComputers,
          ordinateursFonctionnels: functionalComputers,
          connectiviteInternet: Boolean(connectiviteInternet),
          typeConnexion
        }).returning();
      const workflow = await saveModuleWorkflow({
        module: 'tice',
        recordId: saved[0].id,
        etablissementId: Number(etablissementId),
        requester: req.user,
        action: workflowAction
      });
      await logAudit(req.user?.id, 'CREATE', 'tice', saved[0].id, req.body);
      res.json({ ...saved[0], workflowStatus: workflow.statut });
      return;
    } catch (error: any) {
      res.status(error.message?.includes('doit être') ? 400 : 500).json({ error: error.message });
    }
  });

  return router;
}
