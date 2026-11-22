import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  severityLabel,
  quickQuestions,
  askPlaceholder,
  EMPTY_INSIGHTS_TEXT,
  askErrorMessage,
  formatEvidenceAmount,
  formatIsoDateBR,
} from '../src/lib/insightsCopy.ts';

const PJ_WORDS = /\b(PJ|MEI|DAS|empresa|faturamento)\b/i;

test('severityLabel traduz para português', () => {
  assert.equal(severityLabel('alerta'), 'Alerta');
  assert.equal(severityLabel('atencao'), 'Atenção');
  assert.equal(severityLabel('info'), 'Informação');
});

test('perguntas sugeridas sem PJ não falam de MEI/DAS', () => {
  for (const q of quickQuestions(false)) assert.ok(!PJ_WORDS.test(q), q);
  assert.ok(!PJ_WORDS.test(askPlaceholder(false)));
});

test('perguntas sugeridas com PJ incluem limite MEI e DAS', () => {
  const qs = quickQuestions(true).join(' ');
  assert.match(qs, /MEI/);
  assert.match(qs, /DAS/);
  assert.match(askPlaceholder(true), /MEI/);
});

test('texto de vazio', () => {
  assert.equal(EMPTY_INSIGHTS_TEXT, 'Ainda não há insights — eles aparecem conforme você registra lançamentos.');
});

test('askErrorMessage usa a mensagem da API ou um texto claro', () => {
  assert.equal(askErrorMessage({ response: { data: { message: 'Pergunta inválida' } } }), 'Pergunta inválida');
  assert.match(askErrorMessage(new Error('x')), /Não consegui responder/);
});

test('formatEvidenceAmount em pt-BR sem float solto', () => {
  assert.equal(formatEvidenceAmount(1234.5).replace(/\s| /g, ' '), 'R$ 1.234,50');
});

test('formatIsoDateBR converte AAAA-MM-DD sem passar por Date (sem fuso)', () => {
  assert.equal(formatIsoDateBR('2026-11-10'), '10/11/2026');
  assert.equal(formatIsoDateBR('2026-11-10T03:00:00Z'), '10/11/2026');
  assert.equal(formatIsoDateBR('lixo'), 'lixo');
});
