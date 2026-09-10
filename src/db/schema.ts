import { relations } from 'drizzle-orm';
import { integer, pgTable, serial, text, timestamp, boolean, jsonb } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  role: text('role').notNull().default('Directeur / Proviseur'),
  etablissementId: integer('etablissement_id'),
  arrondissement: text('arrondissement'),
  passwordHash: text('password_hash'),
  nom: text('nom'),
  prenom: text('prenom'),
  telephone: text('telephone'),
  rights: text('rights'),
  accessToken: text('access_token'),
  loginAttempts: integer('login_attempts').notNull().default(0),
  isLocked: boolean('is_locked').notNull().default(false),
  lockExpiresAt: timestamp('lock_expires_at'),
  isActive: boolean('is_active').notNull().default(true),
  deactivatedAt: timestamp('deactivated_at'),
  deactivatedById: integer('deactivated_by_id'),
  otpCode: text('otp_code'),
  otpExpiresAt: timestamp('otp_expires_at'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const etablissements = pgTable('etablissements', {
  id: serial('id').primaryKey(),
  nom: text('nom').notNull(),
  type: text('type').notNull(), // 'Primaire' | 'Secondaire'
  arrondissement: text('arrondissement').notNull(),
  statut: text('statut').notNull(), // 'public' | 'privé' | 'en construction'
  nomDirecteur: text('nom_directeur'),
  coordonnees: text('coordonnees'),
  archived: boolean('archived').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

export const infrastructures = pgTable('infrastructures', {
  id: serial('id').primaryKey(),
  etablissementId: integer('etablissement_id').references(() => etablissements.id).notNull(),
  batimentsEtudes: jsonb('batiments_etudes'),
  batimentsAdmin: jsonb('batiments_admin'),
  laboratoires: integer('laboratoires').default(0),
  bibliotheque: integer('bibliotheque').default(0),
  cuisine: integer('cuisine').default(0),
  parking: integer('parking').default(0),
  murCloture: integer('mur_cloture').default(0),
  latrinesPersonnel: integer('latrines_personnel').default(0),
  latrinesEleves: integer('latrines_eleves').default(0),
  pointsEau: integer('points_eau').default(0),
  infirmerie: integer('infirmerie').default(0),
  espacesLibres: text('espaces_libres'),
  conformite: text('conformite').default('Non conforme'),
  lastUpdated: timestamp('last_updated').defaultNow(),
});

export const effectifs = pgTable('effectifs', {
  id: serial('id').primaryKey(),
  etablissementId: integer('etablissement_id').references(() => etablissements.id).notNull(),
  anneeScolaire: text('annee_scolaire').notNull(),
  elevesFilles: integer('eleves_filles').default(0),
  elevesGarcons: integer('eleves_garcons').default(0),
  enseignants: integer('enseignants').default(0),
  personnelsAdmin: integer('personnels_admin').default(0),
});

export const mobilier = pgTable('mobilier', {
  id: serial('id').primaryKey(),
  etablissementId: integer('etablissement_id').references(() => etablissements.id).notNull(),
  tablesBancs: integer('tables_bancs').default(0),
  chaisesEleves: integer('chaises_eleves').default(0),
  tablesBureau: integer('tables_bureau').default(0),
  chaisesBureau: integer('chaises_bureau').default(0),
  lastUpdated: timestamp('last_updated').defaultNow(),
});

export const constructions = pgTable('constructions', {
  id: serial('id').primaryKey(),
  etablissementId: integer('etablissement_id').references(() => etablissements.id),
  intitule: text('intitule').notNull(),
  localisation: text('localisation'),
  arrondissement: text('arrondissement'),
  datesPrevisionnelles: text('dates_previsionnelles'),
  maitreOuvrage: text('maitre_ouvrage'),
  budget: integer('budget'),
  budgetConsomme: integer('budget_consomme').default(0),
  avancement: integer('avancement').default(0),
  modeleType: text('modele_type'), // 'A' | 'B'
  statut: text('statut').default('Planifié'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const communications = pgTable('communications', {
  id: serial('id').primaryKey(),
  titre: text('titre').notNull(),
  contenu: text('contenu').notNull(),
  auteurId: integer('auteur_id').references(() => users.id),
  ciblage: jsonb('ciblage'), 
  delaiHeures: integer('delai_heures').default(24),
  createdAt: timestamp('created_at').defaultNow(),
});

export const etablissementsRelations = relations(etablissements, ({ one, many }) => ({
  infrastructures: one(infrastructures),
  mobilier: one(mobilier),
  effectifs: many(effectifs),
}));

export const incidents = pgTable('incidents', {
  id: serial('id').primaryKey(),
  etablissementId: integer('etablissement_id').references(() => etablissements.id),
  type: text('type').notNull(),
  description: text('description').notNull(),
  statut: text('statut').default('Signalé'),
  dateSignalement: timestamp('date_signalement').defaultNow(),
  dateResolution: timestamp('date_resolution'),
  signaleParId: integer('signale_par_id').references(() => users.id),
});

export const wash = pgTable('wash', {
  id: serial('id').primaryKey(),
  etablissementId: integer('etablissement_id').references(() => etablissements.id),
  forages: integer('forages').default(0),
  foragesFonctionnels: integer('forages_fonctionnels').default(0),
  latrines: integer('latrines').default(0),
  latrinesFonctionnelles: integer('latrines_fonctionnelles').default(0),
  cantineDisponibilite: boolean('cantine_disponibilite').default(false),
  vivresDisponibles: text('vivres_disponibles'),
  cantinesCount: integer('cantines_count').default(0),
  createdAt: timestamp('created_at').defaultNow(),
});

export const tice = pgTable('tice', {
  id: serial('id').primaryKey(),
  etablissementId: integer('etablissement_id').references(() => etablissements.id),
  sallesInformatiques: integer('salles_informatiques').default(0),
  ordinateurs: integer('ordinateurs').default(0),
  ordinateursFonctionnels: integer('ordinateurs_fonctionnels').default(0),
  connectiviteInternet: boolean('connectivite_internet').default(false),
  typeConnexion: text('type_connexion'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const auditLogs = pgTable('audit_logs', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: integer('entity_id'),
  details: jsonb('details'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const annualReports = pgTable('annual_reports', {
  id: serial('id').primaryKey(),
  etablissementId: integer('etablissement_id').references(() => etablissements.id).notNull(),
  anneeScolaire: text('annee_scolaire').notNull(),
  statut: text('statut').notNull().default('Brouillon'),
  donnees: jsonb('donnees').notNull().default({}),
  createdById: integer('created_by_id').references(() => users.id),
  submittedById: integer('submitted_by_id').references(() => users.id),
  validatedById: integer('validated_by_id').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  submittedAt: timestamp('submitted_at'),
  validatedAt: timestamp('validated_at'),
});

export const moduleSubmissions = pgTable('module_submissions', {
  id: serial('id').primaryKey(),
  module: text('module').notNull(),
  recordId: integer('record_id').notNull(),
  etablissementId: integer('etablissement_id').references(() => etablissements.id).notNull(),
  statut: text('statut').notNull().default('Brouillon'),
  createdById: integer('created_by_id').references(() => users.id),
  submittedById: integer('submitted_by_id').references(() => users.id),
  reviewedById: integer('reviewed_by_id').references(() => users.id),
  commentaire: text('commentaire'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  submittedAt: timestamp('submitted_at'),
  reviewedAt: timestamp('reviewed_at'),
});

export const communicationReceipts = pgTable('communication_receipts', {
  id: serial('id').primaryKey(),
  communicationId: integer('communication_id').references(() => communications.id).notNull(),
  userId: integer('user_id').references(() => users.id).notNull(),
  statut: text('statut').notNull().default('Non lu'), // 'Non lu' | 'Lu' | 'Accusé'
  luAt: timestamp('lu_at'),
  accuseAt: timestamp('accuse_at'),
  inAppSentAt: timestamp('in_app_sent_at').defaultNow(),
  smsSentAt: timestamp('sms_sent_at').defaultNow(),
  createdAt: timestamp('created_at').defaultNow(),
});
