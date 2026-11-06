import prisma from '../../../../config/prisma.js';
import {
  ConflictError,
  LocalDate,
  NotFoundError,
  ValidationError,
  assertCanWrite,
  defaultEventBus,
  isValidCnpj,
  normalizeCnpj,
  type WorkspaceScope,
} from '../../../../shared/index.js';

export interface UpdateBusinessProfileInput {
  readonly entityId: string;
  readonly cnpj: string;
  readonly legalName?: string | null;
  readonly tradeName?: string | null;
  readonly openedOn: string; // YYYY-MM-DD
  readonly activity: 'comercio' | 'servicos' | 'misto';
}

const VALID_ACTIVITIES = ['comercio', 'servicos', 'misto'] as const;
const MEI_START_DATE = LocalDate.fromIsoDate('2009-07-01');

export async function updateBusinessProfile(
  scope: WorkspaceScope,
  input: UpdateBusinessProfileInput
) {
  assertCanWrite(scope);

  if (!input.entityId) {
    throw new ValidationError('ID da entidade é obrigatório');
  }

  const rawCnpj = input.cnpj ? String(input.cnpj).trim() : '';
  if (!isValidCnpj(rawCnpj)) {
    throw new ValidationError('CNPJ inválido');
  }
  const cleanCnpj = normalizeCnpj(rawCnpj);

  if (!VALID_ACTIVITIES.includes(input.activity as (typeof VALID_ACTIVITIES)[number])) {
    throw new ValidationError('Atividade inválida. Escolha "comercio", "servicos" ou "misto"');
  }

  let openedDate: LocalDate;
  try {
    openedDate = LocalDate.fromIsoDate(input.openedOn);
  } catch {
    throw new ValidationError('Data de abertura inválida (use o formato AAAA-MM-DD)');
  }

  const today = LocalDate.now();
  if (openedDate.isBefore(MEI_START_DATE)) {
    throw new ValidationError('Data de abertura não pode ser anterior a 01/07/2009 (início do MEI)');
  }
  if (openedDate.isAfter(today)) {
    throw new ValidationError('Data de abertura não pode ser no futuro');
  }

  const entity = await prisma.entity.findFirst({
    where: {
      id: input.entityId,
      workspaceId: scope.workspaceId,
    },
  });

  if (!entity) {
    throw new NotFoundError('Entidade não encontrada');
  }

  // Uniqueness check for CNPJ
  const existingWithCnpj = await prisma.entity.findFirst({
    where: {
      cnpj: cleanCnpj,
      id: { not: entity.id },
    },
  });
  if (existingWithCnpj) {
    throw new ConflictError('CNPJ_ALREADY_EXISTS', 'CNPJ já cadastrado em outra entidade');
  }

  const updated = await prisma.entity.update({
    where: { id: entity.id },
    data: {
      cnpj: cleanCnpj,
      legalName: input.legalName?.trim() || null,
      // Ausente mantém o valor atual; string vazia ou null limpa.
      ...(input.tradeName !== undefined
        ? { tradeName: typeof input.tradeName === 'string' ? input.tradeName.trim().slice(0, 120) || null : null }
        : {}),
      openedOn: new Date(`${openedDate.toIsoDate()}T00:00:00.000Z`),
      activity: input.activity,
      isMei: true,
    },
  });

  defaultEventBus.publish({
    name: 'entity.profile.updated',
    occurredAt: new Date(),
    payload: {
      workspaceId: scope.workspaceId,
      entityId: updated.id,
      openedOn: openedDate.toIsoDate(),
      activity: input.activity,
      isMei: true,
    },
  });

  return updated;
}
