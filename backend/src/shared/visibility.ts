// Quem vê os dados de cada entidade na família (docs/familia.md §3.2 e §3.3). Regras puras, sem Prisma.

export interface EntityAccessRecord {
  readonly id: string;
  readonly kind: string;
  readonly visibility: string; // pessoal | compartilhada
  readonly ownerUserId: string | null;
}

export interface EntityAccess {
  readonly visible: string[];
  readonly own: string[];
}

/**
 * Vê: o que é seu, o que é compartilhado e o pessoal sem dono (dado anterior à família, de quem usava sozinho).
 * Papel não entra aqui: o dono do workspace também não vê o pessoal do cônjuge.
 */
export function computeEntityAccess(entities: readonly EntityAccessRecord[], userId: string): EntityAccess {
  const own = entities.filter((e) => e.ownerUserId === userId).map((e) => e.id);
  const visible = entities
    .filter((e) => e.ownerUserId === userId || e.ownerUserId === null || e.visibility === 'compartilhada')
    .map((e) => e.id);
  return { visible, own };
}

/** PF e PJ padrão da pessoa: as próprias; sem PF própria, uma PF visível sem dono. Nunca a do cônjuge. */
export function pickDefaultEntities(
  entities: readonly EntityAccessRecord[],
  userId: string
): { pf: string; pj?: string } | null {
  const pf =
    entities.find((e) => e.kind === 'pf' && e.ownerUserId === userId) ??
    entities.find((e) => e.kind === 'pf' && e.ownerUserId === null);
  if (!pf) return null;
  const pj = entities.find((e) => e.kind === 'pj' && e.ownerUserId === userId);
  return pj ? { pf: pf.id, pj: pj.id } : { pf: pf.id };
}

export function canSeeEntity(scope: { readonly visibleEntityIds: readonly string[] }, entityId: string): boolean {
  return scope.visibleEntityIds.includes(entityId);
}

/**
 * Filtro de lançamentos (regra 2 da §3.2): visível pela entidade dona, pelo dinheiro próprio que pagou
 * ou por ter sido criado pela pessoa. Formato compatível com o `where` do Prisma.
 */
export function transactionVisibilityWhere(scope: {
  readonly actorUserId: string;
  readonly visibleEntityIds: readonly string[];
  readonly ownEntityIds: readonly string[];
}) {
  return {
    OR: [
      { entityId: { in: [...scope.visibleEntityIds] } },
      { paidByEntityId: { in: [...scope.ownEntityIds] } },
      { userId: scope.actorUserId },
    ],
  };
}
