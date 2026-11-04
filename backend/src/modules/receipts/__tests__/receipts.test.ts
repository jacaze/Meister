import { describe, expect, it } from 'vitest';
import { AccessKey } from '../domain/AccessKey.js';
import { QrPayload } from '../domain/QrPayload.js';
import { SsrGuard } from '../domain/SsrGuard.js';
import { suggestCategoryFromKeywords } from '../domain/ReceiptItem.js';

describe('Receipts Module — Domain & Invariants', () => {
  // Synthesize a valid 44-digit NFC-e access key for MS (UF 50, Year 26, Month 11)
  const base43 = '5026111234567800019565001000000123100000123';
  const expectedDv = AccessKey.calculateDv(base43);
  const validKey = `${base43}${expectedDv}`;

  describe('AccessKey Value Object', () => {
    it('validates and parses a correct 44-digit key', () => {
      expect(AccessKey.isValid(validKey)).toBe(true);

      const parsed = AccessKey.fromString(validKey);
      expect(parsed.cUF).toBe('50');
      expect(parsed.uf).toBe('MS');
      expect(parsed.isNfce).toBe(true);
      expect(parsed.isNfe).toBe(false);
      expect(parsed.cnpj).toBe('12345678000195');
      expect(parsed.yearMonthIso).toBe('2026-11');
      expect(parsed.formattedCnpj).toBe('12.345.678/0001-95');
      expect(Number(parsed.cDV)).toBe(expectedDv);
    });

    it('rejects keys with invalid length or wrong DV', () => {
      expect(AccessKey.isValid('12345')).toBe(false);

      // Invert check digit
      const wrongDv = (expectedDv + 1) % 10;
      const invalidKey = `${base43}${wrongDv}`;
      expect(AccessKey.isValid(invalidKey)).toBe(false);
      expect(() => AccessKey.fromString(invalidKey)).toThrow(/Dígito verificador.*inválido/);
    });
  });

  describe('QrPayload Parser', () => {
    it('parses QR Code 2.0 with pipe parameter', () => {
      const qr2Url = `http://www.dfe.ms.gov.br/nfce/qrcode?p=${validKey}|2|1|1|ABCDEF123456`;
      const result = QrPayload.parse(qr2Url);

      expect(result).not.toBeNull();
      expect(result?.accessKey.raw).toBe(validKey);
      expect(result?.qrVersion).toBe('2');
      expect(result?.environment).toBe('producao');
    });

    it('parses QR Code 1.0 with chNFe parameter', () => {
      const qr1Url = `http://www.dfe.ms.gov.br/nfce/qrcode?chNFe=${validKey}&nVersao=100&tpAmb=1`;
      const result = QrPayload.parse(qr1Url);

      expect(result).not.toBeNull();
      expect(result?.accessKey.raw).toBe(validKey);
      expect(result?.qrVersion).toBe('100');
    });

    it('returns null for unrelated URLs or plain text without a valid 44-digit key', () => {
      expect(QrPayload.parse('https://google.com')).toBeNull();
      expect(QrPayload.parse('wifi:S:MyNetwork;P:MyPassword;;')).toBeNull();
    });
  });

  describe('SsrGuard (SSRF Prevention)', () => {
    it('allows valid SEFAZ domains', () => {
      expect(SsrGuard.isAllowedSefazUrl('https://www.dfe.ms.gov.br/nfce/qrcode?p=123')).toBe(true);
      expect(SsrGuard.isAllowedSefazUrl('http://nfe.fazenda.sp.gov.br/consulta')).toBe(true);
      expect(SsrGuard.isAllowedSefazUrl('https://www.sefaz.rs.gov.br/NFCE/NFCE-COM.aspx')).toBe(true);
    });

    it('blocks loopback, metadata services, private networks, and third-party hosts', () => {
      expect(SsrGuard.isAllowedSefazUrl('http://127.0.0.1:8080/admin')).toBe(false);
      expect(SsrGuard.isAllowedSefazUrl('http://localhost:3000')).toBe(false);
      expect(SsrGuard.isAllowedSefazUrl('http://169.254.169.254/latest/meta-data/')).toBe(false);
      expect(SsrGuard.isAllowedSefazUrl('http://192.168.1.1/router')).toBe(false);
      expect(SsrGuard.isAllowedSefazUrl('http://10.0.0.1/internal')).toBe(false);
      expect(SsrGuard.isAllowedSefazUrl('https://evil-hacker.com/steal-data')).toBe(false);
      expect(SsrGuard.isAllowedSefazUrl('ftp://www.dfe.ms.gov.br/file')).toBe(false);
    });
  });

  describe('Receipt Item Classification', () => {
    it('classifies common receipt items by keyword', () => {
      expect(suggestCategoryFromKeywords('Gasolina Comum')).toBe('transporte');
      expect(suggestCategoryFromKeywords('Marmitex Executivo')).toBe('alimentacao');
      expect(suggestCategoryFromKeywords('Dipirona 500mg Cartela')).toBe('saude');
      expect(suggestCategoryFromKeywords('Papel A4 Chamex Caixa')).toBe('operacao');
      expect(suggestCategoryFromKeywords('Embalagem Papelão 20x20')).toBe('mercadoria-insumos');
    });
  });
});
