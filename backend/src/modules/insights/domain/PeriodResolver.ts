export interface ResolvedPeriod {
  readonly startDate: string; // YYYY-MM-DD
  readonly endDate: string;   // YYYY-MM-DD
  readonly label: string;
}

export class PeriodResolver {
  static resolve(expression: string, referenceDate: Date = new Date()): ResolvedPeriod {
    const normalized = expression.toLowerCase().trim();
    const year = referenceDate.getFullYear();
    const month = referenceDate.getMonth(); // 0-indexed

    // Format YYYY-MM-DD
    const toIso = (d: Date) => d.toISOString().slice(0, 10);

    if (normalized.includes('hoje')) {
      const todayIso = toIso(referenceDate);
      return { startDate: todayIso, endDate: todayIso, label: 'Hoje' };
    }

    if (normalized.includes('ontem')) {
      const yest = new Date(referenceDate);
      yest.setDate(yest.getDate() - 1);
      const yestIso = toIso(yest);
      return { startDate: yestIso, endDate: yestIso, label: 'Ontem' };
    }

    if (normalized.includes('esta semana') || normalized.includes('essa semana')) {
      const start = new Date(referenceDate);
      start.setDate(start.getDate() - start.getDay()); // Sunday
      return { startDate: toIso(start), endDate: toIso(referenceDate), label: 'Esta semana' };
    }

    if (normalized.includes('mês passado') || normalized.includes('mes passado')) {
      const prevMonthStart = new Date(year, month - 1, 1);
      const prevMonthEnd = new Date(year, month, 0); // last day of prev month
      return {
        startDate: toIso(prevMonthStart),
        endDate: toIso(prevMonthEnd),
        label: 'Mês passado',
      };
    }

    if (normalized.includes('este ano') || normalized.includes('esse ano')) {
      return {
        startDate: `${year}-01-01`,
        endDate: toIso(referenceDate),
        label: `Ano de ${year}`,
      };
    }

    if (normalized.includes('3 meses') || normalized.includes('três meses')) {
      const start = new Date(year, month - 2, 1);
      return {
        startDate: toIso(start),
        endDate: toIso(referenceDate),
        label: 'Últimos 3 meses',
      };
    }

    // Default: este mês (current month from day 1 to today/end)
    const currentMonthStart = new Date(year, month, 1);
    const currentMonthEnd = new Date(year, month + 1, 0);
    return {
      startDate: toIso(currentMonthStart),
      endDate: toIso(currentMonthEnd),
      label: 'Este mês',
    };
  }
}
