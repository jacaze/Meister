import prisma from '../../../../config/prisma.js';
import type { WorkspaceScope } from '../../../../shared/index.js';
import { LocalDate, Money, ValidationError } from '../../../../shared/index.js';
import { AccessKey } from '../../domain/AccessKey.js';
import type { FiscalReceiptItem } from '../../domain/ReceiptItem.js';

export interface RegisterReceiptInput {
  readonly accessKey: string;
  readonly issuerCnpj?: string;
  readonly issuedOn?: string;
  readonly total?: string;
  readonly discount?: string;
  readonly source?: 'sefaz' | 'ia' | 'qr_offline';
  readonly items?: readonly FiscalReceiptItem[];
}

export async function registerReceipt(
  scope: WorkspaceScope,
  input: RegisterReceiptInput
) {
  if (!AccessKey.isValid(input.accessKey)) {
    throw new ValidationError('Chave de acesso da nota fiscal inválida');
  }

  const cleanKey = input.accessKey.replace(/\D/g, '');

  const existing = await prisma.fiscalReceipt.findUnique({
    where: {
      workspaceId_accessKey: {
        workspaceId: scope.workspaceId,
        accessKey: cleanKey,
      },
    },
  });

  if (existing) {
    throw new ValidationError(
      `Esta nota fiscal já foi registrada em ${existing.createdAt.toLocaleDateString('pt-BR')}`
    );
  }

  const issuedDate = input.issuedOn ? LocalDate.fromIsoDate(input.issuedOn).toUtcDate() : undefined;
  const totalMoney = input.total ? Money.fromDecimalString(input.total).toDecimalString() : undefined;
  const discountMoney = input.discount ? Money.fromDecimalString(input.discount).toDecimalString() : undefined;

  return prisma.fiscalReceipt.create({
    data: {
      workspaceId: scope.workspaceId,
      accessKey: cleanKey,
      issuerCnpj: input.issuerCnpj?.replace(/\D/g, ''),
      issuedOn: issuedDate,
      total: totalMoney,
      discount: discountMoney,
      source: input.source || 'ia',
      items: input.items ? JSON.parse(JSON.stringify(input.items)) : undefined,
    },
  });
}
