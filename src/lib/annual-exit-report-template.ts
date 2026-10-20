const blank = '';

export function emptyAnnualExitReport() {
  return {
    identification: { responsable: blank, fonction: blank, telephone: blank, dateCloture: blank, observationsGenerales: blank },
    effectifsFinaux: {
      parNiveau: [{ niveau: blank, fillesInscrites: 0, garconsInscrits: 0, totalInscrits: 0, fillesPresentes: 0, garconsPresents: 0, totalPresents: 0, departsFilles: 0, departsGarcons: 0, totalDeparts: 0, motifDepart: blank }],
      mouvements: [{ typeMouvement: 'Transfert entrant', filles: 0, garcons: 0, observations: blank }, { typeMouvement: 'Transfert sortant', filles: 0, garcons: 0, observations: blank }],
    },
    resultatsScolaires: [{ niveau: blank, effectifExamine: 0, fillesAdmis: 0, garconsAdmis: 0, totalAdmis: 0, tauxReussite: 0, fillesRedoublantes: 0, garconsRedoublants: 0, totalRedoublants: 0, fillesExclues: 0, garconsExclus: 0, totalExclus: 0, observations: blank }],
    personnelFinAnnee: { enseignants: [{ statut: blank, fonction: blank, femmes: 0, hommes: 0, total: 0, mouvementsEtObservations: blank }], administrationEtAppui: [{ fonction: blank, femmes: 0, hommes: 0, total: 0, mouvementsEtObservations: blank }] },
    bilanPedagogique: { coursPrevus: 0, coursRealises: 0, programmesAcheves: blank, classesAvecEmploiDuTempsRespecte: 0, classesTotal: 0, observations: blank },
    infrastructures: [{ type: 'Salle de classe', nombre: 0, bonEtat: 0, aReparer: 0, inutilisable: 0, observations: blank }],
    equipementsEtMobilier: [{ designation: blank, quantiteDebutAnnee: 0, acquisitions: 0, reparations: 0, pertesOuMisesAuRebut: 0, quantiteFinAnnee: 0, etatEtObservations: blank }],
    situationFinanciere: { applicable: blank, recettes: [{ nature: blank, montantPrevu: 0, montantRecu: 0, observations: blank }], depenses: [{ nature: blank, montantPrevu: 0, montantRealise: 0, observations: blank }], soldeFinal: 0, observations: blank },
    difficultesEtPerspectives: [{ domaine: blank, problemesConstates: blank, solutionsAppliquees: blank, besoinsAnneeSuivante: blank }],
    validation: { date: blank, observationsResponsable: blank, nomResponsable: blank, signatureResponsable: blank, cachetEtablissement: blank },
  };
}

export function mergeAnnualExitReport(source: unknown): Record<string, any> {
  const defaults = emptyAnnualExitReport() as Record<string, any>;
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
