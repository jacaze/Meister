import { CURATED_LESSONS, type Lesson } from './Lesson.js';
import { Money } from '../../../shared/index.js';

export interface FiscalPlaceholders {
  readonly limite_mei: string;
  readonly limite_atencao: string;
  readonly limite_tolerancia: string;
  readonly valor_das_comercio: string;
  readonly valor_das_servicos: string;
}

export class LessonRegistry {
  private static readonly lessons = new Map<string, Lesson>();

  static {
    for (const l of CURATED_LESSONS) {
      this.validateLessonContract(l);
      this.lessons.set(l.slug, l);
    }
  }

  private static validateLessonContract(lesson: Lesson): void {
    if (!lesson.slug || typeof lesson.slug !== 'string') {
      throw new Error(`Lição inválida: slug ausente`);
    }
    if (!lesson.title) {
      throw new Error(`Lição [${lesson.slug}] inválida: título ausente`);
    }
    if (lesson.version < 1) {
      throw new Error(`Lição [${lesson.slug}] inválida: versão deve ser >= 1`);
    }
    if (lesson.status === 'revisada') {
      if (!lesson.reviewedBy || !lesson.reviewedAt) {
        throw new Error(`Lição revisada [${lesson.slug}] exige reviewedBy e reviewedAt`);
      }
    }
    if (!lesson.quiz || lesson.quiz.length === 0) {
      throw new Error(`Lição [${lesson.slug}] exige ao menos uma questão de quiz`);
    }
    for (const q of lesson.quiz) {
      if (!q.question || q.options.length < 2) {
        throw new Error(`Questão inválida na lição [${lesson.slug}]`);
      }
      if (q.correct < 0 || q.correct >= q.options.length) {
        throw new Error(`Índice de resposta correta (${q.correct}) fora dos limites na lição [${lesson.slug}]`);
      }
      if (!q.explanation) {
        throw new Error(`Explicação ausente na questão [${q.id}] da lição [${lesson.slug}]`);
      }
    }
  }

  static formatBrl(cents: number): string {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    })
      .format(cents / 100)
      .replace(/\u00a0/g, ' ');
  }

  static getFiscalPlaceholders(_year = new Date().getFullYear()): FiscalPlaceholders {
    return {
      limite_mei: this.formatBrl(8100000),
      limite_atencao: this.formatBrl(6480000),
      limite_tolerancia: this.formatBrl(9720000),
      valor_das_comercio: 'R$ 76,60',
      valor_das_servicos: 'R$ 80,60',
    };
  }

  static renderPlaceholders(text: string, placeholders: FiscalPlaceholders): string {
    return text
      .replaceAll('{{limite_mei}}', placeholders.limite_mei)
      .replaceAll('{{limite_atencao}}', placeholders.limite_atencao)
      .replaceAll('{{limite_tolerancia}}', placeholders.limite_tolerancia)
      .replaceAll('{{valor_das_comercio}}', placeholders.valor_das_comercio)
      .replaceAll('{{valor_das_servicos}}', placeholders.valor_das_servicos);
  }

  static listAll(year = new Date().getFullYear()): readonly Lesson[] {
    const placeholders = this.getFiscalPlaceholders(year);
    return Array.from(this.lessons.values())
      .filter((l) => l.status === 'revisada')
      .map((l) => ({
        ...l,
        summary: this.renderPlaceholders(l.summary, placeholders),
        content: this.renderPlaceholders(l.content, placeholders),
      }));
  }

  static getBySlug(slug: string, year = new Date().getFullYear()): Lesson | null {
    const raw = this.lessons.get(slug);
    if (!raw || raw.status !== 'revisada') return null;

    const placeholders = this.getFiscalPlaceholders(year);
    return {
      ...raw,
      summary: this.renderPlaceholders(raw.summary, placeholders),
      content: this.renderPlaceholders(raw.content, placeholders),
    };
  }

  static findByTrigger(trigger: string): Lesson | null {
    for (const l of this.lessons.values()) {
      if (l.status === 'revisada' && l.triggers.includes(trigger)) {
        return l;
      }
    }
    return null;
  }
}
