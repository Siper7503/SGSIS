export const ROLES = {
  ADMIN_DSE: "Administrateur DSE",
  DIRECTEUR_DSE: "Directeur DSE",
  DIRECTEUR_ECOLE: "Directeurs d'école",
  PROVISEUR: "Proviseur d'établissement",
  SECRETAIRE_ADMIN: "Secrétaire Administratif",
  SECRETAIRE_ADMIN_LEGACY: "Sécretaire Adminstratif",
  RESPONSABLE_ARR: "Responsable d'Arrondissement",
  RESPONSABLE_ARR_LEGACY: "Responsable d'arrondissement",
  VISITEUR: "utilisateur lambda(visiteur)",
  DIRECTEUR_PROVISEUR_LEGACY: "Directeur / Proviseur",
} as const;

const ROLE_ALIASES: Record<string, string> = {
  [ROLES.SECRETAIRE_ADMIN_LEGACY]: ROLES.SECRETAIRE_ADMIN,
  [ROLES.RESPONSABLE_ARR_LEGACY]: ROLES.RESPONSABLE_ARR,
  [ROLES.DIRECTEUR_PROVISEUR_LEGACY]: ROLES.PROVISEUR,
};

export function normalizeRole(role?: string | null): string {
  if (!role) return "";
  const trimmed = role.trim();
  return ROLE_ALIASES[trimmed] || trimmed;
}

export function hasAnyRole(role: string | null | undefined, allowedRoles: readonly string[]): boolean {
  const normalized = normalizeRole(role);
  return allowedRoles.map(normalizeRole).includes(normalized);
}

export const DSE_ROLES = [ROLES.ADMIN_DSE, ROLES.DIRECTEUR_DSE] as const;

export const LOCAL_SCHOOL_ROLES = [
  ROLES.DIRECTEUR_ECOLE,
  ROLES.PROVISEUR,
  ROLES.SECRETAIRE_ADMIN,
  ROLES.SECRETAIRE_ADMIN_LEGACY,
] as const;

export const ARRONDISSEMENT_ROLES = [
  ROLES.RESPONSABLE_ARR,
  ROLES.RESPONSABLE_ARR_LEGACY,
] as const;

export const SCHOOL_WRITE_ROLES = [
  ...DSE_ROLES,
  ...LOCAL_SCHOOL_ROLES,
] as const;
