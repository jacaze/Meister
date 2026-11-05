/**
 * Utilitários unificados de dinheiro e formatação financeira BRL para o MEIster.
 * Regra: NUNCA usar parseFloat/Number solto ou somar floats diretamente.
 */

const brlFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

/**
 * Converte qualquer entrada financeira (número, string BRL "1.234,56", "R$ 50,00", decimal "1234.56")
 * de forma defensiva para number em reais.
 */
export function parseBRL(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') {
    return isNaN(value) ? 0 : value;
  }

  const clean = value.trim();
  if (!clean) return 0;

  // Detecta sinal negativo
  const isNegative = clean.includes('-') || clean.includes('(');

  // Remove caracteres que não sejam dígitos, pontos ou vírgulas
  const stripped = clean.replace(/[^\d.,]/g, '');
  if (!stripped) return 0;

  let normalized: string;
  if (stripped.includes(',')) {
    // Padrão brasileiro: "1.234,56" -> remove pontos de milhar e troca vírgula por ponto
    normalized = stripped.replace(/\./g, '').replace(',', '.');
  } else {
    // Padrão sem vírgula (ex: "1234.56" ou "1234")
    normalized = stripped;
  }

  const parsed = parseFloat(normalized);
  if (isNaN(parsed)) return 0;

  return isNegative ? -Math.abs(parsed) : Math.abs(parsed);
}

/**
 * Formata um valor numérico ou string em Real Brasileiro (ex: "R$ 1.234,56").
 */
export function formatBRL(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return 'R$ 0,00';
  const num = typeof value === 'number' ? value : parseBRL(value);
  return brlFormatter.format(isNaN(num) ? 0 : num);
}

/**
 * Converte valor para centavos inteiros (bigint), garantindo precisão em somas contábeis.
 */
export function toCents(value: string | number | null | undefined): bigint {
  const num = parseBRL(value);
  return BigInt(Math.round(num * 100));
}

/**
 * Converte centavos inteiros de volta para number (reais).
 */
export function fromCents(cents: bigint | number): number {
  return Number(cents) / 100;
}
