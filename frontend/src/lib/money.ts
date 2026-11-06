/**
 * Utilitários unificados de dinheiro e formatação financeira BRL para o MEIster.
 * Regra: NUNCA usar parseFloat/Number solto ou somar floats diretamente.
 *
 * Duas entradas diferentes:
 * - parseDecimal: valores vindos da API ("1234.56", 1234.56) — ponto é sempre decimal.
 * - parseBRL: o que a pessoa digita ("1.500", "1.234,56", "R$ 50") — ponto pode ser milhar.
 */

const brlFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const API_DECIMAL = /^-?\d+(\.\d+)?$/;
const THOUSANDS_GROUPED = /^[1-9]\d{0,2}(\.\d{3})+$/;

/**
 * Normaliza o texto digitado para um decimal canônico ("-1234.56"), ou null se for inválido
 * ou ambíguo. Regras:
 * - Com vírgula: ponto é milhar (em grupos de 3) e a vírgula, única, é o decimal.
 * - Sem vírgula: "1.500" e "1.234.567" são milhar; "1.5", "1.50" e "1234.56" são decimal.
 * - Sinal negativo só no início (ou entre parênteses); letras e símbolos tornam inválido.
 */
function normalizeBRL(input: string): string | null {
  let s = input.replace(/\s| /g, '').replace(/^R\$/i, '');
  let negative = false;
  if (s.startsWith('(') && s.endsWith(')')) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith('-')) {
    negative = !negative;
    s = s.slice(1).replace(/^R\$/i, '');
  }
  if (!s || !/^\d[\d.,]*$/.test(s)) return null;

  let intPart: string;
  let fracPart = '';
  const commas = s.split(',').length - 1;

  if (commas > 1) return null;
  if (commas === 1) {
    const [rawInt, rawFrac] = s.split(',') as [string, string];
    if (!/^\d*$/.test(rawFrac) || rawFrac.length === 0) return null;
    if (rawInt.includes('.') && !THOUSANDS_GROUPED.test(rawInt)) return null;
    intPart = rawInt.replace(/\./g, '');
    fracPart = rawFrac;
  } else {
    const dots = s.split('.').length - 1;
    if (dots === 0) {
      intPart = s;
    } else if (THOUSANDS_GROUPED.test(s)) {
      intPart = s.replace(/\./g, '');
    } else if (dots === 1) {
      const [rawInt, rawFrac] = s.split('.') as [string, string];
      if (!rawFrac) return null;
      intPart = rawInt;
      fracPart = rawFrac;
    } else {
      return null;
    }
  }

  if (!intPart) intPart = '0';
  const canonical = fracPart ? `${intPart}.${fracPart}` : intPart;
  return negative ? `-${canonical}` : canonical;
}

/**
 * Converte o texto digitado pela pessoa (ou um número) em reais.
 * Vazio vira 0; texto inválido ou ambíguo vira NaN — quem chama deve validar com `> 0`.
 */
export function parseBRL(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  if (!value.trim()) return 0;
  const normalized = normalizeBRL(value);
  return normalized === null ? NaN : Number(normalized);
}

/** Converte um valor decimal vindo da API ("1234.56" ou número) em number. Inválido vira 0. */
export function parseDecimal(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const num = typeof value === 'number' ? value : API_DECIMAL.test(value.trim()) ? Number(value) : NaN;
  return Number.isFinite(num) ? num : 0;
}

/**
 * Formata em Real Brasileiro (ex: "R$ 1.234,56"). Strings no formato da API ("1234.56")
 * são lidas como decimal; o resto passa pelas regras de digitação do parseBRL.
 */
export function formatBRL(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return brlFormatter.format(0);
  const num =
    typeof value === 'number'
      ? value
      : API_DECIMAL.test(value.trim())
        ? Number(value)
        : parseBRL(value);
  return brlFormatter.format(Number.isFinite(num) ? num : 0);
}

/**
 * Converte para centavos inteiros (bigint) arredondando meio centavo para cima,
 * sem passar por multiplicação de float (1,005 → 101).
 */
export function toCents(value: string | number | null | undefined): bigint {
  if (value === null || value === undefined) return 0n;
  let canonical: string | null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return 0n;
    canonical = value.toFixed(10);
  } else {
    canonical = API_DECIMAL.test(value.trim()) ? value.trim() : normalizeBRL(value);
  }
  if (!canonical) return 0n;

  const negative = canonical.startsWith('-');
  const [intPart, fracPart = ''] = canonical.replace('-', '').split('.') as [string, string?];
  const padded = (fracPart + '000').slice(0, 3);
  let cents = BigInt(intPart || '0') * 100n + BigInt(padded.slice(0, 2));
  if (Number(padded[2]) >= 5) cents += 1n;
  return negative ? -cents : cents;
}

/**
 * Converte centavos inteiros de volta para number (reais).
 */
export function fromCents(cents: bigint | number): number {
  return Number(cents) / 100;
}
