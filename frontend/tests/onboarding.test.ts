import { test } from 'node:test';
import assert from 'node:assert/strict';
import { needsBusiness, validateOnboarding } from '../src/lib/onboarding.ts';

test('needsBusiness: só os perfis com negócio exigem negócio', () => {
  assert.equal(needsBusiness('individual'), false);
  assert.equal(needsBusiness('familia'), false);
  assert.equal(needsBusiness('negocio'), true);
  assert.equal(needsBusiness('familia_negocio'), true);
});

test('validateOnboarding: perfil sem negócio ignora as linhas e envia lista vazia', () => {
  const r = validateOnboarding('individual', [{ type: 'mei', name: 'Loja' }], 0);
  assert.deepEqual(r, { businesses: [] });
});

test('validateOnboarding: perfil com negócio exige ao menos um (novo ou existente)', () => {
  assert.ok(validateOnboarding('negocio', [], 0).error);
  assert.deepEqual(validateOnboarding('negocio', [], 1), { businesses: [] });
});

test('validateOnboarding: apara nomes, descarta linhas vazias e exige nome em linha preenchida pela metade', () => {
  assert.deepEqual(
    validateOnboarding('negocio', [{ type: 'autonomo', name: '  Aulas  ' }, { type: 'mei', name: '' }], 0),
    { businesses: [{ type: 'autonomo', name: 'Aulas' }] }
  );
  assert.ok(validateOnboarding('negocio', [{ type: 'mei', name: '   ' }], 0).error);
});
