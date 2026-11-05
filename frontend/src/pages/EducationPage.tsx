import React, { useState, useEffect, useCallback } from 'react';
import api from '../api/client.js';
import { Confetti, Lightbulb, SealCheck } from '../components/ui/icons.js';
import MotionIcon from '../components/ui/MotionIcon.js';

export interface QuizOption {
  readonly id: string;
  readonly question: string;
  readonly options: readonly string[];
  readonly correct: number;
  readonly explanation: string;
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
  const [lessons, setLessons] = useState<LessonItem[]>([]);
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
    answer: string;
    citedLessonTitle?: string;
    isDisclaimer: boolean;
  } | null>(null);

  const fetchLessons = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/education/lessons');
      setLessons(res.data.lessons || []);
      setStats({
        totalLessons: res.data.totalLessons || 0,
        completedCount: res.data.completedCount || 0,
        progressPercentage: res.data.progressPercentage || 0,
        averageQuizScore: res.data.averageQuizScore,
      });
    } catch (err) {
      console.error('Erro ao buscar lições:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLessons();
  }, [fetchLessons]);

  const handleOpenLesson = async (slug: string) => {
    try {
      setLoadingLesson(true);
      const res = await api.get(`/education/lessons/${slug}`);
      setActiveLesson(res.data.lesson);
      setIsQuizOpen(false);
      setQuizResult(null);
    } catch (err) {
      console.error('Erro ao abrir lição:', err);
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
      setQuizResult(res.data.grading);
      // Refresh list to update progress pills
      fetchLessons();
    } catch (err) {
      console.error('Erro ao enviar quiz:', err);
    } finally {
      setSubmittingQuiz(false);
    }
  };

  const handleAskQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!questionText.trim()) return;

    try {
      setAsking(true);
      const res = await api.post('/education/ask', { question: questionText });
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

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-ink tracking-tight flex items-center gap-3">
            <span className="material-symbols-outlined text-brand text-3xl">school</span>
            Educação Financeira & Micro-Lições
          </h1>
          <p className="text-sm text-muted mt-1">
            Conhecimento fiscal, tributário e operacional em micro-doses práticas para fortalecer seu MEI.
          </p>
        </div>
      </div>

      {/* Mandatory Disclaimer Alert (RN-44 / Compliance) */}
      <div className="bg-card border border-primary/30 rounded-2xl p-4 flex items-start gap-3.5 shadow-[0_0_20px_rgba(242,201,76,0.05)]">
        <span className="material-symbols-outlined text-brand text-2xl shrink-0 mt-0.5">verified_user</span>
        <div className="text-xs text-ink-soft leading-relaxed">
          <strong className="text-ink block mb-0.5">Conteúdo Educativo Revisado por Profissionais Contábeis</strong>
          As micro-lições do MEIster têm finalidade exclusivamente educativa e gerencial. O MEIster não realiza recomendações de investimento, compra de ações ou aplicações financeiras, nem substitui a assessoria de um contador habilitado.
        </div>
      </div>

      {/* Progress & Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-card border border-ink/5 rounded-2xl p-5">
          <p className="text-xs font-semibold text-muted uppercase tracking-wider">Total de Lições</p>
          <p className="text-2xl font-black text-ink mt-2">{stats.totalLessons}</p>
          <p className="text-xs text-muted mt-1">Trilha de capacitação essencial</p>
        </div>

        <div className="bg-card border border-ink/5 rounded-2xl p-5">
          <p className="text-xs font-semibold text-muted uppercase tracking-wider">Lições Concluídas</p>
          <div className="flex items-baseline gap-2 mt-2">
            <p className="text-2xl font-black text-success">{stats.completedCount}</p>
            <span className="text-xs text-muted">de {stats.totalLessons}</span>
          </div>
          <p className="text-xs text-muted mt-1">{stats.progressPercentage}% da trilha concluída</p>
        </div>

        <div className="bg-card border border-ink/5 rounded-2xl p-5">
          <p className="text-xs font-semibold text-muted uppercase tracking-wider">Média nos Quizzes</p>
          <p className="text-2xl font-black text-brand mt-2">
            {stats.averageQuizScore !== null ? `${stats.averageQuizScore}%` : '—'}
          </p>
          <p className="text-xs text-muted mt-1">Aproveitamento nos testes</p>
        </div>

        <div className="bg-card border border-ink/5 rounded-2xl p-5 flex flex-col justify-between">
          <div>
            <p className="text-xs font-semibold text-muted uppercase tracking-wider">Progresso Geral</p>
            <div className="w-full bg-card-2 h-2.5 rounded-full overflow-hidden mt-3">
              <div
                className="bg-gradient-to-r from-primary to-success h-full transition-all duration-500"
                style={{ width: `${stats.progressPercentage}%` }}
              />
            </div>
          </div>
          <p className="text-xs text-muted mt-2 flex items-center gap-1.5">
            {stats.completedCount === stats.totalLessons && stats.totalLessons > 0 ? (
              <>
                <MotionIcon icon={Confetti} animate="bounce" size={16} weight="fill" className="text-primary-deep" />
                Trilha completa! Parabéns!
              </>
            ) : (
              'Continue aprendendo para dominar seu negócio'
            )}
          </p>
        </div>
      </div>

      {/* Free-form Educational Q&A ("Pergunte sobre seu MEI") */}
      <div className="bg-card border border-ink/5 rounded-3xl p-6 md:p-8 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-field flex items-center justify-center text-brand">
            <span className="material-symbols-outlined text-2xl">help</span>
          </div>
          <div>
            <h2 className="text-lg font-bold text-ink">Tire suas Dúvidas sobre Gestão do MEI</h2>
            <p className="text-xs text-muted">
              Pergunte sobre limites de faturamento, pagamento do DAS, método dos potes ou separação de contas.
            </p>
          </div>
        </div>

        <form onSubmit={handleAskQuestion} className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            className="flex-1 bg-canvas border border-ink/10 rounded-xl px-4 py-3 text-sm text-ink placeholder-faint focus:outline-none focus:border-primary transition"
            placeholder="Ex: O que acontece se meu faturamento passar de 80% do limite?"
            value={questionText}
            onChange={(e) => setQuestionText(e.target.value)}
          />
          <button
            type="submit"
            disabled={asking || !questionText.trim()}
            className="px-6 py-3 rounded-xl bg-primary text-on-primary font-bold text-sm hover:brightness-110 active:scale-95 disabled:opacity-50 transition flex items-center justify-center gap-2"
          >
            {asking ? (
              <>
                <span className="material-symbols-outlined animate-spin text-lg">progress_activity</span>
                Consultando...
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-lg">search</span>
                Perguntar
              </>
            )}
          </button>
        </form>

        {askResponse && (
          <div className="mt-4 bg-card-2 border border-ink/5 rounded-2xl p-5 space-y-3 animate-fade-in">
            {askResponse.citedLessonTitle && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-field text-brand border border-primary/20">
                <span className="material-symbols-outlined text-sm">menu_book</span>
                Fonte: {askResponse.citedLessonTitle}
              </span>
            )}
            <p className="text-sm text-ink whitespace-pre-line leading-relaxed">
              {askResponse.answer}
            </p>
          </div>
        )}
      </div>

      {/* Lessons List Grid */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-ink flex items-center gap-2">
          <span className="material-symbols-outlined text-brand">local_library</span>
          Trilha de Micro-Lições
        </h2>

        {loading ? (
          <div className="text-center py-12 text-muted flex items-center justify-center gap-2">
            <span className="material-symbols-outlined animate-spin text-2xl">progress_activity</span>
            Carregando trilha de educação...
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {lessons.map((lesson) => {
              const isCompleted = lesson.progress.status === 'concluida';
              const isInProgress = lesson.progress.status === 'iniciada';

              return (
                <div
                  key={lesson.slug}
                  className="bg-card border border-ink/5 rounded-2xl p-5 flex flex-col justify-between hover:border-primary/40 transition group"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-muted flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm">schedule</span>
                        {lesson.estimatedMinutes} min de leitura
                      </span>

                      {isCompleted ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-success/10 text-success border border-success/30">
                          <span className="material-symbols-outlined text-xs font-bold">check_circle</span>
                          Concluída {lesson.progress.quizScore !== null ? `(${lesson.progress.quizScore}%)` : ''}
                        </span>
                      ) : isInProgress ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-primary/10 text-brand border border-primary/30">
                          <span className="material-symbols-outlined text-xs">pending</span>
                          Em andamento
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-field text-muted">
                          Não iniciada
                        </span>
                      )}
                    </div>

                    <h3 className="text-base font-bold text-ink group-hover:text-brand transition">
                      {lesson.title}
                    </h3>
                    <p className="text-xs text-muted line-clamp-2 leading-relaxed">
                      {lesson.summary}
                    </p>
                  </div>

                  <div className="mt-5 pt-4 border-t border-ink/5 flex items-center justify-between">
                    <span className="flex items-center gap-1 text-[11px] text-faint">
                      <SealCheck size={14} weight="fill" className="text-success" />
                      {lesson.reviewedBy}
                    </span>

                    <button
                      onClick={() => handleOpenLesson(lesson.slug)}
                      className="px-4 py-2 rounded-xl bg-field hover:bg-primary hover:text-on-primary text-xs font-bold text-ink transition flex items-center gap-1.5"
                    >
                      <span>{isCompleted ? 'Revisar' : 'Abrir Lição'}</span>
                      <span className="material-symbols-outlined text-sm">arrow_forward</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Lesson Reader Modal */}
      {activeLesson && !isQuizOpen && (
        <div className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-card border border-ink/10 rounded-3xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl animate-scale-up my-auto">
            {/* Modal Header */}
            <div className="p-6 border-b border-ink/5 flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[11px] font-bold text-brand uppercase tracking-wider">
                    Micro-Lição {activeLesson.estimatedMinutes} min
                  </span>
                  <span className="text-xs text-faint">•</span>
                  <span className="text-xs text-faint">Revisada em {activeLesson.reviewedAt}</span>
                </div>
                <h2 className="text-xl font-extrabold text-ink">{activeLesson.title}</h2>
              </div>
              <button
                onClick={() => setActiveLesson(null)}
                className="p-2 text-muted hover:text-ink rounded-xl bg-card-2 transition"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 overflow-y-auto flex-1 space-y-4 text-sm text-ink-soft leading-relaxed">
              {loadingLesson ? (
                <div className="text-center py-8 text-muted">Carregando conteúdo...</div>
              ) : (
                <div className="prose prose-invert max-w-none space-y-4 whitespace-pre-line">
                  {activeLesson.content}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t border-ink/5 bg-card rounded-b-3xl flex flex-col sm:flex-row items-center justify-between gap-3">
              <span className="text-xs text-muted">
                {activeLesson.quiz.length} pergunta(s) no quiz avaliativo
              </span>
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <button
                  onClick={() => setActiveLesson(null)}
                  className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl bg-card-2 text-xs font-bold text-muted hover:text-ink transition"
                >
                  Fechar
                </button>
                <button
                  onClick={handleStartQuiz}
                  className="flex-1 sm:flex-none px-6 py-2.5 rounded-xl bg-primary text-on-primary text-xs font-bold hover:brightness-110 active:scale-95 transition flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-base">quiz</span>
                  Fazer Quiz
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quiz Modal */}
      {activeLesson && isQuizOpen && (
        <div className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-card border border-ink/10 rounded-3xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl animate-scale-up my-auto">
            {/* Modal Header */}
            <div className="p-6 border-b border-ink/5 flex items-start justify-between gap-4">
              <div>
                <span className="text-[11px] font-bold text-brand uppercase tracking-wider">
                  Quiz Avaliativo
                </span>
                <h2 className="text-lg font-bold text-ink mt-1">{activeLesson.title}</h2>
              </div>
              <button
                onClick={() => setIsQuizOpen(false)}
                className="p-2 text-muted hover:text-ink rounded-xl bg-card-2 transition"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            {/* Quiz Questions or Results */}
            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              {quizResult ? (
                /* Results View */
                <div className="space-y-6 animate-fade-in">
                  <div
                    className={`p-6 rounded-2xl text-center border ${
                      quizResult.passed
                        ? 'bg-success/10 border-success/30'
                        : 'bg-danger/10 border-danger/30'
                    }`}
                  >
                    <span className="material-symbols-outlined text-5xl mb-2 block">
                      {quizResult.passed ? 'task_alt' : 'sentiment_dissatisfied'}
                    </span>
                    <h3 className="text-xl font-black text-ink">
                      {quizResult.passed ? 'Parabéns, Você Passou!' : 'Quase lá! Vamos revisar?'}
                    </h3>
                    <p className="text-sm mt-1 text-ink-soft">
                      Você acertou {quizResult.correctCount} de {quizResult.totalQuestions} questões ({quizResult.score}%).
                    </p>
                  </div>

                  {/* Question Breakdown with Explanations */}
                  <div className="space-y-4">
                    <h4 className="text-xs font-bold text-muted uppercase tracking-wider">
                      Gabarito Comentado:
                    </h4>
                    {quizResult.breakdown.map((item, idx) => (
                      <div
                        key={item.questionId}
                        className="bg-card-2 border border-ink/5 rounded-2xl p-4 space-y-2"
                      >
                        <div className="flex items-start gap-2.5">
                          <span
                            className={`material-symbols-outlined text-lg shrink-0 mt-0.5 ${
                              item.isCorrect ? 'text-success' : 'text-danger'
                            }`}
                          >
                            {item.isCorrect ? 'check_circle' : 'cancel'}
                          </span>
                          <div>
                            <p className="text-sm font-semibold text-ink">
                              {idx + 1}. {item.question}
                            </p>
                            <p className="text-xs text-ink-soft mt-1.5 leading-relaxed bg-canvas p-3 rounded-xl border border-ink/5">
                              <Lightbulb size={16} weight="fill" className="mr-1 inline align-[-3px] text-primary-deep" />
                              <strong>Explicação:</strong> {item.explanation}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                /* Questions Form */
                <div className="space-y-6">
                  {activeLesson.quiz.map((q, qIndex) => (
                    <div key={q.id} className="space-y-3">
                      <p className="text-sm font-bold text-ink flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-primary text-on-primary text-xs font-black flex items-center justify-center shrink-0">
                          {qIndex + 1}
                        </span>
                        {q.question}
                      </p>

                      <div className="space-y-2 pl-8">
                        {q.options.map((opt, optIndex) => {
                          const isSelected = quizAnswers[qIndex] === optIndex;
                          return (
                            <button
                              key={optIndex}
                              type="button"
                              onClick={() => handleAnswerSelect(qIndex, optIndex)}
                              className={`w-full text-left p-3.5 rounded-xl border text-xs font-medium transition flex items-center gap-3 ${
                                isSelected
                                  ? 'bg-primary/10 border-primary text-ink'
                                  : 'bg-card-2 border-ink/5 text-ink-soft hover:border-ink/15'
                              }`}
                            >
                              <div
                                className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                                  isSelected ? 'border-primary bg-primary' : 'border-faint'
                                }`}
                              >
                                {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-canvas" />}
                              </div>
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

            {/* Modal Footer */}
            <div className="p-6 border-t border-ink/5 bg-card rounded-b-3xl flex items-center justify-between gap-3">
              {quizResult ? (
                <div className="flex items-center justify-end gap-3 w-full">
                  {!quizResult.passed && (
                    <button
                      onClick={handleStartQuiz}
                      className="px-4 py-2.5 rounded-xl bg-card-2 hover:bg-field text-xs font-bold text-ink transition"
                    >
                      Tentar Novamente
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setIsQuizOpen(false);
                      setActiveLesson(null);
                    }}
                    className="px-6 py-2.5 rounded-xl bg-primary text-on-primary text-xs font-bold hover:brightness-110 transition"
                  >
                    Concluir
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between w-full">
                  <button
                    onClick={() => setIsQuizOpen(false)}
                    className="px-4 py-2.5 rounded-xl bg-card-2 text-xs font-bold text-muted hover:text-ink transition"
                  >
                    Voltar à Leitura
                  </button>
                  <button
                    onClick={handleSubmitQuiz}
                    disabled={submittingQuiz || quizAnswers.some((a) => a === -1)}
                    className="px-6 py-2.5 rounded-xl bg-primary text-on-primary text-xs font-bold hover:brightness-110 active:scale-95 disabled:opacity-50 transition flex items-center gap-2"
                  >
                    {submittingQuiz ? (
                      <>
                        <span className="material-symbols-outlined animate-spin text-base">progress_activity</span>
                        Corrigindo...
                      </>
                    ) : (
                      <>
                        <span>Enviar Respostas</span>
                        <span className="material-symbols-outlined text-base">check</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EducationPage;
