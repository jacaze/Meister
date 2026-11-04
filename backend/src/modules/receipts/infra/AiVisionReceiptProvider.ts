import type { FiscalReceiptProvider, ParsedReceiptData } from '../application/ports/FiscalReceiptProvider.js';
import type { FiscalReceiptItem } from '../domain/ReceiptItem.js';
import { suggestCategoryFromKeywords } from '../domain/ReceiptItem.js';

export class AiVisionReceiptProvider implements FiscalReceiptProvider {
  private readonly apiKey?: string;
  private readonly model: string;

  constructor(apiKey?: string, model?: string) {
    this.apiKey = apiKey || process.env.GEMINI_API_KEY;
    this.model = model || process.env.LLM_MODEL || 'gemini-3.5-flash';
  }

  async parseReceipt(input: {
    imageBase64?: string;
    mimeType?: string;
    qrUrl?: string;
  }): Promise<ParsedReceiptData | null> {
    if (!this.apiKey || !input.imageBase64) {
      return this.heuristicFallback(input.qrUrl);
    }

    const systemPrompt = `Você é um leitor especialista em notas fiscais brasileiras (NFC-e, NF-e), cupons fiscais e comprovantes de pagamento para MEI.
Sua tarefa é analisar a imagem e extrair os dados estruturados com extrema precisão.
Campos a extrair:
- accessKey: chave de acesso de 44 dígitos se visível (apenas dígitos numéricos ou null)
- issuerCnpj: CNPJ do estabelecimento emissor (apenas dígitos ou null)
- issuerName: Razão social ou nome fantasia do estabelecimento
- issuedOn: Data da emissão no formato AAAA-MM-DD
- total: Valor total final da compra em string decimal (ex: "85.90")
- discount: Valor de desconto total se houver (ex: "5.00" ou null)
- items: Lista de itens comprados, contendo:
  - description: Nome do produto/serviço
  - quantity: Quantidade numérica (ex: 2)
  - unitPrice: Valor unitário em string decimal (ex: "10.00")
  - total: Valor total do item em string decimal (ex: "20.00")
  - categorySlug: Sugestão de categoria ("alimentacao", "mercadoria-insumos", "operacao", "transporte", "saude", "outras-despesas")

Retorne RIGOROSAMENTE apenas um objeto JSON com essa estrutura.`;

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [
            {
              role: 'user',
              parts: [
                {
                  inlineData: {
                    mimeType: input.mimeType || 'image/jpeg',
                    data: input.imageBase64,
                  },
                },
                { text: 'Extraia os dados desta nota fiscal/comprovante.' },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.1,
          },
        }),
      });

      if (!response.ok) {
        console.warn(`[AiVisionReceiptProvider] Gemini API error ${response.status}. Using fallback.`);
        return this.heuristicFallback(input.qrUrl);
      }

      const json = await response.json();
      const rawText = json?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) {
        return this.heuristicFallback(input.qrUrl);
      }

      const parsed = JSON.parse(rawText);

      const items: FiscalReceiptItem[] = Array.isArray(parsed.items)
        ? parsed.items.map((it: Record<string, unknown>) => ({
            description: String(it.description || 'Item'),
            quantity: it.quantity ? Number(it.quantity) : undefined,
            unitPrice: it.unitPrice ? String(it.unitPrice) : undefined,
            total: String(it.total || '0.00'),
            categorySlug: (typeof it.categorySlug === 'string' ? it.categorySlug : undefined) || suggestCategoryFromKeywords(String(it.description || '')),
          }))
        : [];

      return {
        accessKey: parsed.accessKey || undefined,
        issuerCnpj: parsed.issuerCnpj || undefined,
        issuerName: parsed.issuerName || undefined,
        issuedOn: parsed.issuedOn || new Date().toISOString().slice(0, 10),
        total: String(parsed.total || '0.00'),
        discount: parsed.discount ? String(parsed.discount) : undefined,
        items,
        source: 'ia',
        rawText,
      };
    } catch (err) {
      console.warn('[AiVisionReceiptProvider] Vision extraction error:', err);
      return this.heuristicFallback(input.qrUrl);
    }
  }

  private heuristicFallback(qrUrl?: string): ParsedReceiptData {
    return {
      issuedOn: new Date().toISOString().slice(0, 10),
      total: '0.00',
      items: [],
      source: 'ia',
      rawText: qrUrl ? `QR: ${qrUrl}` : undefined,
    };
  }
}
