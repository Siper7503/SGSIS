import assert from 'node:assert/strict';
import { test } from 'node:test';
import { moduleDecisionStatus, workflowStatusForSave } from './module-workflow.ts';
import { ROLES } from '../lib/roles.ts';

test('module save and submit statuses follow the school review chain', () => {
  assert.equal(workflowStatusForSave({ role: ROLES.PROVISEUR }, 'save'), 'Brouillon');
  assert.equal(workflowStatusForSave({ role: ROLES.PROVISEUR }, 'submit'), 'Soumis au DSE');
  assert.equal(workflowStatusForSave({ role: ROLES.DIRECTEUR_ECOLE }, 'submit'), 'Soumis au DSE');
  assert.equal(workflowStatusForSave({ role: ROLES.DIRECTEUR_DSE }, 'save'), 'Valide');
  assert.equal(workflowStatusForSave({ role: ROLES.SUPER_ADMIN }, 'submit'), 'Valide');
});

test('module approvals advance sequentially and reject back to correction', () => {
  assert.equal(moduleDecisionStatus(ROLES.PROVISEUR, 'Soumis au proviseur', 'approuver'), 'Soumis au DSE');
  assert.equal(moduleDecisionStatus(ROLES.DIRECTEUR_DSE, 'Soumis au DSE', 'approuver'), 'Valide');
  assert.equal(moduleDecisionStatus(ROLES.DIRECTEUR_DSE, 'Brouillon', 'approuver'), null);
  assert.equal(moduleDecisionStatus(ROLES.PROVISEUR, 'Brouillon', 'approuver'), null);
  assert.equal(moduleDecisionStatus("Responsable d'Arrondissement", 'Soumis au DSE', 'rejeter'), null);
});
