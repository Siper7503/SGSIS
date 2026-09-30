export const ROLES = {
  SUPER_ADMIN: "SuperAdmin",
  DIRECTEUR_DGSS: "Directeur DGSS",
  DIRECTEUR_DSE: "Directeur DSE",
  DIRECTEUR_ECOLE: "Directeur d'école primaire",
  PROVISEUR: "Proviseur d'établissement secondaire public",
  USER: "Usager",
} as const;

const ROLE_ALIASES: Record<string, string> = {
  "Administrateur DGSS": ROLES.DIRECTEUR_DGSS,
  "Administrateur DSE": ROLES.DIRECTEUR_DSE,
  "Directeur d'ecole primaire": ROLES.DIRECTEUR_ECOLE,
  "Directeurs d'ecole": ROLES.DIRECTEUR_ECOLE,
  "Directeurs d'école": ROLES.DIRECTEUR_ECOLE,
  "Directeurs d'Ã©cole": ROLES.DIRECTEUR_ECOLE,
  "Directeur d'école primaire": ROLES.DIRECTEUR_ECOLE,
  "Proviseur d'etablissement": ROLES.PROVISEUR,
  "Proviseur d'établissement": ROLES.PROVISEUR,
  "Proviseur d'Ã©tablissement": ROLES.PROVISEUR,
  "utilisateur lambda(visiteur)": ROLES.USER,
  "Visiteur": ROLES.USER,
  "Directeur / Proviseur": ROLES.PROVISEUR,
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
] as const;

export const DSE_ROLES = [
  ROLES.DIRECTEUR_DSE,
] as const;

export const DGSS_ROLES = [
  ROLES.DIRECTEUR_DGSS,
] as const;

export const SYSTEM_ADMIN_ROLES = [
  ...DSE_ROLES,
] as const;

export const BUSINESS_ADMIN_ROLES = [
  ...DGSS_ROLES,
  ...DSE_ROLES,
] as const;

export const LOCAL_SCHOOL_ROLES = [
  ROLES.DIRECTEUR_ECOLE,
  ROLES.PROVISEUR,
] as const;

export const SCHOOL_USER_ROLES = [
  ...LOCAL_SCHOOL_ROLES,
  ROLES.USER,
] as const;

export const ADMIN_MANAGED_ROLES = [
  ...BUSINESS_ADMIN_ROLES,
] as const;

export const MANAGEMENT_ROLES = [
  ...SUPER_ADMIN_ROLES,
  ...SYSTEM_ADMIN_ROLES,
] as const;

export const SCHOOL_WRITE_ROLES = [
  ...DSE_ROLES,
  ...LOCAL_SCHOOL_ROLES,
] as const;

export type RoleCategory = 'SuperAdmin' | 'Admin' | 'Agent' | 'User';

export function getRoleCategory(role?: string | null): RoleCategory {
  if (hasAnyRole(role, SUPER_ADMIN_ROLES)) return 'SuperAdmin';
  if (hasAnyRole(role, BUSINESS_ADMIN_ROLES)) return 'Admin';
  if (hasAnyRole(role, LOCAL_SCHOOL_ROLES)) return 'Agent';
  return 'User';
}

export function isAgentRoleForEstablishment(
  role: string | null | undefined,
  type: string | null | undefined,
  statut: string | null | undefined,
): boolean {
  if (hasAnyRole(role, [ROLES.DIRECTEUR_ECOLE])) return type?.toLowerCase() === 'primaire';
  if (hasAnyRole(role, [ROLES.PROVISEUR])) {
    return type?.toLowerCase() === 'secondaire' && statut?.toLowerCase() === 'public';
  }
  return false;
}
