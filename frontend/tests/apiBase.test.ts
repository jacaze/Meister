import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveApiBase } from '../src/lib/apiBase.ts';

test('sem VITE_API_URL usa /api relativo', () => {
  for (const env of [undefined, {}, { VITE_API_URL: '' }, { VITE_API_URL: '   ' }, { VITE_API_URL: '/' }]) {
    assert.equal(resolveApiBase(env), '/api');
  }
});

test('com VITE_API_URL usa a origem da API + /api', () => {
  assert.equal(resolveApiBase({ VITE_API_URL: 'https://meister-api.onrender.com' }), 'https://meister-api.onrender.com/api');
});

test('normaliza barra final, espaços e /api já informado', () => {
  for (const v of ['https://x.onrender.com/', 'https://x.onrender.com//', ' https://x.onrender.com ', 'https://x.onrender.com/api', 'https://x.onrender.com/api/']) {
    assert.equal(resolveApiBase({ VITE_API_URL: v }), 'https://x.onrender.com/api', v);
  }
});
