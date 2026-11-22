import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveFeatureFlags, visibleProfiles } from '../src/lib/featureFlags.ts';

test('família desligada por padrão (sem env, vazio, outro valor, DEV)', () => {
  assert.equal(resolveFeatureFlags(undefined).familia, false);
  assert.equal(resolveFeatureFlags({}).familia, false);
  assert.equal(resolveFeatureFlags({ VITE_FEATURE_FAMILIA: 'false' }).familia, false);
  assert.equal(resolveFeatureFlags({ VITE_FEATURE_FAMILIA: '1' }).familia, false);
  assert.equal(resolveFeatureFlags({ DEV: true }).familia, false);
});

test('VITE_FEATURE_FAMILIA=true liga família', () => {
  assert.equal(resolveFeatureFlags({ VITE_FEATURE_FAMILIA: 'true' }).familia, true);
});

test('visibleProfiles sem a flag mostra só individual e negocio', () => {
  const all = [{ value: 'individual' }, { value: 'negocio' }, { value: 'familia' }, { value: 'familia_negocio' }];
  assert.deepEqual(visibleProfiles(all, false).map((p) => p.value), ['individual', 'negocio']);
  assert.equal(visibleProfiles(all, true).length, 4);
});
