import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accountsWithoutEntity, entityLabel, missingSelections } from '../src/lib/bankAccountEntity.ts';

test('entityLabel: PF é "Pessoal"; PJ usa nome fantasia, depois nome, depois "Empresa"', () => {
  assert.equal(entityLabel({ id: '1', kind: 'pf', name: 'Fulano' }), 'Pessoal');
  assert.equal(entityLabel({ id: '2', kind: 'pj', name: 'Razão Ltda', tradeName: 'Loja' }), 'Loja');
  assert.equal(entityLabel({ id: '3', kind: 'pj', name: 'Razão Ltda', tradeName: null }), 'Razão Ltda');
  assert.equal(entityLabel({ id: '4', kind: 'pj', name: '' }), 'Empresa');
});

test('accountsWithoutEntity: só as contas ainda sem entidade', () => {
  const contas = [
    { id: 'a', entityId: null },
    { id: 'b', entityId: 'pf-1' },
    { id: 'c', entityId: null },
  ];
  assert.deepEqual(accountsWithoutEntity(contas).map((c) => c.id), ['a', 'c']);
  assert.deepEqual(accountsWithoutEntity([]), []);
});

test('missingSelections: contas sem escolha no formulário', () => {
  const contas = [{ id: 'a' }, { id: 'b' }];
  assert.deepEqual(missingSelections(contas, { a: 'pf-1' }), ['b']);
  assert.deepEqual(missingSelections(contas, { a: 'pf-1', b: 'pj-1' }), []);
  assert.deepEqual(missingSelections(contas, { a: '', b: 'pj-1' }), ['a']);
});
