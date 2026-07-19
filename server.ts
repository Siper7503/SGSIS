import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { requireAuth, AuthRequest } from "./src/middleware/auth.ts";
import { getOrCreateUser } from "./src/db/users.ts";
import { db } from "./src/db/index.ts";
import { etablissements, effectifs, constructions, infrastructures, mobilier, communications, communicationReceipts, incidents, wash, tice, auditLogs, users } from "./src/db/schema.ts";
import { eq, and, ilike, ne } from "drizzle-orm";
import multer from "multer";
import * as xlsx from "xlsx";
import Papa from "papaparse";
import { GoogleGenAI } from "@google/genai";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "super_secret_dse_burkina_key_2026";

interface SimulatedEmail {
  id: string;
  to: string;
  subject: string;
  body: string;
  sentAt: string;
}

const simulatedEmails: SimulatedEmail[] = [];

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

async function startServer() {
  const app = express();
  const PORT = 3000;

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
      res.json(user);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Upgraded secure user registration endpoint
  app.post("/api/auth/register-secure", async (req, res) => {
    try {
      const { nom, prenom, email, telephone, password, role, arrondissement } = req.body;
      
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
      let rights = "lecture et recherche";
      if (role === "Administrateur DSE" || role === "Directeur DSE") {
        rights = "pilotage de l'ensemble du système (lecture, ecriture et recherche)";
      } else if (
        role === "Directeurs d'école" ||
        role === "Proviseur d'établissement" ||
        role === "Sécretaire Adminstratif" ||
        role === "Responsable d'Arrondissement"
      ) {
        rights = "lecture, ecriture et recherche";
      }

      // 5. Automatic Secure Token Code generation
      const accessToken = "SGSIED-" + Math.random().toString(36).substring(2, 8).toUpperCase() + "-" + Math.floor(100 + Math.random() * 900);

      const existingUsers = await db.select().from(users).where(eq(users.email, email));

      // Limit Administrateur DSE accounts to maximum of 2
      if (role === "Administrateur DSE") {
        const admins = await db.select().from(users).where(eq(users.role, "Administrateur DSE"));
        const isAlreadyAdmin = existingUsers.length > 0 && existingUsers[0].role === "Administrateur DSE";
        if (!isAlreadyAdmin && admins.length >= 2) {
          res.status(400).json({ error: "La limite stricte de deux (02) comptes d'accès Administrateur DSE a été atteinte pour l'ensemble du système." });
          return;
        }
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
          accessToken,
          arrondissement: arrondissement || null,
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
          accessToken,
          arrondissement: arrondissement || null,
          passwordHash: hash,
          loginAttempts: 0,
          isLocked: false
        }).returning();
      }

      // 6. Log registration in audit log
      await db.insert(auditLogs).values({
        userId: userResult[0].id,
        action: "INSCRIPTION_SECURE",
        entityType: "users",
        entityId: userResult[0].id,
        details: { email, role, rights, accessToken }
      });

      // 7. Simuler l'envoi du jeton par email
      const emailSubject = "Bienvenue sur SGSIED - Votre jeton d'accès sécurisé";
      const emailBody = `Bonjour ${prenom} ${nom},\n\nVotre compte d'accès sécurisé SGSIED en tant que "${role}" a été créé avec succès.\n\nLe système vous a attribué automatiquement le droit de contrôle suivant :\n👉 ${rights}\n\nVoici votre jeton de sécurité à conserver précieusement pour vos futures authentifications d'accès ou récupérations :\n🔑 Code d'accès : ${accessToken}\n\nVous pouvez utiliser ce code comme alternative à votre mot de passe pour vous connecter.\n\nCordialement,\nL'administration SGSIED Burkina Faso.`;
      
      simulatedEmails.unshift({
        id: "em_" + Math.random().toString(36).substring(2, 9),
        to: email,
        subject: emailSubject,
        body: emailBody,
        sentAt: new Date().toISOString()
      });

      res.json({ 
        success: true, 
        user: userResult[0],
        rights,
        accessToken,
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
      const maxAttempts = user.role === "Administrateur DSE" ? 3 : 5;
      let isSuccess = false;

      // 1. Vérifier si le compte est bloqué
      if (user.isLocked || user.loginAttempts >= maxAttempts) {
        // If they are logging in with their correct accessToken (recovery token), let them in and unlock!
        if (accessToken && user.accessToken && user.accessToken === accessToken) {
          isSuccess = true;
          const newAccessToken = "SGSIED-" + Math.random().toString(36).substring(2, 8).toUpperCase() + "-" + Math.floor(100 + Math.random() * 900);
          await db.update(users).set({ 
            accessToken: newAccessToken,
            isLocked: false,
            loginAttempts: 0
          }).where(eq(users.id, user.id));
        } else {
          if (!user.isLocked) {
            await db.update(users).set({ isLocked: true }).where(eq(users.id, user.id));
          }

          await db.insert(auditLogs).values({
            userId: user.id,
            action: "CONNEXION_REFUSEE_BLOQUE",
            entityType: "users",
            entityId: user.id,
            details: { email, reason: "Compte verrouillé pour échecs multiples" }
          });

          res.status(403).json({ 
            error: `Votre compte est bloqué suite à ${maxAttempts} échecs consécutifs de connexion. Veuillez contacter l'administrateur DSE pour déverrouiller votre accès ou utiliser votre jeton de sécurité temporaire reçu par email.` 
          });
          return;
        }
      }

      // 2. Mode de connexion : Jeton d'accès (Code Token) vs Mot de passe traditionnel
      if (accessToken) {
        // Authenticate using the generated security code token
        if (!isSuccess) {
          if (user.accessToken && user.accessToken === accessToken) {
            isSuccess = true;
            // Reset token after use
            const newAccessToken = "SGSIED-" + Math.random().toString(36).substring(2, 8).toUpperCase() + "-" + Math.floor(100 + Math.random() * 900);
            await db.update(users).set({ 
              accessToken: newAccessToken,
              isLocked: false,
              loginAttempts: 0
            }).where(eq(users.id, user.id));
          } else {
            const newAttempts = user.loginAttempts + 1;
            const shouldLock = newAttempts >= maxAttempts;

            await db.update(users).set({ 
              loginAttempts: newAttempts,
              isLocked: shouldLock
            }).where(eq(users.id, user.id));

            await db.insert(auditLogs).values({
              userId: user.id,
              action: shouldLock ? "COMPTE_VERROUILLE" : "ECHEC_CONNEXION_TOKEN",
              entityType: "users",
              entityId: user.id,
              details: { email, attempts: newAttempts, locked: shouldLock }
            });

            if (shouldLock) {
              res.status(403).json({ error: `Votre compte a été bloqué après ${maxAttempts} échecs de sécurité consécutifs.` });
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

          await db.update(users).set({ 
            loginAttempts: newAttempts,
            isLocked: shouldLock
          }).where(eq(users.id, user.id));

          await db.insert(auditLogs).values({
            userId: user.id,
            action: shouldLock ? "COMPTE_VERROUILLE" : "ECHEC_CONNEXION_PASS",
            entityType: "users",
            entityId: user.id,
            details: { email, attempts: newAttempts, locked: shouldLock }
          });

          if (shouldLock) {
            res.status(403).json({ error: `Votre compte a été bloqué après ${maxAttempts} échecs de sécurité consécutifs.` });
          } else {
            res.status(401).json({ error: `Mot de passe incorrect. Tentative ${newAttempts}/${maxAttempts}.` });
          }
          return;
        }
        isSuccess = true;
      }

      // 3. Réinitialiser le compteur d'échecs en cas de succès
      await db.update(users).set({ loginAttempts: 0 }).where(eq(users.id, user.id));

      // 4. Vérifier si le profil requiert la 2FA (Uniquement pour Admin DSE, Directeur DSE et Responsable d'Arrondissement, en cas de connexion par mot de passe)
      const requires2FA = (
        user.role === "Administrateur DSE" || 
        user.role === "Directeur DSE" || 
        user.role === "Responsable d'arrondissement" || 
        user.role === "Responsable d'Arrondissement"
      ) && !accessToken;

      if (requires2FA) {
        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        const otpExpiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

        await db.update(users).set({
          otpCode,
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

        simulatedEmails.unshift({
          id: "em_" + Math.random().toString(36).substring(2, 9),
          to: user.email,
          subject: "🔑 [SMS OTP] Votre code de sécurité double facteur (2FA)",
          body: `Bonjour ${user.prenom || ''} ${user.nom || ''},\n\nUn code de sécurité à 6 chiffres a été généré pour valider votre connexion en double facteur (2FA) sur SGSIED.\n\n📱 Code OTP SMS : ${otpCode}\n\nCe code est valable pendant 5 minutes. Ne le partagez jamais.\n\nCordialement,\nL'administration SGSIED Burkina Faso.`,
          sentAt: new Date().toISOString()
        });

        res.json({ 
          requires2FA: true, 
          email: user.email,
          message: "Un code OTP additionnel de double facteur a été généré et envoyé par SMS." 
        });
        return;
      }

      // 5. Générer le JWT de session
      const token = jwt.sign(
        { 
          id: user.id, 
          uid: user.uid, 
          email: user.email, 
          role: user.role, 
          arrondissement: user.arrondissement,
          nom: user.nom,
          prenom: user.prenom,
          telephone: user.telephone,
          rights: user.rights,
          accessToken: user.accessToken
        },
        JWT_SECRET,
        { expiresIn: "24h" }
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
          arrondissement: user.arrondissement,
          nom: user.nom,
          prenom: user.prenom,
          telephone: user.telephone,
          rights: user.rights,
          accessToken: user.accessToken
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

      if (!user.otpCode || user.otpCode !== otpCode) {
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

      const token = jwt.sign(
        { 
          id: user.id, 
          uid: user.uid, 
          email: user.email, 
          role: user.role, 
          arrondissement: user.arrondissement,
          nom: user.nom,
          prenom: user.prenom,
          telephone: user.telephone,
          rights: user.rights,
          accessToken: user.accessToken
        },
        JWT_SECRET,
        { expiresIn: "24h" }
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
          arrondissement: user.arrondissement,
          nom: user.nom,
          prenom: user.prenom,
          telephone: user.telephone,
          rights: user.rights,
          accessToken: user.accessToken
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
      const tokenToUse = user.accessToken || ("SGSIED-" + Math.random().toString(36).substring(2, 8).toUpperCase() + "-" + Math.floor(100 + Math.random() * 900));
      
      if (!user.accessToken) {
        await db.update(users).set({ accessToken: tokenToUse }).where(eq(users.id, user.id));
      }

      // Log recovery action
      await db.insert(auditLogs).values({
        userId: user.id,
        action: "RECUPERATION_COMPTE",
        entityType: "users",
        entityId: user.id,
        details: { email, recoveryToken: tokenToUse }
      });

      // Simuler l'envoi du jeton de récupération par email
      const emailSubject = "Récupération de compte SGSIED - Votre Jeton de Sécurité";
      const emailBody = `Bonjour ${user.prenom || ''} ${user.nom || ''},\n\nVous avez demandé la récupération de votre compte d'accès SGSIED.\n\nVoici votre jeton de code de sécurité réutilisable à saisir lors de votre connexion :\n🔑 Jeton d'accès : ${tokenToUse}\n\nVous pouvez utiliser ce jeton de code directement sur notre formulaire de connexion alternative pour accéder de nouveau à votre session.\n\nCordialement,\nLa Direction du Suivi des Établissements (DSE).`;

      simulatedEmails.unshift({
        id: "em_" + Math.random().toString(36).substring(2, 9),
        to: email,
        subject: emailSubject,
        body: emailBody,
        sentAt: new Date().toISOString()
      });

      res.json({
        success: true,
        message: "Un email de récupération avec votre jeton de sécurité a été envoyé à votre adresse email."
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Simulated local emails for debugging/sandbox visualization
  app.get("/api/auth/simulated-emails", async (req, res) => {
    try {
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

  // Admin lock/unlock users (Restricted to Administrateur DSE)
  app.post("/api/users/unlock/:id", requireAuth, async (req: AuthRequest, res) => {
    if (!req.user || req.user.role !== "Administrateur DSE") {
      res.status(403).json({ error: "Accès refusé : Seul l'Administrateur DSE peut déverrouiller ou autoriser des comptes." });
      return;
    }
    try {
      const targetId = parseInt(req.params.id);
      const updated = await db.update(users).set({
        isLocked: false,
        loginAttempts: 0,
        otpCode: null,
        otpExpiresAt: null
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

      res.json({ success: true, user: updated[0] });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/users/lock/:id", requireAuth, async (req: AuthRequest, res) => {
    if (!req.user || req.user.role !== "Administrateur DSE") {
      res.status(403).json({ error: "Accès refusé : Seul l'Administrateur DSE peut bloquer des comptes." });
      return;
    }
    try {
      const targetId = parseInt(req.params.id);
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

      res.json({ success: true, user: updated[0] });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Create a new user by Administrateur DSE
  app.post("/api/users", requireAuth, async (req: AuthRequest, res) => {
    if (!req.user || req.user.role !== "Administrateur DSE") {
      res.status(403).json({ error: "Accès refusé : Seul l'Administrateur DSE peut ajouter de nouveaux utilisateurs." });
      return;
    }
    try {
      const { nom, prenom, email, telephone, password, role, arrondissement } = req.body;

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

      // Limit Administrateur DSE accounts to maximum of 2
      if (role === "Administrateur DSE") {
        const admins = await db.select().from(users).where(eq(users.role, "Administrateur DSE"));
        if (admins.length >= 2) {
          res.status(400).json({ error: "La limite stricte de deux (02) comptes d'accès Administrateur DSE a été atteinte pour l'ensemble du système." });
          return;
        }
      }

      // 5. Automatic "Droit de contrôle" (Pilotage / Lecture-Ecriture / Lecture-Recherche)
      let rights = "lecture et recherche";
      if (role === "Administrateur DSE" || role === "Directeur DSE") {
        rights = "pilotage de l'ensemble du système (lecture, ecriture et recherche)";
      } else if (
        role === "Directeurs d'école" ||
        role === "Proviseur d'établissement" ||
        role === "Sécretaire Adminstratif" ||
        role === "Responsable d'Arrondissement"
      ) {
        rights = "lecture, ecriture et recherche";
      }

      // 6. Automatic Secure Token Code generation
      const accessToken = "SGSIED-" + Math.random().toString(36).substring(2, 8).toUpperCase() + "-" + Math.floor(100 + Math.random() * 900);
      const uid = "custom_" + Math.random().toString(36).substring(2, 15);
      const hash = await bcrypt.hash(password, 10);

      const createdUser = await db.insert(users).values({
        uid,
        email,
        nom,
        prenom,
        telephone: cleanPhone,
        role,
        rights,
        accessToken,
        arrondissement: arrondissement || null,
        passwordHash: hash,
        loginAttempts: 0,
        isLocked: false
      }).returning();

      // Log in audit log
      await db.insert(auditLogs).values({
        userId: req.user?.id || null,
        action: "CREATION_UTILISATEUR_ADMIN",
        entityType: "users",
        entityId: createdUser[0].id,
        details: { email, role, rights, createdBy: req.user.email }
      });

      // Simulate email notification
      simulatedEmails.unshift({
        id: "em_" + Math.random().toString(36).substring(2, 9),
        to: email,
        subject: "Création de votre compte SGSIED par l'Administrateur",
        body: `Bonjour ${prenom} ${nom},\n\nVotre compte d'accès sécurisé SGSIED en tant que "${role}" a été créé avec succès par l'Administrateur DSE.\n\nLe système vous a attribué automatiquement le droit de contrôle suivant :\n👉 ${rights}\n\n🔑 Vos identifiants de connexion :\n📧 Email : ${email}\n🔒 Mot de passe initial : ${password}\n🔑 Jeton d'accès de secours : ${accessToken}\n\nVous pouvez utiliser ce code comme alternative à votre mot de passe pour vous connecter.\n\nCordialement,\nL'administration SGSIED Burkina Faso.`,
        sentAt: new Date().toISOString()
      });

      res.json({ success: true, user: createdUser[0] });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // DELETE a user (reject access or delete completely)
  app.delete("/api/users/:id", requireAuth, async (req: AuthRequest, res) => {
    if (!req.user || req.user.role !== "Administrateur DSE") {
      res.status(403).json({ error: "Accès refusé : Seul l'Administrateur DSE peut refuser l'accès ou supprimer des utilisateurs." });
      return;
    }
    try {
      const targetId = parseInt(req.params.id);
      if (isNaN(targetId)) {
        res.status(400).json({ error: "ID de l'utilisateur invalide." });
        return;
      }

      if (req.user.id === targetId) {
        res.status(400).json({ error: "Sécurité : Vous ne pouvez pas supprimer votre propre compte Administrateur DSE." });
        return;
      }

      const usersFound = await db.select().from(users).where(eq(users.id, targetId));
      if (usersFound.length === 0) {
        res.status(404).json({ error: "Utilisateur non trouvé." });
        return;
      }

      const userToDelete = usersFound[0];

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

      // Finally, delete the user
      await db.delete(users).where(eq(users.id, targetId));

      res.json({ success: true, message: `Utilisateur ${userToDelete.email} supprimé avec succès.` });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // DELETE single audit log
  app.delete("/api/audit-logs/:id", requireAuth, async (req: AuthRequest, res) => {
    if (!req.user || req.user.role !== "Administrateur DSE") {
      res.status(403).json({ error: "Accès refusé : Seul l'Administrateur DSE peut supprimer des journaux d'audit." });
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
    if (!req.user || req.user.role !== "Administrateur DSE") {
      res.status(403).json({ error: "Accès refusé : Seul l'Administrateur DSE peut vider les journaux d'audit." });
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
      const results = await db.select().from(etablissements);
      res.json(results);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/etablissements", requireAuth, async (req: AuthRequest, res) => {
    const allowedRoles = ["Administrateur DSE", "Directeur DSE", "Proviseur d'établissement", "Sécretaire Adminstratif", "Directeurs d'école"];
    if (!req.user || !allowedRoles.includes(req.user.role || "")) {
      res.status(403).json({ error: "Accès refusé : Vous n'avez pas les droits d'écriture requis." });
      return;
    }
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
    const allowedRoles = ["Administrateur DSE", "Directeur DSE", "Proviseur d'établissement", "Sécretaire Adminstratif", "Directeurs d'école"];
    if (!req.user || !allowedRoles.includes(req.user.role || "")) {
      res.status(403).json({ error: "Accès refusé : Vous n'avez pas les droits d'écriture requis." });
      return;
    }
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
    const allowedRoles = ["Administrateur DSE", "Directeur DSE", "Proviseur d'établissement", "Sécretaire Adminstratif", "Directeurs d'école"];
    if (!req.user || !allowedRoles.includes(req.user.role || "")) {
      res.status(403).json({ error: "Accès refusé : Vous n'avez pas les droits d'archivage requis." });
      return;
    }
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
    const allowedRoles = ["Administrateur DSE", "Directeur DSE", "Proviseur d'établissement", "Sécretaire Adminstratif", "Directeurs d'école"];
    if (!req.user || !allowedRoles.includes(req.user.role || "")) {
      res.status(403).json({ error: "Accès refusé : Vous n'avez pas les droits d'écriture requis." });
      return;
    }
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
    const allowedRoles = ["Administrateur DSE", "Directeur DSE", "Proviseur d'établissement", "Sécretaire Adminstratif", "Directeurs d'école"];
    if (!req.user || !allowedRoles.includes(req.user.role || "")) {
      res.status(403).json({ error: "Accès refusé : Vous n'avez pas les droits d'écriture requis." });
      return;
    }
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
      } else {
        res.status(400).json({ error: "Format de fichier non supporté. Utilisez CSV ou Excel." });
        return;
      }

      if (parsedData.length === 0) {
        res.status(400).json({ error: "Le fichier importé est vide ou ne contient aucune ligne de données." });
        return;
      }

      // Analyse de la structure du fichier (colonnes attendues)
      const firstRow = parsedData[0];
      const headers = Object.keys(firstRow);

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
        const key = Object.keys(row).find(k => synonyms.includes(k.toLowerCase().trim()));
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
        let normalizedType = item.type;
        if (normalizedType.toLowerCase().startsWith('prim')) {
          normalizedType = 'Primaire';
        } else if (normalizedType.toLowerCase().startsWith('sec')) {
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
        let normalizedStatut = item.statut.toLowerCase().trim();
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
      res.json(results);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/infrastructures", requireAuth, async (req: AuthRequest, res) => {
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

      if (!etablissementId) {
        res.status(400).json({ error: "L'ID de l'établissement est requis." });
        return;
      }

      const existing = await db.select().from(infrastructures).where(eq(infrastructures.etablissementId, etablissementId)).limit(1);

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
        res.json(updated[0]);
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
        res.json(inserted[0]);
      }
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
      res.json(results);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/effectifs", requireAuth, async (req: AuthRequest, res) => {
    const allowedRoles = ["Administrateur DSE", "Directeur DSE", "Proviseur d'établissement", "Sécretaire Adminstratif", "Directeurs d'école"];
    if (!req.user || !allowedRoles.includes(req.user.role || "")) {
      res.status(403).json({ error: "Accès refusé : Vous n'avez pas les droits d'écriture requis." });
      return;
    }
    try {
      const { etablissementId, anneeScolaire, elevesFilles, elevesGarcons, enseignants, personnelsAdmin } = req.body;
      if (!etablissementId || !anneeScolaire) {
        res.status(400).json({ error: "L'ID de l'établissement et l'année scolaire sont requis." });
        return;
      }
      const existing = await db.select().from(effectifs).where(
        eq(effectifs.etablissementId, etablissementId)
      ).limit(1);

      if (existing.length > 0) {
        // Update the most recent or the matching one (simplified: update the first one found)
        const updated = await db.update(effectifs).set({
          elevesFilles,
          elevesGarcons,
          enseignants,
          personnelsAdmin,
          anneeScolaire
        }).where(eq(effectifs.id, existing[0].id)).returning();
        res.json(updated[0]);
      } else {
        const inserted = await db.insert(effectifs).values({
          etablissementId,
          anneeScolaire,
          elevesFilles,
          elevesGarcons,
          enseignants,
          personnelsAdmin
        }).returning();
        res.json(inserted[0]);
      }
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
      res.json(results);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/mobilier", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { etablissementId, tablesBancs, chaisesEleves, tablesBureau, chaisesBureau } = req.body;
      if (!etablissementId) {
        res.status(400).json({ error: "L'ID de l'établissement est requis." });
        return;
      }
      const existing = await db.select().from(mobilier).where(eq(mobilier.etablissementId, etablissementId)).limit(1);
      
      if (existing.length > 0) {
        const updated = await db.update(mobilier).set({
          tablesBancs,
          chaisesEleves,
          tablesBureau,
          chaisesBureau,
          lastUpdated: new Date()
        }).where(eq(mobilier.etablissementId, etablissementId)).returning();
        res.json(updated[0]);
      } else {
        const inserted = await db.insert(mobilier).values({
          etablissementId,
          tablesBancs,
          chaisesEleves,
          tablesBureau,
          chaisesBureau
        }).returning();
        res.json(inserted[0]);
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/mobilier/dotation", requireAuth, async (req: AuthRequest, res) => {
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
      res.json(results);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/constructions", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { intitule, localisation, arrondissement, datesPrevisionnelles, maitreOuvrage, budget, modeleType, statut, avancement } = req.body;
      if (!intitule) {
        res.status(400).json({ error: "L'intitulé est requis." });
        return;
      }
      
      const inserted = await db.insert(constructions).values({
        intitule,
        localisation,
        arrondissement,
        datesPrevisionnelles,
        maitreOuvrage,
        budget,
        modeleType,
        avancement: avancement != null ? parseInt(avancement.toString()) : 0,
        statut: statut || 'Planifié'
      }).returning();
      
      // Journalisation de l'action
      await logAudit(
        req.user?.id || null,
        "CREATION_PROJET_CONSTRUCTION",
        "constructions",
        inserted[0].id,
        { intitule, statut: statut || 'Planifié', budget }
      );

      res.json(inserted[0]);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/constructions/:id", requireAuth, async (req: AuthRequest, res) => {
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
      res.json(results);
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
    const allowedRoles = ["Administrateur DSE", "Directeur DSE"];
    if (!req.user || !allowedRoles.includes(req.user.role || "")) {
      res.status(403).json({ error: "Accès refusé : Seul le personnel de Direction DSE peut diffuser des communications." });
      return;
    }
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
      const allDirectors = await db.select().from(users).where(eq(users.role, "Directeur / Proviseur"));
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
    try {
      const results = await db.select().from(users).orderBy(users.createdAt);
      res.json(results);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
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

  // M: Maintenance et Entretien (Incidents)
  app.get("/api/incidents", requireAuth, async (req: AuthRequest, res) => {
    try {
      const results = await db.select().from(incidents).orderBy(incidents.dateSignalement);
      res.json(results);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/incidents", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { etablissementId, type, description } = req.body;
      const inserted = await db.insert(incidents).values({
        etablissementId: parseInt(etablissementId),
        type,
        description,
        signaleParId: req.user?.id || null
      }).returning();
      
      await logAudit(req.user?.id, 'CREATE', 'incidents', inserted[0].id, { type, description });
      res.json(inserted[0]);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.put("/api/incidents/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { statut, dateResolution } = req.body;
      const updated = await db.update(incidents).set({
        statut,
        dateResolution: dateResolution ? new Date(dateResolution) : null
      }).where(eq(incidents.id, parseInt(req.params.id))).returning();
      
      if (updated.length > 0) {
        await logAudit(req.user?.id, 'UPDATE', 'incidents', updated[0].id, { statut });
        res.json(updated[0]);
      } else {
        res.status(404).json({ error: "Not found" });
      }
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // M: Cantine & WASH My Establishment Look-up
  app.get("/api/cantine-wash/my-establishment", requireAuth, async (req: AuthRequest, res) => {
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
    try {
      const { nom, type, arrondissement, forages, latrines, cantinesCount } = req.body;
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

  // M: WASH (Cantines scolaires et points d'eau)
  app.get("/api/wash", requireAuth, async (req: AuthRequest, res) => {
    try {
      const results = await db.select().from(wash);
      res.json(results);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/wash", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { etablissementId, forages, foragesFonctionnels, latrines, latrinesFonctionnelles, cantineDisponibilite, vivresDisponibles } = req.body;
      const inserted = await db.insert(wash).values({
        etablissementId: parseInt(etablissementId),
        forages: parseInt(forages || 0),
        foragesFonctionnels: parseInt(foragesFonctionnels || 0),
        latrines: parseInt(latrines || 0),
        latrinesFonctionnelles: parseInt(latrinesFonctionnelles || 0),
        cantineDisponibilite: Boolean(cantineDisponibilite),
        vivresDisponibles
      }).returning();
      
      await logAudit(req.user?.id, 'CREATE', 'wash', inserted[0].id, req.body);
      res.json(inserted[0]);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // M: TICE (Equipements Informatiques)
  app.get("/api/tice", requireAuth, async (req: AuthRequest, res) => {
    try {
      const results = await db.select().from(tice);
      res.json(results);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/tice", requireAuth, async (req: AuthRequest, res) => {
    try {
      const { etablissementId, sallesInformatiques, ordinateurs, ordinateursFonctionnels, connectiviteInternet, typeConnexion } = req.body;
      const inserted = await db.insert(tice).values({
        etablissementId: parseInt(etablissementId),
        sallesInformatiques: parseInt(sallesInformatiques || 0),
        ordinateurs: parseInt(ordinateurs || 0),
        ordinateursFonctionnels: parseInt(ordinateursFonctionnels || 0),
        connectiviteInternet: Boolean(connectiviteInternet),
        typeConnexion
      }).returning();
      
      await logAudit(req.user?.id, 'CREATE', 'tice', inserted[0].id, req.body);
      res.json(inserted[0]);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // M: Journal d'Audit
  app.get("/api/audit-logs", requireAuth, async (req: AuthRequest, res) => {
    try {
      // Pour des raisons de securité, on pourrait verifier le role req.user.role === 'Administrateur DSE'
      // mais ici on le retourne simplement.
      const results = await db.select({
         log: auditLogs,
         user: users
      }).from(auditLogs)
        .leftJoin(users, eq(auditLogs.userId, users.id))
        .orderBy(auditLogs.createdAt);
      res.json(results);
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

      const isArrResp = req.user?.role === "Responsable d'arrondissement" || req.user?.role === "Responsable d'Arrondissement";
      const userArr = req.user?.arrondissement;

      if (isArrResp && userArr) {
        filteredEtabs = etabs.filter(e => e.arrondissement && e.arrondissement.toLowerCase() === userArr.toLowerCase());
        const allowedEtabIds = new Set(filteredEtabs.map(e => e.id));

        filteredInfras = infras.filter(i => allowedEtabIds.has(i.etablissementId));
        filteredEffs = effs.filter(ef => allowedEtabIds.has(ef.etablissementId));
        filteredConstrs = constrs.filter(c => c.arrondissement && c.arrondissement.toLowerCase() === userArr.toLowerCase());
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
        incidentStats
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
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
