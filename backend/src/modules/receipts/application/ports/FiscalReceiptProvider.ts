import type { AccessKey } from '../../domain/AccessKey.js';
import type { FiscalReceiptItem } from '../../domain/ReceiptItem.js';

export interface ParsedReceiptData {
  readonly accessKey?: string;
  readonly issuerCnpj?: string;
  readonly issuerName?: string;
  readonly issuedOn?: string; // YYYY-MM-DD
  readonly total: string;
  readonly discount?: string;
  readonly items: readonly FiscalReceiptItem[];
  readonly source: 'sefaz' | 'ia' | 'qr_offline';
  readonly rawText?: string;
}

export interface FiscalReceiptProvider {
  parseReceipt(input: {
    imageBase64?: string;
    mimeType?: string;
    qrUrl?: string;
    accessKey?: AccessKey;
  }): Promise<ParsedReceiptData | null>;
}
