import type { Finding } from './Finding.js';

export class PolicyGuard {
  private static readonly FORBIDDEN_PATTERNS = [
    /\bvoc[êe]\s+deveria\b/i,
    /\brecomendo\b/i,
    /\bo\s+melhor\s+[ée]\b/i,
    /\binvista\b/i,
    /\baplique\b/i,
    /\bcriptomoeda\b/i,
    /\bcripto\b/i,
    /\ba[çc][õo]es\b/i,
    /\bdeixe\s+de\s+pagar\b/i,
    /\birrespons[áa]vel\b/i,
    /\bconselho\s+financeiro\b/i,
  ];

  static validate(text: string): { valid: boolean; reason?: string } {
    for (const pattern of this.FORBIDDEN_PATTERNS) {
      if (pattern.test(text)) {
        return { valid: false, reason: `Contém expressão não permitida pela política de integridade: "${pattern.source}"` };
      }
    }
    return { valid: true };
  }
}

export class LengthGuard {
  static validate(text: string, maxLength: number = 400): { valid: boolean; reason?: string } {
    if (text.length > maxLength) {
      return { valid: false, reason: `Texto excede o limite máximo de ${maxLength} caracteres (${text.length})` };
    }
    return { valid: true };
  }
}

export class NumberGuard {
  static validate(text: string, finding: Finding): { valid: boolean; reason?: string } {
    // If confidence is estimativa, require the word 'estimativa' or 'previsão'
    if (finding.confidence === 'estimativa') {
      if (!/estimativa|previs[ãa]o/i.test(text)) {
        return { valid: false, reason: 'Achado com confiança de estimativa requer o termo "estimativa" ou "previsão"' };
      }
    }
    return { valid: true };
  }
}
