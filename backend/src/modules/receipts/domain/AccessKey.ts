import { ValidationError } from '../../../shared/index.js';

export const UF_CODES: Record<string, string> = {
  '11': 'RO', '12': 'AC', '13': 'AM', '14': 'RR', '15': 'PA', '16': 'AP', '17': 'TO',
  '21': 'MA', '22': 'PI', '23': 'CE', '24': 'RN', '25': 'PB', '26': 'PE', '27': 'AL',
  '28': 'SE', '29': 'BA', '31': 'MG', '32': 'ES', '33': 'RJ', '35': 'SP', '41': 'PR',
  '42': 'SC', '43': 'RS', '50': 'MS', '51': 'MT', '52': 'GO', '53': 'DF',
};

export class AccessKey {
  readonly raw: string;
  readonly cUF: string;
  readonly aamm: string;
  readonly cnpj: string;
  readonly modelo: string;
  readonly serie: string;
  readonly numero: string;
  readonly tpEmis: string;
  readonly cNF: string;
  readonly cDV: string;

  private constructor(key: string) {
    this.raw = key;
    this.cUF = key.slice(0, 2);
    this.aamm = key.slice(2, 6);
    this.cnpj = key.slice(6, 20);
    this.modelo = key.slice(20, 22);
    this.serie = key.slice(22, 25);
    this.numero = key.slice(25, 34);
    this.tpEmis = key.slice(34, 35);
    this.cNF = key.slice(35, 43);
    this.cDV = key.slice(43, 44);
  }

  static calculateDv(first43Digits: string): number {
    if (first43Digits.length !== 43) {
      throw new ValidationError('A chave deve conter 43 dígitos para cálculo do DV');
    }

    let sum = 0;
    let weight = 2;

    for (let i = 42; i >= 0; i--) {
      const digit = Number(first43Digits[i]);
      if (isNaN(digit)) {
        throw new ValidationError('A chave deve conter apenas dígitos numéricos');
      }
      sum += digit * weight;
      weight = weight === 9 ? 2 : weight + 1;
    }

    const remainder = sum % 11;
    const dv = 11 - remainder;
    return dv >= 10 ? 0 : dv;
  }

  static isValid(key: string): boolean {
    const clean = key.replace(/\D/g, '');
    if (clean.length !== 44) return false;
    const expectedDv = AccessKey.calculateDv(clean.slice(0, 43));
    return expectedDv === Number(clean[43]);
  }

  static fromString(key: string): AccessKey {
    const clean = key.replace(/\D/g, '');
    if (clean.length !== 44) {
      throw new ValidationError(`Chave de acesso deve conter 44 dígitos (recebido: ${clean.length})`);
    }

    const expectedDv = AccessKey.calculateDv(clean.slice(0, 43));
    const actualDv = Number(clean[43]);
    if (expectedDv !== actualDv) {
      throw new ValidationError(
        `Dígito verificador da chave de acesso inválido (esperado: ${expectedDv}, recebido: ${actualDv})`
      );
    }

    return new AccessKey(clean);
  }

  get uf(): string {
    return UF_CODES[this.cUF] || 'BR';
  }

  get isNfce(): boolean {
    return this.modelo === '65';
  }

  get isNfe(): boolean {
    return this.modelo === '55';
  }

  get isSat(): boolean {
    return this.modelo === '59';
  }

  get formattedCnpj(): string {
    return this.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  }

  get yearMonthIso(): string {
    const yy = this.aamm.slice(0, 2);
    const mm = this.aamm.slice(2, 4);
    return `20${yy}-${mm}`;
  }

  format(): string {
    return this.raw.replace(/(\d{4})/g, '$1 ').trim();
  }
}
