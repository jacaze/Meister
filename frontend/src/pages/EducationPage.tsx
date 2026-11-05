import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import api from '../api/client.js';
import Sheet from '../components/ui/Sheet.js';
import RichText from '../components/ui/RichText.js';
import Mel from '../components/brand/Mel.js';
import { celebrate, haptic } from '../lib/celebrate.js';
import { useToast } from '../components/ui/Toast.js';
import {
  GraduationCap,
  ShieldCheck,
  Question,
  MagnifyingGlass,
  BookOpen,
  Clock,
  CheckCircle,
  XCircle,
  SealCheck,
  ArrowRight,
  CircleNotch,
  Sparkle,
  Confetti,
  Lightbulb,
} from '../components/ui/icons.js';

export interface QuizOption {
  readonly id: string;
  readonly question: string;
  readonly options: readonly string[];
}

export interface LessonProgress {
  readonly status: 'nao_iniciada' | 'iniciada' | 'concluida';
  readonly quizScore: number | null;
  readonly quizAttempts: number;
  readonly completedAt: string | null;
}

export interface LessonItem {
  readonly slug: string;
  readonly title: string;
  readonly version: number;
  readonly status: 'revisada';
  readonly reviewedBy: string;
  readonly reviewedAt: string;
  readonly estimatedMinutes: number;
  readonly triggers: readonly string[];
  readonly summary: string;
  readonly progress: LessonProgress;
  readonly quiz: readonly QuizOption[];
  readonly content?: string;
}

export interface QuestionBreakdown {
  readonly questionId: string;
  readonly question: string;
  readonly chosenIndex: number;
  readonly correctIndex: number;
  readonly isCorrect: boolean;
  readonly explanation: string;
}

export interface QuizResult {
  readonly totalQuestions: number;
  readonly correctCount: number;
  readonly score: number;
  readonly passed: boolean;
  readonly breakdown: readonly QuestionBreakdown[];
}

export const EducationPage: React.FC = () => {
  const toast = useToast();
  const [lessons, setLessons] = useState<readonly LessonItem[]>([]);
  const [stats, setStats] = useState({
    totalLessons: 0,
    completedCount: 0,
    progressPercentage: 0,
    averageQuizScore: null as number | null,
  });
  const [loading, setLoading] = useState(true);

  // Lesson Viewer Modal
  const [activeLesson, setActiveLesson] = useState<LessonItem | null>(null);
  const [loadingLesson, setLoadingLesson] = useState(false);

  // Quiz Modal
  const [isQuizOpen, setIsQuizOpen] = useState(false);
  const [quizAnswers, setQuizAnswers] = useState<number[]>([]);
  const [quizResult, setQuizResult] = useState<QuizResult | null>(null);
  const [submittingQuiz, setSubmittingQuiz] = useState(false);

  // Free-form Ask Education
  const [questionText, setQuestionText] = useState('');
  const [asking, setAsking] = useState(false);
  const [askResponse, setAskResponse] = useState<{
    readonly answer: string;
    readonly citedLessonTitle?: string;
    readonly isDisclaimer: boolean;
  } | null>(null);

  const fetchLessons = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/education/lessons');
      setLessons(res.data?.lessons || []);
      setStats({
        totalLessons: res.data?.totalLessons || 0,
        completedCount: res.data?.completedCount || 0,
        progressPercentage: res.data?.progressPercentage || 0,
        averageQuizScore: res.data?.averageQuizScore,
      });
    } catch (err) {
      console.error('Erro ao buscar lições:', err);
      toast.error('Não foi possível carregar as lições.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchLessons();
  }, [fetchLessons]);

  const handleOpenLesson = async (slug: string) => {
    try {
      setLoadingLesson(true);
      const res = await api.get(`/education/lessons/${slug}`);
      setActiveLesson(res.data?.lesson);
      setIsQuizOpen(false);
      setQuizResult(null);
    } catch (err) {
      console.error('Erro ao abrir lição:', err);
      toast.error('Erro ao carregar o conteúdo da lição.');
    } finally {
      setLoadingLesson(false);
    }
  };

  const handleStartQuiz = () => {
    if (!activeLesson) return;
    setQuizAnswers(new Array(activeLesson.quiz.length).fill(-1));
    setQuizResult(null);
    setIsQuizOpen(true);
  };

  const handleAnswerSelect = (questionIndex: number, optionIndex: number) => {
    setQuizAnswers((prev) => {
      const next = [...prev];
      next[questionIndex] = optionIndex;
      return next;
    });
  };

  const handleSubmitQuiz = async () => {
    if (!activeLesson) return;
    try {
      setSubmittingQuiz(true);
      const res = await api.post(`/education/lessons/${activeLesson.slug}/quiz`, {
        answers: quizAnswers,
      });
      const grading: QuizResult = res.data?.grading;
      setQuizResult(grading);

      if (grading.passed) {
        haptic([12, 40, 12]);
        celebrate('big');
        toast.success(`Parabéns! Você concluiu a lição com ${grading.score}% de aproveitamento.`);
      } else {
        haptic([40, 40]);
        toast.info(`Você atingiu ${grading.score}%. Revise o gabarito comentado abaixo.`);
      }

      fetchLessons();
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err && (err as { response?: { data?: { message?: string } } }).response?.data?.message
          ? (err as { response: { data: { message: string } } }).response.data.message
          : 'Erro ao avaliar quiz.';
      toast.error(msg);
    } finally {
      setSubmittingQuiz(false);
    }
  };

  const handleAskQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!questionText.trim()) return;

    try {
      setAsking(true);
      const res = await api.post('/education/ask', { question: questionText.trim() });
      setAskResponse(res.data);
    } catch (err) {
      console.error('Erro ao consultar educação:', err);
      setAskResponse({
        answer: 'Erro ao conectar ao assistente de educação. Tente novamente mais tarde.',
        isDisclaimer: true,
      });
    } finally {
      setAsking(false);
    }
  };

  // Reader Sheet Footer
  const readerFooter = activeLesson && (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 w-full">
      <span className="text-xs text-muted">
        {activeLesson.quiz.length} pergunta(s) no quiz avaliativo
      </span>
      <div className="flex items-center gap-3 w-full sm:w-auto">
        <button
          type="button"
          onClick={() => setActiveLesson(null)}
          className="flex-1 sm:flex-none min-h-[44px] px-4 py-2.5 rounded-2xl bg-card border border-ink/10 text-xs font-bold text-muted hover:text-ink transition"
        >
          Fechar
        </button>
        <button
          type="button"
          onClick={handleStartQuiz}
          className="flex-1 sm:flex-none min-h-[44px] px-6 py-2.5 rounded-2xl bg-primary text-on-primary text-xs font-extrabold hover:bg-primary-deep transition flex items-center justify-center gap-2 shadow-[var(--shadow-honey)]"
        >
          <Sparkle size={16} weight="bold" />
          <span>Fazer Quiz</span>
        </button>
      </div>
    </div>
  );

  // Quiz Sheet Footer
  const quizFooter = activeLesson && (
    <div className="flex items-center justify-between gap-3 w-full">
      {quizResult ? (
        <div className="flex items-center justify-end gap-3 w-full">
          {!quizResult.passed && (
            <button
              type="button"
              onClick={handleStartQuiz}
              className="min-h-[44px] px-4 py-2.5 rounded-2xl bg-field hover:bg-card border border-ink/10 text-xs font-bold text-ink transition"
            >
              Tentar Novamente
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setIsQuizOpen(false);
              setActiveLesson(null);
            }}
            className="min-h-[44px] px-6 py-2.5 rounded-2xl bg-primary text-on-primary text-xs font-extrabold hover:bg-primary-deep transition shadow-[var(--shadow-honey)]"
          >
            Concluir Lição
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between w-full">
          <button
            type="button"
            onClick={() => setIsQuizOpen(false)}
            className="min-h-[44px] px-4 py-2.5 rounded-2xl bg-card border border-ink/10 text-xs font-bold text-muted hover:text-ink transition"
          >
            Voltar ao Texto
          </button>
          <button
            type="button"
            onClick={handleSubmitQuiz}
            disabled={submittingQuiz || quizAnswers.some((a) => a === -1)}
            className="min-h-[44px] px-6 py-2.5 rounded-2xl bg-primary text-on-primary text-xs font-extrabold hover:bg-primary-deep active:scale-95 disabled:opacity-50 transition flex items-center gap-2 shadow-[var(--shadow-honey)]"
          >
            {submittingQuiz ? (
              <>
                <CircleNotch size={16} className="animate-spin" />
                <span>Corrigindo...</span>
              </>
            ) : (
              <>
                <span>Enviar Respostas</span>
                <CheckCircle size={16} weight="bold" />
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-ink tracking-tight">
              Educação Financeira & Micro-Lições
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-muted mt-0.5">
            Capacitação contábil, tributária e gerencial em micro-doses práticas para o seu MEI.
          </p>
        </div>
      </div>

      {/* Alerta Obrigatório de Conformidade (RN-44 / Compliance) */}
      <div className="card-surface p-4 flex items-start gap-3.5 border-l-4 border-l-brand">
        <ShieldCheck size={24} className="text-brand shrink-0 mt-0.5" weight="duotone" />
        <div className="text-xs text-ink-soft leading-relaxed">
          <strong className="text-ink block mb-0.5">Conteúdo Educativo Revisado por Especialistas Contábeis</strong>
          As micro-lições do MEIster possuem finalidade exclusivamente didática e de organização operacional. O MEIster não realiza recomendações de investimento financeiro nem substitui a assessoria formal de um contador habilitado.
        </div>
      </div>

      {/* Cards de Métricas e Progresso */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card-surface p-5 space-y-1">
          <span className="text-[10px] font-bold text-muted uppercase tracking-wider block">
            Total de Lições
          </span>
          <span className="text-2xl font-extrabold text-ink tabular block">
            {stats.totalLessons}
          </span>
          <span className="text-xs text-muted">Trilha de capacitação essencial</span>
        </div>

        <div className="card-surface p-5 space-y-1">
          <span className="text-[10px] font-bold text-muted uppercase tracking-wider block">
            Lições Concluídas
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-success tabular">
              {stats.completedCount}
            </span>
            <span className="text-xs text-muted">de {stats.totalLessons}</span>
          </div>
          <span className="text-xs text-muted">{stats.progressPercentage}% da trilha concluída</span>
        </div>

        <div className="card-surface p-5 space-y-1">
          <span className="text-[10px] font-bold text-muted uppercase tracking-wider block">
            Média nos Quizzes
          </span>
          <span className="text-2xl font-extrabold text-brand tabular block">
            {stats.averageQuizScore !== null ? `${stats.averageQuizScore}%` : '—'}
          </span>
          <span className="text-xs text-muted">Aproveitamento nos testes</span>
        </div>

        <div className="card-surface p-5 flex flex-col justify-between gap-3">
          <div>
            <span className="text-[10px] font-bold text-muted uppercase tracking-wider block">
              Progresso Geral
            </span>
            <div className="w-full bg-field h-2.5 rounded-full overflow-hidden mt-2 p-0.5">
              <div
                className="bg-primary h-full rounded-full transition-all duration-700"
                style={{ width: `${stats.progressPercentage}%` }}
              />
            </div>
          </div>
          <span className="text-xs text-muted flex items-center gap-1.5">
            {stats.completedCount === stats.totalLessons && stats.totalLessons > 0 ? (
              <>
                <Confetti size={16} weight="fill" className="text-brand" />
                <span className="font-bold text-ink">Trilha completa! Parabéns!</span>
              </>
            ) : (
              'Complete as lições para dominar seu negócio'
            )}
          </span>
        </div>
      </div>

      {/* Assistente de Dúvidas Educacionais ("Pergunte sobre seu MEI") */}
      <div className="card-surface p-6 md:p-8 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-primary-soft text-brand flex items-center justify-center shrink-0">
            <Question size={22} weight="bold" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-extrabold text-ink">
              Tire Dúvidas sobre Gestão do MEI
            </h2>
            <p className="text-xs text-muted">
              Pergunte sobre limites de faturamento, emissão do DAS, método dos potes ou separação de contas.
            </p>
          </div>
        </div>

        <form onSubmit={handleAskQuestion} className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            className="flex-1 bg-canvas border border-ink/10 rounded-2xl px-4 py-3 text-sm text-ink placeholder-faint focus:outline-none focus:border-primary transition min-h-[44px]"
            placeholder="Ex: O que acontece se meu faturamento passar de 80% do limite?"
            value={questionText}
            onChange={(e) => setQuestionText(e.target.value)}
          />
          <button
            type="submit"
            disabled={asking || !questionText.trim()}
            className="min-h-[44px] px-6 py-3 rounded-2xl bg-primary text-on-primary font-bold text-sm hover:bg-primary-deep active:scale-95 disabled:opacity-50 transition flex items-center justify-center gap-2 shadow-[var(--shadow-honey)]"
          >
            {asking ? (
              <>
                <CircleNotch size={16} className="animate-spin" />
                <span>Consultando...</span>
              </>
            ) : (
              <>
                <MagnifyingGlass size={16} weight="bold" />
                <span>Perguntar</span>
              </>
            )}
          </button>
        </form>

        {askResponse && (
          <div className="mt-4 bg-canvas border border-ink/8 rounded-2xl p-5 space-y-3">
            {askResponse.citedLessonTitle && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-primary-soft text-brand border border-primary/20">
                <BookOpen size={14} weight="bold" />
                <span>Fonte: {askResponse.citedLessonTitle}</span>
              </span>
            )}
            <RichText text={askResponse.answer} compact />
          </div>
        )}
      </div>

      {/* Grid da Trilha de Micro-Lições */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <GraduationCap size={22} className="text-brand" weight="duotone" />
          <h2 className="text-lg font-extrabold text-ink tracking-tight">Trilha de Micro-Lições</h2>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4" aria-busy="true">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="card-surface p-5 space-y-3">
                <div className="skeleton h-4 w-1/3 rounded-full" />
                <div className="skeleton h-5 w-3/4 rounded-full" />
                <div className="skeleton h-12 w-full rounded-xl" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {lessons.map((lesson) => {
              const isCompleted = lesson.progress.status === 'concluida';
              const isInProgress = lesson.progress.status === 'iniciada';

              return (
                <div
                  key={lesson.slug}
                  className="card-surface p-5 flex flex-col justify-between gap-4 transition hover:shadow-[var(--shadow-float)] group"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-muted flex items-center gap-1.5">
                        <Clock size={14} weight="bold" />
                        <span>{lesson.estimatedMinutes} min de leitura</span>
                      </span>

                      {isCompleted ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-success/10 text-success border border-success/30">
                          <CheckCircle size={14} weight="bold" />
                          <span>Concluída {lesson.progress.quizScore !== null ? `(${lesson.progress.quizScore}%)` : ''}</span>
                        </span>
                      ) : isInProgress ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-primary-soft text-brand border border-primary/30">
                          <Clock size={14} weight="bold" />
                          <span>Em andamento</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-field text-muted">
                          Não iniciada
                        </span>
                      )}
                    </div>

                    <h3 className="text-base font-extrabold text-ink group-hover:text-brand transition leading-snug">
                      {lesson.title}
                    </h3>
                    <p className="text-xs text-muted line-clamp-2 leading-relaxed">
                      {lesson.summary}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-ink/5 flex items-center justify-between">
                    <span className="flex items-center gap-1 text-[11px] text-muted">
                      <SealCheck size={14} weight="fill" className="text-success" />
                      <span>{lesson.reviewedBy}</span>
                    </span>

                    <button
                      type="button"
                      onClick={() => handleOpenLesson(lesson.slug)}
                      className="min-h-[44px] px-4 py-2 rounded-2xl bg-card border border-ink/10 hover:bg-primary hover:text-on-primary hover:border-transparent text-xs font-bold text-ink transition flex items-center gap-1.5 shadow-sm"
                    >
                      <span>{isCompleted ? 'Revisar' : 'Abrir Lição'}</span>
                      <ArrowRight size={14} weight="bold" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Reader Sheet (Leitura da Lição) */}
      <Sheet
        open={Boolean(activeLesson && !isQuizOpen)}
        onClose={() => setActiveLesson(null)}
        title={activeLesson?.title || 'Micro-Lição'}
        subtitle={`Tempo estimado: ${activeLesson?.estimatedMinutes || 3} min · Revisada em ${activeLesson?.reviewedAt || ''}`}
        icon={<Mel size={44} mood={loadingLesson ? 'thinking' : 'idle'} />}
        footer={readerFooter}
      >
        <div className="py-2 text-sm text-ink-soft leading-relaxed">
          {loadingLesson ? (
            <div className="text-center py-12 text-muted flex items-center justify-center gap-2">
              <CircleNotch size={18} className="animate-spin text-brand" />
              <span>Carregando lição...</span>
            </div>
          ) : (
            <RichText text={activeLesson?.content ?? ''} hideFirstH1 />
          )}
        </div>
      </Sheet>

      {/* Quiz Sheet (Quiz Avaliativo Animado) */}
      <Sheet
        open={Boolean(activeLesson && isQuizOpen)}
        onClose={() => setIsQuizOpen(false)}
        title={`Quiz: ${activeLesson?.title || ''}`}
        subtitle="Teste seus conhecimentos para validar a conclusão da lição."
        icon={<Mel size={44} mood={quizResult ? (quizResult.passed ? 'celebrate' : 'thinking') : 'idle'} />}
        footer={quizFooter}
      >
        <div className="space-y-6 py-2">
          {quizResult ? (
            /* Resultados Avaliados com Explicações */
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.3 }}
              className="space-y-6"
            >
              <div
                className={`p-6 rounded-3xl text-center border ${
                  quizResult.passed
                    ? 'bg-success/10 border-success/30'
                    : 'bg-danger/10 border-danger/30'
                }`}
              >
                <div className="flex justify-center mb-2">
                  <Mel size={56} mood={quizResult.passed ? 'celebrate' : 'alert'} />
                </div>
                <h3 className="text-xl font-extrabold text-ink">
                  {quizResult.passed ? 'Parabéns, Você Concluiu!' : 'Quase lá! Vamos revisar?'}
                </h3>
                <p className="text-xs sm:text-sm mt-1 text-ink-soft">
                  Você acertou {quizResult.correctCount} de {quizResult.totalQuestions} questões ({quizResult.score}%).
                </p>
              </div>

              {/* Gabarito Comentado com Explicações Reveladas */}
              <div className="space-y-4">
                <span className="text-xs font-bold text-muted uppercase tracking-wider block">
                  Gabarito Comentado:
                </span>
                {quizResult.breakdown.map((item, idx) => (
                  <div
                    key={item.questionId}
                    className="bg-canvas border border-ink/8 rounded-2xl p-4 space-y-2"
                  >
                    <div className="flex items-start gap-2.5">
                      {item.isCorrect ? (
                        <CheckCircle size={20} className="text-success shrink-0 mt-0.5" weight="bold" />
                      ) : (
                        <XCircle size={20} className="text-danger shrink-0 mt-0.5" weight="bold" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-bold text-ink">
                          {idx + 1}. {item.question}
                        </p>
                        <div className="mt-2 text-xs text-ink-soft leading-relaxed bg-field p-3 rounded-xl border border-ink/5">
                          <p className="flex items-start gap-1.5">
                            <Lightbulb size={16} weight="fill" className="text-brand shrink-0 mt-0.5" />
                            <span>
                              <strong>Explicação:</strong> {item.explanation}
                            </span>
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          ) : (
            /* Perguntas do Quiz Interativo */
            <div className="space-y-6">
              {activeLesson?.quiz.map((q, qIndex) => (
                <div key={q.id} className="space-y-3">
                  <p className="text-sm font-extrabold text-ink flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-primary text-on-primary text-xs font-black flex items-center justify-center shrink-0">
                      {qIndex + 1}
                    </span>
                    <span>{q.question}</span>
                  </p>

                  <div className="space-y-2 pl-8">
                    {q.options.map((opt, optIndex) => {
                      const isSelected = quizAnswers[qIndex] === optIndex;
                      return (
                        <button
                          key={optIndex}
                          type="button"
                          onClick={() => handleAnswerSelect(qIndex, optIndex)}
                          className={`w-full min-h-[44px] text-left p-3.5 rounded-2xl border text-xs font-semibold transition flex items-center gap-3 ${
                            isSelected
                              ? 'bg-card border-brand shadow-sm ring-1 ring-brand text-ink'
                              : 'bg-card border-ink/8 text-ink-soft hover:border-ink/20'
                          }`}
                        >
                          <span
                            className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                              isSelected ? 'border-brand bg-primary' : 'border-ink/30'
                            }`}
                          >
                            {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-card" />}
                          </span>
                          <span>{opt}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Sheet>
    </div>
  );
};

export default EducationPage;
