import { LocalDate, SystemClock, type Clock } from '../../../shared/index.js';

export class PtBrDateResolver {
  private readonly clock: Clock;

  constructor(clock: Clock = new SystemClock()) {
    this.clock = clock;
  }

  resolve(expression: string | null | undefined): LocalDate | null {
    if (!expression) return null;
    const clean = expression.toLowerCase().trim();

    const today = this.clock.today();

    if (clean === 'hoje') {
      return today;
    }
    if (clean === 'ontem') {
      return today.addDays(-1);
    }
    if (clean === 'anteontem') {
      return today.addDays(-2);
    }
    if (clean === 'amanhã' || clean === 'amanha') {
      return today.addDays(1);
    }
    if (clean === 'semana passada') {
      return today.addDays(-7);
    }

    // Explicit date: DD/MM/YYYY or DD/MM
    const ddmmyyyyMatch = clean.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
    if (ddmmyyyyMatch && ddmmyyyyMatch[1] && ddmmyyyyMatch[2]) {
      const day = parseInt(ddmmyyyyMatch[1], 10);
      const month = parseInt(ddmmyyyyMatch[2], 10);
      let year = ddmmyyyyMatch[3] ? parseInt(ddmmyyyyMatch[3], 10) : today.year;
      if (year < 100) year += 2000;
      try {
        return LocalDate.fromParts(year, month, day);
      } catch {
        return null;
      }
    }

    // Explicit ISO date: YYYY-MM-DD
    const isoMatch = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) {
      try {
        return LocalDate.fromIsoDate(clean);
      } catch {
        return null;
      }
    }

    // "dia X" or "dia 15"
    const diaMatch = clean.match(/\bdia\s+(\d{1,2})\b/);
    if (diaMatch && diaMatch[1]) {
      const targetDay = parseInt(diaMatch[1], 10);
      if (targetDay >= 1 && targetDay <= 31) {
        let month = today.month;
        let year = today.year;
        if (targetDay > today.day) {
          month -= 1;
          if (month < 1) {
            month = 12;
            year -= 1;
          }
        }
        try {
          return LocalDate.fromParts(year, month, targetDay);
        } catch {
          return null;
        }
      }
    }

    // Days of week (most recent past occurrence)
    const weekdayMap: Record<string, number> = {
      domingo: 0,
      segunda: 1,
      'segunda-feira': 1,
      terca: 2,
      terça: 2,
      'terça-feira': 2,
      'terca-feira': 2,
      quarta: 3,
      'quarta-feira': 3,
      quinta: 4,
      'quinta-feira': 4,
      sexta: 5,
      'sexta-feira': 5,
      sabado: 6,
      sábado: 6,
    };

    for (const [key, targetDow] of Object.entries(weekdayMap)) {
      if (clean.includes(key)) {
        const currentDow = today.dayOfWeek();
        let diff = currentDow - targetDow;
        if (diff <= 0) diff += 7; // strictly previous occurrence
        return today.addDays(-diff);
      }
    }

    return null;
  }
}
