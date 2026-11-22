import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolvePluggyConfig } from '../src/lib/pluggyConfig.ts';

test('sandbox desligado por padrão em produção', () => {
  assert.equal(resolvePluggyConfig({ DEV: false }).includeSandbox, false);
  assert.equal(resolvePluggyConfig({}).includeSandbox, false);
  assert.equal(resolvePluggyConfig(undefined).includeSandbox, false);
});

test('sandbox ligado em desenvolvimento', () => {
  assert.equal(resolvePluggyConfig({ DEV: true }).includeSandbox, true);
});

test('VITE_PLUGGY_INCLUDE_SANDBOX=true liga o sandbox em produção', () => {
  const cfg = resolvePluggyConfig({ DEV: false, VITE_PLUGGY_INCLUDE_SANDBOX: 'true' });
  assert.equal(cfg.includeSandbox, true);
  assert.equal(cfg.showDemoNotice, true);
});

test('só o texto exato "true" liga a flag (sem interpretar "1", "yes", "false")', () => {
  for (const v of ['false', '1', 'yes', '', 'TRUE ', undefined]) {
    assert.equal(
      resolvePluggyConfig({ DEV: false, VITE_PLUGGY_INCLUDE_SANDBOX: v }).includeSandbox,
      false,
      `valor ${String(v)}`,
    );
  }
});

test('aviso de demonstração aparece quando o sandbox está ligado e some quando desligado', () => {
  assert.equal(resolvePluggyConfig({ DEV: true }).showDemoNotice, true);
  assert.equal(resolvePluggyConfig({ DEV: false }).showDemoNotice, false);
});
