import { LessonRegistry } from './LessonRegistry.js';

export interface EducationAnswer {
  readonly answer: string;
  readonly citedLessonSlug?: string;
  readonly citedLessonTitle?: string;
  readonly isDisclaimer: boolean;
}

export class EducationPolicyGuard {
  private static readonly INVESTMENT_PATTERNS = [
    /\b(a[çc][õo]es|bolsa de valores|b3|cripto|criptomoeda|bitcoin|btc|ethereum|eth|cdb|lci|lca|tesouro direto|fundo imobili[aá]rio|fii|day trade|forex|onde investir|recomenda comprar|investimento)\b/i,
  ];

  static isInvestmentQuestion(question: string): boolean {
    return this.INVESTMENT_PATTERNS.some((pattern) => pattern.test(question));
  }

  static answerQuestion(question: string): EducationAnswer {
    const trimmed = question.trim();
    if (!trimmed) {
      return {
        answer: 'Por favor, digite uma dúvida sobre a gestão ou finanças do seu MEI.',
        isDisclaimer: false,
      };
    }

    // 1. RN-44 Investment rejection
    if (this.isInvestmentQuestion(trimmed)) {
      return {
        answer:
          'O MEIster é uma plataforma de gestão e educação financeira para microempreendedores e não realiza recomendações de investimento ou indicação de produtos financeiros.',
        isDisclaimer: true,
      };
    }

    // 2. Search reviewed lesson corpus
    const STOP_WORDS = new Set([
      'qual', 'quais', 'como', 'onde', 'quando', 'quem', 'porque', 'para', 'pelo', 'pela',
      'sobre', 'esse', 'essa', 'este', 'esta', 'mais', 'muito', 'tudo', 'todos', 'toda',
      'todas', 'seus', 'suas', 'minha', 'meus', 'pode', 'fazer', 'funciona', 'deve', 'nave',
    ]);

    const KEYWORD_WHITELIST = new Set(['das', 'dasn', 'mei', 'pj', 'pf', 'inss', 'icms', 'iss', 'teto', 'potes', 'lucro', 'salario']);

    const lessons = LessonRegistry.listAll();
    const tokens = trimmed
      .toLowerCase()
      .replace(/[^\w\sáéíóúâêîôûãõç]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w));

    let bestScore = 0;
    let bestLesson = null;
    let bestExcerpt = '';

    for (const lesson of lessons) {
      const fullCorpus = `${lesson.title} ${lesson.summary} ${lesson.content}`.toLowerCase();
      let matchCount = 0;

      for (const token of tokens) {
        if (fullCorpus.includes(token)) {
          matchCount += 1;
        }
      }

      if (matchCount > bestScore) {
        bestScore = matchCount;
        bestLesson = lesson;

        // Choose paragraph with highest token density
        const paragraphs = lesson.content.split('\n\n');
        let maxParaMatches = 0;
        let chosenPara = '';

        for (const p of paragraphs) {
          const cleanP = p.replace(/^#+\s+/gm, '').trim();
          if (cleanP.length < 30) continue;

          const pLower = cleanP.toLowerCase();
          const pMatches = tokens.filter((t) => pLower.includes(t)).length;
          if (pMatches > maxParaMatches) {
            maxParaMatches = pMatches;
            chosenPara = cleanP;
          }
        }

        bestExcerpt = chosenPara;
      }
    }

    const hasSpecificTerm = tokens.some((t) => KEYWORD_WHITELIST.has(t));
    if (!bestLesson || (bestScore < 2 && !hasSpecificTerm)) {
      return {
        answer:
          'Não encontrei informações sobre este tema nas lições revisadas do MEIster. Para questões fiscais ou tributárias específicas, recomendamos consultar um contador habilitado.',
        isDisclaimer: true,
      };
    }

    const cleanExcerpt = bestExcerpt || bestLesson.summary;
    const finalAnswer = `De acordo com a lição "${bestLesson.title}":\n\n${cleanExcerpt}\n\n💡 _Fonte: Lição revisada por profissionais contábeis no MEIster._`;

    return {
      answer: finalAnswer,
      citedLessonSlug: bestLesson.slug,
      citedLessonTitle: bestLesson.title,
      isDisclaimer: false,
    };
  }
}
