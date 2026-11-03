import { ValidationError } from './errors.js';

export const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

const ISO_DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;
const YEAR_MONTH_REGEX = /^(\d{4})-(\d{2})$/;

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export class YearMonth {
  public readonly year: number;
  public readonly month: number; // 1..12

  public constructor(year: number, month: number) {
    if (!Number.isInteger(year) || year < 1970 || year > 2200) {
      throw new ValidationError('Ano inválido');
    }
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      throw new ValidationError('Mês inválido');
    }
    this.year = year;
    this.month = month;
  }

  public static fromString(raw: string): YearMonth {
    if (typeof raw !== 'string') {
      throw new ValidationError('Período inválido');
    }
    const match = YEAR_MONTH_REGEX.exec(raw.trim());
    if (!match) {
      throw new ValidationError('Período inválido. Use YYYY-MM');
    }
    return new YearMonth(Number(match[1]), Number(match[2]));
  }

  public toString(): string {
    return `${String(this.year).padStart(4, '0')}-${String(this.month).padStart(2, '0')}`;
  }

  public equals(other: YearMonth): boolean {
    return this.year === other.year && this.month === other.month;
  }

  public addMonths(delta: number): YearMonth {
    const totalMonths = this.year * 12 + (this.month - 1) + delta;
    const newYear = Math.floor(totalMonths / 12);
    const newMonth = (totalMonths % 12) + 1;
    return new YearMonth(newYear, newMonth);
  }

  public startOfMonth(): LocalDate {
    return new LocalDate(this.year, this.month, 1);
  }

  public endOfMonth(): LocalDate {
    return new LocalDate(this.year, this.month, daysInMonth(this.year, this.month));
  }
}

export class LocalDate {
  public readonly year: number;
  public readonly month: number; // 1..12
  public readonly day: number; // 1..31

  public constructor(year: number, month: number, day: number) {
    if (!Number.isInteger(year) || year < 1970 || year > 2200) {
      throw new ValidationError('Data inválida');
    }
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      throw new ValidationError('Data inválida');
    }
    const maxDay = daysInMonth(year, month);
    if (!Number.isInteger(day) || day < 1 || day > maxDay) {
      throw new ValidationError('Data inválida');
    }
    this.year = year;
    this.month = month;
    this.day = day;
  }

  public static fromIsoDate(iso: string, label = 'Data'): LocalDate {
    if (typeof iso !== 'string') {
      throw new ValidationError(`${label} inválida`);
    }
    const match = ISO_DATE_REGEX.exec(iso.trim());
    if (!match) {
      throw new ValidationError(`${label} inválida`);
    }
    try {
      return new LocalDate(Number(match[1]), Number(match[2]), Number(match[3]));
    } catch {
      throw new ValidationError(`${label} inválida`);
    }
  }

  public static fromInstant(instant: Date, timeZone = DEFAULT_TIMEZONE, label = 'Data'): LocalDate {
    if (!(instant instanceof Date) || Number.isNaN(instant.getTime())) {
      throw new ValidationError(`${label} inválida`);
    }
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const parts = formatter.formatToParts(instant);
    const year = Number(parts.find((p) => p.type === 'year')?.value);
    const month = Number(parts.find((p) => p.type === 'month')?.value);
    const day = Number(parts.find((p) => p.type === 'day')?.value);
    return new LocalDate(year, month, day);
  }

  /**
   * Parses either a pure YYYY-MM-DD date string or an ISO instant/Date object.
   * Pure YYYY-MM-DD strings are kept as-is; timestamps with time/offset are converted to `timeZone`!
   * Note: Midnight UTC Date objects coming from Prisma `@db.Date` columns are extracted via UTC components.
   */
  public static fromInput(
    value: unknown,
    options?: { label?: string; timeZone?: string; isPrismaDateColumn?: boolean }
  ): LocalDate {
    const label = options?.label ?? 'Data';
    const timeZone = options?.timeZone ?? DEFAULT_TIMEZONE;

    if (value instanceof LocalDate) {
      return value;
    }

    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) {
        throw new ValidationError(`${label} inválida`);
      }
      if (options?.isPrismaDateColumn) {
        return new LocalDate(
          value.getUTCFullYear(),
          value.getUTCMonth() + 1,
          value.getUTCDate()
        );
      }
      return LocalDate.fromInstant(value, timeZone, label);
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) {
        throw new ValidationError(`${label} inválida`);
      }
      if (ISO_DATE_REGEX.test(trimmed)) {
        return LocalDate.fromIsoDate(trimmed, label);
      }
      const parsed = new Date(trimmed);
      if (Number.isNaN(parsed.getTime())) {
        throw new ValidationError(`${label} inválida`);
      }
      return LocalDate.fromInstant(parsed, timeZone, label);
    }

    throw new ValidationError(`${label} inválida`);
  }

  public toIsoDate(): string {
    return `${String(this.year).padStart(4, '0')}-${String(this.month).padStart(2, '0')}-${String(this.day).padStart(2, '0')}`;
  }

  /**
   * Converts to a UTC midnight Date suitable for Prisma `@db.Date` columns and queries.
   */
  public toUtcDate(): Date {
    return new Date(Date.UTC(this.year, this.month - 1, this.day));
  }

  /**
   * Converts to end of day in UTC (23:59:59.999) for inclusive upper-bound Date queries.
   */
  public toUtcEndOfDay(): Date {
    return new Date(Date.UTC(this.year, this.month - 1, this.day, 23, 59, 59, 999));
  }

  public yearMonth(): YearMonth {
    return new YearMonth(this.year, this.month);
  }

  public addDays(days: number): LocalDate {
    const utc = new Date(Date.UTC(this.year, this.month - 1, this.day + days));
    return new LocalDate(utc.getUTCFullYear(), utc.getUTCMonth() + 1, utc.getUTCDate());
  }

  public compare(other: LocalDate): -1 | 0 | 1 {
    if (this.year !== other.year) return this.year < other.year ? -1 : 1;
    if (this.month !== other.month) return this.month < other.month ? -1 : 1;
    if (this.day !== other.day) return this.day < other.day ? -1 : 1;
    return 0;
  }

  public equals(other: LocalDate): boolean {
    return this.compare(other) === 0;
  }

  public isBefore(other: LocalDate): boolean {
    return this.compare(other) < 0;
  }

  public isAfter(other: LocalDate): boolean {
    return this.compare(other) > 0;
  }

  public dayOfWeek(): number {
    return new Date(Date.UTC(this.year, this.month - 1, this.day)).getUTCDay();
  }

  public isWeekend(): boolean {
    const dow = this.dayOfWeek();
    return dow === 0 || dow === 6;
  }
}

export interface Clock {
  now(): Date;
  today(timeZone?: string): LocalDate;
  currentYearMonth(timeZone?: string): YearMonth;
}

export class SystemClock implements Clock {
  public now(): Date {
    return new Date();
  }

  public today(timeZone = DEFAULT_TIMEZONE): LocalDate {
    return LocalDate.fromInstant(this.now(), timeZone);
  }

  public currentYearMonth(timeZone = DEFAULT_TIMEZONE): YearMonth {
    return this.today(timeZone).yearMonth();
  }
}

export class FakeClock implements Clock {
  private currentInstant: Date;

  public constructor(initialInstant: Date | string = '2026-11-03T12:00:00.000Z') {
    this.currentInstant =
      typeof initialInstant === 'string' ? new Date(initialInstant) : new Date(initialInstant.getTime());
  }

  public now(): Date {
    return new Date(this.currentInstant.getTime());
  }

  public today(timeZone = DEFAULT_TIMEZONE): LocalDate {
    return LocalDate.fromInstant(this.currentInstant, timeZone);
  }

  public currentYearMonth(timeZone = DEFAULT_TIMEZONE): YearMonth {
    return this.today(timeZone).yearMonth();
  }

  public setNow(instant: Date | string): void {
    this.currentInstant =
      typeof instant === 'string' ? new Date(instant) : new Date(instant.getTime());
  }

  public advanceMs(ms: number): void {
    this.currentInstant = new Date(this.currentInstant.getTime() + ms);
  }

  public advanceMinutes(minutes: number): void {
    this.advanceMs(minutes * 60 * 1000);
  }
}
