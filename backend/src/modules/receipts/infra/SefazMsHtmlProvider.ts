import type { FiscalReceiptProvider, ParsedReceiptData } from '../application/ports/FiscalReceiptProvider.js';
import type { AccessKey } from '../domain/AccessKey.js';
import { SsrGuard } from '../domain/SsrGuard.js';
import type { FiscalReceiptItem } from '../domain/ReceiptItem.js';
import { suggestCategoryFromKeywords } from '../domain/ReceiptItem.js';

export class SefazMsHtmlProvider implements FiscalReceiptProvider {
  async parseReceipt(input: {
    imageBase64?: string;
    mimeType?: string;
    qrUrl?: string;
    accessKey?: AccessKey;
  }): Promise<ParsedReceiptData | null> {
    if (!input.qrUrl) {
      return null;
    }

    // 1. Strict SSRF Guard check
    if (!SsrGuard.isAllowedSefazUrl(input.qrUrl)) {
      console.warn(`[SefazMsHtmlProvider] Host not allowed by SSRF guard: ${input.qrUrl}`);
      return null;
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(input.qrUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'MEIster-Bot/1.0 (+https://meister.app.br; fiscal-assistant)',
          Accept: 'text/html,application/xhtml+xml',
        },
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok) {
        return null;
      }

      const html = await res.text();
      return this.parseHtml(html, input.accessKey);
    } catch (err) {
      console.warn('[SefazMsHtmlProvider] Failed to fetch or parse SEFAZ page:', err);
      return null;
    }
  }

  private parseHtml(html: string, accessKey?: AccessKey): ParsedReceiptData | null {
    // Regex extraction for NFC-e table values
    const totalMatch = html.match(/vbrt[^>]*>([0-9.,]+)<\/span>/i) ||
      html.match(/Valor total[^>]*>([0-9.,]+)<\/span>/i) ||
      html.match(/totalNfe[^>]*>([0-9.,]+)<\/span>/i) ||
      html.match(/R\$\s*([0-9.,]+)/i);

    const totalStr = totalMatch && totalMatch[1]
      ? totalMatch[1].replace('.', '').replace(',', '.')
      : '0.00';

    const cnpjMatch = html.match(/CNPJ[^0-9]*([0-9]{2}\.[0-9]{3}\.[0-9]{3}\/[0-9]{4}-[0-9]{2})/i);
    const issuerCnpj = cnpjMatch && cnpjMatch[1] ? cnpjMatch[1].replace(/\D/g, '') : accessKey?.cnpj;

    // Simple item extractor from table rows
    const items: FiscalReceiptItem[] = [];
    const itemRegex = /<tr[^>]*class="Item[^"]*"[^>]*>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>[\s\S]*?<td[^>]*>([0-9.,]+)<\/td>[\s\S]*?<\/tr>/gi;
    let match;

    while ((match = itemRegex.exec(html)) !== null && items.length < 50) {
      if (!match[1] || !match[2]) continue;
      const desc = match[1].replace(/<[^>]+>/g, '').trim();
      const val = match[2].replace('.', '').replace(',', '.');
      if (desc && !isNaN(Number(val)) && Number(val) > 0) {
        items.push({
          description: desc,
          total: Number(val).toFixed(2),
          categorySlug: suggestCategoryFromKeywords(desc) || undefined,
        });
      }
    }

    return {
      accessKey: accessKey?.raw,
      issuerCnpj,
      total: Number(totalStr).toFixed(2),
      items,
      source: 'sefaz',
    };
  }
}
