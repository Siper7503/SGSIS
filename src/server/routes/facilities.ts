import { Router } from 'express';
import { db } from '../../db/index.ts';
import { incidents, tice, wash } from '../../db/schema.ts';
import { eq } from 'drizzle-orm';
import { requireAuth, AuthRequest } from '../../middleware/auth.ts';
import { DSE_ROLES, hasAnyRole } from '../../lib/roles.ts';

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

export function createFacilitiesRouter(logAudit: AuditLogger): Router {
  const router = Router();

  router.get('/api/incidents', requireAuth, async (_req: AuthRequest, res) => {
    try {
      const results = await db.select().from(incidents).orderBy(incidents.dateSignalement);
      res.json(results);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/api/incidents', requireAuth, async (req: AuthRequest, res) => {
    if (!requireDseRole(req, res)) return;
    try {
      const { etablissementId, type, description } = req.body;
      if (!type || typeof type !== 'string' || !description || typeof description !== 'string') {
        res.status(400).json({ error: "Le type et la description de l'incident sont obligatoires." });
        return;
      }
      const inserted = await db.insert(incidents).values({
        etablissementId: parseNonNegativeInteger(etablissementId, "L'établissement"),
        type,
        description,
        signaleParId: req.user?.id || null
      }).returning();
      await logAudit(req.user?.id, 'CREATE', 'incidents', inserted[0].id, { type, description });
      res.json(inserted[0]);
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

  router.get('/api/wash', requireAuth, async (_req: AuthRequest, res) => {
    try {
      res.json(await db.select().from(wash));
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/api/wash', requireAuth, async (req: AuthRequest, res) => {
    if (!requireDseRole(req, res)) return;
    try {
      const { etablissementId, forages, foragesFonctionnels, latrines, latrinesFonctionnelles, cantineDisponibilite, vivresDisponibles } = req.body;
      const totalForages = parseNonNegativeInteger(forages, 'Le nombre de forages');
      const functionalForages = parseNonNegativeInteger(foragesFonctionnels, 'Le nombre de forages fonctionnels');
      const totalLatrines = parseNonNegativeInteger(latrines, 'Le nombre de latrines');
      const functionalLatrines = parseNonNegativeInteger(latrinesFonctionnelles, 'Le nombre de latrines fonctionnelles');
      if (functionalForages > totalForages || functionalLatrines > totalLatrines) {
        res.status(400).json({ error: "Le nombre d'équipements fonctionnels ne peut pas dépasser le total." });
        return;
      }
      const inserted = await db.insert(wash).values({
        etablissementId: parseNonNegativeInteger(etablissementId, "L'établissement"),
        forages: totalForages,
        foragesFonctionnels: functionalForages,
        latrines: totalLatrines,
        latrinesFonctionnelles: functionalLatrines,
        cantineDisponibilite: Boolean(cantineDisponibilite),
        vivresDisponibles
      }).returning();
      await logAudit(req.user?.id, 'CREATE', 'wash', inserted[0].id, req.body);
      res.json(inserted[0]);
    } catch (error: any) {
      res.status(error.message?.includes('doit être') ? 400 : 500).json({ error: error.message });
    }
  });

  router.get('/api/tice', requireAuth, async (_req: AuthRequest, res) => {
    try {
      res.json(await db.select().from(tice));
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post('/api/tice', requireAuth, async (req: AuthRequest, res) => {
    if (!requireDseRole(req, res)) return;
    try {
      const { etablissementId, sallesInformatiques, ordinateurs, ordinateursFonctionnels, connectiviteInternet, typeConnexion } = req.body;
      const totalComputers = parseNonNegativeInteger(ordinateurs, 'Le nombre d\'ordinateurs');
      const functionalComputers = parseNonNegativeInteger(ordinateursFonctionnels, 'Le nombre d\'ordinateurs fonctionnels');
      if (functionalComputers > totalComputers) {
        res.status(400).json({ error: "Le nombre d'ordinateurs fonctionnels ne peut pas dépasser le total." });
        return;
      }
      const inserted = await db.insert(tice).values({
        etablissementId: parseNonNegativeInteger(etablissementId, "L'établissement"),
        sallesInformatiques: parseNonNegativeInteger(sallesInformatiques, 'Le nombre de salles informatiques'),
        ordinateurs: totalComputers,
        ordinateursFonctionnels: functionalComputers,
        connectiviteInternet: Boolean(connectiviteInternet),
        typeConnexion
      }).returning();
      await logAudit(req.user?.id, 'CREATE', 'tice', inserted[0].id, req.body);
      res.json(inserted[0]);
    } catch (error: any) {
      res.status(error.message?.includes('doit être') ? 400 : 500).json({ error: error.message });
    }
  });

  return router;
}
