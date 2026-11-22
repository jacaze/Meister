/**
 * Período dos lançamentos: mês de calendário no fuso America/Sao_Paulo.
 * Tudo em strings YYYY-MM-DD (sem Date para somar dias), então não há deslocamento de fuso.
 */
export interface DateRange {
  readonly start: string;
  readonly end: string;
}

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

/** Mês (YYYY-MM) de um instante, no fuso de São Paulo. */
export function saoPauloMonth(now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }).slice(0, 7);
}

function daysIn(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Primeiro e último dia de um mês YYYY-MM. */
export function monthRange(month: string): DateRange {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return { start: `${month}-01`, end: `${month}-${String(daysIn(y, m)).padStart(2, '0')}` };
}

/** Mês atual (São Paulo) como intervalo — padrão da tela de lançamentos. */
export function currentMonthRange(now: Date = new Date()): DateRange {
  return monthRange(saoPauloMonth(now));
}

/** Soma `delta` meses a um YYYY-MM. */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const idx = y * 12 + (m - 1) + delta;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, '0')}`;
}

/** Se o intervalo cobre exatamente um mês inteiro, devolve YYYY-MM; senão null. */
export function rangeAsMonth(start: string, end: string): string | null {
  if (!/^\d{4}-\d{2}-01$/.test(start)) return null;
  const month = start.slice(0, 7);
  return monthRange(month).end === end ? month : null;
}

function brDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** Rótulo do período: "Novembro de 2026", "01/08/2026 a 30/11/2026", "Todo o período". */
export function periodLabel(start: string, end: string): string {
  if (!start && !end) return 'Todo o período';
  const month = rangeAsMonth(start, end);
  if (month) {
    const [y, m] = month.split('-').map(Number) as [number, number];
    return `${MONTHS[m - 1]} de ${y}`;
  }
  if (start && end) return `${brDate(start)} a ${brDate(end)}`;
  if (start) return `A partir de ${brDate(start)}`;
  return `Até ${brDate(end)}`;
}
