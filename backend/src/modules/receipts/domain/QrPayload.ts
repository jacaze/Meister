import { AccessKey } from './AccessKey.js';

export interface QrParseResult {
  readonly accessKey: AccessKey;
  readonly qrVersion: string;
  readonly environment: 'producao' | 'homologacao';
  readonly rawUrl: string;
}

export class QrPayload {
  static parse(textOrUrl: string): QrParseResult | null {
    if (!textOrUrl || typeof textOrUrl !== 'string') {
      return null;
    }

    const trimmed = textOrUrl.trim();

    // 1. Try QR 2.0 (pipe-separated parameter ?p=chave|versao|tpAmb|...)
    const pParamMatch = trimmed.match(/[?&]p=([^&]+)/i);
    if (pParamMatch && pParamMatch[1]) {
      const pDecoded = decodeURIComponent(pParamMatch[1]);
      const parts = pDecoded.split('|');
      const candidateKey = parts[0]?.replace(/\D/g, '');

      if (candidateKey && candidateKey.length === 44 && AccessKey.isValid(candidateKey)) {
        const accessKey = AccessKey.fromString(candidateKey);
        const qrVersion = parts[1] || '2.0';
        const tpAmb = parts[2] === '2' ? 'homologacao' : 'producao';
        return {
          accessKey,
          qrVersion,
          environment: tpAmb,
          rawUrl: trimmed,
        };
      }
    }

    // 2. Try QR 1.0 (query parameter chNFe=chave)
    const chNfeMatch = trimmed.match(/[?&]chNFe=([0-9]{44})/i);
    if (chNfeMatch && chNfeMatch[1]) {
      const candidateKey = chNfeMatch[1];
      if (AccessKey.isValid(candidateKey)) {
        const accessKey = AccessKey.fromString(candidateKey);
        const nVersaoMatch = trimmed.match(/[?&]nVersao=([^&]+)/i);
        const tpAmbMatch = trimmed.match(/[?&]tpAmb=([^&]+)/i);
        const qrVersion = nVersaoMatch && nVersaoMatch[1] ? nVersaoMatch[1] : '1.0';

        return {
          accessKey,
          qrVersion,
          environment: tpAmbMatch && tpAmbMatch[1] === '2' ? 'homologacao' : 'producao',
          rawUrl: trimmed,
        };
      }
    }

    // 3. Fallback: Check if the raw text itself contains a valid 44-digit access key
    const any44Match = trimmed.match(/\b([0-9]{44})\b/);
    if (any44Match && any44Match[1] && AccessKey.isValid(any44Match[1])) {
      return {
        accessKey: AccessKey.fromString(any44Match[1]),
        qrVersion: 'raw',
        environment: 'producao',
        rawUrl: trimmed,
      };
    }

    return null;
  }
}
