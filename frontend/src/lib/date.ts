/**
 * Datas de calendário no fuso de quem usa o app. `toISOString()` é UTC: no Brasil, depois das
 * 21h ele já devolve o dia seguinte — nunca use para "hoje" de formulário.
 */
export function toLocalIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Hoje no formato YYYY-MM-DD, no fuso local. */
export function todayLocalIso(): string {
  return toLocalIsoDate(new Date());
}
