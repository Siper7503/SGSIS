import {
  ADMIN_MANAGED_ROLES,
  DSE_ROLES,
  LOCAL_SCHOOL_ROLES,
  ROLES,
  SCHOOL_USER_ROLES,
  SUPER_ADMIN_ROLES,
  hasAnyRole,
} from './roles.ts';
import type { SessionUser } from './shared-types.ts';

export function canCreateTargetRole(
  managerRole: string | null | undefined,
  targetRole: string | null | undefined,
): boolean {
  if (hasAnyRole(managerRole, SUPER_ADMIN_ROLES)) {
    return hasAnyRole(targetRole, [...ADMIN_MANAGED_ROLES, ...SCHOOL_USER_ROLES, ...SUPER_ADMIN_ROLES]);
  }
  if (hasAnyRole(managerRole, DSE_ROLES)) {
    return hasAnyRole(targetRole, SCHOOL_USER_ROLES);
  }
  return false;
}

export function canManageTargetAccount(
  managerRole: string | null | undefined,
  targetRole: string | null | undefined,
): boolean {
  if (hasAnyRole(targetRole, SUPER_ADMIN_ROLES)) return false;
  if (hasAnyRole(managerRole, SUPER_ADMIN_ROLES)) {
    return hasAnyRole(targetRole, [...ADMIN_MANAGED_ROLES, ...SCHOOL_USER_ROLES]);
  }
  if (hasAnyRole(managerRole, DSE_ROLES)) {
    return hasAnyRole(targetRole, SCHOOL_USER_ROLES);
  }
  return false;
}

export function canManageScopedTarget(
  manager: Pick<SessionUser, 'role' | 'etablissementId'> | null | undefined,
  target: Pick<SessionUser, 'role' | 'etablissementId'> | null | undefined,
): boolean {
  return Boolean(manager && target && canManageTargetAccount(manager.role, target.role));
}

export type ModuleReviewDenial = 'role' | 'read-only' | 'establishment';

export function getModuleReviewDenial(options: {
  role?: string | null;
  module: string;
  requesterEstablishmentId?: number | null;
  targetEstablishmentId: number;
}): ModuleReviewDenial | null {
  const { role, module } = options;
  if (!hasAnyRole(role, [...DSE_ROLES, ROLES.PROVISEUR])) return 'role';
  if (module === 'effectifs' && hasAnyRole(role, DSE_ROLES)) return 'read-only';
  if (hasAnyRole(role, [ROLES.PROVISEUR]) && options.requesterEstablishmentId !== options.targetEstablishmentId) return 'establishment';
  return null;
}

export function canReviewModuleSubmission(options: Parameters<typeof getModuleReviewDenial>[0]): boolean {
  return getModuleReviewDenial(options) === null;
}
