import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hasPjEntity, jarRuleLabel, baseModeLabel, isDefaultSuggestedPlan, suggestedPlanNotice,
} from '../src/lib/jarsCopy.ts';

const fmt = (v: string) => `R$ ${v}`;

test('hasPjEntity: só kind pj conta', () => {
  assert.equal(hasPjEntity([{ kind: 'pf' }]), false);
  assert.equal(hasPjEntity([{ kind: 'pf' }, { kind: 'pj' }]), true);
  assert.equal(hasPjEntity(undefined), false);
});

test('jarRuleLabel: sem PJ fala em renda, com PJ em faturamento', () => {
  assert.equal(jarRuleLabel({ percent: 55 }, false, fmt), '55% da renda');
  assert.equal(jarRuleLabel({ percent: 15 }, true, fmt), '15% do faturamento');
  assert.equal(jarRuleLabel({ percent: null, fixedAmount: '86.05' }, false, fmt), 'R$ 86.05 fixo');
  assert.equal(jarRuleLabel({}, true, fmt), 'Meta personalizada');
});

test('baseModeLabel: sem PJ não fala em faturamento', () => {
  assert.equal(baseModeLabel('mes_atual', false), 'Renda deste mês (tempo real)');
  assert.equal(baseModeLabel('mes_anterior', true), 'Faturamento do mês anterior');
  assert.equal(baseModeLabel('media_3_meses', false), 'Média dos últimos 3 meses');
});

test('isDefaultSuggestedPlan: template que o backend escolhe sozinho', () => {
  assert.equal(isDefaultSuggestedPlan('seis-potes', 'pf'), true);
  assert.equal(isDefaultSuggestedPlan('mei-empresa', 'pj'), true);
  assert.equal(isDefaultSuggestedPlan('personalizado', 'pf'), false);
  assert.equal(isDefaultSuggestedPlan('50-30-20', 'pf'), false);
  assert.equal(isDefaultSuggestedPlan(undefined, 'pf'), false);
});

test('suggestedPlanNotice: mostra a divisão', () => {
  const jars = [55, 10, 10, 10, 10, 5].map((percent) => ({ percent }));
  assert.equal(
    suggestedPlanNotice(jars),
    'Criamos uma divisão sugerida (55/10/10/10/10/5). Ajuste as porcentagens e categorias como preferir.',
  );
});
