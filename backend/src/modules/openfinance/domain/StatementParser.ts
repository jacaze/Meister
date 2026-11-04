import crypto from 'crypto';
import { suggestCategoryFromKeywords } from '../../receipts/domain/ReceiptItem.js';

export interface ParsedBankTransaction {
  readonly externalId: string;
  readonly direction: 'in' | 'out';
  readonly amount: string; // positive decimal string e.g. "150.00"
  readonly occurredOn: string; // "YYYY-MM-DD"
  readonly description: string;
  readonly suggestedCategorySlug?: string;
  readonly raw?: Record<string, unknown>;
}

export class StatementParser {
  /**
   * Parse OFX text (SGML or XML-like format commonly produced by Brazilian banks)
   */
  static parseOfx(content: string): ParsedBankTransaction[] {
    const transactions: ParsedBankTransaction[] = [];
    const trnRegex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
    let match;

    let seq = 0;
    while ((match = trnRegex.exec(content)) !== null) {
      seq += 1;
      const block = match[1] || '';

      const trnTypeMatch = block.match(/<TRNTYPE>([^<\r\n]+)/i);
      const dtPostedMatch = block.match(/<DTPOSTED>([^<\r\n]+)/i);
      const trnAmtMatch = block.match(/<TRNAMT>([^<\r\n]+)/i);
      const fitIdMatch = block.match(/<FITID>([^<\r\n]+)/i);
      const memoMatch = block.match(/<MEMO>([^<\r\n]+)/i);
      const nameMatch = block.match(/<NAME>([^<\r\n]+)/i);

      const rawAmountStr = trnAmtMatch ? trnAmtMatch[1]!.trim().replace(',', '.') : '0';
      const numAmount = parseFloat(rawAmountStr);
      if (isNaN(numAmount) || numAmount === 0) continue;

      const direction: 'in' | 'out' = numAmount < 0 ? 'out' : 'in';
      const positiveAmount = Math.abs(numAmount).toFixed(2);

      // Parse Date: YYYYMMDD...
      let dateIso = new Date().toISOString().slice(0, 10);
      if (dtPostedMatch) {
        const rawDate = dtPostedMatch[1]!.trim();
        if (rawDate.length >= 8) {
          const y = rawDate.slice(0, 4);
          const m = rawDate.slice(4, 6);
          const d = rawDate.slice(6, 8);
          dateIso = `${y}-${m}-${d}`;
        }
      }

      const description = (memoMatch ? memoMatch[1] : nameMatch ? nameMatch[1] : 'Lançamento bancário')!
        .trim();

      const externalId =
        (fitIdMatch && fitIdMatch[1] ? fitIdMatch[1]!.trim() : null) ||
        crypto
          .createHash('sha256')
          .update(`ofx_${dateIso}_${positiveAmount}_${direction}_${description}_${seq}`)
          .digest('hex')
          .slice(0, 32);

      transactions.push({
        externalId,
        direction,
        amount: positiveAmount,
        occurredOn: dateIso,
        description,
        suggestedCategorySlug: suggestCategoryFromKeywords(description) || undefined,
        raw: { trnType: trnTypeMatch ? trnTypeMatch[1]?.trim() : undefined, originalAmount: rawAmountStr },
      });
    }

    return transactions;
  }

  /**
   * Parse CSV text with delimiter detection (; or , or \t)
   */
  static parseCsv(content: string): ParsedBankTransaction[] {
    const transactions: ParsedBankTransaction[] = [];
    const lines = content.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
    if (lines.length < 2) return [];

    // Detect delimiter from first non-empty line
    const header = lines[0]!;
    const delimiter = header.includes(';') ? ';' : header.includes('\t') ? '\t' : ',';

    let seq = 0;
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]!;
      const parts = line.split(delimiter).map((p) => p.replace(/^["']|["']$/g, '').trim());
      if (parts.length < 3) continue;

      // Typical order: Date, Description, Amount
      const rawDate = parts[0]!;
      const rawDesc = parts[1]!;
      const rawAmt = parts[2]!;

      // Normalize date: DD/MM/YYYY or YYYY-MM-DD
      let dateIso = new Date().toISOString().slice(0, 10);
      if (rawDate.includes('/')) {
        const dParts = rawDate.split('/');
        if (dParts.length === 3) {
          if (dParts[0]!.length === 4) {
            dateIso = `${dParts[0]}-${dParts[1]!.padStart(2, '0')}-${dParts[2]!.padStart(2, '0')}`;
          } else {
            dateIso = `${dParts[2]}-${dParts[1]!.padStart(2, '0')}-${dParts[0]!.padStart(2, '0')}`;
          }
        }
      } else if (rawDate.includes('-') && rawDate.length >= 10) {
        dateIso = rawDate.slice(0, 10);
      }

      // Normalize amount (handle Brazilian "1.250,50" or "-45,00")
      let cleanAmt = rawAmt.replace('R$', '').trim();
      if (cleanAmt.includes(',') && cleanAmt.includes('.')) {
        cleanAmt = cleanAmt.replace(/\./g, '').replace(',', '.');
      } else if (cleanAmt.includes(',')) {
        cleanAmt = cleanAmt.replace(',', '.');
      }

      const numAmount = parseFloat(cleanAmt);
      if (isNaN(numAmount) || numAmount === 0) continue;

      seq += 1;
      const direction: 'in' | 'out' = numAmount < 0 ? 'out' : 'in';
      const positiveAmount = Math.abs(numAmount).toFixed(2);
      const description = rawDesc || 'Lançamento bancário';

      const externalId = crypto
        .createHash('sha256')
        .update(`csv_${dateIso}_${positiveAmount}_${direction}_${description}_${seq}`)
        .digest('hex')
        .slice(0, 32);

      transactions.push({
        externalId,
        direction,
        amount: positiveAmount,
        occurredOn: dateIso,
        description,
        suggestedCategorySlug: suggestCategoryFromKeywords(description) || undefined,
        raw: { lineIndex: i, originalLine: line },
      });
    }

    return transactions;
  }

  /**
   * Auto-detect format and parse
   */
  static parse(content: string): ParsedBankTransaction[] {
    if (content.includes('<OFX>') || content.includes('<STMTTRN>') || content.includes('OFXHEADER')) {
      return this.parseOfx(content);
    }
    return this.parseCsv(content);
  }
}
