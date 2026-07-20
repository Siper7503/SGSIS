CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" integer,
	"details" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "communication_receipts" (
	"id" serial PRIMARY KEY NOT NULL,
	"communication_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"statut" text DEFAULT 'Non lu' NOT NULL,
	"lu_at" timestamp,
	"accuse_at" timestamp,
	"in_app_sent_at" timestamp DEFAULT now(),
	"sms_sent_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "communications" (
	"id" serial PRIMARY KEY NOT NULL,
	"titre" text NOT NULL,
	"contenu" text NOT NULL,
	"auteur_id" integer,
	"ciblage" jsonb,
	"delai_heures" integer DEFAULT 24,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "constructions" (
	"id" serial PRIMARY KEY NOT NULL,
	"intitule" text NOT NULL,
	"localisation" text,
	"arrondissement" text,
	"dates_previsionnelles" text,
	"maitre_ouvrage" text,
	"budget" integer,
	"budget_consomme" integer DEFAULT 0,
	"avancement" integer DEFAULT 0,
	"modele_type" text,
	"statut" text DEFAULT 'Planifié',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "effectifs" (
	"id" serial PRIMARY KEY NOT NULL,
	"etablissement_id" integer NOT NULL,
	"annee_scolaire" text NOT NULL,
	"eleves_filles" integer DEFAULT 0,
	"eleves_garcons" integer DEFAULT 0,
	"enseignants" integer DEFAULT 0,
	"personnels_admin" integer DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "etablissements" (
	"id" serial PRIMARY KEY NOT NULL,
	"nom" text NOT NULL,
	"type" text NOT NULL,
	"arrondissement" text NOT NULL,
	"statut" text NOT NULL,
	"nom_directeur" text,
	"coordonnees" text,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "incidents" (
	"id" serial PRIMARY KEY NOT NULL,
	"etablissement_id" integer,
	"type" text NOT NULL,
	"description" text NOT NULL,
	"statut" text DEFAULT 'Signalé',
	"date_signalement" timestamp DEFAULT now(),
	"date_resolution" timestamp,
	"signale_par_id" integer
);
--> statement-breakpoint
CREATE TABLE "infrastructures" (
	"id" serial PRIMARY KEY NOT NULL,
	"etablissement_id" integer NOT NULL,
	"batiments_etudes" jsonb,
	"batiments_admin" jsonb,
	"laboratoires" integer DEFAULT 0,
	"bibliotheque" integer DEFAULT 0,
	"cuisine" integer DEFAULT 0,
	"parking" integer DEFAULT 0,
	"mur_cloture" integer DEFAULT 0,
	"latrines_personnel" integer DEFAULT 0,
	"latrines_eleves" integer DEFAULT 0,
	"points_eau" integer DEFAULT 0,
	"infirmerie" integer DEFAULT 0,
	"espaces_libres" text,
	"conformite" text DEFAULT 'Non conforme',
	"last_updated" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "mobilier" (
	"id" serial PRIMARY KEY NOT NULL,
	"etablissement_id" integer NOT NULL,
	"tables_bancs" integer DEFAULT 0,
	"chaises_eleves" integer DEFAULT 0,
	"tables_bureau" integer DEFAULT 0,
	"chaises_bureau" integer DEFAULT 0,
	"last_updated" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "tice" (
	"id" serial PRIMARY KEY NOT NULL,
	"etablissement_id" integer,
	"salles_informatiques" integer DEFAULT 0,
	"ordinateurs" integer DEFAULT 0,
	"ordinateurs_fonctionnels" integer DEFAULT 0,
	"connectivite_internet" boolean DEFAULT false,
	"type_connexion" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"uid" text NOT NULL,
	"email" text NOT NULL,
	"role" text DEFAULT 'Directeur / Proviseur' NOT NULL,
	"arrondissement" text,
	"password_hash" text,
	"nom" text,
	"prenom" text,
	"telephone" text,
	"rights" text,
	"access_token" text,
	"login_attempts" integer DEFAULT 0 NOT NULL,
	"is_locked" boolean DEFAULT false NOT NULL,
	"otp_code" text,
	"otp_expires_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "users_uid_unique" UNIQUE("uid")
);
--> statement-breakpoint
CREATE TABLE "wash" (
	"id" serial PRIMARY KEY NOT NULL,
	"etablissement_id" integer,
	"forages" integer DEFAULT 0,
	"forages_fonctionnels" integer DEFAULT 0,
	"latrines" integer DEFAULT 0,
	"latrines_fonctionnelles" integer DEFAULT 0,
	"cantine_disponibilite" boolean DEFAULT false,
	"vivres_disponibles" text,
	"cantines_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_receipts" ADD CONSTRAINT "communication_receipts_communication_id_communications_id_fk" FOREIGN KEY ("communication_id") REFERENCES "public"."communications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_receipts" ADD CONSTRAINT "communication_receipts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communications" ADD CONSTRAINT "communications_auteur_id_users_id_fk" FOREIGN KEY ("auteur_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "effectifs" ADD CONSTRAINT "effectifs_etablissement_id_etablissements_id_fk" FOREIGN KEY ("etablissement_id") REFERENCES "public"."etablissements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_etablissement_id_etablissements_id_fk" FOREIGN KEY ("etablissement_id") REFERENCES "public"."etablissements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_signale_par_id_users_id_fk" FOREIGN KEY ("signale_par_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "infrastructures" ADD CONSTRAINT "infrastructures_etablissement_id_etablissements_id_fk" FOREIGN KEY ("etablissement_id") REFERENCES "public"."etablissements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mobilier" ADD CONSTRAINT "mobilier_etablissement_id_etablissements_id_fk" FOREIGN KEY ("etablissement_id") REFERENCES "public"."etablissements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tice" ADD CONSTRAINT "tice_etablissement_id_etablissements_id_fk" FOREIGN KEY ("etablissement_id") REFERENCES "public"."etablissements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wash" ADD CONSTRAINT "wash_etablissement_id_etablissements_id_fk" FOREIGN KEY ("etablissement_id") REFERENCES "public"."etablissements"("id") ON DELETE no action ON UPDATE no action;