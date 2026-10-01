import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canCreateTargetRole, canManageScopedTarget, canReviewModuleSubmission, getModuleReviewDenial } from './authorization.ts';
import { getRoleCategory, isAgentRoleForEstablishment, normalizeRole, ROLES } from './roles.ts';

test('account creation and management respect role hierarchy and school scope', () => {
  assert.equal(canCreateTargetRole(ROLES.SUPER_ADMIN, ROLES.DIRECTEUR_DGSS), true);
  assert.equal(canCreateTargetRole(ROLES.SUPER_ADMIN, ROLES.DIRECTEUR_ECOLE), true);
  assert.equal(canCreateTargetRole(ROLES.DIRECTEUR_DSE, ROLES.PROVISEUR), true);
  assert.equal(canCreateTargetRole(ROLES.DIRECTEUR_DSE, ROLES.USER), true);
  assert.equal(canCreateTargetRole(ROLES.PROVISEUR, ROLES.DIRECTEUR_ECOLE), false);
  assert.equal(canCreateTargetRole(ROLES.DIRECTEUR_DSE, "Secretaire Administratif"), false);
  assert.equal(canCreateTargetRole(ROLES.SUPER_ADMIN, "Responsable d'Arrondissement"), false);
  assert.equal(canCreateTargetRole(ROLES.PROVISEUR, ROLES.SUPER_ADMIN), false);
  assert.equal(canManageScopedTarget(
    { role: ROLES.SUPER_ADMIN, etablissementId: null },
    { role: "Responsable d'Arrondissement", etablissementId: null },
  ), false);
  assert.equal(canManageScopedTarget(
    { role: ROLES.PROVISEUR, etablissementId: 7 },
    { role: ROLES.DIRECTEUR_ECOLE, etablissementId: 8 },
  ), false);
  assert.equal(canManageScopedTarget(
    { role: ROLES.PROVISEUR, etablissementId: 7 },
    { role: ROLES.DIRECTEUR_ECOLE, etablissementId: 7 },
  ), false);
  assert.equal(canManageScopedTarget(
    { role: ROLES.SUPER_ADMIN, etablissementId: null },
    { role: ROLES.SUPER_ADMIN, etablissementId: null },
  ), false);
});

test('module review permissions enforce role, establishment and module restrictions', () => {
  const shared = {
    module: 'wash',
    targetEstablishmentId: 7,
  };

  assert.equal(canReviewModuleSubmission({
    ...shared,
    role: ROLES.PROVISEUR,
    requesterEstablishmentId: 7,
  }), true);
  assert.equal(canReviewModuleSubmission({
    ...shared,
    role: ROLES.PROVISEUR,
    requesterEstablishmentId: 8,
  }), false);
  assert.equal(getModuleReviewDenial({
    ...shared,
    role: "Responsable d'Arrondissement",
  }), 'role');
  assert.equal(canReviewModuleSubmission({
    ...shared,
    module: 'effectifs',
    role: ROLES.DIRECTEUR_DSE,
  }), false);
  assert.equal(canReviewModuleSubmission({
    ...shared,
    role: ROLES.USER,
  }), false);
});

test('Agent roles must match the establishment type and public secondary status', () => {
  assert.equal(isAgentRoleForEstablishment(ROLES.DIRECTEUR_ECOLE, 'Primaire', 'public'), true);
  assert.equal(isAgentRoleForEstablishment(ROLES.DIRECTEUR_ECOLE, 'Secondaire', 'public'), false);
  assert.equal(isAgentRoleForEstablishment(ROLES.PROVISEUR, 'Secondaire', 'public'), true);
  assert.equal(isAgentRoleForEstablishment(ROLES.PROVISEUR, 'Secondaire', 'privé'), false);
  assert.equal(isAgentRoleForEstablishment(ROLES.PROVISEUR, 'Primaire', 'public'), false);
});

test('profiles map to the four requested actor categories and retired roles gain no rights', () => {
  assert.equal(getRoleCategory(ROLES.SUPER_ADMIN), 'SuperAdmin');
  assert.equal(getRoleCategory(ROLES.DIRECTEUR_DGSS), 'Admin');
  assert.equal(getRoleCategory(ROLES.DIRECTEUR_DSE), 'Admin');
  assert.equal(getRoleCategory(ROLES.DIRECTEUR_ECOLE), 'Agent');
  assert.equal(getRoleCategory(ROLES.PROVISEUR), 'Agent');
  assert.equal(getRoleCategory(ROLES.USER), 'User');
  assert.equal(getRoleCategory('Secretaire Administratif'), 'User');
  assert.equal(getRoleCategory("Responsable d'Arrondissement"), 'User');
  assert.equal(normalizeRole('Administrateur DGSS'), ROLES.DIRECTEUR_DGSS);
  assert.equal(normalizeRole("Directeurs d'ecole"), ROLES.DIRECTEUR_ECOLE);
});
