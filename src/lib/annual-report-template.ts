const blank = '';
const blankPerson = () => ({ nom: blank, prenom: blank, sexe: blank, titreCapaciteDiplome: blank, discipline: blank, contact: blank, statut: blank, observations: blank });
const blankStaffCount = (emploi: string) => ({ emploi, statut: blank, femmes: 0, hommes: 0, total: 0, postesAPourvoir: 0 });
const blankTeachingCount = (discipline: string) => ({ discipline, permanentsF: 0, permanentsH: 0, permanentsTotal: 0, nonPermanentsF: 0, nonPermanentsH: 0, nonPermanentsTotal: 0, vacatairesF: 0, vacatairesH: 0, vacatairesTotal: 0, totalPourvu: 0, aPourvoir: 0 });
const blankActivity = (activite: string) => ({ activite, realisee: blank, datePeriode: blank, observationsSiNonRealisee: blank });
const blankDifficulty = (domaine: string) => ({ domaine, difficultesRencontrees: blank, solutionsEnvisagees: blank });
const blankTimetable = () => Object.fromEntries(['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'].map((day) => [day, Object.fromEntries(['7h-8h', '8h-9h', '9h-10h', '10h-11h', '11h-12h', '15h-16h', '16h-17h', '17h-18h'].map((period) => [period, blank]))]));

export function emptyAnnualReportComplement() {
  const disciplines = ['Allemand', 'Français/Allemand', 'Français', 'Français/Anglais', 'Français/Histoire-Géographie/EC', 'Anglais', 'Histoire-Géographie/EC', 'Maths', 'Maths/PC', 'Maths/SVT', 'PC/SVT', 'PC', 'SVT', 'EPS', 'Philosophie', 'Arabe', 'ESF', 'Russe', 'Mooré', 'Dioula', 'Fulfuldé', 'Autres'];
  const supportJobs = ['Gardien/Vigile', 'Agent de liaison', 'Cantinière', 'Chauffeur', 'Reprographe', 'Manœuvre', 'Autre'];
  const adminJobs = ['Conseiller d’éducation', 'Attaché d’éducation', 'Assistant d’éducation', 'CISU', 'CASU', 'AISU', 'AASU', 'Secrétaire', 'Autres'];
  const specificJobs = ['Bibliothécaires', 'Technicien supérieur de laboratoire et atelier', 'Laborantins', 'Agents de l’action sociale', 'Personnel médico-scolaire'];
  return {
    I_identification: { codeAdministratif: blank, referencesActeOuverture: blank },
    II_localisation: { region: blank, province: blank, commune: blank, arrondissement: blank, secteur: blank, village: blank, distanceDPESFPT_CESFPT: blank, boitePostale: blank, rue: blank, telephone: blank, email: blank, siteWeb: blank, chefEtablissementDirecteurEtudes: blank, contactWhatsAppChef: blank, fondateurPrive: blank, contactWhatsAppFondateur: blank },
    III_informationsGenerales: {
      statut: { publicPrive: blank, polyvalent: false, conventionne: false, laic: false, francoArabe: false, catholique: false, protestant: false, islamique: false },
      partenariats: [{ type: blank, denominationPartenaire: blank, domainesAction: blank, dateMiseEnOeuvre: blank, responsable: blank, contact: blank }],
      organisationSpecifique: { devise: blank, charteExiste: false, reglementInterieurSpecifique: false, projetEtablissement: false, commentaire: blank },
      postPrimaire: ['6e', '5e', '4e', '3e'].map((niveau) => ({ niveau, nombreClasses: 0, filles: 0, garcons: 0, total: 0 })),
      secondaire: ['2nde', '1re', 'Bac Pro', 'Tle'].map((niveau) => ({ niveau, series: blank, nombreClasses: 0, filles: 0, garcons: 0, total: 0 })),
      recapitulatif: { postPrimaire: { filles: 0, garcons: 0, total: 0, nombreClasses: 0, sallesAbrisPrecaires: 0, sallesEmprunt: 0, sallesNonUtilisees: 0 }, secondaire: { filles: 0, garcons: 0, total: 0, nombreClasses: 0, sallesAbrisPrecaires: 0, sallesEmprunt: 0, sallesNonUtilisees: 0 } },
      affectesEtatPublic: [{ categorie: 'Admis à l’entrée en 6e', affectesCommission: 0, recusSurTransfert: 0, total: 0, presentsAu15Novembre: 0 }, { categorie: 'Admis à l’entrée en 2de', affectesCommission: 0, recusSurTransfert: 0, total: 0, presentsAu15Novembre: 0 }, { categorie: 'Admis en 1re année Bac Pro', affectesCommission: 0, recusSurTransfert: 0, total: 0, presentsAu15Novembre: 0 }],
      affectesEtatPrive: [{ niveau: 'Post-primaire', sexe: blank, anciensAffectesRedoublants: 0, nouveauxAffectesEtat: 0 }, { niveau: 'Secondaire', sexe: blank, anciensAffectesRedoublants: 0, nouveauxAffectesEtat: 0 }],
      elevesDeplacesInternes: ['6e', '5e', '4e', '3e', '2nde', '1re', 'Tle', 'Bac Pro'].map((niveau) => ({ niveau, series: blank, filles: 0, garcons: 0, total: 0 })),
      elevesInscritsAuxMetiers: [{ metier: blank, filles: 0, garcons: 0, total: 0 }],
      precisions: blank,
    },
    IV_personnelEnseignant: { public: disciplines.map(blankTeachingCount), prive: disciplines.map(blankTeachingCount), commentaires: blank },
    V_personnelDirection: { public: ['Proviseur/Directeur', 'Censeur', 'Chef des travaux', 'Conseiller principal d’éducation', 'Intendant/Économe', 'Responsable centre de ressources'].map((fonction) => ({ ...blankPerson(), fonction })), prive: ['Proviseur/Directeur', 'Directeur des études', 'Chef des travaux', 'Conseiller principal d’éducation', 'Comptable', 'Responsable centre de ressources'].map((fonction) => ({ ...blankPerson(), fonction })), referencesAutorisationPrive: blank },
    V_personnelAdministrationVieScolaire: { public: adminJobs.map(blankStaffCount), prive: ['Conseiller d’éducation', 'Attaché d’éducation', 'Assistant d’éducation', 'Secrétaire', 'Autres'].map(blankStaffCount), precisionsAutres: blank },
    VI_personnelsSpecifiques: { public: specificJobs.map(blankStaffCount), prive: specificJobs.map(blankStaffCount) },
    VII_personnelsAppuiSoutien: { public: supportJobs.map(blankStaffCount), prive: supportJobs.map(blankStaffCount), statuts: ['Agent public', 'Agent communal', 'Contractuel/volontaire/autre'] },
    VIII_preparationDeroulementRentree: {
      activitesPreparatoires: ['Élaboration avant-projet de budget', 'Rencontre avec le Conseil de l’École', 'Rencontre avec les autorités', 'Préparation des emplois du temps', 'Affectation des élèves admis aux concours nationaux', 'Affectation des personnels pour convenances personnelles', 'Autres activités'].map(blankActivity),
      activitesRentreeAdministrative: ['Conseil de direction', 'Entretien et réparations', 'Nettoyage du domaine scolaire et des infrastructures sportives', 'Conseil de gestion', 'Commission de recrutement', 'Remise des emplois du temps', 'Préparation des cahiers et registres', 'Conseil d’établissement', 'Conseil des professeurs', 'Mise en place du conseil de discipline', 'Conseils d’enseignement', 'Accueil et installation des élèves', 'Autres activités'].map(blankActivity),
      dateDebutEffectifCours: blank, compteRendu: blank,
    },
    IX_organesGestion: { instances: ['Conseil de gestion', 'Conseil de direction', 'Conseil d’établissement', 'Conseil des professeurs', 'Conseil de discipline', 'Conseils d’enseignement', 'Conseils de classe', 'Commission RCE'].map((instance) => ({ instance, existe: blank, explicationSiNon: blank })), composition: [{ nom: blank, prenom: blank, titre: blank, statut: blank, contact: blank }] },
    X_structuresStatutaires: ['Conseil de gestion', 'Conseil de discipline', 'Commission de recrutement', 'Bureau du comité des élèves', 'Bureau du Conseil de l’école'].map((structure) => ({ structure, existe: blank, observations: blank })),
    XI_autresStructures: ['Bureau d’animation sportive', 'Autres'].map((structure) => ({ structure, observations: blank })),
    XII_organisationPedagogique: { emploisDuTempsClasses: [{ classe: blank, nombreHeuresDues: 0, nombreHeuresAssurees: 0, enseignantsParMatiere: blank, emploiDuTemps: blankTimetable() }] },
    XIII_identificationProfesseurs: { professeurs: [{ nom: blank, prenom: blank, matricule: blank, contact: blank, dateLieuNaissance: blank, sexe: blank, disciplineSpecialite: blank, titreCapacite: blank, diplomePlusEleve: blank, datePriseServiceEtablissement: blank, dateEntreeFonctionPublique: blank, referencesAutorisationEnseigner: blank, statut: blank, secondEtablissementSiA_Cheval: blank, nombreHeuresDues: 0, nombreHeuresAssurees: 0, emploiDuTemps: blankTimetable() }] },
    XIV_professeursPrincipaux: [{ nom: blank, prenom: blank, classe: blank, contact: blank }],
    XV_matieresSpecifiques: [{ matiere: blank, enseignant: blank, classe: blank, observations: blank }],
    XVI_coursDuSoir: { existe: blank, anneeOuvertureReferences: blank, organisateur: blank, denomination: blank, directeur: blank, contact: blank, effectifs: [{ classe: blank, serie: blank, nombreClasses: 0, filles: 0, garcons: 0, total: 0 }] },
    XVII_situationFinancierePublic: { recettes: { exerciceAnterieur: { fraisParticipationScolarite: 0, contributionConseilEcole: 0, subventionVacation: 0, subventionCollectivites: 0, autresRecettes: 0 }, exerciceEnCours: { fraisParticipationScolarite: 0, contributionConseilEcole: 0, subventionVacation: 0, subventionCollectivites: 0, autresRecettes: 0 } }, depenses: { exerciceAnterieur: { reversement10PourcentDR_DP: 0, salairesPersonnel: 0, fraisVacation: 0, investissementsEquipements: 0, autresCharges: 0 }, exerciceEnCours: { reversement10PourcentDR_DP: 0, salairesPersonnel: 0, fraisVacation: 0, investissementsEquipements: 0, autresCharges: 0 } }, solde: { exerciceAnterieur: 0, exerciceEnCours: 0 } },
    XVIII_resultatsConcours: ['Entrée en 2de', 'Entrée en 1re année de BEP', 'Entrée en 1re année Bac Pro'].map((concours) => ({ concours, inscritsF: 0, inscritsG: 0, inscritsTotal: 0, presentesF: 0, presentesG: 0, presentesTotal: 0, admisF: 0, admisG: 0, admisTotal: 0, tauxReussite: 0 })),
    XIX_difficultesSolutions: {
      domaines: ['Difficultés d’ordre pédagogique', 'Ressources humaines', 'Difficultés d’ordre financier', 'Matières d’œuvres', 'Infrastructures et équipements'].map(blankDifficulty),
      dateRapport: blank,
      nomResponsable: blank,
      fonctionResponsable: blank,
      signatureResponsable: blank,
      cachetEtablissement: blank,
    },
  };
}

export function mergeAnnualReportComplement(source: unknown): Record<string, unknown> {
  const defaults = emptyAnnualReportComplement() as Record<string, unknown>;
  if (!source || typeof source !== 'object' || Array.isArray(source)) return defaults;
  const merge = (base: any, value: any): any => {
    if (Array.isArray(value)) return value;
    if (base && value && typeof base === 'object' && typeof value === 'object' && !Array.isArray(base) && !Array.isArray(value)) {
      return Object.fromEntries([...new Set([...Object.keys(base), ...Object.keys(value)])].map((key) => [key, key in value ? merge(base[key], value[key]) : base[key]]));
    }
    return value === undefined || value === null ? base : value;
  };
  return merge(defaults, source);
}
