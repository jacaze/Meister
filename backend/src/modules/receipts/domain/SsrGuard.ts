import { URL } from 'node:url';

export const SEFAZ_ALLOWED_HOST_SUFFIXES = [
  '.ms.gov.br',
  '.dfe.ms.gov.br',
  '.fazenda.ms.gov.br',
  '.sefaz.ms.gov.br',
  '.fazenda.gov.br',
  '.receita.fazenda.gov.br',
  '.sefaz.sp.gov.br',
  '.fazenda.sp.gov.br',
  '.fazenda.rj.gov.br',
  '.fazenda.mg.gov.br',
  '.fazenda.pr.gov.br',
  '.sefaz.rs.gov.br',
  '.sefaz.sc.gov.br',
  '.sefaz.ba.gov.br',
  '.sefaz.ce.gov.br',
  '.sefaz.pe.gov.br',
  '.sefaz.go.gov.br',
  '.sefaz.mt.gov.br',
  '.nfe.fazenda.gov.br',
];

export class SsrGuard {
  static isAllowedSefazUrl(rawUrl: string): boolean {
    try {
      const parsed = new URL(rawUrl);

      // 1. Only http and https
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return false;
      }

      const hostname = parsed.hostname.toLowerCase();

      // 2. Reject private IPs and localhost
      if (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '0.0.0.0' ||
        hostname === '::1' ||
        hostname.startsWith('10.') ||
        hostname.startsWith('192.168.') ||
        hostname.startsWith('169.254.') ||
        /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname)
      ) {
        return false;
      }

      // 3. Must match allowlist
      const isAllowed = SEFAZ_ALLOWED_HOST_SUFFIXES.some(
        (suffix) => hostname.endsWith(suffix) || hostname === suffix.slice(1)
      );

      return isAllowed;
    } catch {
      return false;
    }
  }
}
