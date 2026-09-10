import "dotenv/config";
import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { requireAuth, AuthRequest } from "./src/middleware/auth.ts";
import { getOrCreateUser } from "./src/db/users.ts";
import { db } from "./src/db/index.ts";
import { etablissements, effectifs, constructions, infrastructures, mobilier, communications, communicationReceipts, incidents, wash, tice, auditLogs, annualReports, moduleSubmissions, users } from "./src/db/schema.ts";
import { asc, eq, and, ilike, ne, sql } from "drizzle-orm";
import multer from "multer";
import * as xlsx from "xlsx";
import Papa from "papaparse";
import { PDFParse } from "pdf-parse";
import { GoogleGenAI } from "@google/genai";
import bcrypt from "bcryptjs";
import { createOneTimeToken, hashSecret, secretsMatch, signSession } from "./src/lib/auth-security.ts";
import { ADMIN_MANAGED_ROLES, ARRONDISSEMENT_ROLES, DSE_ROLES, LOCAL_SCHOOL_ROLES, ROLES, SCHOOL_USER_ROLES, SCHOOL_WRITE_ROLES, SUPER_ADMIN_ROLES, SYSTEM_ADMIN_ROLES, hasAnyRole } from "./src/lib/roles.ts";
import { createFacilitiesRouter } from "./src/server/routes/facilities.ts";
import { attachModuleWorkflow, saveModuleWorkflow, isSchoolDataWriter } from "./src/server/module-workflow.ts";

interface SimulatedEmail {
  id: string;
  to: string;
  subject: string;
  body: string;
  sentAt: string;
}

const simulatedEmails: SimulatedEmail[] = [];
const MAX_LOGIN_ATTEMPTS = 5;
const AUTO_LOCK_MINUTES = 10;
const AUTO_LOCK_MS = AUTO_LOCK_MINUTES * 60 * 1000;

const DISPOSABLE_DOMAINS = [
  "yopmail.com", "tempmail.com", "mailinator.com", "10minutemail.com", 
  "trashmail.com", "dispostable.com", "guerrillamail.com", "sharklasers.com",
  "getairmail.com", "burnermail.io", "tempmailo.com"
];

function validateEmailSecured(email: string): { isValid: boolean; error?: string } {
  if (!email || typeof email !== 'string') {
    return { isValid: false, error: "L'adresse email est requise." };
  }
  
  // Syntax RFC-compliant regex check
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(email)) {
    return { isValid: false, error: "Format d'adresse email non conforme aux techniques standard." };
  }
  
  // Check domain
  const parts = email.split('@');
  if (parts.length !== 2) {
    return { isValid: false, error: "Adresse email invalide." };
  }
  
  const domain = parts[1].toLowerCase().trim();
  
  // Enforce Gmail format (nom@gmail.com)
  if (domain !== 'gmail.com') {
    return { isValid: false, error: "L'adresse email d'authentification doit obligatoirement respecter le format: nom@gmail.com (adresse Gmail uniquement)." };
  }

  return { isValid: true };
}

function validatePasswordSecured(pass: string): { isValid: boolean; error?: string } {
  if (!pass || pass.length < 8) {
    return { isValid: false, error: "Le mot de passe doit contenir au moins 8 caractères." };
  }

  // Check composed of letters, digits, and signs/symbols
  const hasLetter = /[a-zA-Z]/.test(pass);
  const hasDigit = /[0-9]/.test(pass);
  const hasSign = /[^a-zA-Z0-9]/.test(pass);

  if (!hasLetter) {
    return { isValid: false, error: "Le mot de passe doit contenir au moins une lettre." };
  }
  if (!hasDigit) {
    return { isValid: false, error: "Le mot de passe doit contenir au moins un chiffre." };
  }
  if (!hasSign) {
    return { isValid: false, error: "Le mot de passe doit contenir au moins un signe spécial (ex: @, #, $, %, etc.)." };
  }

  // Casing rule: uppercase only if it appears at the start, followed by lowercase letters
  const hasUppercase = /[A-Z]/.test(pass);
  if (hasUppercase) {
    if (!/^[A-Z]/.test(pass)) {
      return { isValid: false, error: "La lettre majuscule n'est autorisée qu'au tout début du mot de passe." };
    }
    // Check all letters after index 0 are lowercase
    const rest = pass.slice(1);
    if (/[A-Z]/.test(rest)) {
      return { isValid: false, error: "Seule la première lettre au début du mot de passe peut être majuscule. Les lettres suivantes doivent être minuscules." };
    }
  }

  return { isValid: true };
}

const upload = multer({ storage: multer.memoryStorage() });

function forbid(res: express.Response, message = "Accès refusé : droits insuffisants.") {
  res.status(403).json({ error: message });
}

function requireAnyRole(req: AuthRequest, res: express.Response, allowedRoles: readonly string[], message?: string): boolean {
  if (!req.user || !hasAnyRole(req.user.role, allowedRoles)) {
    forbid(res, message);
    return false;
  }
  return true;
}

function canManageUsers(role?: string | null): boolean {
  return hasAnyRole(role, [...SUPER_ADMIN_ROLES, ...DSE_ROLES]);
}

function canCreateUsers(role?: string | null): boolean {
  return canManageUsers(role) || hasAnyRole(role, [ROLES.PROVISEUR]);
}

function canCreateTargetRole(managerRole: string | null | undefined, targetRole: string | null | undefined): boolean {
  if (hasAnyRole(managerRole, SUPER_ADMIN_ROLES)) {
    return hasAnyRole(targetRole, ADMIN_MANAGED_ROLES);
  }

  if (hasAnyRole(managerRole, DSE_ROLES)) {
    return hasAnyRole(targetRole, SCHOOL_USER_ROLES);
  }

  if (hasAnyRole(managerRole, [ROLES.PROVISEUR])) {
    return hasAnyRole(targetRole, [ROLES.SECRETAIRE_ADMIN, ROLES.SECRETAIRE_ADMIN_LEGACY]);
  }

  return false;
}

function rightsForRole(role: string | null | undefined): string {
  if (hasAnyRole(role, SUPER_ADMIN_ROLES)) {
    return "super administration technique, gestion des droits d'acces et audit global";
  }
  if (hasAnyRole(role, ARRONDISSEMENT_ROLES)) {
    return "supervision territoriale, lecture et controle des donnees de l'arrondissement";
  }
  if (hasAnyRole(role, SYSTEM_ADMIN_ROLES)) {
    return "administration metier, pilotage, lecture, ecriture et recherche";
  }
  if (hasAnyRole(role, LOCAL_SCHOOL_ROLES)) {
    return "lecture, ecriture et recherche sur les modules d'etablissement";
  }
  return "lecture et recherche";
}

function publicUser(user: any) {
  if (!user) return null;
  const { passwordHash, accessToken, otpCode, otpExpiresAt, ...safeUser } = user;
  return safeUser;
}

function canManageTargetAccount(managerRole: string | null | undefined, targetRole: string | null | undefined): boolean {
  if (hasAnyRole(targetRole, SUPER_ADMIN_ROLES)) {
    return false;
  }

  if (hasAnyRole(managerRole, SUPER_ADMIN_ROLES)) {
    return hasAnyRole(targetRole, [...SYSTEM_ADMIN_ROLES, ...SCHOOL_USER_ROLES]);
  }

  if (hasAnyRole(managerRole, DSE_ROLES)) {
    return hasAnyRole(targetRole, SCHOOL_USER_ROLES);
  }

  if (hasAnyRole(managerRole, [ROLES.PROVISEUR])) {
    return hasAnyRole(targetRole, [ROLES.SECRETAIRE_ADMIN, ROLES.SECRETAIRE_ADMIN_LEGACY]);
  }

  return false;
}

function canManageScopedTarget(manager: AuthRequest["user"], target: any): boolean {
  if (!manager || !canManageTargetAccount(manager.role, target?.role)) return false;
  if (hasAnyRole(manager.role, [ROLES.PROVISEUR])) {
    return Boolean(manager.etablissementId && target?.etablissementId === manager.etablissementId);
  }
  return true;
}

function filterUsersForRequester(allUsers: any[], requester: AuthRequest["user"]): any[] {
  if (hasAnyRole(requester?.role, SUPER_ADMIN_ROLES)) {
    return allUsers;
  }

  if (hasAnyRole(requester?.role, DSE_ROLES)) {
    return allUsers.filter((user) => hasAnyRole(user.role, SCHOOL_USER_ROLES));
  }

  if (hasAnyRole(requester?.role, ARRONDISSEMENT_ROLES)) {
    return allUsers.filter((user) => user.arrondissement && requester?.arrondissement && user.arrondissement === requester.arrondissement);
  }

  if (hasAnyRole(requester?.role, [ROLES.PROVISEUR])) {
    return allUsers.filter((user) =>
      hasAnyRole(user.role, [ROLES.SECRETAIRE_ADMIN, ROLES.SECRETAIRE_ADMIN_LEGACY]) &&
      user.etablissementId && requester?.etablissementId && user.etablissementId === requester.etablissementId
    );
  }

  return [];
}

function filterEstablishmentsForRequester(allEstablishments: any[], requester: AuthRequest["user"]): any[] {
  if (hasAnyRole(requester?.role, [...SUPER_ADMIN_ROLES, ...DSE_ROLES])) return allEstablishments;
  if (hasAnyRole(requester?.role, ARRONDISSEMENT_ROLES)) {
    return allEstablishments.filter((etablissement) => etablissement.arrondissement === requester?.arrondissement);
  }
  if (hasAnyRole(requester?.role, LOCAL_SCHOOL_ROLES)) {
    return allEstablishments.filter((etablissement) => etablissement.id === requester?.etablissementId);
  }
  return [];
}

function filterRowsForRequester(rows: any[], requester: AuthRequest["user"]): any[] {
  if (hasAnyRole(requester?.role, [...SUPER_ADMIN_ROLES, ...DSE_ROLES])) return rows;
  if (hasAnyRole(requester?.role, ARRONDISSEMENT_ROLES)) {
    return rows.filter((row) => row.arrondissement === requester?.arrondissement || row.etablissementArrondissement === requester?.arrondissement);
  }
  if (hasAnyRole(requester?.role, LOCAL_SCHOOL_ROLES)) {
    return rows.filter((row) => row.etablissementId === requester?.etablissementId);
  }
  return [];
}

async function ensureDatabaseShape() {
  await db.execute(sql`alter table users add column if not exists lock_expires_at timestamp`);
  await db.execute(sql`alter table users add column if not exists etablissement_id integer`);
  await db.execute(sql`alter table constructions add column if not exists etablissement_id integer references etablissements(id)`);
  await db.execute(sql`
    create table if not exists annual_reports (
      id serial primary key,
      etablissement_id integer not null references etablissements(id),
      annee_scolaire text not null,
      statut text not null default 'Brouillon',
      donnees jsonb not null default '{}'::jsonb,
      created_by_id integer references users(id),
      submitted_by_id integer references users(id),
      validated_by_id integer references users(id),
      created_at timestamp default now(),
      updated_at timestamp default now(),
      submitted_at timestamp,
      validated_at timestamp
    )
  `);
  await db.execute(sql`
    create table if not exists module_submissions (
      id serial primary key,
      module text not null,
      record_id integer not null,
      etablissement_id integer not null references etablissements(id),
      statut text not null default 'Brouillon',
      created_by_id integer references users(id),
      submitted_by_id integer references users(id),
      reviewed_by_id integer references users(id),
      commentaire text,
      created_at timestamp default now(),
      updated_at timestamp default now(),
      submitted_at timestamp,
      reviewed_at timestamp
    )
  `);
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);
  await ensureDatabaseShape();

  // Initialize Gemini
  let ai: GoogleGenAI | null = null;
  if (process.env.GEMINI_API_KEY) {
    ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }

  app.use(express.json());

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/api/predictions", requireAuth, async (req: AuthRequest, res) => {
    if (!requireAnyRole(req, res, DSE_ROLES, "Accès refusé : le module de prédiction est réservé à la DSE.")) return;
    try {
      if (!ai) {
        res.status(503).json({ error: "L'IA n'est pas configurée (clé API manquante)." });
        return;
      }
      
      const { prompt } = req.body;
      
      const e = await db.select().from(etablissements);
      const m = await db.select().from(mobilier);
      
      const context = `
      Nous avons actuellement ${e.length} établissements scolaires enregistrés.
      Il y a un total de ${m.reduce((acc, curr) => acc + (curr.tablesBancs || 0), 0)} tables bancs.
      Veuillez analyser ce contexte et répondre à la requête de prédiction :
      ${prompt}
      Fournissez des recommandations stratégiques, claires et structurées pour le Burkina Faso.
      `;

      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: context,
        config: {
          systemInstruction: "Tu es un expert en planification d'infrastructures éducatives pour le gouvernement du Burkina Faso. Tes réponses sont professionnelles, analytiques, en français et orientées solutions pour l'éducation publique.",
        }
      });
      
      res.json({ text: response.text });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // User auth/registration
  app.post("/api/auth/login", requireAuth, async (req: AuthRequest, res) => {
    try {
      if (!req.user) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }
      const user = await getOrCreateUser(req.user.uid, req.user.email!);
      res.json(publicUser(user));
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Upgraded secure user registration endpoint
  app.post("/api/auth/register-secure", async (req, res) => {
    try {
      const { nom, prenom, email, telephone, password, role, arrondissement, etablissementId } = req.body;
      
      // 1. Strict Email Validation
      const emailValidation = validateEmailSecured(email);
      if (!emailValidation.isValid) {
        res.status(400).json({ error: emailValidation.error });
        return;
      }

      // 2. Strict Password Validation
      if (!password) {
        res.status(400).json({ error: "Le mot de passe est obligatoire." });
        return;
      }
      const passwordValidation = validatePasswordSecured(password);
      if (!passwordValidation.isValid) {
        res.status(400).json({ error: passwordValidation.error });
        return;
      }

      // 3. Required Fields Validation
      if (!nom || !prenom || !telephone || !role) {
        res.status(400).json({ error: "Toutes les informations personnelles (nom, prénom, téléphone et choix du poste) sont obligatoires." });
        return;
      }

      const cleanPhone = telephone.replace(/\s+/g, '');
      const isDigits = /^\d+$/.test(cleanPhone);
      if (!isDigits) {
        res.status(400).json({ error: "Le numéro de téléphone doit prendre en compte uniquement des chiffres en entrée." });
        return;
      }

      // 4. Automatic "Droit de contrôle" (Pilotage / Lecture-Ecriture / Lecture-Recherche)
      const rights = rightsForRole(role);

      // 5. Automatic Secure Token Code generation
      const accessToken = createOneTimeToken();

      const existingUsers = await db.select().from(users).where(eq(users.email, email));
      const allSystemUsers = await db.select().from(users);

      if (allSystemUsers.length > 0) {
        res.status(403).json({ error: "Inscription publique fermee. Les comptes doivent etre crees par le SuperAdmin ou le Directeur DSE." });
        return;
      }

      if (!hasAnyRole(role, SUPER_ADMIN_ROLES)) {
        res.status(403).json({ error: "Le premier compte doit etre le SuperAdmin de l'application." });
        return;
      }

      const hash = await bcrypt.hash(password, 10);

      let userResult;
      if (existingUsers.length > 0) {
        userResult = await db.update(users).set({
          nom,
          prenom,
          telephone: cleanPhone,
          passwordHash: hash,
          role,
          rights,
          accessToken: hashSecret(accessToken),
          arrondissement: arrondissement || null,
          lockExpiresAt: null,
        }).where(eq(users.email, email)).returning();
      } else {
        const uid = "custom_" + Math.random().toString(36).substring(2, 15);
        userResult = await db.insert(users).values({
          uid,
          email,
          nom,
          prenom,
          telephone: cleanPhone,
          role,
          rights,
          accessToken: hashSecret(accessToken),
          arrondissement: arrondissement || null,
          passwordHash: hash,
          loginAttempts: 0,
          isLocked: false,
          lockExpiresAt: null
        }).returning();
      }

      // 6. Log registration in audit log
      await db.insert(auditLogs).values({
        userId: userResult[0].id,
        action: "INSCRIPTION_SECURE",
        entityType: "users",
        entityId: userResult[0].id,
        details: { email, role, rights }
      });

      // 7. Simuler l'envoi du jeton par email
      const emailSubject = "Bienvenue sur SGSIED - Votre jeton d'accès sécurisé";
      const emailBody = `Bonjour ${prenom} ${nom},\n\nVotre compte d'accès sécurisé SGSIED en tant que "${role}" a été créé avec succès.\n\nLe système vous a attribué automatiquement le droit de contrôle suivant :\n👉 ${rights}\n\nVoici votre jeton de sécurité à conserver précieusement pour vos futures authentifications d'accès ou récupérations :\n🔑 Code d'accès : ${accessToken}\n\nVous pouvez utiliser ce code comme alternative à votre mot de passe pour vous connecter.\n\nCordialement,\nL'administration SGSIED Burkina Faso.`;
      
      const simulatedEmail = {
        id: "em_" + Math.random().toString(36).substring(2, 9),
        to: email,
        subject: emailSubject,
        body: emailBody,
        sentAt: new Date().toISOString()
      };
      simulatedEmails.unshift(simulatedEmail);

      res.json({ 
        success: true, 
        user: publicUser(userResult[0]),
        rights,
        accessToken,
        simulatedEmail,
        message: "Compte créé avec succès ! Votre jeton d'accès sécurisé a été généré automatiquement et envoyé par email." 
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Upgraded secure login endpoint with attempts tracking, block checks, conditional 2FA, and alternative code token login
  app.post("/api/auth/login-secure", async (req, res) => {
    try {
      const { email, password, accessToken } = req.body;
      if (!email) {
        res.status(400).json({ error: "Adresse email requise." });
        return;
      }

      const usersFound = await db.select().from(users).where(eq(users.email, email));
      if (usersFound.length === 0) {
        // Log unknown attempt
        await db.insert(auditLogs).values({
          userId: null,
          action: "TENTATIVE_CONNEXION_INCONNUE",
          entityType: "users",
          entityId: null,
          details: { email, reason: "Compte non existant" }
        });
        res.status(401).json({ error: "Identifiants incorrects ou compte inexistant." });
        return;
      }

      const user = usersFound[0];
      const maxAttempts = MAX_LOGIN_ATTEMPTS;
      const now = new Date();
      let isSuccess = false;

      // 1. Vérifier si le compte est bloqué
      if (user.isLocked || user.loginAttempts >= maxAttempts) {
        const lockExpiresAt = user.lockExpiresAt ? new Date(user.lockExpiresAt) : null;

        if (lockExpiresAt && lockExpiresAt <= now) {
          await db.update(users).set({
            isLocked: false,
            loginAttempts: 0,
            lockExpiresAt: null
          }).where(eq(users.id, user.id));
          user.isLocked = false;
          user.loginAttempts = 0;
          user.lockExpiresAt = null;
        } else {
          let effectiveLockExpiresAt = lockExpiresAt;
          if (!effectiveLockExpiresAt) {
            effectiveLockExpiresAt = new Date(Date.now() + AUTO_LOCK_MS);
            await db.update(users).set({
              isLocked: true,
              lockExpiresAt: effectiveLockExpiresAt
            }).where(eq(users.id, user.id));
          }

          const remainingMinutes = Math.max(1, Math.ceil((effectiveLockExpiresAt.getTime() - Date.now()) / 60000));

          await db.insert(auditLogs).values({
            userId: user.id,
            action: "CONNEXION_REFUSEE_BLOQUE",
            entityType: "users",
            entityId: user.id,
            details: { email, reason: "Compte verrouille pour echecs multiples", lockExpiresAt: effectiveLockExpiresAt }
          });

          res.status(403).json({ 
            error: `Votre compte est bloque suite a ${maxAttempts} echecs consecutifs de connexion. Veuillez patienter ${remainingMinutes} minute(s) avant de reessayer.` 
          });
          return;
        }
      }

      // 2. Mode de connexion : Jeton d'accès (Code Token) vs Mot de passe traditionnel
      if (accessToken) {
        // Authenticate using the generated security code token
        if (!isSuccess) {
          if (secretsMatch(accessToken, user.accessToken)) {
            isSuccess = true;
            // Reset token after use
            const newAccessToken = createOneTimeToken();
            await db.update(users).set({ 
              accessToken: hashSecret(newAccessToken),
              isLocked: false,
              loginAttempts: 0,
              lockExpiresAt: null
            }).where(eq(users.id, user.id));
          } else {
            const newAttempts = user.loginAttempts + 1;
            const shouldLock = newAttempts >= maxAttempts;
            const lockExpiresAt = shouldLock ? new Date(Date.now() + AUTO_LOCK_MS) : null;

            await db.update(users).set({ 
              loginAttempts: newAttempts,
              isLocked: shouldLock,
              lockExpiresAt
            }).where(eq(users.id, user.id));

            await db.insert(auditLogs).values({
              userId: user.id,
              action: shouldLock ? "COMPTE_VERROUILLE" : "ECHEC_CONNEXION_TOKEN",
              entityType: "users",
              entityId: user.id,
              details: { email, attempts: newAttempts, locked: shouldLock, lockExpiresAt }
            });

            if (shouldLock) {
              res.status(403).json({ error: `Votre compte a ete bloque apres ${maxAttempts} echecs de securite consecutifs. Veuillez patienter ${AUTO_LOCK_MINUTES} minutes avant de reessayer.` });
            } else {
              res.status(401).json({ error: `Jeton de sécurité incorrect. Tentative ${newAttempts}/${maxAttempts}.` });
            }
            return;
          }
        }
      } else {
        // Authenticate using password
        if (!password) {
          res.status(400).json({ error: "Mot de passe requis pour la connexion standard." });
          return;
        }

        if (!user.passwordHash) {
          res.status(401).json({ error: "Aucun mot de passe configuré. Veuillez utiliser votre jeton de sécurité pour vous connecter ou réinitialiser." });
          return;
        }

        const match = await bcrypt.compare(password, user.passwordHash);
        if (!match) {
          const newAttempts = user.loginAttempts + 1;
          const shouldLock = newAttempts >= maxAttempts;
          const lockExpiresAt = shouldLock ? new Date(Date.now() + AUTO_LOCK_MS) : null;

          await db.update(users).set({ 
            loginAttempts: newAttempts,
            isLocked: shouldLock,
            lockExpiresAt
          }).where(eq(users.id, user.id));

          await db.insert(auditLogs).values({
            userId: user.id,
            action: shouldLock ? "COMPTE_VERROUILLE" : "ECHEC_CONNEXION_PASS",
            entityType: "users",
            entityId: user.id,
            details: { email, attempts: newAttempts, locked: shouldLock, lockExpiresAt }
          });

          if (shouldLock) {
            res.status(403).json({ error: `Votre compte a ete bloque apres ${maxAttempts} echecs de securite consecutifs. Veuillez patienter ${AUTO_LOCK_MINUTES} minutes avant de reessayer.` });
          } else {
            res.status(401).json({ error: `Mot de passe incorrect. Tentative ${newAttempts}/${maxAttempts}.` });
          }
          return;
        }
        isSuccess = true;
      }

      // 3. Réinitialiser le compteur d'échecs en cas de succès
      await db.update(users).set({ loginAttempts: 0, lockExpiresAt: null }).where(eq(users.id, user.id));

      // 4. Les profils d'administration disposent d'une double vérification par mot de passe.
      const requires2FA = (
        hasAnyRole(user.role, [...SUPER_ADMIN_ROLES, ...DSE_ROLES, ...ARRONDISSEMENT_ROLES])
      ) && !accessToken;

      if (requires2FA) {
        const otpCode = createOneTimeToken('OTP').slice(-6);
        const otpExpiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

        await db.update(users).set({
          otpCode: hashSecret(otpCode),
          otpExpiresAt
        }).where(eq(users.id, user.id));

        await db.insert(auditLogs).values({
          userId: user.id,
          action: "OTP_SMS_ENVOYE",
          entityType: "users",
          entityId: user.id,
          details: { email, expiration: otpExpiresAt }
        });

        console.log(`\n=========================================\n[SMS OTP 2FA] Code envoyé au mobile de ${user.email} (${user.role}) : ${otpCode}\n=========================================\n`);

        const simulatedEmail = {
          id: "em_" + Math.random().toString(36).substring(2, 9),
          to: user.email,
          subject: "🔑 [SMS OTP] Votre code de sécurité double facteur (2FA)",
          body: `Bonjour ${user.prenom || ''} ${user.nom || ''},\n\nUn code de sécurité à 6 caractères alphanumériques a été généré pour valider votre connexion en double facteur (2FA) sur SGSIED.\n\n📱 Code OTP SMS : ${otpCode}\n\nCe code est valable pendant 5 minutes. Ne le partagez jamais.\n\nCordialement,\nL'administration SGSIED Burkina Faso.`,
          sentAt: new Date().toISOString()
        };
        simulatedEmails.unshift(simulatedEmail);

        res.json({ 
          requires2FA: true, 
          email: user.email,
          simulatedEmail,
          message: "Un code OTP additionnel de double facteur a été généré et envoyé par SMS." 
        });
        return;
      }

      // 5. Générer le JWT de session
      const token = signSession(
        { 
          id: user.id, 
          uid: user.uid, 
          email: user.email, 
          role: user.role, 
          etablissementId: user.etablissementId,
          arrondissement: user.arrondissement,
          nom: user.nom,
          prenom: user.prenom,
          telephone: user.telephone,
          rights: user.rights
        }
      );

      await db.insert(auditLogs).values({
        userId: user.id,
        action: "CONNEXION_REUSSIE",
        entityType: "users",
        entityId: user.id,
        details: { email, role: user.role, rights: user.rights, method: accessToken ? "token" : "password" }
      });

      res.json({
        success: true,
        token,
        user: {
          id: user.id,
          uid: user.uid,
          email: user.email,
          role: user.role,
          etablissementId: user.etablissementId,
          arrondissement: user.arrondissement,
          nom: user.nom,
          prenom: user.prenom,
          telephone: user.telephone,
          rights: user.rights
        }
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Verify 2FA OTP code
  app.post("/api/auth/verify-otp", async (req, res) => {
    try {
      const { email, otpCode } = req.body;
      if (!email || !otpCode) {
        res.status(400).json({ error: "Email et code OTP requis." });
        return;
      }

      const usersFound = await db.select().from(users).where(eq(users.email, email));
      if (usersFound.length === 0) {
        res.status(404).json({ error: "Utilisateur non trouvé." });
        return;
      }

      const user = usersFound[0];

      if (user.isLocked) {
        res.status(403).json({ error: "Ce compte est bloqué. Veuillez contacter l'administrateur." });
        return;
      }

      if (!secretsMatch(otpCode, user.otpCode)) {
        await db.insert(auditLogs).values({
          userId: user.id,
          action: "ECHEC_VERIFICATION_OTP",
          entityType: "users",
          entityId: user.id,
          details: { email, reason: "Code OTP incorrect" }
        });
        res.status(401).json({ error: "Code de vérification incorrect." });
        return;
      }

      if (user.otpExpiresAt && new Date() > user.otpExpiresAt) {
        await db.insert(auditLogs).values({
          userId: user.id,
          action: "ECHEC_VERIFICATION_OTP",
          entityType: "users",
          entityId: user.id,
          details: { email, reason: "Code OTP expiré" }
        });
        res.status(401).json({ error: "Le code OTP a expiré. Veuillez en demander un nouveau." });
        return;
      }

      // Reset OTP fields
      await db.update(users).set({
        otpCode: null,
        otpExpiresAt: null
      }).where(eq(users.id, user.id));

      const token = signSession(
        { 
          id: user.id, 
          uid: user.uid, 
          email: user.email, 
          role: user.role, 
          arrondissement: user.arrondissement,
          nom: user.nom,
          prenom: user.prenom,
          telephone: user.telephone,
          rights: user.rights
        }
      );

      await db.insert(auditLogs).values({
        userId: user.id,
        action: "CONNEXION_REUSSIE_2FA",
        entityType: "users",
        entityId: user.id,
        details: { email, role: user.role, rights: user.rights }
      });

      res.json({
        success: true,
        token,
        user: {
          id: user.id,
          uid: user.uid,
          email: user.email,
          role: user.role,
          etablissementId: user.etablissementId,
          arrondissement: user.arrondissement,
          nom: user.nom,
          prenom: user.prenom,
          telephone: user.telephone,
          rights: user.rights
        }
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Account Recovery Endpoint (Méthode de Récupération du Compte)
  app.post("/api/auth/recover-account", async (req, res) => {
    try {
      const { email } = req.body;
      
      const emailValidation = validateEmailSecured(email);
      if (!emailValidation.isValid) {
        res.status(400).json({ error: emailValidation.error });
        return;
      }

      const usersFound = await db.select().from(users).where(eq(users.email, email));
      if (usersFound.length === 0) {
        res.status(404).json({ error: "Aucun compte n'est associé à cette adresse email." });
        return;
      }

      const user = usersFound[0];
      const tokenToUse = createOneTimeToken();
      await db.update(users).set({ accessToken: hashSecret(tokenToUse) }).where(eq(users.id, user.id));

      // Log recovery action
      await db.insert(auditLogs).values({
        userId: user.id,
        action: "RECUPERATION_COMPTE",
        entityType: "users",
        entityId: user.id,
        details: { email, recoveryTokenIssued: true }
      });

      // Simuler l'envoi du jeton de récupération par email
      const emailSubject = "Récupération de compte SGSIED - Votre Jeton de Sécurité";
      const emailBody = `Bonjour ${user.prenom || ''} ${user.nom || ''},\n\nVous avez demandé la récupération de votre compte d'accès SGSIED.\n\nVoici votre jeton de code de sécurité réutilisable à saisir lors de votre connexion :\n🔑 Jeton d'accès : ${tokenToUse}\n\nVous pouvez utiliser ce jeton de code directement sur notre formulaire de connexion alternative pour accéder de nouveau à votre session.\n\nCordialement,\nLa Direction du Suivi des Établissements (DSE).`;

      const simulatedEmail = {
        id: "em_" + Math.random().toString(36).substring(2, 9),
        to: email,
        subject: emailSubject,
        body: emailBody,
        sentAt: new Date().toISOString()
      };
      simulatedEmails.unshift(simulatedEmail);

      res.json({
        success: true,
        simulatedEmail,
        message: "Un email de récupération avec votre jeton de sécurité a été envoyé à votre adresse email."
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Authenticated users can change their own password after confirming the current one.
  app.post("/api/auth/change-password", requireAuth, async (req: AuthRequest, res) => {
    if (!req.user) {
      res.status(401).json({ error: "Session utilisateur introuvable." });
      return;
    }

    try {
      const { currentPassword, newPassword } = req.body;
      const userQuery = req.user.id
        ? db.select().from(users).where(eq(users.id, req.user.id))
        : db.select().from(users).where(eq(users.email, req.user.email || ""));
      const usersFound = await userQuery;
      if (usersFound.length === 0) {
        res.status(404).json({ error: "Utilisateur non trouve." });
        return;
      }

      if (!currentPassword || !usersFound[0].passwordHash || !(await bcrypt.compare(currentPassword, usersFound[0].passwordHash))) {
        res.status(400).json({ error: "Le mot de passe actuel est incorrect." });
        return;
      }

      const passwordValidation = validatePasswordSecured(newPassword);
      if (!passwordValidation.isValid) {
        res.status(400).json({ error: passwordValidation.error });
        return;
      }
      if (currentPassword === newPassword) {
        res.status(400).json({ error: "Le nouveau mot de passe doit etre different de l'ancien." });
        return;
      }

      const updated = await db.update(users).set({
        passwordHash: await bcrypt.hash(newPassword, 10),
        loginAttempts: 0,
        isLocked: false,
        lockExpiresAt: null
      }).where(eq(users.id, usersFound[0].id)).returning();

      await db.insert(auditLogs).values({
        userId: usersFound[0].id,
        action: "MODIFICATION_MOT_DE_PASSE_PERSONNEL",
        entityType: "users",
        entityId: usersFound[0].id,
        details: { email: usersFound[0].email }
      });

      res.json({ success: true, user: publicUser(updated[0]) });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Simulated local emails for debugging/sandbox visualization
  app.get("/api/auth/simulated-emails", requireAuth, async (req: AuthRequest, res) => {
    try {
      if (!hasAnyRole(req.user?.role, SUPER_ADMIN_ROLES)) {
        res.status(403).json({ error: "Acces reserve au SuperAdmin." });
        return;
      }
      const { email } = req.query;
      if (email) {
        const filtered = simulatedEmails.filter(em => em.to.toLowerCase() === (email as string).toLowerCase());
        res.json(filtered);
      } else {
        res.json(simulatedEmails);
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Admin lock/unlock users according to the administration hierarchy.
  app.post("/api/users/unlock/:id", requireAuth, async (req: AuthRequest, res) => {
    if (!req.user || !canCreateUsers(req.user.role)) {
      res.status(403).json({ error: "Acces refuse : vous ne pouvez pas deverrouiller ou autoriser ce compte." });
      return;
    }
    try {
      const targetId = parseInt(req.params.id);
      const targetUsers = await db.select().from(users).where(eq(users.id, targetId));
      if (targetUsers.length === 0) {
        res.status(404).json({ error: "Utilisateur non trouvé" });
        return;
      }
      if (!canManageScopedTarget(req.user, targetUsers[0])) {
        res.status(403).json({ error: "Acces refuse : vous ne pouvez pas gerer ce compte." });
        return;
      }
      const updated = await db.update(users).set({
        isLocked: false,
        loginAttempts: 0,
        otpCode: null,
        otpExpiresAt: null,
        lockExpiresAt: null
      }).where(eq(users.id, targetId)).returning();

      if (updated.length === 0) {
        res.status(404).json({ error: "Utilisateur non trouvé" });
        return;
      }

      await db.insert(auditLogs).values({
        userId: req.user?.id || null,
        action: "DEVERROUILLAGE_COMPTE",
        entityType: "users",
        entityId: targetId,
        details: { unlockedUser: updated[0].email, byAdmin: req.user.email }
      });

      res.json({ success: true, user: publicUser(updated[0]) });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/users/lock/:id", requireAuth, async (req: AuthRequest, res) => {
    if (!req.user || !canCreateUsers(req.user.role)) {
      res.status(403).json({ error: "Acces refuse : vous ne pouvez pas bloquer ce compte." });
      return;
    }
    try {
      const targetId = parseInt(req.params.id);
      const targetUsers = await db.select().from(users).where(eq(users.id, targetId));
      if (targetUsers.length === 0) {
        res.status(404).json({ error: "Utilisateur non trouvé" });
        return;
      }
      if (!canManageScopedTarget(req.user, targetUsers[0])) {
        res.status(403).json({ error: "Acces refuse : vous ne pouvez pas gerer ce compte." });
        return;
      }
      const updated = await db.update(users).set({
        isLocked: true
      }).where(eq(users.id, targetId)).returning();

      if (updated.length === 0) {
        res.status(404).json({ error: "Utilisateur non trouvé" });
        return;
      }

      await db.insert(auditLogs).values({
        userId: req.user?.id || null,
        action: "VERROUILLAGE_COMPTE_MANUEL",
        entityType: "users",
        entityId: targetId,
        details: { lockedUser: updated[0].email, byAdmin: req.user.email }
      });

      res.json({ success: true, user: publicUser(updated[0]) });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Create users according to the administration hierarchy.
  app.post("/api/users", requireAuth, async (req: AuthRequest, res) => {
    if (!req.user || !canCreateUsers(req.user.role)) {
      res.status(403).json({ error: "Acces refuse : vous n'avez pas les droits de creation d'utilisateurs." });
      return;
    }
    try {
      const { nom, prenom, email, telephone, password, role, arrondissement, etablissementId } = req.body;

      if (!canCreateTargetRole(req.user.role, role)) {
        res.status(403).json({ error: "Acces refuse : ce role ne peut pas etre attribue par votre profil." });
        return;
      }

      const targetEtablissementId = etablissementId ? Number(etablissementId) : null;
      if (hasAnyRole(role, LOCAL_SCHOOL_ROLES) && !targetEtablissementId) {
        res.status(400).json({ error: "L'etablissement est obligatoire pour un compte scolaire." });
        return;
      }
      if (hasAnyRole(req.user.role, [ROLES.PROVISEUR]) && targetEtablissementId !== req.user.etablissementId) {
        res.status(403).json({ error: "Un proviseur ne peut creer un compte que pour son propre etablissement." });
        return;
      }
      if (targetEtablissementId) {
        const targetEstablishments = await db.select({ arrondissement: etablissements.arrondissement })
          .from(etablissements)
          .where(eq(etablissements.id, targetEtablissementId));
        if (targetEstablishments.length === 0) {
          res.status(400).json({ error: "L'etablissement rattache est introuvable." });
          return;
        }
        if (hasAnyRole(req.user.role, ARRONDISSEMENT_ROLES) && targetEstablishments[0].arrondissement !== req.user.arrondissement) {
          res.status(403).json({ error: "Un responsable d'arrondissement ne peut creer un compte que dans son arrondissement." });
          return;
        }
      }
      if (hasAnyRole(req.user.role, ARRONDISSEMENT_ROLES) && arrondissement && arrondissement !== req.user.arrondissement) {
        res.status(403).json({ error: "Le compte doit rester rattache a votre arrondissement." });
        return;
      }

      // 1. Email validation
      const emailValidation = validateEmailSecured(email);
      if (!emailValidation.isValid) {
        res.status(400).json({ error: emailValidation.error });
        return;
      }

      // 2. Password validation
      if (!password) {
        res.status(400).json({ error: "Le mot de passe est obligatoire." });
        return;
      }
      const passwordValidation = validatePasswordSecured(password);
      if (!passwordValidation.isValid) {
        res.status(400).json({ error: passwordValidation.error });
        return;
      }

      // 3. Phone validation (only digits)
      if (!telephone) {
        res.status(400).json({ error: "Le numéro de téléphone est obligatoire." });
        return;
      }
      const cleanPhone = telephone.replace(/\s+/g, '');
      const isDigits = /^\d+$/.test(cleanPhone);
      if (!isDigits) {
        res.status(400).json({ error: "Le numéro de téléphone doit prendre en compte uniquement des chiffres en entrée." });
        return;
      }

      // 4. Check for duplicate email
      const existingUsers = await db.select().from(users).where(eq(users.email, email));
      if (existingUsers.length > 0) {
        res.status(400).json({ error: "Un utilisateur avec cette adresse email existe déjà." });
        return;
      }

      // 5. Automatic "Droit de contrôle" (Pilotage / Lecture-Ecriture / Lecture-Recherche)
      let rights = "lecture et recherche";
      if (hasAnyRole(role, SUPER_ADMIN_ROLES)) {
        rights = "super administration technique, gestion des droits d'acces et audit global";
      } else if (hasAnyRole(role, SYSTEM_ADMIN_ROLES)) {
        rights = "administration metier, pilotage, lecture, ecriture et recherche";
      } else if (hasAnyRole(role, LOCAL_SCHOOL_ROLES)) {
        rights = "lecture, ecriture et recherche sur les modules d'etablissement";
      }

      // 6. Automatic Secure Token Code generation
      const accessToken = createOneTimeToken();
      const uid = "custom_" + Math.random().toString(36).substring(2, 15);
      const hash = await bcrypt.hash(password, 10);

      const createdUser = await db.insert(users).values({
        uid,
        email,
        nom,
        prenom,
        telephone: cleanPhone,
        role,
        etablissementId: targetEtablissementId,
        rights,
        accessToken: hashSecret(accessToken),
        arrondissement: hasAnyRole(req.user.role, ARRONDISSEMENT_ROLES) ? req.user.arrondissement || null : arrondissement || null,
        passwordHash: hash,
        loginAttempts: 0,
        isLocked: false,
        lockExpiresAt: null
      }).returning();

      // Log in audit log
      await db.insert(auditLogs).values({
        userId: req.user?.id || null,
        action: "CREATION_UTILISATEUR_ADMIN",
        entityType: "users",
        entityId: createdUser[0].id,
        details: { email, role, rights, createdBy: req.user.email }
      });

      // Simulate email notification and return it to the authenticated creator
      // so the local SMTP simulator can display the generated access token.
      const simulatedEmail = {
        id: "em_" + Math.random().toString(36).substring(2, 9),
        to: email,
        subject: "Création de votre compte SGSIED par l'Administrateur",
        body: `Bonjour ${prenom} ${nom},\n\nVotre compte d'accès sécurisé SGSIS en tant que "${role}" a été créé avec succès par l'administration habilitée.\n\nLe système vous a attribué automatiquement le droit de contrôle suivant :\n${rights}\n\nVos identifiants de connexion :\nEmail : ${email}\nMot de passe initial : ${password}\nJeton d'accès de secours : ${accessToken}\n\nVous pouvez utiliser ce code comme alternative à votre mot de passe pour vous connecter.\n\nCordialement,\nL'administration SGSIS - Commune de Ouagadougou.`,
        sentAt: new Date().toISOString()
      };
      simulatedEmails.unshift(simulatedEmail);

      res.json({ success: true, user: publicUser(createdUser[0]), simulatedEmail });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // DELETE a user (reject access or delete completely)
  app.delete("/api/users/:id", requireAuth, async (req: AuthRequest, res) => {
    if (!req.user || !canCreateUsers(req.user.role)) {
      res.status(403).json({ error: "Acces refuse : vous ne pouvez pas supprimer ce compte." });
      return;
    }
    try {
      const targetId = parseInt(req.params.id);
      if (isNaN(targetId)) {
        res.status(400).json({ error: "ID de l'utilisateur invalide." });
        return;
      }

      if (req.user.id === targetId) {
        res.status(400).json({ error: "Securite : vous ne pouvez pas supprimer votre propre compte." });
        return;
      }

      const usersFound = await db.select().from(users).where(eq(users.id, targetId));
      if (usersFound.length === 0) {
        res.status(404).json({ error: "Utilisateur non trouvé." });
        return;
      }

      const userToDelete = usersFound[0];
      if (!canManageScopedTarget(req.user, userToDelete)) {
        res.status(403).json({ error: "Acces refuse : vous ne pouvez pas supprimer ce compte." });
        return;
      }

      // Insert audit log before deletion
      await db.insert(auditLogs).values({
        userId: req.user.id,
        action: "SUPPRESSION_UTILISATEUR",
        entityType: "users",
        entityId: targetId,
        details: { email: userToDelete.email, nomComplet: `${userToDelete.prenom} ${userToDelete.nom}`, deletedBy: req.user.email }
      });

      // Clean up references to prevent foreign key errors
      await db.delete(communicationReceipts).where(eq(communicationReceipts.userId, targetId));
      await db.update(auditLogs).set({ userId: null }).where(eq(auditLogs.userId, targetId));
      await db.update(communications).set({ auteurId: null }).where(eq(communications.auteurId, targetId));
      await db.update(incidents).set({ signaleParId: null }).where(eq(incidents.signaleParId, targetId));
      await db.update(annualReports).set({
        createdById: null,
        submittedById: null,
        validatedById: null
      }).where(eq(annualReports.createdById, targetId));
      await db.update(annualReports).set({ submittedById: null }).where(eq(annualReports.submittedById, targetId));
      await db.update(annualReports).set({ validatedById: null }).where(eq(annualReports.validatedById, targetId));

      // Finally, delete the user
      await db.delete(users).where(eq(users.id, targetId));

      res.json({ success: true, message: `Utilisateur ${userToDelete.email} supprimé avec succès.` });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/users/:id", requireAuth, async (req: AuthRequest, res) => {
    if (!req.user || !canCreateUsers(req.user.role)) {
      res.status(403).json({ error: "Acces refuse : vous ne pouvez pas modifier ce compte." });
      return;
    }
    try {
      const targetId = Number(req.params.id);
      const targetUsers = await db.select().from(users).where(eq(users.id, targetId));
      if (targetUsers.length === 0) {
        res.status(404).json({ error: "Utilisateur non trouve." });
        return;
      }
      const target = targetUsers[0];
      if (!canManageScopedTarget(req.user, target)) {
        res.status(403).json({ error: "Acces refuse : vous ne pouvez pas modifier ce compte." });
        return;
      }

      const { nom, prenom, telephone, role, arrondissement, etablissementId, password } = req.body;
      const nextRole = role || target.role;
      if (!canCreateTargetRole(req.user.role, nextRole)) {
        res.status(403).json({ error: "Acces refuse : ce role ne peut pas etre attribue par votre profil." });
        return;
      }
      const nextEtablissementId = etablissementId === undefined ? target.etablissementId : (etablissementId ? Number(etablissementId) : null);
      if (hasAnyRole(nextRole, LOCAL_SCHOOL_ROLES) && !nextEtablissementId) {
        res.status(400).json({ error: "L'etablissement est obligatoire pour un compte scolaire." });
        return;
      }
      if (hasAnyRole(req.user.role, [ROLES.PROVISEUR]) && nextEtablissementId !== req.user.etablissementId) {
        res.status(403).json({ error: "Un proviseur ne peut modifier que son etablissement." });
        return;
      }
      if (nextEtablissementId) {
        const targetEstablishments = await db.select({ arrondissement: etablissements.arrondissement })
          .from(etablissements)
          .where(eq(etablissements.id, nextEtablissementId));
        if (targetEstablishments.length === 0) {
          res.status(400).json({ error: "L'etablissement rattache est introuvable." });
          return;
        }
        if (hasAnyRole(req.user.role, ARRONDISSEMENT_ROLES) && targetEstablishments[0].arrondissement !== req.user.arrondissement) {
          res.status(403).json({ error: "Un responsable d'arrondissement ne peut gerer qu'un compte de son arrondissement." });
          return;
        }
      }
      if (hasAnyRole(req.user.role, ARRONDISSEMENT_ROLES) && arrondissement && arrondissement !== req.user.arrondissement) {
        res.status(403).json({ error: "Le compte doit rester rattache a votre arrondissement." });
        return;
      }

      const updates: any = {
        nom: nom ?? target.nom,
        prenom: prenom ?? target.prenom,
        telephone: telephone ?? target.telephone,
        role: nextRole,
        rights: rightsForRole(nextRole),
        arrondissement: hasAnyRole(req.user.role, ARRONDISSEMENT_ROLES) ? req.user.arrondissement || target.arrondissement : arrondissement ?? target.arrondissement,
        etablissementId: nextEtablissementId
      };
      if (password) {
        const passwordValidation = validatePasswordSecured(password);
        if (!passwordValidation.isValid) {
          res.status(400).json({ error: passwordValidation.error });
          return;
        }
        updates.passwordHash = await bcrypt.hash(password, 10);
      }

      const updated = await db.update(users).set(updates).where(eq(users.id, targetId)).returning();
      await db.insert(auditLogs).values({
        userId: req.user.id || null,
        action: "MODIFICATION_UTILISATEUR",
        entityType: "users",
        entityId: targetId,
        details: { email: target.email, modifiedBy: req.user.email }
      });
      res.json({ success: true, user: publicUser(updated[0]) });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // DELETE single audit log
  app.delete("/api/audit-logs/:id", requireAuth, async (req: AuthRequest, res) => {
    if (!req.user || !hasAnyRole(req.user.role, SUPER_ADMIN_ROLES)) {
      res.status(403).json({ error: "Acces refuse : seul le SuperAdmin peut supprimer des journaux d'audit." });
      return;
    }
    try {
      const logId = parseInt(req.params.id);
      if (isNaN(logId)) {
        res.status(400).json({ error: "ID de journal invalide." });
        return;
      }
      await db.delete(auditLogs).where(eq(auditLogs.id, logId));
      res.json({ success: true, message: "Journal d'audit supprimé avec succès." });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // DELETE all audit logs (bulk clear)
  app.delete("/api/audit-logs", requireAuth, async (req: AuthRequest, res) => {
    if (!req.user || !hasAnyRole(req.user.role, SUPER_ADMIN_ROLES)) {
      res.status(403).json({ error: "Acces refuse : seul le SuperAdmin peut vider les journaux d'audit." });
      return;
    }
    try {
      await db.delete(auditLogs);
      res.json({ success: true, message: "Tous les journaux d'audit ont été supprimés." });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // M1: Etablissements
  app.get("/api/etablissements", requireAuth, async (req: AuthRequest, res) => {
    try {
      const results = await db.select().from(etablissements).orderBy(asc(etablissements.id));
      res.json(filterEstablishmentsForRequester(results, req.user));
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/etablissements", requireAuth, async (req: AuthRequest, res) => {
    if (!requireAnyRole(req, res, DSE_ROLES, "Accès refusé : la gestion des établissements est réservée au Directeur DSE.")) return;
    try {
      const { nom, type, arrondissement, statut, nomDirecteur, coordonnees, force } = req.body;

      // 1. Validation des champs obligatoires et format
      if (!nom || !nom.trim()) {
        res.status(400).json({ error: "Le nom de l'établissement est requis." });
        return;
      }
      if (!type || !["Primaire", "Secondaire"].includes(type)) {
        res.status(400).json({ error: "Le type doit être 'Primaire' ou 'Secondaire'." });
        return;
      }
      if (!arrondissement || !arrondissement.trim()) {
        res.status(400).json({ error: "L'arrondissement est requis." });
        return;
      }
      if (!statut || !["public", "privé", "en construction"].includes(statut)) {
        res.status(400).json({ error: "Le statut juridique doit être 'public', 'privé' ou 'en construction'." });
        return;
      }

      // Validation du format des coordonnées (ex: "12.368, -1.527")
      if (coordonnees && coordonnees.trim()) {
        const coordRegex = /^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/;
        if (!coordRegex.test(coordonnees.trim())) {
          res.status(400).json({ error: "Format des coordonnées géographiques invalide. Attendu: 'Latitude, Longitude' (ex: 12.368, -1.527)." });
          return;
        }
      }

      // 2. Détection de doublons sur la paire (nom + arrondissement)
      const normalizedNom = nom.trim().toLowerCase();
      const normalizedArrondissement = arrondissement.trim();

      const existing = await db.select().from(etablissements).where(
        and(
          ilike(etablissements.nom, normalizedNom),
          eq(etablissements.arrondissement, normalizedArrondissement),
          eq(etablissements.archived, false)
        )
      );

      if (existing.length > 0 && !force) {
        res.status(409).json({
          error: "CONFLIT_DOUBLON",
          message: `Un établissement portant le nom "${nom}" existe déjà dans l'${arrondissement}.`
        });
        return;
      }

      // 3. Enregistrement avec le statut « actif » (archived: false)
      const result = await db.insert(etablissements).values({
        nom: nom.trim(),
        type,
        arrondissement,
        statut,
        nomDirecteur: nomDirecteur ? nomDirecteur.trim() : null,
        coordonnees: coordonnees ? coordonnees.trim() : null,
        archived: false
      }).returning();

      // 4. Pré-remplissage automatique selon le modèle type choisi (SF-22 / SF-16)
      const mt = req.body.modeleType;
      if (mt === 'A' || mt === 'B' || mt === 'C') {
        const isModelA = mt === 'A';
        const isModelB = mt === 'B';
        
        const studyRooms = isModelA ? 6 : (isModelB ? 12 : 18);
        const staffLatrines = isModelA ? 4 : (isModelB ? 6 : 8);
        const studentLatrines = isModelA ? 8 : (isModelB ? 12 : 16);
        const waterPoints = isModelA ? 1 : (isModelB ? 2 : 3);
        const labs = isModelA ? 0 : (isModelB ? 2 : 3);
        const libs = isModelA ? 0 : (isModelB ? 1 : 2);

        // Insert prefilled Infrastructure
        await db.insert(infrastructures).values({
          etablissementId: result[0].id,
          batimentsEtudes: { total: studyRooms, bonEtat: studyRooms, degrade: 0, horsService: 0 },
          batimentsAdmin: { total: isModelA ? 1 : 2, bonEtat: isModelA ? 1 : 2, degrade: 0, horsService: 0 },
          laboratoires: labs,
          bibliotheque: libs,
          cuisine: 1,
          parking: 1,
          murCloture: 1,
          latrinesPersonnel: staffLatrines,
          latrinesEleves: studentLatrines,
          pointsEau: waterPoints,
          espacesLibres: "Cour de récréation et terrain de sport prévus",
          conformite: "Conforme"
        });

        // Insert prefilled Mobilier
        await db.insert(mobilier).values({
          etablissementId: result[0].id,
          tablesBancs: studyRooms * 25, // e.g. 25 tables per room
          chaisesEleves: studyRooms * 50,
          tablesBureau: isModelA ? 6 : (isModelB ? 12 : 18),
          chaisesBureau: isModelA ? 12 : (isModelB ? 24 : 36)
        });
      }

      // Journalisation de l'action
      await logAudit(
        req.user?.id || null,
        "CREATION_ETABLISSEMENT",
        "etablissements",
        result[0].id,
        { nom: result[0].nom, arrondissement: result[0].arrondissement, type: result[0].type, prefilledModel: mt || "None" }
      );

      res.json({ success: true, message: "L'établissement a été créé avec succès.", etablissement: result[0] });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/etablissements/:id", requireAuth, async (req: AuthRequest, res) => {
    if (!requireAnyRole(req, res, DSE_ROLES, "Accès refusé : la gestion des établissements est réservée au Directeur DSE.")) return;
    try {
      const { nom, type, arrondissement, statut, nomDirecteur, coordonnees, archived, force } = req.body;
      const id = parseInt(req.params.id);

      // 1. Validation des champs obligatoires et format
      if (!nom || !nom.trim()) {
        res.status(400).json({ error: "Le nom de l'établissement est requis." });
        return;
      }
      if (!type || !["Primaire", "Secondaire"].includes(type)) {
        res.status(400).json({ error: "Le type doit être 'Primaire' ou 'Secondaire'." });
        return;
      }
      if (!arrondissement || !arrondissement.trim()) {
        res.status(400).json({ error: "L'arrondissement est requis." });
        return;
      }
      if (!statut || !["public", "privé", "en construction"].includes(statut)) {
        res.status(400).json({ error: "Le statut juridique doit être 'public', 'privé' ou 'en construction'." });
        return;
      }

      // Validation du format des coordonnées (ex: "12.368, -1.527")
      if (coordonnees && coordonnees.trim()) {
        const coordRegex = /^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/;
        if (!coordRegex.test(coordonnees.trim())) {
          res.status(400).json({ error: "Format des coordonnées géographiques invalide. Attendu: 'Latitude, Longitude' (ex: 12.368, -1.527)." });
          return;
        }
      }

      // 2. Détection de doublons (à l'exclusion de l'établissement en cours de modification)
      const normalizedNom = nom.trim().toLowerCase();
      const normalizedArrondissement = arrondissement.trim();

      const existing = await db.select().from(etablissements).where(
        and(
          ilike(etablissements.nom, normalizedNom),
          eq(etablissements.arrondissement, normalizedArrondissement),
          eq(etablissements.archived, false),
          ne(etablissements.id, id)
        )
      );

      if (existing.length > 0 && !force) {
        res.status(409).json({
          error: "CONFLIT_DOUBLON",
          message: `Un établissement portant le nom "${nom}" existe déjà dans l'${arrondissement}.`
        });
        return;
      }

      // 3. Enregistrement des modifications
      const updated = await db.update(etablissements).set({
        nom: nom.trim(),
        type,
        arrondissement,
        statut,
        nomDirecteur: nomDirecteur ? nomDirecteur.trim() : null,
        coordonnees: coordonnees ? coordonnees.trim() : null,
        archived: archived !== undefined ? archived : false
      }).where(eq(etablissements.id, id)).returning();

      if (updated.length === 0) {
        res.status(404).json({ error: "Établissement non trouvé" });
        return;
      }

      // Journalisation de l'action
      await logAudit(
        req.user?.id || null,
        "MODIFICATION_ETABLISSEMENT",
        "etablissements",
        id,
        { nom: updated[0].nom, arrondissement: updated[0].arrondissement, type: updated[0].type, archived: updated[0].archived }
      );

      res.json({ success: true, message: "L'établissement a été modifié avec succès.", etablissement: updated[0] });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Archivage logique au lieu de suppression définitive (SF-02)
  app.delete("/api/etablissements/:id", requireAuth, async (req: AuthRequest, res) => {
    if (!requireAnyRole(req, res, DSE_ROLES, "Accès refusé : l'archivage des établissements est réservé au Directeur DSE.")) return;
    try {
      const id = parseInt(req.params.id);
      const updated = await db.update(etablissements).set({
        archived: true
      }).where(eq(etablissements.id, id)).returning();

      if (updated.length === 0) {
        res.status(404).json({ error: "Établissement non trouvé" });
        return;
      }

      // Journalisation de l'action
      await logAudit(
        req.user?.id || null,
        "ARCHIVAGE_ETABLISSEMENT",
        "etablissements",
        id,
        { nom: updated[0].nom, arrondissement: updated[0].arrondissement, archived: true }
      );

      res.json({ success: true, message: "L'établissement a été archivé avec succès.", etablissement: updated[0] });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/etablissements/bulk", requireAuth, async (req: AuthRequest, res) => {
    if (!requireAnyRole(req, res, DSE_ROLES, "Accès refusé : l'importation des établissements est réservée au Directeur DSE.")) return;
    try {
      const data = req.body;
      if (!Array.isArray(data)) {
        res.status(400).json({ error: "Invalid data format. Expected an array." });
        return;
      }

      const report = {
        total: data.length,
        imported: 0,
        duplicates: 0,
        errors: 0,
        details: [] as string[]
      };

      const existing = await db.select({ nom: etablissements.nom, arrondissement: etablissements.arrondissement }).from(etablissements);
      const existingSet = new Set(existing.map(e => `${e.nom}-${e.arrondissement}`.toLowerCase()));

      const toInsert = [];

      for (const item of data) {
        if (!item.nom || !item.arrondissement || !item.type || !item.statut) {
          report.errors++;
          report.details.push(`Ligne invalide (champs requis manquants) : ${item.nom || 'Inconnu'}`);
          continue;
        }

        const key = `${item.nom}-${item.arrondissement}`.toLowerCase();
        if (existingSet.has(key)) {
          report.duplicates++;
          report.details.push(`Doublon ignoré : ${item.nom} (${item.arrondissement})`);
          continue;
        }

        toInsert.push({
          nom: item.nom,
          type: item.type,
          arrondissement: item.arrondissement,
          statut: item.statut,
          nomDirecteur: item.nomDirecteur || null,
          coordonnees: item.coordonnees || null
        });
        existingSet.add(key); // Prevent duplicates within the import file itself
      }

      if (toInsert.length > 0) {
        await db.insert(etablissements).values(toInsert);
        report.imported = toInsert.length;
      }

      res.json(report);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/etablissements/upload", requireAuth, upload.single("file"), async (req: AuthRequest, res) => {
    if (!requireAnyRole(req, res, DSE_ROLES, "Accès refusé : l'importation des établissements est réservée au Directeur DSE.")) return;
    try {
      const file = (req as any).file;
      if (!file) {
        res.status(400).json({ error: "Aucun fichier fourni." });
        return;
      }

      let parsedData: any[] = [];
      const filename = file.originalname.toLowerCase();

      if (filename.endsWith('.csv')) {
        const csvString = file.buffer.toString('utf-8');
        const parseResult = Papa.parse(csvString, { header: true, skipEmptyLines: true });
        parsedData = parseResult.data;
      } else if (filename.endsWith('.xlsx') || filename.endsWith('.xls')) {
        const workbook = xlsx.read(file.buffer, { type: 'buffer' });
        const firstSheet = workbook.SheetNames[0];
        parsedData = xlsx.utils.sheet_to_json(workbook.Sheets[firstSheet]);
      } else if (filename.endsWith('.pdf')) {
        const parser = new PDFParse({ data: file.buffer });
        const pdfResult = await parser.getText();
        await parser.destroy();
        const extractedText = pdfResult.text?.trim() || '';
        if (!extractedText) {
          res.status(400).json({ error: "Le PDF ne contient pas de texte exploitable. Pour un PDF scanne, utilisez la saisie manuelle ou un PDF avec OCR." });
          return;
        }
        res.json({
          pdf: true,
          filename: file.originalname,
          pages: extractedText.split('\f').length,
          total: 0,
          imported: 0,
          duplicates: 0,
          errors: 0,
          details: ["PDF lu avec succes. Les tableaux PDF sont affiches en apercu et doivent etre verifies avant saisie dans Rapports scolaires annuels."],
          textPreview: extractedText.slice(0, 60000)
        });
        return;
      } else {
        res.status(400).json({ error: "Format de fichier non supporté. Utilisez CSV, Excel ou PDF." });
        return;
      }

      if (parsedData.length === 0) {
        res.status(400).json({ error: "Le fichier importé est vide ou ne contient aucune ligne de données." });
        return;
      }

      // Analyse de la structure du fichier (colonnes attendues)
      const normalizeImportLabel = (value: unknown) => String(value ?? '')
        .replace(/^\uFEFF/, '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim()
        .replace(/[’']/g, "'")
        .replace(/\s+/g, ' ');

      const firstRow = parsedData[0];
      const headers = Object.keys(firstRow).flatMap((header) => {
        const normalized = normalizeImportLabel(header);
        const aliases = [normalized];
        if (normalized.startsWith('nom ')) aliases.push('nom');
        if (normalized.startsWith('type ')) aliases.push('type');
        if (normalized.startsWith('statut ')) aliases.push('statut');
        if (normalized.startsWith('arrondissement ')) aliases.push('arrondissement');
        return aliases;
      });

      const hasNom = headers.some(h => ['nom', 'nom de l\'établissement', 'nom_etablissement', 'intitule', 'établissement'].includes(h.toLowerCase().trim()));
      const hasType = headers.some(h => ['type', 'type d\'établissement', 'type_etablissement', 'catégorie'].includes(h.toLowerCase().trim()));
      const hasArr = headers.some(h => ['arrondissement', 'secteur', 'zone', 'commune'].includes(h.toLowerCase().trim()));
      const hasStatut = headers.some(h => ['statut', 'statut juridique', 'statut_juridique', 'juridique'].includes(h.toLowerCase().trim()));

      if (!hasNom || !hasType || !hasArr || !hasStatut) {
        const missing = [];
        if (!hasNom) missing.push("Nom");
        if (!hasType) missing.push("Type");
        if (!hasArr) missing.push("Arrondissement");
        if (!hasStatut) missing.push("Statut");
        res.status(400).json({
          error: `Structure du fichier invalide. Les colonnes obligatoires suivantes sont manquantes : ${missing.join(', ')}. Colonnes attendues : Nom, Type, Arrondissement, Statut (Directeur, Coordonnées sont optionnelles).`
        });
        return;
      }

      const getVal = (row: any, synonyms: string[], defaultVal = '') => {
        const normalizedSynonyms = synonyms.map(normalizeImportLabel);
        const key = Object.keys(row).find(k => {
          const normalizedKey = normalizeImportLabel(k);
          return normalizedSynonyms.includes(normalizedKey)
            || (normalizedSynonyms.includes('nom') && normalizedKey.startsWith('nom '))
            || (normalizedSynonyms.includes('type') && normalizedKey.startsWith('type '))
            || (normalizedSynonyms.includes('statut') && normalizedKey.startsWith('statut '))
            || (normalizedSynonyms.includes('arrondissement') && normalizedKey.startsWith('arrondissement '));
        });
        return key ? String(row[key]).trim() : defaultVal;
      };

      const mappedData = parsedData.map((row: any, index: number) => {
        const nom = getVal(row, ['nom', 'nom de l\'établissement', 'nom_etablissement', 'intitule', 'établissement']);
        const type = getVal(row, ['type', 'type d\'établissement', 'type_etablissement', 'catégorie'], 'Primaire');
        const arrondissement = getVal(row, ['arrondissement', 'secteur', 'zone', 'commune'], 'Arrondissement 1');
        const statut = getVal(row, ['statut', 'statut juridique', 'statut_juridique', 'juridique'], 'public');
        const nomDirecteur = getVal(row, ['directeur', 'nomdirecteur', 'nom directeur', 'directeur/proviseur', 'responsable', 'nom_directeur']);
        const coordonnees = getVal(row, ['coordonnées', 'coordonnees', 'localisation', 'gps', 'position']);

        return {
          line: index + 2, // Ligne 1 est l'en-tête
          nom,
          type,
          arrondissement,
          statut,
          nomDirecteur,
          coordonnees,
          originalRow: row
        };
      });

      const report = {
        total: mappedData.length,
        imported: 0,
        duplicates: 0,
        errors: 0,
        details: [] as string[],
        errorRows: [] as any[]
      };

      // Chargement de l'index des établissements existants pour détection des doublons sur la paire (nom + arrondissement)
      const existing = await db.select({ nom: etablissements.nom, arrondissement: etablissements.arrondissement }).from(etablissements);
      const existingSet = new Set(existing.map(e => `${e.nom.trim()}-${e.arrondissement.trim()}`.toLowerCase()));

      const toInsert = [];

      for (const item of mappedData) {
        // Validation des champs requis
        if (!item.nom) {
          report.errors++;
          const reason = "Le nom de l'établissement est requis.";
          report.details.push(`Ligne ${item.line} : ${reason}`);
          report.errorRows.push({ ...item, motif: reason });
          continue;
        }

        if (!item.arrondissement) {
          report.errors++;
          const reason = "L'arrondissement est requis.";
          report.details.push(`Ligne ${item.line} [${item.nom}] : ${reason}`);
          report.errorRows.push({ ...item, motif: reason });
          continue;
        }

        // Standardisation et validation du Type (Primaire ou Secondaire)
        const normalizedTypeValue = normalizeImportLabel(item.type);
        let normalizedType = item.type;
        if (normalizedTypeValue.startsWith('prim') || normalizedTypeValue.includes('ecole primaire')) {
          normalizedType = 'Primaire';
        } else if (normalizedTypeValue.startsWith('sec') || normalizedTypeValue.includes('etablissement secondaire')) {
          normalizedType = 'Secondaire';
        } else {
          normalizedType = normalizedType.charAt(0).toUpperCase() + normalizedType.slice(1).toLowerCase();
        }

        if (normalizedType !== 'Primaire' && normalizedType !== 'Secondaire') {
          report.errors++;
          const reason = `Le type doit être 'Primaire' ou 'Secondaire' (reçu : '${item.type}').`;
          report.details.push(`Ligne ${item.line} [${item.nom}] : ${reason}`);
          report.errorRows.push({ ...item, motif: reason });
          continue;
        }

        // Standardisation et validation du Statut
        const privateStatus = "priv\u00e9";
        let normalizedStatut = normalizeImportLabel(item.statut);
        if (normalizedStatut === 'publique') normalizedStatut = 'public';
        if (normalizedStatut === 'prive' || normalizedStatut === 'privee') normalizedStatut = privateStatus;
        if (normalizedStatut === 'public' || normalizedStatut === 'prive' || normalizedStatut === 'privé' || normalizedStatut === 'en construction') {
          if (normalizedStatut === 'prive') normalizedStatut = 'privé';
        } else {
          report.errors++;
          const reason = `Le statut doit être 'public', 'privé' ou 'en construction' (reçu : '${item.statut}').`;
          report.details.push(`Ligne ${item.line} [${item.nom}] : ${reason}`);
          report.errorRows.push({ ...item, motif: reason });
          continue;
        }

        // Validation du format des coordonnées géographiques (si fournies)
        if (item.coordonnees && item.coordonnees.trim()) {
          const coordRegex = /^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/;
          if (!coordRegex.test(item.coordonnees.trim())) {
            report.errors++;
            const reason = "Format des coordonnées géographiques invalide. Attendu: 'Latitude, Longitude' (ex: 12.368, -1.527).";
            report.details.push(`Ligne ${item.line} [${item.nom}] : ${reason}`);
            report.errorRows.push({ ...item, motif: reason });
            continue;
          }
        }

        // Détection de doublons sur la paire (nom + arrondissement)
        const key = `${item.nom.trim()}-${item.arrondissement.trim()}`.toLowerCase();
        if (existingSet.has(key)) {
          report.duplicates++;
          const reason = `Un établissement portant le nom "${item.nom}" existe déjà dans l'${item.arrondissement}.`;
          report.details.push(`Ligne ${item.line} : Doublon ignoré - ${item.nom} (${item.arrondissement})`);
          report.errorRows.push({ ...item, motif: reason });
          continue;
        }

        // Ajout à la liste d'insertion
        toInsert.push({
          nom: item.nom.trim(),
          type: normalizedType,
          arrondissement: item.arrondissement.trim(),
          statut: normalizedStatut,
          nomDirecteur: item.nomDirecteur ? item.nomDirecteur.trim() : null,
          coordonnees: item.coordonnees ? item.coordonnees.trim() : null,
          archived: false
        });

        // Enregistrement immédiat dans l'index local pour éviter les doublons intrapares du même fichier
        existingSet.add(key);
      }

      if (toInsert.length > 0) {
        const inserted = await db.insert(etablissements).values(toInsert).returning();
        report.imported = inserted.length;

        // Journalisation de l'action de masse
        await logAudit(
          req.user?.id || null,
          "IMPORT_MASSE_ETABLISSEMENTS",
          "etablissements",
          inserted[0].id,
          { count: inserted.length, total: mappedData.length }
        );
      }

      res.json(report);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // M2: Infrastructures
  app.get("/api/infrastructures", requireAuth, async (req: AuthRequest, res) => {
    try {
      const results = await db
        .select({
           id: infrastructures.id,
           etablissementId: etablissements.id,
           nomEtablissement: etablissements.nom,
           typeEtablissement: etablissements.type,
           arrondissement: etablissements.arrondissement,
           batimentsEtudes: infrastructures.batimentsEtudes,
           batimentsAdmin: infrastructures.batimentsAdmin,
           laboratoires: infrastructures.laboratoires,
           bibliotheque: infrastructures.bibliotheque,
           cuisine: infrastructures.cuisine,
           parking: infrastructures.parking,
           murCloture: infrastructures.murCloture,
           latrinesPersonnel: infrastructures.latrinesPersonnel,
           latrinesEleves: infrastructures.latrinesEleves,
           pointsEau: infrastructures.pointsEau,
           infirmerie: infrastructures.infirmerie,
           espacesLibres: infrastructures.espacesLibres,
           conformite: infrastructures.conformite,
           lastUpdated: infrastructures.lastUpdated,
        })
        .from(etablissements)
        .leftJoin(infrastructures, eq(infrastructures.etablissementId, etablissements.id));
       const visible = filterRowsForRequester(results, req.user);
       res.json(await attachModuleWorkflow(visible, 'infrastructures'));
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/infrastructures", requireAuth, async (req: AuthRequest, res) => {
    if (!requireAnyRole(req, res, SCHOOL_WRITE_ROLES, "Accès refusé : Vous n'avez pas les droits d'écriture sur les infrastructures.")) return;
    try {
      const { 
        etablissementId,
        batimentsEtudes,
        batimentsAdmin,
        laboratoires,
        bibliotheque,
        cuisine,
        parking,
        murCloture,
        latrinesPersonnel,
        latrinesEleves,
        pointsEau,
        infirmerie,
        espacesLibres,
        conformite
      } = req.body;
      const workflowAction = req.body.workflowAction === 'save' ? 'save' : 'submit';

      if (!etablissementId) {
        res.status(400).json({ error: "L'ID de l'établissement est requis." });
        return;
      }
      if (hasAnyRole(req.user?.role, LOCAL_SCHOOL_ROLES) && Number(etablissementId) !== req.user?.etablissementId) {
        res.status(403).json({ error: "Vous ne pouvez modifier que les infrastructures de votre etablissement." });
        return;
      }

      const existing = await db.select().from(infrastructures).where(eq(infrastructures.etablissementId, etablissementId)).limit(1);

      let savedInfrastructure;
      if (existing.length > 0) {
        const updated = await db.update(infrastructures).set({
          batimentsEtudes,
          batimentsAdmin,
          laboratoires,
          bibliotheque,
          cuisine,
          parking,
          murCloture,
          latrinesPersonnel,
          latrinesEleves,
          pointsEau,
          infirmerie,
          espacesLibres,
          conformite,
          lastUpdated: new Date()
        }).where(eq(infrastructures.etablissementId, etablissementId)).returning();
        savedInfrastructure = updated[0];
      } else {
        const inserted = await db.insert(infrastructures).values({
          etablissementId,
          batimentsEtudes,
          batimentsAdmin,
          laboratoires,
          bibliotheque,
          cuisine,
          parking,
          murCloture,
          latrinesPersonnel,
          latrinesEleves,
          pointsEau,
          infirmerie,
          espacesLibres,
          conformite
        }).returning();
        savedInfrastructure = inserted[0];
      }
      const workflow = await saveModuleWorkflow({
        module: 'infrastructures',
        recordId: savedInfrastructure.id,
        etablissementId: Number(etablissementId),
        requester: req.user,
        action: workflowAction
      });
      res.json({ ...savedInfrastructure, workflowStatus: workflow.statut });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // M3: Effectifs
  app.get("/api/effectifs", requireAuth, async (req: AuthRequest, res) => {
    try {
      const results = await db
        .select({
          id: effectifs.id,
          etablissementId: etablissements.id,
          nomEtablissement: etablissements.nom,
          typeEtablissement: etablissements.type,
          arrondissement: etablissements.arrondissement,
          anneeScolaire: effectifs.anneeScolaire,
          elevesFilles: effectifs.elevesFilles,
          elevesGarcons: effectifs.elevesGarcons,
          enseignants: effectifs.enseignants,
          personnelsAdmin: effectifs.personnelsAdmin
        })
        .from(etablissements)
        .leftJoin(effectifs, eq(effectifs.etablissementId, etablissements.id));
      const visible = filterRowsForRequester(results, req.user);
      res.json(await attachModuleWorkflow(visible, 'effectifs'));
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/effectifs", requireAuth, async (req: AuthRequest, res) => {
    if (!requireAnyRole(req, res, SCHOOL_WRITE_ROLES, "Accès refusé : Vous n'avez pas les droits d'écriture requis.")) return;
    try {
      const { etablissementId, anneeScolaire, elevesFilles, elevesGarcons, enseignants, personnelsAdmin } = req.body;
      const workflowAction = req.body.workflowAction === 'save' ? 'save' : 'submit';
      if (!etablissementId || !anneeScolaire) {
        res.status(400).json({ error: "L'ID de l'établissement et l'année scolaire sont requis." });
        return;
      }
      if (hasAnyRole(req.user?.role, LOCAL_SCHOOL_ROLES) && Number(etablissementId) !== req.user?.etablissementId) {
        res.status(403).json({ error: "Vous ne pouvez modifier que les effectifs de votre etablissement." });
        return;
      }
      const existing = await db.select().from(effectifs).where(
        eq(effectifs.etablissementId, etablissementId)
      ).limit(1);

      let savedEffectifs;
      if (existing.length > 0) {
        // Update the most recent or the matching one (simplified: update the first one found)
        const updated = await db.update(effectifs).set({
          elevesFilles,
          elevesGarcons,
          enseignants,
          personnelsAdmin,
          anneeScolaire
        }).where(eq(effectifs.id, existing[0].id)).returning();
        savedEffectifs = updated[0];
      } else {
        const inserted = await db.insert(effectifs).values({
          etablissementId,
          anneeScolaire,
          elevesFilles,
          elevesGarcons,
          enseignants,
          personnelsAdmin
        }).returning();
        savedEffectifs = inserted[0];
      }
      const workflow = await saveModuleWorkflow({
        module: 'effectifs',
        recordId: savedEffectifs.id,
        etablissementId: Number(etablissementId),
        requester: req.user,
        action: workflowAction
      });
      res.json({ ...savedEffectifs, workflowStatus: workflow.statut });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // M4: Mobilier
  app.get("/api/mobilier", requireAuth, async (req: AuthRequest, res) => {
    try {
      const results = await db
        .select({
          id: mobilier.id,
          etablissementId: etablissements.id,
          nomEtablissement: etablissements.nom,
          typeEtablissement: etablissements.type,
          arrondissement: etablissements.arrondissement,
          tablesBancs: mobilier.tablesBancs,
          chaisesEleves: mobilier.chaisesEleves,
          tablesBureau: mobilier.tablesBureau,
          chaisesBureau: mobilier.chaisesBureau,
          lastUpdated: mobilier.lastUpdated,
          elevesFilles: effectifs.elevesFilles,
          elevesGarcons: effectifs.elevesGarcons,
          enseignants: effectifs.enseignants,
          personnelsAdmin: effectifs.personnelsAdmin,
          anneeScolaire: effectifs.anneeScolaire
        })
        .from(etablissements)
        .leftJoin(mobilier, eq(mobilier.etablissementId, etablissements.id))
        .leftJoin(effectifs, eq(effectifs.etablissementId, etablissements.id));
      const visible = filterRowsForRequester(results, req.user);
      res.json(await attachModuleWorkflow(visible, 'mobilier'));
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/mobilier", requireAuth, async (req: AuthRequest, res) => {
    if (!requireAnyRole(req, res, SCHOOL_WRITE_ROLES, "Accès refusé : vous n'avez pas les droits d'écriture sur le mobilier.")) return;
    try {
      const { etablissementId, tablesBancs, chaisesEleves, tablesBureau, chaisesBureau } = req.body;
      const workflowAction = req.body.workflowAction === 'save' ? 'save' : 'submit';
      if (!etablissementId) {
        res.status(400).json({ error: "L'ID de l'établissement est requis." });
        return;
      }
      if (hasAnyRole(req.user?.role, LOCAL_SCHOOL_ROLES) && Number(etablissementId) !== req.user?.etablissementId) {
        res.status(403).json({ error: "Vous ne pouvez modifier que le mobilier de votre établissement." });
        return;
      }
      const existing = await db.select().from(mobilier).where(eq(mobilier.etablissementId, etablissementId)).limit(1);
      
      let savedMobilier;
      if (existing.length > 0) {
        const updated = await db.update(mobilier).set({
          tablesBancs,
          chaisesEleves,
          tablesBureau,
          chaisesBureau,
          lastUpdated: new Date()
        }).where(eq(mobilier.etablissementId, etablissementId)).returning();
        savedMobilier = updated[0];
      } else {
        const inserted = await db.insert(mobilier).values({
          etablissementId,
          tablesBancs,
          chaisesEleves,
          tablesBureau,
          chaisesBureau
        }).returning();
        savedMobilier = inserted[0];
      }
      const workflow = await saveModuleWorkflow({
        module: 'mobilier',
        recordId: savedMobilier.id,
        etablissementId: Number(etablissementId),
        requester: req.user,
        action: workflowAction
      });
      res.json({ ...savedMobilier, workflowStatus: workflow.statut });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/mobilier/dotation", requireAuth, async (req: AuthRequest, res) => {
    if (!requireAnyRole(req, res, DSE_ROLES, "Accès refusé : Seule la DSE peut enregistrer une dotation mobilier.")) return;
    try {
      const { etablissementId, tablesBancs, chaisesEleves, tablesBureau, chaisesBureau, motif } = req.body;
      
      if (!etablissementId) {
        res.status(400).json({ error: "L'ID de l'établissement est requis." });
        return;
      }

      const existing = await db.select().from(mobilier).where(eq(mobilier.etablissementId, etablissementId)).limit(1);
      
      let finalResult;
      const addTablesBancs = Number(tablesBancs || 0);
      const addChaisesEleves = Number(chaisesEleves || 0);
      const addTablesBureau = Number(tablesBureau || 0);
      const addChaisesBureau = Number(chaisesBureau || 0);

      if (existing.length > 0) {
        const updated = await db.update(mobilier).set({
          tablesBancs: (existing[0].tablesBancs || 0) + addTablesBancs,
          chaisesEleves: (existing[0].chaisesEleves || 0) + addChaisesEleves,
          tablesBureau: (existing[0].tablesBureau || 0) + addTablesBureau,
          chaisesBureau: (existing[0].chaisesBureau || 0) + addChaisesBureau,
          lastUpdated: new Date()
        }).where(eq(mobilier.etablissementId, etablissementId)).returning();
        finalResult = updated[0];
      } else {
        const inserted = await db.insert(mobilier).values({
          etablissementId,
          tablesBancs: addTablesBancs,
          chaisesEleves: addChaisesEleves,
          tablesBureau: addTablesBureau,
          chaisesBureau: addChaisesBureau
        }).returning();
        finalResult = inserted[0];
      }

      // Log the dotation in audit logs
      await logAudit(
        req.user?.id || null,
        "DOTATION_MOBILIER",
        "mobilier",
        finalResult.id,
        {
          added: {
            tablesBancs: addTablesBancs,
            chaisesEleves: addChaisesEleves,
            tablesBureau: addTablesBureau,
            chaisesBureau: addChaisesBureau
          },
          motif: motif || "Dotation officielle de mobilier"
        }
      );

      res.json(finalResult);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // M5: Constructions
  app.get("/api/constructions", requireAuth, async (req: AuthRequest, res) => {
    try {
      const results = await db.select().from(constructions).orderBy(constructions.createdAt);
      const visible = filterRowsForRequester(results, req.user);
      res.json(await attachModuleWorkflow(visible, 'constructions'));
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/constructions", requireAuth, async (req: AuthRequest, res) => {
    if (!requireAnyRole(req, res, [...DSE_ROLES, ...LOCAL_SCHOOL_ROLES], "Accès refusé : seuls la DSE et les responsables scolaires peuvent signaler une construction.")) return;
    try {
      const { intitule, localisation, arrondissement, datesPrevisionnelles, maitreOuvrage, budget, modeleType, statut, avancement } = req.body;
      if (!intitule) {
        res.status(400).json({ error: "L'intitulé est requis." });
        return;
      }
      
      const isLocal = hasAnyRole(req.user?.role, LOCAL_SCHOOL_ROLES);
      if (isLocal && !req.user?.etablissementId) {
        res.status(400).json({ error: "Votre compte n'est pas rattaché à un établissement." });
        return;
      }
      const targetEtablissementId = isLocal ? req.user?.etablissementId : (req.body.etablissementId ? Number(req.body.etablissementId) : null);
      const inserted = await db.insert(constructions).values({
        etablissementId: targetEtablissementId || null,
        intitule,
        localisation: isLocal ? (localisation || null) : localisation,
        arrondissement: isLocal ? (req.user?.arrondissement || arrondissement || null) : arrondissement,
        datesPrevisionnelles,
        maitreOuvrage: isLocal ? null : maitreOuvrage,
        budget: isLocal ? null : budget,
        modeleType: isLocal ? null : modeleType,
        avancement: isLocal ? 0 : (avancement != null ? parseInt(avancement.toString()) : 0),
        statut: isLocal ? 'Demande' : (statut || 'Planifié')
      }).returning();
      
      // Journalisation de l'action
      await logAudit(
        req.user?.id || null,
        "CREATION_PROJET_CONSTRUCTION",
        "constructions",
        inserted[0].id,
        { intitule, statut: isLocal ? 'Demande' : (statut || 'Planifié'), budget }
      );

      if (targetEtablissementId) {
        const workflow = await saveModuleWorkflow({
          module: 'constructions',
          recordId: inserted[0].id,
          etablissementId: targetEtablissementId,
          requester: req.user,
          action: isLocal ? 'submit' : 'save'
        });
        res.json({ ...inserted[0], workflowStatus: workflow.statut });
        return;
      }
      res.json(inserted[0]);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/constructions/:id", requireAuth, async (req: AuthRequest, res) => {
    if (!requireAnyRole(req, res, DSE_ROLES, "Accès refusé : Seule la DSE peut modifier des projets de construction.")) return;
    try {
      const { intitule, localisation, arrondissement, datesPrevisionnelles, maitreOuvrage, budget, modeleType, statut, budgetConsomme, avancement } = req.body;
      const updated = await db.update(constructions).set({
        intitule,
        localisation,
        arrondissement,
        datesPrevisionnelles,
        maitreOuvrage,
        budget,
        budgetConsomme,
        avancement: avancement != null ? parseInt(avancement.toString()) : 0,
        modeleType,
        statut
      }).where(eq(constructions.id, parseInt(req.params.id))).returning();
      
      if (updated.length === 0) {
         res.status(404).json({ error: "Construction non trouvée" });
         return;
      }

      // Journalisation de l'action (SF-21)
      await logAudit(
        req.user?.id || null,
        "MODIFICATION_PROJET_CONSTRUCTION",
        "constructions",
        updated[0].id,
        { intitule, statut, budget, budgetConsomme }
      );

      res.json(updated[0]);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // M6: Communications
  app.get("/api/communications", requireAuth, async (req: AuthRequest, res) => {
    try {
      const results = await db.select().from(communications).orderBy(communications.createdAt);
      if (hasAnyRole(req.user?.role, [...SUPER_ADMIN_ROLES, ...DSE_ROLES])) {
        res.json(results);
        return;
      }
      if (hasAnyRole(req.user?.role, ARRONDISSEMENT_ROLES)) {
        res.json(results.filter((communication) =>
          communication.ciblage === "Tous les établissements" || communication.ciblage === req.user?.arrondissement
        ));
        return;
      }
      res.json([]);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get recipient's individual inbox (for school directors)
  app.get("/api/communications/inbox", requireAuth, async (req: AuthRequest, res) => {
    try {
      if (!req.user || !req.user.id) {
        res.status(401).json({ error: "Non autorisé" });
        return;
      }

      // Fetch all receipts for the logged-in user
      const userReceipts = await db.select()
        .from(communicationReceipts)
        .where(eq(communicationReceipts.userId, req.user.id));

      if (userReceipts.length === 0) {
        res.json([]);
        return;
      }

      // Fetch communications corresponding to those receipts
      const inboxList = [];
      for (const receipt of userReceipts) {
        const comms = await db.select().from(communications).where(eq(communications.id, receipt.communicationId)).limit(1);
        if (comms.length > 0) {
          inboxList.push({
            ...comms[0],
            receiptId: receipt.id,
            statut: receipt.statut,
            luAt: receipt.luAt,
            accuseAt: receipt.accuseAt,
            smsSentAt: receipt.smsSentAt,
            inAppSentAt: receipt.inAppSentAt
          });
        }
      }

      // Sort by creation date desc
      inboxList.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      res.json(inboxList);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Create communication with targeting and multi-channel parallel delivery
  app.post("/api/communications", requireAuth, async (req: AuthRequest, res) => {
    if (!requireAnyRole(req, res, DSE_ROLES, "Accès refusé : Seul le personnel de Direction DSE peut diffuser des communications.")) return;
    try {
      const { titre, contenu, ciblage, delaiHeures } = req.body;
      if (!titre || !contenu) {
        res.status(400).json({ error: "Le titre et le contenu sont requis." });
        return;
      }

      const limitHours = parseInt(delaiHeures) || 24;
      
      const inserted = await db.insert(communications).values({
        titre,
        contenu,
        ciblage: ciblage || "Tous les établissements",
        delaiHeures: limitHours
      }).returning();

      const communicationId = inserted[0].id;

      // RESOLUTION OF TARGETED RECIPIENTS (SF-23 / SF-26)
      // Get all school directors (role = Directeur / Proviseur)
      const allUsers = await db.select().from(users);
      const allDirectors = allUsers.filter((user) => hasAnyRole(user.role, LOCAL_SCHOOL_ROLES));
      let targetUsers = allDirectors;

      const targetStr = ciblage || "Tous les établissements";

      if (targetStr !== "Tous les établissements") {
        if (targetStr.startsWith("Arrondissement")) {
          // Filter by specific Arrondissement
          targetUsers = allDirectors.filter(u => u.arrondissement === targetStr);
        } else if (targetStr === "Écoles Primaires Uniquement") {
          // Find primary schools and match their arrondissements/profiles
          const primarySchools = await db.select().from(etablissements).where(eq(etablissements.type, "Primaire"));
          const primaryArrondissements = new Set(primarySchools.map(s => s.arrondissement));
          targetUsers = allDirectors.filter(u => u.arrondissement && primaryArrondissements.has(u.arrondissement));
        } else if (targetStr === "Lycées et Collèges Uniquement") {
          // Find secondary schools
          const secondarySchools = await db.select().from(etablissements).where(eq(etablissements.type, "Secondaire"));
          const secondaryArrondissements = new Set(secondarySchools.map(s => s.arrondissement));
          targetUsers = allDirectors.filter(u => u.arrondissement && secondaryArrondissements.has(u.arrondissement));
        }
      }

      // If no users were matched, add some test recipients so the system isn't empty during demos
      if (targetUsers.length === 0 && allDirectors.length > 0) {
        targetUsers = [allDirectors[0]];
      }

      // PARALLEL DOUBLE-CHANNEL DISPATCH (SF-26)
      // For each resolved recipient, insert a receipt record representing in-app + SMS dispatch timestamps
      for (const targetUser of targetUsers) {
        await db.insert(communicationReceipts).values({
          communicationId,
          userId: targetUser.id,
          statut: "Non lu",
          inAppSentAt: new Date(),
          smsSentAt: new Date() // SMS sent simultaneously in parallel as secondary channel
        });
      }

      // Journalisation de l'action (SF-21)
      await logAudit(
        req.user?.id || null,
        "DIFFUSION_COMMUNICATION",
        "communications",
        communicationId,
        { titre, ciblage: targetStr, targetCount: targetUsers.length, delaiHeures: limitHours }
      );
      
      res.json({
        ...inserted[0],
        recipientsRouted: targetUsers.length,
        channels: ["in-app", "SMS"]
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Mark a communication as read
  app.post("/api/communications/:id/read", requireAuth, async (req: AuthRequest, res) => {
    try {
      const commId = parseInt(req.params.id);
      if (!req.user || !req.user.id) {
        res.status(401).json({ error: "Non autorisé" });
        return;
      }

      const receipt = await db.select()
        .from(communicationReceipts)
        .where(
          and(
            eq(communicationReceipts.communicationId, commId),
            eq(communicationReceipts.userId, req.user.id)
          )
        )
        .limit(1);

      if (receipt.length > 0) {
        // Only update status if it's currently 'Non lu'
        if (receipt[0].statut === "Non lu") {
          await db.update(communicationReceipts)
            .set({
              statut: "Lu",
              luAt: new Date()
            })
            .where(eq(communicationReceipts.id, receipt[0].id));
        }
        res.json({ success: true, message: "Marqué comme lu" });
      } else {
        res.status(404).json({ error: "Accusé non trouvé pour cet utilisateur" });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Acknowledge a communication (Accuser réception) (SF-24)
  app.post("/api/communications/:id/acknowledge", requireAuth, async (req: AuthRequest, res) => {
    try {
      const commId = parseInt(req.params.id);
      if (!req.user || !req.user.id) {
        res.status(401).json({ error: "Non autorisé" });
        return;
      }

      const receipt = await db.select()
        .from(communicationReceipts)
        .where(
          and(
            eq(communicationReceipts.communicationId, commId),
            eq(communicationReceipts.userId, req.user.id)
          )
        )
        .limit(1);

      if (receipt.length > 0) {
        await db.update(communicationReceipts)
          .set({
            statut: "Accusé",
            accuseAt: new Date()
          })
          .where(eq(communicationReceipts.id, receipt[0].id));

        // Log audit
        await logAudit(
          req.user.id,
          "ACCUSE_RECEPTION_COMMUNICATION",
          "communications",
          commId,
          { receiptId: receipt[0].id }
        );

        res.json({ success: true, message: "Accusé de réception enregistré avec succès." });
      } else {
        res.status(404).json({ error: "Accusé non trouvé pour cet utilisateur" });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get receipts details for a specific communication (for DSE Director)
  app.get("/api/communications/:id/receipts", requireAuth, async (req: AuthRequest, res) => {
    if (!requireAnyRole(req, res, DSE_ROLES, "Accès refusé : le suivi des accusés est réservé à la DSE.")) return;
    try {
      const commId = parseInt(req.params.id);
      const receiptsList = await db.select().from(communicationReceipts).where(eq(communicationReceipts.communicationId, commId));
      
      const allEtabs = await db.select().from(etablissements);
      
      const detailedReceipts = [];
      for (const rec of receiptsList) {
        const u = await db.select().from(users).where(eq(users.id, rec.userId)).limit(1);
        let userObj = null;
        let matchedEtab = null;

        if (u.length > 0) {
          const user = u[0];
          userObj = {
            id: user.id,
            email: user.email,
            arrondissement: user.arrondissement,
            role: user.role,
            nom: user.nom,
            prenom: user.prenom,
            telephone: user.telephone
          };

          // Find matching establishment
          const userFullName = `${user.prenom || ''} ${user.nom || ''}`.trim().toLowerCase();
          matchedEtab = allEtabs.find(etab => {
            const dirName = (etab.nomDirecteur || '').trim().toLowerCase();
            return dirName && userFullName && (
              userFullName.includes(dirName) || 
              dirName.includes(userFullName) || 
              (user.nom && dirName.includes(user.nom.toLowerCase()))
            );
          });
        }

        detailedReceipts.push({
          ...rec,
          user: userObj,
          etablissement: matchedEtab ? {
            id: matchedEtab.id,
            nom: matchedEtab.nom,
            type: matchedEtab.type,
            arrondissement: matchedEtab.arrondissement,
            nomDirecteur: matchedEtab.nomDirecteur
          } : null
        });
      }

      res.json(detailedReceipts);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get tardiness alerts for DSE Director (Unacknowledged beyond deadline) (SF-25)
  app.get("/api/communications/alerts", requireAuth, async (req: AuthRequest, res) => {
    if (!requireAnyRole(req, res, DSE_ROLES, "Accès refusé : les alertes de retard sont réservées à la DSE.")) return;
    try {
      // Find all communications
      const allComms = await db.select().from(communications);
      const overdueAlerts = [];

      for (const comm of allComms) {
        const deadlineHours = comm.delaiHeures || 24;
        const limitDate = new Date(new Date(comm.createdAt).getTime() + deadlineHours * 60 * 60 * 1000);
        const isOverdue = new Date() > limitDate;

        if (isOverdue) {
          // Find unacknowledged receipts for this comm
          const unacknowledged = await db.select()
            .from(communicationReceipts)
            .where(
              and(
                eq(communicationReceipts.communicationId, comm.id),
                ne(communicationReceipts.statut, "Accusé")
              )
            );

          for (const rec of unacknowledged) {
            const u = await db.select().from(users).where(eq(users.id, rec.userId)).limit(1);
            overdueAlerts.push({
              communicationId: comm.id,
              titre: comm.titre,
              delaiHeures: deadlineHours,
              createdAt: comm.createdAt,
              limitDate,
              userId: rec.userId,
              userEmail: u.length > 0 ? u[0].email : `ID: ${rec.userId}`,
              userArrondissement: u.length > 0 ? u[0].arrondissement : "Inconnu",
              statut: rec.statut,
              smsSentAt: rec.smsSentAt,
              inAppSentAt: rec.inAppSentAt
            });
          }
        }
      }

      res.json(overdueAlerts);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });


  // Admin: Users
  app.get("/api/users", requireAuth, async (req: AuthRequest, res) => {
    if (!requireAnyRole(req, res, [...SUPER_ADMIN_ROLES, ...DSE_ROLES, ROLES.PROVISEUR], "Acces refuse : la liste des utilisateurs est reservee aux profils habilites.")) return;
    try {
      const results = await db.select().from(users).orderBy(users.createdAt);
      res.json(filterUsersForRequester(results, req.user).map(publicUser));
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Technical health endpoint: exposes status only, never database credentials.
  app.get("/api/system/health", requireAuth, async (req: AuthRequest, res) => {
    if (!requireAnyRole(req, res, SUPER_ADMIN_ROLES, "Acces refuse : la supervision technique est reservee au SuperAdmin.")) return;
    try {
      await db.execute(sql`select 1`);
      res.json({
        status: "operational",
        database: "connected",
        environment: process.env.NODE_ENV || "development",
        security: {
          maxLoginAttempts: MAX_LOGIN_ATTEMPTS,
          lockDurationMinutes: AUTO_LOCK_MINUTES,
          twoFactorForAdministrators: true
        },
        checkedAt: new Date().toISOString()
      });
    } catch (error: any) {
      res.status(503).json({
        status: "degraded",
        database: "unavailable",
        error: error.message,
        checkedAt: new Date().toISOString()
      });
    }
  });

  
  // Helper for audit logs
  const logAudit = async (userId, action, entityType, entityId, details) => {
    try {
      if (userId) {
        await db.insert(auditLogs).values({
          userId,
          action,
          entityType,
          entityId,
          details
        });
      }
    } catch (e) {
      console.error("Failed to log audit", e);
    }
  };

  // Annual school reports: structured data with a secondary-school approval workflow.
  app.get("/api/annual-reports", requireAuth, async (req: AuthRequest, res) => {
    if (!requireAnyRole(req, res, [...SUPER_ADMIN_ROLES, ...DSE_ROLES, ...ARRONDISSEMENT_ROLES, ...LOCAL_SCHOOL_ROLES], "Acces refuse : vous n'avez pas acces aux rapports annuels.")) return;
    try {
      const reports = await db.select({
        report: annualReports,
        etablissement: etablissements
      }).from(annualReports).leftJoin(etablissements, eq(annualReports.etablissementId, etablissements.id));

      const visible = reports.filter((row) => {
        if (hasAnyRole(req.user?.role, [...SUPER_ADMIN_ROLES, ...DSE_ROLES])) return true;
        if (hasAnyRole(req.user?.role, ARRONDISSEMENT_ROLES)) return Boolean(row.etablissement?.arrondissement === req.user?.arrondissement);
        return Boolean(req.user?.etablissementId && row.report.etablissementId === req.user.etablissementId);
      });
      res.json(visible);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/annual-reports", requireAuth, async (req: AuthRequest, res) => {
    if (!requireAnyRole(req, res, [...SUPER_ADMIN_ROLES, ...DSE_ROLES, ...LOCAL_SCHOOL_ROLES], "Acces refuse : vous n'avez pas acces aux rapports annuels.")) return;
    try {
      const { etablissementId, anneeScolaire, donnees, action = "save" } = req.body;
      const targetId = Number(etablissementId);
      if (!targetId || !anneeScolaire || !donnees || typeof donnees !== "object") {
        res.status(400).json({ error: "L'etablissement, l'annee scolaire et les donnees sont obligatoires." });
        return;
      }

      const targetRows = await db.select().from(etablissements).where(eq(etablissements.id, targetId));
      if (targetRows.length === 0) {
        res.status(404).json({ error: "Etablissement introuvable." });
        return;
      }
      const target = targetRows[0];
      const isDse = hasAnyRole(req.user?.role, [...SUPER_ADMIN_ROLES, ...DSE_ROLES]);
      const isLocal = hasAnyRole(req.user?.role, LOCAL_SCHOOL_ROLES);
      const isSecretary = hasAnyRole(req.user?.role, [ROLES.SECRETAIRE_ADMIN, ROLES.SECRETAIRE_ADMIN_LEGACY]);
      const isProviseur = hasAnyRole(req.user?.role, [ROLES.PROVISEUR]);
      if (isLocal && req.user?.etablissementId !== targetId) {
        res.status(403).json({ error: "Vous ne pouvez renseigner que votre propre etablissement." });
        return;
      }
      if (isLocal && !isDse && target.type === "Primaire" && !hasAnyRole(req.user?.role, [ROLES.DIRECTEUR_ECOLE])) {
        res.status(403).json({ error: "Pour une ecole primaire, seul le Directeur d'ecole renseigne le rapport." });
        return;
      }
      if (isSecretary && target.type !== "Secondaire") {
        res.status(403).json({ error: "Le secretaire ne peut renseigner que les donnees d'un etablissement secondaire." });
        return;
      }
      if (isProviseur && target.type !== "Secondaire") {
        res.status(403).json({ error: "Le proviseur ne peut traiter que les donnees d'un etablissement secondaire." });
        return;
      }

      const existing = await db.select().from(annualReports).where(and(
        eq(annualReports.etablissementId, targetId),
        eq(annualReports.anneeScolaire, String(anneeScolaire))
      )).limit(1);
      let statut = existing[0]?.statut || "Brouillon";
      if (isLocal && existing[0] && !["Brouillon", "Rejete"].includes(existing[0].statut) && !(isProviseur && existing[0].statut === "Soumis au proviseur")) {
        res.status(409).json({ error: "Ce rapport est deja transmis et ne peut plus etre modifie a ce stade du circuit." });
        return;
      }
      if (action === "save" && isLocal && statut === "Rejete") {
        statut = "Brouillon";
      }
      if (action === "submit") {
        if (isSecretary) {
          statut = "Soumis au proviseur";
        } else {
          statut = "Soumis au DSE";
        }
      }

      const values = {
        etablissementId: targetId,
        anneeScolaire: String(anneeScolaire),
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

      await logAudit(req.user?.id, action === "submit" ? "SOUMISSION_RAPPORT_ANNUEL" : "SAUVEGARDE_RAPPORT_ANNUEL", "annual_reports", saved[0].id, { etablissementId: targetId, anneeScolaire, statut });
      res.json({ success: true, report: saved[0] });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/annual-reports/:id/decision", requireAuth, async (req: AuthRequest, res) => {
    if (!requireAnyRole(req, res, [...SUPER_ADMIN_ROLES, ...DSE_ROLES, ROLES.PROVISEUR], "Acces refuse : profil non habilite.")) return;
    try {
      const reportId = Number(req.params.id);
      const { decision } = req.body;
      const rows = await db.select().from(annualReports).where(eq(annualReports.id, reportId));
      if (rows.length === 0) {
        res.status(404).json({ error: "Rapport annuel introuvable." });
        return;
      }
      const report = rows[0];
      const isDse = hasAnyRole(req.user?.role, [...SUPER_ADMIN_ROLES, ...DSE_ROLES]);
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
      if (report.statut !== "Soumis au DSE") {
        res.status(409).json({ error: "La decision finale ne peut porter que sur un rapport soumis a la DSE." });
        return;
      }
      const updated = await db.update(annualReports).set({ statut: nextStatus, updatedAt: new Date(), validatedById: req.user?.id || null, validatedAt: decision === "valider" ? new Date() : null }).where(eq(annualReports.id, reportId)).returning();
      await logAudit(req.user?.id, decision === "valider" ? "VALIDATION_RAPPORT_ANNUEL" : "REJET_RAPPORT_ANNUEL", "annual_reports", reportId, { statut: nextStatus });
      res.json({ success: true, report: updated[0] });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Common review workflow for establishment data modules.
  app.post("/api/module-submissions/:module/:recordId/decision", requireAuth, async (req: AuthRequest, res) => {
    if (!req.user || !hasAnyRole(req.user.role, [...DSE_ROLES, ...ARRONDISSEMENT_ROLES, ROLES.PROVISEUR])) {
      res.status(403).json({ error: "Acces refuse : ce circuit de validation est reserve aux profils metier habilites." });
      return;
    }
    try {
      const { decision, commentaire } = req.body;
      if (!['approuver', 'rejeter'].includes(decision)) {
        res.status(400).json({ error: "Decision invalide." });
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
      const establishmentRows = await db.select().from(etablissements).where(eq(etablissements.id, submission.etablissementId)).limit(1);
      const establishment = establishmentRows[0];
      const isDse = hasAnyRole(req.user.role, DSE_ROLES);
      const isProviseur = hasAnyRole(req.user.role, [ROLES.PROVISEUR]);
      const isArrondissement = hasAnyRole(req.user.role, ARRONDISSEMENT_ROLES);

      if (isProviseur && req.user.etablissementId !== submission.etablissementId) {
        res.status(403).json({ error: "Vous ne pouvez traiter que les donnees de votre etablissement." });
        return;
      }
      if (isArrondissement && (!establishment || establishment.arrondissement !== req.user.arrondissement)) {
        res.status(403).json({ error: "Vous ne pouvez traiter que les donnees de votre arrondissement." });
        return;
      }
      if (isArrondissement && decision === 'approuver') {
        res.status(403).json({ error: "Le responsable d'arrondissement peut demander une correction, mais la validation appartient au responsable scolaire ou a la DSE." });
        return;
      }

      let nextStatus: string;
      if (decision === 'rejeter') {
        nextStatus = 'A corriger';
      } else if (isProviseur && submission.statut === 'Soumis au proviseur') {
        nextStatus = 'Soumis au DSE';
      } else if (isDse && submission.statut === 'Soumis au DSE') {
        nextStatus = 'Valide';
      } else {
        res.status(409).json({ error: "Cette donnee ne se trouve pas dans un etat compatible avec votre decision." });
        return;
      }

      const updated = await db.update(moduleSubmissions).set({
        statut: nextStatus,
        reviewedById: req.user.id || null,
        reviewedAt: new Date(),
        commentaire: commentaire || null,
        updatedAt: new Date()
      }).where(eq(moduleSubmissions.id, submission.id)).returning();
      await logAudit(req.user.id, decision === 'approuver' ? 'VALIDATION_DONNEE_ETABLISSEMENT' : 'RETOUR_DONNEE_ETABLISSEMENT', req.params.module, recordId, { statut: nextStatus, commentaire });
      res.json({ success: true, submission: updated[0] });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.use(createFacilitiesRouter(logAudit));

  // M: Cantine & WASH My Establishment Look-up
  app.get("/api/cantine-wash/my-establishment", requireAuth, async (req: AuthRequest, res) => {
    if (!requireAnyRole(req, res, LOCAL_SCHOOL_ROLES, "Accès refusé : cet espace est réservé aux responsables d'établissement.")) return;
    try {
      const directorName = `${req.user?.prenom || ''} ${req.user?.nom || ''}`.trim().toLowerCase();
      if (!directorName) {
        return res.json({ etablissement: null, wash: null });
      }

      // Load all etablissements to do a client-side or case-insensitive search
      const allEtabs = await db.select().from(etablissements);
      const matchedEtab = allEtabs.find(etab => {
        const dirName = (etab.nomDirecteur || '').trim().toLowerCase();
        return dirName && (
          directorName.includes(dirName) || 
          dirName.includes(directorName) ||
          (req.user?.nom && dirName.includes(req.user.nom.toLowerCase()))
        );
      });

      if (!matchedEtab) {
        return res.json({ etablissement: null, wash: null });
      }

      const washData = await db.select()
        .from(wash)
        .where(eq(wash.etablissementId, matchedEtab.id))
        .limit(1);

      res.json({
        etablissement: matchedEtab,
        wash: washData.length > 0 ? washData[0] : null
      });
    } catch (error: any) {
      console.error("Error in /api/cantine-wash/my-establishment:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // M: Cantine & WASH Direct Saisie
  app.post("/api/cantine-wash/submit", requireAuth, async (req: AuthRequest, res) => {
    if (!requireAnyRole(req, res, LOCAL_SCHOOL_ROLES, "Accès refusé : cette saisie est réservée aux responsables d'établissement.")) return;
    try {
      const { nom, type, arrondissement, forages, latrines, cantinesCount } = req.body;
      if (!nom || !type) {
        return res.status(400).json({ error: "Le nom et le type d'établissement sont obligatoires." });
      }

      if (req.user?.etablissementId) {
        const etablissementId = req.user.etablissementId;
        const target = await db.select().from(etablissements).where(eq(etablissements.id, etablissementId)).limit(1);
        if (target.length === 0) return res.status(404).json({ error: "Votre etablissement de rattachement est introuvable." });
        const existingWash = await db.select().from(wash).where(eq(wash.etablissementId, etablissementId)).limit(1);
        const payload = {
          forages: parseInt(forages || 0),
          foragesFonctionnels: parseInt(forages || 0),
          latrines: parseInt(latrines || 0),
          latrinesFonctionnelles: parseInt(latrines || 0),
          cantineDisponibilite: parseInt(cantinesCount || 0) > 0,
          cantinesCount: parseInt(cantinesCount || 0),
          vivresDisponibles: `Nombre de cantines: ${cantinesCount || 0}`
        };
        const saved = existingWash.length > 0
          ? await db.update(wash).set(payload).where(eq(wash.id, existingWash[0].id)).returning()
          : await db.insert(wash).values({ etablissementId, ...payload }).returning();
        const workflow = await saveModuleWorkflow({ module: 'wash', recordId: saved[0].id, etablissementId, requester: req.user, action: 'submit' });
        await logAudit(req.user?.id, 'CREATE', 'cantine_wash_submit', etablissementId, { nomEtablissement: target[0].nom, forages, latrines, cantinesCount });
        return res.json({ success: true, etablissementId, wash: { ...saved[0], workflowStatus: workflow.statut } });
      }

      if (req.user?.etablissementId) {
        const etablissementId = req.user.etablissementId;
        const target = await db.select().from(etablissements).where(eq(etablissements.id, etablissementId)).limit(1);
        if (target.length === 0) return res.status(404).json({ error: "Votre etablissement de rattachement est introuvable." });
        const { batimentsEtudes, batimentsAdmin, laboratoires, infirmerie } = req.body;
        const studyVal = parseInt(batimentsEtudes || 0);
        const adminVal = parseInt(batimentsAdmin || 0);
        const existingInfra = await db.select().from(infrastructures).where(eq(infrastructures.etablissementId, etablissementId)).limit(1);
        const saved = existingInfra.length > 0
          ? await db.update(infrastructures).set({
            batimentsEtudes: { total: studyVal, bonEtat: studyVal, degrade: 0, horsService: 0 },
            batimentsAdmin: { total: adminVal, bonEtat: adminVal, degrade: 0, horsService: 0 },
            laboratoires: parseInt(laboratoires || 0),
            infirmerie: parseInt(infirmerie || 0),
            lastUpdated: new Date()
          }).where(eq(infrastructures.id, existingInfra[0].id)).returning()
          : await db.insert(infrastructures).values({
            etablissementId,
            batimentsEtudes: { total: studyVal, bonEtat: studyVal, degrade: 0, horsService: 0 },
            batimentsAdmin: { total: adminVal, bonEtat: adminVal, degrade: 0, horsService: 0 },
            laboratoires: parseInt(laboratoires || 0),
            infirmerie: parseInt(infirmerie || 0),
            conformite: "Non conforme"
          }).returning();
        const workflow = await saveModuleWorkflow({ module: 'infrastructures', recordId: saved[0].id, etablissementId, requester: req.user, action: 'submit' });
        await logAudit(req.user?.id, 'CREATE_INFRASTRUCTURE', 'infrastructures', saved[0].id, { nom: target[0].nom, batimentsEtudes, batimentsAdmin, laboratoires, infirmerie });
        return res.json({ success: true, etablissementId, infrastructure: { ...saved[0], workflowStatus: workflow.statut } });
      }

      // Check if this establishment already exists by name (case-insensitive) and type
      let etablissementId: number;
      const existingEtab = await db.select()
        .from(etablissements)
        .where(
          and(
            ilike(etablissements.nom, nom.trim()),
            eq(etablissements.type, type)
          )
        )
        .limit(1);

      const directorName = `${req.user?.prenom || ''} ${req.user?.nom || ''}`.trim();

      if (existingEtab.length > 0) {
        etablissementId = existingEtab[0].id;
        // Optionally update the director's name and arrondissement if missing or to ensure association
        await db.update(etablissements)
          .set({
            nomDirecteur: directorName || existingEtab[0].nomDirecteur,
            arrondissement: arrondissement || existingEtab[0].arrondissement || req.user?.arrondissement || "Arrondissement 1"
          })
          .where(eq(etablissements.id, etablissementId));
      } else {
        // Create new establishment
        const insertedEtab = await db.insert(etablissements).values({
          nom: nom.trim(),
          type: type,
          arrondissement: arrondissement || req.user?.arrondissement || "Arrondissement 1",
          statut: "public",
          nomDirecteur: directorName || null
        }).returning();
        etablissementId = insertedEtab[0].id;
      }

      // Check if a wash entry already exists for this establishment
      const existingWash = await db.select()
        .from(wash)
        .where(eq(wash.etablissementId, etablissementId))
        .limit(1);

      let washResult;
      if (existingWash.length > 0) {
        // Update
        const updatedWash = await db.update(wash)
          .set({
            forages: parseInt(forages || 0),
            foragesFonctionnels: parseInt(forages || 0), // assume functional = total
            latrines: parseInt(latrines || 0),
            latrinesFonctionnelles: parseInt(latrines || 0),
            cantineDisponibilite: parseInt(cantinesCount || 0) > 0,
            cantinesCount: parseInt(cantinesCount || 0),
            vivresDisponibles: `Nombre de cantines: ${cantinesCount || 0}`
          })
          .where(eq(wash.id, existingWash[0].id))
          .returning();
        washResult = updatedWash[0];
      } else {
        // Insert
        const insertedWash = await db.insert(wash).values({
          etablissementId: etablissementId,
          forages: parseInt(forages || 0),
          foragesFonctionnels: parseInt(forages || 0),
          latrines: parseInt(latrines || 0),
          latrinesFonctionnelles: parseInt(latrines || 0),
          cantineDisponibilite: parseInt(cantinesCount || 0) > 0,
          cantinesCount: parseInt(cantinesCount || 0),
          vivresDisponibles: `Nombre de cantines: ${cantinesCount || 0}`
        }).returning();
        washResult = insertedWash[0];
      }

      // Log security trace
      await logAudit(req.user?.id, 'CREATE', 'cantine_wash_submit', etablissementId, {
        nomEtablissement: nom,
        typeEtablissement: type,
        forages,
        latrines,
        cantinesCount
      });

      res.json({
        success: true,
        etablissementId,
        wash: washResult
      });
    } catch (error: any) {
      console.error("Error in /api/cantine-wash/submit:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // M: Infrastructure My Establishment Look-up
  app.get("/api/infrastructures/my-establishment", requireAuth, async (req: AuthRequest, res) => {
    if (!requireAnyRole(req, res, LOCAL_SCHOOL_ROLES, "Accès refusé : cet espace est réservé aux responsables d'établissement.")) return;
    try {
      const directorName = `${req.user?.prenom || ''} ${req.user?.nom || ''}`.trim().toLowerCase();
      if (!directorName) {
        return res.json({ etablissement: null, infrastructure: null });
      }

      // Load all etablissements to do a client-side or case-insensitive search
      const allEtabs = await db.select().from(etablissements);
      const matchedEtab = allEtabs.find(etab => {
        const dirName = (etab.nomDirecteur || '').trim().toLowerCase();
        return dirName && (
          directorName.includes(dirName) || 
          dirName.includes(directorName) ||
          (req.user?.nom && dirName.includes(req.user.nom.toLowerCase()))
        );
      });

      if (!matchedEtab) {
        return res.json({ etablissement: null, infrastructure: null });
      }

      const infraData = await db.select()
        .from(infrastructures)
        .where(eq(infrastructures.etablissementId, matchedEtab.id))
        .limit(1);

      res.json({
        etablissement: matchedEtab,
        infrastructure: infraData.length > 0 ? infraData[0] : null
      });
    } catch (error: any) {
      console.error("Error in /api/infrastructures/my-establishment:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // M: Infrastructure Direct Saisie
  app.post("/api/infrastructures/submit", requireAuth, async (req: AuthRequest, res) => {
    if (!requireAnyRole(req, res, LOCAL_SCHOOL_ROLES, "Accès refusé : cette saisie est réservée aux responsables d'établissement.")) return;
    try {
      const { nom, type, arrondissement, batimentsEtudes, batimentsAdmin, laboratoires, infirmerie } = req.body;
      if (!nom || !type) {
        return res.status(400).json({ error: "Le nom et le type d'établissement sont obligatoires." });
      }

      // Check if this establishment already exists by name (case-insensitive) and type
      let etablissementId: number;
      const existingEtab = await db.select()
        .from(etablissements)
        .where(
          and(
            ilike(etablissements.nom, nom.trim()),
            eq(etablissements.type, type)
          )
        )
        .limit(1);

      const directorName = `${req.user?.prenom || ''} ${req.user?.nom || ''}`.trim();

      if (existingEtab.length > 0) {
        etablissementId = existingEtab[0].id;
        // Optionally update the director's name and arrondissement if missing or to ensure association
        await db.update(etablissements)
          .set({
            nomDirecteur: directorName || existingEtab[0].nomDirecteur,
            arrondissement: arrondissement || existingEtab[0].arrondissement || req.user?.arrondissement || "Arrondissement 1"
          })
          .where(eq(etablissements.id, etablissementId));
      } else {
        // Create new establishment
        const insertedEtab = await db.insert(etablissements).values({
          nom: nom.trim(),
          type: type,
          arrondissement: arrondissement || req.user?.arrondissement || "Arrondissement 1",
          statut: "public",
          nomDirecteur: directorName || null
        }).returning();
        etablissementId = insertedEtab[0].id;
      }

      // Check if an infrastructure entry already exists for this establishment
      const existingInfra = await db.select()
        .from(infrastructures)
        .where(eq(infrastructures.etablissementId, etablissementId))
        .limit(1);

      const studyVal = parseInt(batimentsEtudes || 0);
      const adminVal = parseInt(batimentsAdmin || 0);
      const labVal = parseInt(laboratoires || 0);
      const infVal = parseInt(infirmerie || 0);

      let infraResult;
      if (existingInfra.length > 0) {
        // Update
        const updatedInfra = await db.update(infrastructures)
          .set({
            batimentsEtudes: { total: studyVal, bonEtat: studyVal, degrade: 0, horsService: 0 },
            batimentsAdmin: { total: adminVal, bonEtat: adminVal, degrade: 0, horsService: 0 },
            laboratoires: labVal,
            infirmerie: infVal,
            lastUpdated: new Date()
          })
          .where(eq(infrastructures.id, existingInfra[0].id))
          .returning();
        infraResult = updatedInfra[0];
      } else {
        // Insert
        const insertedInfra = await db.insert(infrastructures).values({
          etablissementId: etablissementId,
          batimentsEtudes: { total: studyVal, bonEtat: studyVal, degrade: 0, horsService: 0 },
          batimentsAdmin: { total: adminVal, bonEtat: adminVal, degrade: 0, horsService: 0 },
          laboratoires: labVal,
          infirmerie: infVal,
          conformite: "Conforme"
        }).returning();
        infraResult = insertedInfra[0];
      }

      await logAudit(req.user?.id, 'CREATE_INFRASTRUCTURE', 'infrastructures', infraResult.id, { nom, batimentsEtudes, batimentsAdmin, laboratoires, infirmerie });

      res.json({
        success: true,
        etablissementId,
        infrastructure: infraResult
      });
    } catch (error: any) {
      console.error("Error in /api/infrastructures/submit:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // M: Journal d'Audit
  app.get("/api/audit-logs", requireAuth, async (req: AuthRequest, res) => {
    if (!requireAnyRole(req, res, SUPER_ADMIN_ROLES, "Acces refuse : le journal d'audit est reserve au SuperAdmin.")) return;
    try {
      const results = await db.select({
         log: auditLogs,
         user: users
      }).from(auditLogs)
        .leftJoin(users, eq(auditLogs.userId, users.id))
        .orderBy(auditLogs.createdAt);
      res.json(results.map((row) => ({ ...row, user: publicUser(row.user) })));
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // API route for complete dashboard statistics
  app.get("/api/dashboard/stats", requireAuth, async (req: AuthRequest, res) => {
    try {
      const etabs = await db.select().from(etablissements);
      const infras = await db.select().from(infrastructures);
      const effs = await db.select().from(effectifs);
      const constrs = await db.select().from(constructions);
      const incs = await db.select().from(incidents);
      const washes = await db.select().from(wash);
      const tices = await db.select().from(tice);

      let filteredEtabs = etabs;
      let filteredInfras = infras;
      let filteredEffs = effs;
      let filteredConstrs = constrs;
      let filteredIncs = incs;
      let filteredWashes = washes;
      let filteredTices = tices;

      const isArrResp = hasAnyRole(req.user?.role, ARRONDISSEMENT_ROLES);
      const isLocalActor = hasAnyRole(req.user?.role, LOCAL_SCHOOL_ROLES);
      const userArr = req.user?.arrondissement;

      if (isArrResp || isLocalActor) {
        filteredEtabs = filterEstablishmentsForRequester(etabs, req.user);
        const allowedEtabIds = new Set(filteredEtabs.map(e => e.id));

        filteredInfras = infras.filter(i => allowedEtabIds.has(i.etablissementId));
        filteredEffs = effs.filter(ef => allowedEtabIds.has(ef.etablissementId));
        filteredConstrs = isArrResp && userArr
          ? constrs.filter(c => c.arrondissement && c.arrondissement.toLowerCase() === userArr.toLowerCase())
          : [];
        filteredIncs = incs.filter(inc => inc.etablissementId && allowedEtabIds.has(inc.etablissementId));
        filteredWashes = washes.filter(w => w.etablissementId && allowedEtabIds.has(w.etablissementId));
        filteredTices = tices.filter(t => t.etablissementId && allowedEtabIds.has(t.etablissementId));
      }

      // Total Etablissements
      const totalEtablissements = filteredEtabs.length;

      // Conformity stats
      const conformiteCounts = {
        conforme: 0,
        partiel: 0,
        nonConforme: 0,
        nonRenseigne: 0
      };

      filteredInfras.forEach(inf => {
        const conf = inf.conformite?.toLowerCase() || '';
        if (conf.includes('non conforme')) {
          conformiteCounts.nonConforme++;
        } else if (conf.includes('partiel') || conf.includes('intermédiaire') || conf.includes('moyen')) {
          conformiteCounts.partiel++;
        } else if (conf.includes('conforme')) {
          conformiteCounts.conforme++;
        } else {
          conformiteCounts.nonRenseigne++;
        }
      });
      // The rest of etabs that don't have infra records
      conformiteCounts.nonRenseigne += Math.max(0, totalEtablissements - filteredInfras.length);

      // Construction stats
      const constructionStats = {
        total: filteredConstrs.length,
        planifie: 0,
        enCours: 0,
        livre: 0,
        suspendu: 0,
        abandonne: 0,
        totalBudget: 0,
        totalConsomme: 0
      };

      filteredConstrs.forEach(c => {
        const s = c.statut?.toLowerCase() || '';
        if (s.includes('planifi')) constructionStats.planifie++;
        else if (s.includes('cours')) constructionStats.enCours++;
        else if (s.includes('livr')) constructionStats.livre++;
        else if (s.includes('suspendu')) constructionStats.suspendu++;
        else if (s.includes('abandon')) constructionStats.abandonne++;
        
        constructionStats.totalBudget += c.budget || 0;
        constructionStats.totalConsomme += c.budgetConsomme || 0;
      });

      // Enrollment stats
      let totalFilles = 0;
      let totalGarcons = 0;
      let totalEnseignants = 0;
      
      const enrollmentByArrondissement: { [key: string]: { filles: number, garcons: number } } = {};

      filteredEffs.forEach(ef => {
        totalFilles += ef.elevesFilles || 0;
        totalGarcons += ef.elevesGarcons || 0;
        totalEnseignants += ef.enseignants || 0;

        // Find associated etablissement to group by arrondissement
        const etab = filteredEtabs.find(e => e.id === ef.etablissementId);
        if (etab) {
          const arr = etab.arrondissement || 'Autre';
          if (!enrollmentByArrondissement[arr]) {
            enrollmentByArrondissement[arr] = { filles: 0, garcons: 0 };
          }
          enrollmentByArrondissement[arr].filles += ef.elevesFilles || 0;
          enrollmentByArrondissement[arr].garcons += ef.elevesGarcons || 0;
        }
      });

      const arrData = Object.entries(enrollmentByArrondissement).map(([name, val]) => ({
        arrondissement: name,
        filles: val.filles,
        garcons: val.garcons,
        total: val.filles + val.garcons
      })).sort((a, b) => b.total - a.total);

      // WASH stats
      let totalForages = 0;
      let totalForagesFonctionnels = 0;
      let totalLatrines = 0;
      let totalLatrinesFonctionnelles = 0;
      let totalCantinesFonctionnelles = 0;

      filteredWashes.forEach(w => {
        totalForages += w.forages || 0;
        totalForagesFonctionnels += w.foragesFonctionnels || 0;
        totalLatrines += w.latrines || 0;
        totalLatrinesFonctionnelles += w.latrinesFonctionnelles || 0;
        if (w.cantineDisponibilite) {
          totalCantinesFonctionnelles++;
        }
      });

      // TICE stats
      let totalSallesInformatiques = 0;
      let totalOrdinateurs = 0;
      let totalOrdinateursFonctionnels = 0;
      let totalConnectes = 0;

      filteredTices.forEach(t => {
        totalSallesInformatiques += t.sallesInformatiques || 0;
        totalOrdinateurs += t.ordinateurs || 0;
        totalOrdinateursFonctionnels += t.ordinateursFonctionnels || 0;
        if (t.connectiviteInternet) {
          totalConnectes++;
        }
      });

      // Incidents stats
      const incidentStats = {
        total: filteredIncs.length,
        signale: 0,
        enCours: 0,
        resolu: 0
      };

      filteredIncs.forEach(inc => {
        const s = inc.statut?.toLowerCase() || '';
        if (s.includes('signal')) incidentStats.signale++;
        else if (s.includes('cours')) incidentStats.enCours++;
        else if (s.includes('resolu') || s.includes('résolu')) incidentStats.resolu++;
      });

      const latestSchoolYear = filteredEffs
        .map(ef => ef.anneeScolaire)
        .filter((year): year is string => Boolean(year))
        .sort((a, b) => b.localeCompare(a))[0] || "2025-2026";

      const latestEffs = filteredEffs.filter(ef => ef.anneeScolaire === latestSchoolYear);
      const latestEffByEtab = new Map<number, typeof filteredEffs[number]>();
      latestEffs.forEach(ef => latestEffByEtab.set(ef.etablissementId, ef));

      const normalizeText = (value?: string | null) => (value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();

      const countStudyRooms = (etabId: number) => {
        const infra = filteredInfras.find(item => item.etablissementId === etabId);
        const rooms = infra?.batimentsEtudes as { total?: number } | null | undefined;
        return Number(rooms?.total || 0);
      };

      const buildSchoolSummary = (items: typeof filteredEtabs) => items.reduce((acc, etab) => {
        const eff = latestEffByEtab.get(etab.id);
        const filles = eff?.elevesFilles || 0;
        const garcons = eff?.elevesGarcons || 0;

        acc.ecoles += 1;
        acc.classes += countStudyRooms(etab.id);
        acc.enseignants += eff?.enseignants || 0;
        acc.filles += filles;
        acc.garcons += garcons;
        acc.eleves += filles + garcons;
        return acc;
      }, {
        ecoles: 0,
        classes: 0,
        enseignants: 0,
        filles: 0,
        garcons: 0,
        eleves: 0
      });

      const primaryEtabs = filteredEtabs.filter(etab => normalizeText(etab.type).includes('primaire'));
      const publicPrimaryEtabs = primaryEtabs.filter(etab => normalizeText(etab.statut).includes('public'));
      const privatePrimaryEtabs = primaryEtabs.filter(etab => {
        const statut = normalizeText(etab.statut);
        return statut.includes('prive') || statut.includes('priv');
      });
      const secondaryEtabs = filteredEtabs.filter(etab => normalizeText(etab.type).includes('secondaire'));

      const arrondissements = Array.from(new Set(primaryEtabs.map(etab => etab.arrondissement || 'Non renseigne'))).sort((a, b) => a.localeCompare(b, 'fr'));
      const primaryByArrondissement = arrondissements.map(arrondissement => {
        const publicItems = publicPrimaryEtabs.filter(etab => (etab.arrondissement || 'Non renseigne') === arrondissement);
        const privateItems = privatePrimaryEtabs.filter(etab => (etab.arrondissement || 'Non renseigne') === arrondissement);
        const allItems = primaryEtabs.filter(etab => (etab.arrondissement || 'Non renseigne') === arrondissement);
        return {
          arrondissement,
          public: buildSchoolSummary(publicItems),
          prive: buildSchoolSummary(privateItems),
          total: buildSchoolSummary(allItems)
        };
      });

      const secondaryRows = secondaryEtabs.map(etab => {
        const eff = latestEffByEtab.get(etab.id);
        const filles = eff?.elevesFilles || 0;
        const garcons = eff?.elevesGarcons || 0;
        return {
          etablissementId: etab.id,
          nomEtablissement: etab.nom,
          arrondissement: etab.arrondissement,
          classes: countStudyRooms(etab.id),
          filles,
          garcons,
          eleves: filles + garcons,
          enseignants: eff?.enseignants || 0
        };
      }).sort((a, b) => a.nomEtablissement.localeCompare(b.nomEtablissement, 'fr'));

      const annualSchoolReport = {
        anneeScolaire: latestSchoolYear,
        primary: {
          public: buildSchoolSummary(publicPrimaryEtabs),
          prive: buildSchoolSummary(privatePrimaryEtabs),
          total: buildSchoolSummary(primaryEtabs),
          byArrondissement: primaryByArrondissement
        },
        secondary: {
          total: buildSchoolSummary(secondaryEtabs),
          rows: secondaryRows
        },
        cep: {
          source: "DONNEES SCOLAIRES 2025-2026",
          avecCandidatsLibres: {
            presents: { filles: 29998, garcons: 25716, total: 55714 },
            admis: { filles: 28634, garcons: 24664, total: 53298 },
            taux: { filles: 95.45, garcons: 95.91, total: 95.66, province: 95.75 }
          },
          sansCandidatsLibres: {
            presents: { filles: 29075, garcons: 24920, total: 53995 },
            admis: { filles: 28006, garcons: 24064, total: 52070 },
            taux: { filles: 96.32, garcons: 96.57, total: 96.43, province: 96.4 }
          }
        }
      };

      res.json({
        totalEtablissements,
        conformiteCounts,
        constructionStats,
        enrollmentStats: {
          totalFilles,
          totalGarcons,
          totalEnseignants,
          totalEleves: totalFilles + totalGarcons,
          byArrondissement: arrData
        },
        washStats: {
          totalForages,
          totalForagesFonctionnels,
          totalLatrines,
          totalLatrinesFonctionnelles,
          totalCantinesFonctionnelles,
          countEvaluated: filteredWashes.length
        },
        ticeStats: {
          totalSallesInformatiques,
          totalOrdinateurs,
          totalOrdinateursFonctionnels,
          totalConnectes,
          countEvaluated: filteredTices.length
        },
        incidentStats,
        annualSchoolReport
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer().catch((error) => {
  console.error("Échec du démarrage du serveur:", error);
  process.exit(1);
});
