export const ROLES = {
  SUPER_ADMIN: "SuperAdmin",
  ADMIN_DSE: "Administrateur DSE",
  ADMIN_DSE_LEGACY: "Administrateur DSE",
  DIRECTEUR_DSE: "Directeur DSE",
  DIRECTEUR_ECOLE: "Directeurs d'ecole",
  PROVISEUR: "Proviseur d'etablissement",
  SECRETAIRE_ADMIN: "Secretaire Administratif",
  SECRETAIRE_ADMIN_LEGACY: "Secretaire Adminstratif",
  RESPONSABLE_ARR: "Responsable d'Arrondissement",
  RESPONSABLE_ARR_LEGACY: "Responsable d'arrondissement",
  VISITEUR: "utilisateur lambda(visiteur)",
  DIRECTEUR_PROVISEUR_LEGACY: "Directeur / Proviseur",
} as const;

const ROLE_ALIASES: Record<string, string> = {
  "Administrateur DSE": ROLES.SUPER_ADMIN,
  "Directeurs d'école": ROLES.DIRECTEUR_ECOLE,
  "Directeurs d'Ã©cole": ROLES.DIRECTEUR_ECOLE,
  "Proviseur d'établissement": ROLES.PROVISEUR,
  "Proviseur d'Ã©tablissement": ROLES.PROVISEUR,
  "Sécretaire Adminstratif": ROLES.SECRETAIRE_ADMIN,
  "SÃ©cretaire Adminstratif": ROLES.SECRETAIRE_ADMIN,
  "Secrétaire Administratif": ROLES.SECRETAIRE_ADMIN,
  "SecrÃ©taire Administratif": ROLES.SECRETAIRE_ADMIN,
  "Responsable d'arrondissement": ROLES.RESPONSABLE_ARR,
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

export const SUPER_ADMIN_ROLES = [
  ROLES.SUPER_ADMIN,
  ROLES.ADMIN_DSE_LEGACY,
] as const;

export const DSE_ROLES = [
  ROLES.DIRECTEUR_DSE,
] as const;

export const ARRONDISSEMENT_ROLES = [
  ROLES.RESPONSABLE_ARR,
  ROLES.RESPONSABLE_ARR_LEGACY,
] as const;

export const SYSTEM_ADMIN_ROLES = [
  ...DSE_ROLES,
  ...ARRONDISSEMENT_ROLES,
] as const;

export const LOCAL_SCHOOL_ROLES = [
  ROLES.DIRECTEUR_ECOLE,
  ROLES.PROVISEUR,
  ROLES.SECRETAIRE_ADMIN,
  ROLES.SECRETAIRE_ADMIN_LEGACY,
] as const;

export const SCHOOL_USER_ROLES = [
  ...LOCAL_SCHOOL_ROLES,
  ROLES.VISITEUR,
] as const;

export const ADMIN_MANAGED_ROLES = [
  ...SYSTEM_ADMIN_ROLES,
] as const;

export const MANAGEMENT_ROLES = [
  ...SUPER_ADMIN_ROLES,
  ...SYSTEM_ADMIN_ROLES,
] as const;

export const SCHOOL_WRITE_ROLES = [
  ...DSE_ROLES,
  ...LOCAL_SCHOOL_ROLES,
] as const;
