import prisma from '../../../../config/prisma.js';
import type { WorkspaceScope } from '../../../../shared/index.js';
import { AccessKey } from '../../domain/AccessKey.js';
import { QrPayload } from '../../domain/QrPayload.js';
import type { FiscalReceiptItem } from '../../domain/ReceiptItem.js';
import type { FiscalReceiptProvider } from '../ports/FiscalReceiptProvider.js';
import { AiVisionReceiptProvider } from '../../infra/AiVisionReceiptProvider.js';
import { SefazMsHtmlProvider } from '../../infra/SefazMsHtmlProvider.js';
import { buildSplitProposal, type SplitProposalResult } from './BuildSplitProposal.js';

export interface ParseReceiptPhotoInput {
  readonly imageBase64?: string;
  readonly mimeType?: string;
  readonly textOrQrUrl?: string;
  readonly entityId?: string;
  readonly visionProvider?: FiscalReceiptProvider;
  readonly sefazProvider?: FiscalReceiptProvider;
}

export interface ReceiptParseResult {
  readonly qrStatus: 'found' | 'not_found' | 'invalid';
  readonly accessKey?: string;
  readonly issuerCnpj?: string;
  readonly issuerName?: string;
  readonly issuedOn: string;
  readonly total: string;
  readonly discount?: string;
  readonly items: readonly FiscalReceiptItem[];
  readonly source: 'sefaz' | 'ia' | 'qr_offline';
  readonly duplicate?: {
    readonly isDuplicate: boolean;
    readonly registeredAt: string;
    readonly existingReceiptId: string;
  };
  readonly splitProposal: SplitProposalResult;
}

export async function parseReceiptPhoto(
  scope: WorkspaceScope,
  input: ParseReceiptPhotoInput
): Promise<ReceiptParseResult> {
  let resolvedKey: AccessKey | undefined;
  let qrUrl: string | undefined;
  let qrStatus: 'found' | 'not_found' | 'invalid' = 'not_found';

  // 1. Try decoding QR / Key from text if present
  if (input.textOrQrUrl) {
    const qrResult = QrPayload.parse(input.textOrQrUrl);
    if (qrResult) {
      resolvedKey = qrResult.accessKey;
      qrUrl = qrResult.rawUrl;
      qrStatus = 'found';
    } else {
      qrStatus = 'invalid';
    }
  }

  // 2. Check Duplicity in DB if we have accessKey
  let duplicateInfo: ReceiptParseResult['duplicate'];
  if (resolvedKey) {
    const existing = await prisma.fiscalReceipt.findUnique({
      where: {
        workspaceId_accessKey: {
          workspaceId: scope.workspaceId,
          accessKey: resolvedKey.raw,
        },
      },
    });

    if (existing) {
      duplicateInfo = {
        isDuplicate: true,
        registeredAt: existing.createdAt.toISOString().slice(0, 10),
        existingReceiptId: existing.id,
      };
    }
  }

  // 3. Try SEFAZ if QR URL is present
  let receiptData: {
    total: string;
    items: FiscalReceiptItem[];
    issuedOn?: string;
    issuerCnpj?: string;
    issuerName?: string;
    discount?: string;
    source: 'sefaz' | 'ia' | 'qr_offline';
  } | null = null;

  const sefazProvider = input.sefazProvider || new SefazMsHtmlProvider();
  if (qrUrl) {
    const sefazRes = await sefazProvider.parseReceipt({
      qrUrl,
      accessKey: resolvedKey,
    });
    if (sefazRes && sefazRes.items.length > 0) {
      receiptData = {
        total: sefazRes.total,
        items: [...sefazRes.items],
        issuedOn: sefazRes.issuedOn,
        issuerCnpj: sefazRes.issuerCnpj,
        issuerName: sefazRes.issuerName,
        discount: sefazRes.discount,
        source: 'sefaz',
      };
    }
  }

  // 4. Fallback to Gemini Vision if SEFAZ was not used or yielded no items
  if (!receiptData) {
    const vision = input.visionProvider || new AiVisionReceiptProvider();
    const visionRes = await vision.parseReceipt({
      imageBase64: input.imageBase64,
      mimeType: input.mimeType,
      qrUrl,
    });

    if (visionRes) {
      if (!resolvedKey && visionRes.accessKey && AccessKey.isValid(visionRes.accessKey)) {
        resolvedKey = AccessKey.fromString(visionRes.accessKey);
        qrStatus = 'found';
      }

      receiptData = {
        total: visionRes.total,
        items: [...visionRes.items],
        issuedOn: visionRes.issuedOn,
        issuerCnpj: visionRes.issuerCnpj,
        issuerName: visionRes.issuerName,
        discount: visionRes.discount,
        source: 'ia',
      };
    }
  }

  // Final fallback
  if (!receiptData) {
    receiptData = {
      total: '0.00',
      items: [],
      issuedOn: new Date().toISOString().slice(0, 10),
      source: 'ia',
    };
  }

  // 5. Build Split Proposal and Jars Impact
  const splitProposal = await buildSplitProposal(scope, {
    items: receiptData.items,
    total: receiptData.total,
    discount: receiptData.discount,
    entityId: input.entityId,
  });

  return {
    qrStatus,
    accessKey: resolvedKey?.raw,
    issuerCnpj: receiptData.issuerCnpj || resolvedKey?.cnpj,
    issuerName: receiptData.issuerName,
    issuedOn: receiptData.issuedOn || new Date().toISOString().slice(0, 10),
    total: receiptData.total,
    discount: receiptData.discount,
    items: receiptData.items,
    source: receiptData.source,
    duplicate: duplicateInfo,
    splitProposal,
  };
}
