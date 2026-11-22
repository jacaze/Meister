import { describe, expect, it } from 'vitest';
import {
  canSeeEntity,
  computeEntityAccess,
  pickDefaultEntities,
  transactionVisibilityWhere,
  type EntityAccessRecord,
} from '../visibility.js';

// Família, fase 2 (docs/familia.md §3.2 e §3.3): quem vê os dados de cada entidade.
const ana = 'user-ana';
const joao = 'user-joao';
const entities: EntityAccessRecord[] = [
  { id: 'pf-ana', kind: 'pf', visibility: 'pessoal', ownerUserId: ana },
  { id: 'pj-ana', kind: 'pj', visibility: 'pessoal', ownerUserId: ana },
  { id: 'pf-joao', kind: 'pf', visibility: 'pessoal', ownerUserId: joao },
  { id: 'aut-joao', kind: 'autonomo', visibility: 'compartilhada', ownerUserId: joao },
  { id: 'casa', kind: 'casa', visibility: 'compartilhada', ownerUserId: null },
];

describe('visibilidade de entidades', () => {
  it('cada pessoa vê o que é dela e o que é compartilhado, nunca o pessoal do outro', () => {
    expect(computeEntityAccess(entities, ana)).toEqual({
      visible: ['pf-ana', 'pj-ana', 'aut-joao', 'casa'],
      own: ['pf-ana', 'pj-ana'],
    });
    expect(computeEntityAccess(entities, joao)).toEqual({
      visible: ['pf-joao', 'aut-joao', 'casa'],
      own: ['pf-joao', 'aut-joao'],
    });
  });

  it('entidade pessoal sem dono (dado antigo) fica visível a todos os membros', () => {
    const legacy: EntityAccessRecord[] = [{ id: 'pf-antiga', kind: 'pf', visibility: 'pessoal', ownerUserId: null }];
    expect(computeEntityAccess(legacy, joao)).toEqual({ visible: ['pf-antiga'], own: [] });
  });

  it('padrões: a própria PF e a própria PJ; PJ do outro não vira padrão', () => {
    expect(pickDefaultEntities(entities, ana)).toEqual({ pf: 'pf-ana', pj: 'pj-ana' });
    expect(pickDefaultEntities(entities, joao)).toEqual({ pf: 'pf-joao' });
  });

  it('padrões: sem PF própria, usa uma PF visível sem dono', () => {
    const legacy: EntityAccessRecord[] = [{ id: 'pf-antiga', kind: 'pf', visibility: 'pessoal', ownerUserId: null }];
    expect(pickDefaultEntities(legacy, joao)).toEqual({ pf: 'pf-antiga' });
    expect(pickDefaultEntities([], joao)).toBeNull();
  });

  it('canSeeEntity respeita a lista visível do escopo', () => {
    const scope = { visibleEntityIds: ['pf-joao', 'casa'] };
    expect(canSeeEntity(scope, 'casa')).toBe(true);
    expect(canSeeEntity(scope, 'pf-ana')).toBe(false);
  });

  it('lançamento: visível pela entidade dona, pelo dinheiro próprio que pagou, ou por quem criou', () => {
    expect(
      transactionVisibilityWhere({ actorUserId: joao, visibleEntityIds: ['pf-joao', 'casa'], ownEntityIds: ['pf-joao'] })
    ).toEqual({
      OR: [
        { entityId: { in: ['pf-joao', 'casa'] } },
        { paidByEntityId: { in: ['pf-joao'] } },
        { userId: joao },
      ],
    });
  });
});
