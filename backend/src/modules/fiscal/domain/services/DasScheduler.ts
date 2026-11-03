import { LocalDate, YearMonth } from '../../../../shared/clock.js';

export class DasScheduler {
  /**
   * Computes the due date for competence YYYY-MM:
   * Due on the 20th of the following month. If 20th is Saturday or Sunday, moves to next Monday.
   */
  static getDueDate(competence: string): LocalDate {
    const ym = YearMonth.fromIsoString(competence);
    const nextYm = ym.addMonths(1);

    let dueDate = LocalDate.fromParts(nextYm.year, nextYm.month, 20);
    const dayOfWeek = dueDate.toUtcDate().getUTCDay(); // 0 is Sunday, 6 is Saturday

    if (dayOfWeek === 6) {
      // Saturday -> Monday (+2 days)
      dueDate = dueDate.addDays(2);
    } else if (dayOfWeek === 0) {
      // Sunday -> Monday (+1 day)
      dueDate = dueDate.addDays(1);
    }

    return dueDate;
  }
}
