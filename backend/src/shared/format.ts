/**
 * Formatação pt-BR para textos exibidos ao usuário (insights, assistente, Telegram).
 * Dinheiro parte sempre de centavos inteiros (bigint) ou de string decimal exata: nunca de float.
 */

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** `R$ 1.234,56`; negativos saem como `-R$ 1.234,56`. */
export function formatBRL(signedCents: bigint): string {
  const negative = signedCents < 0n;
  const abs = negative ? -signedCents : signedCents;
  const intPart = groupThousands((abs / 100n).toString());
  const frac = (abs % 100n).toString().padStart(2, '0');
  return `${negative ? '-' : ''}R$ ${intPart},${frac}`;
}

const DECIMAL_REGEX = /^(-)?(\d+)(?:\.(\d{1,2}))?\d*$/;

/**
 * Formata um valor decimal vindo da API (string "3500.00" ou number) sem aritmética de ponto flutuante.
 * Entrada inválida vira `R$ 0,00`.
 */
export function formatBRLFromDecimal(raw: string | number): string {
  const text = typeof raw === 'number' ? (Number.isFinite(raw) ? raw.toFixed(2) : '') : raw.trim();
  const match = DECIMAL_REGEX.exec(text);
  if (!match) return formatBRL(0n);
  const cents = BigInt(match[2]!) * 100n + BigInt((match[3] ?? '').padEnd(2, '0'));
  return formatBRL(match[1] ? -cents : cents);
}

/** `75,0%` (vírgula decimal). */
export function formatPercent(value: number, fractionDigits = 1): string {
  if (!Number.isFinite(value)) return '0%';
  return `${value.toFixed(fractionDigits).replace('.', ',')}%`;
}

/** `2026-12-21` (ou ISO com hora) -> `21/12/2026`. Entrada fora do padrão é devolvida como veio. */
export function formatDateBR(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return iso;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

/** Competência `2026-11` -> `11/2026`. */
export function formatCompetence(competence: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(competence);
  if (!match) return competence;
  return `${match[2]}/${match[1]}`;
}
