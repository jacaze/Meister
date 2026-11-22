import React, { useEffect, useState, useCallback } from 'react';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';
import { useToast } from '../components/ui/Toast.js';
import { hasPjEntity } from '../lib/reviewCopy.js';
import {
  askErrorMessage,
  askPlaceholder,
  EMPTY_INSIGHTS_TEXT,
  formatEvidenceAmount,
  formatIsoDateBR,
  quickQuestions,
  severityLabel,
} from '../lib/insightsCopy.js';
import {
  Lightbulb,
  ArrowsClockwise,
  Question,
  Robot,
  BellRinging,
  CheckCircle,
  WarningCircle,
  Warning,
  Info,
  Eye,
  ThumbsUp,
  ThumbsDown,
  X,
  ChartLineUp,
} from '../components/ui/icons.js';

interface Metric {
  key: string;
  kind: string;
  value: string | number;
  display: string;
}

interface InsightAction {
  kind: string;
  label: string;
  params?: Record<string, string | number>;
}

interface Insight {
  id: string;
  detectorId: string;
  period: string;
  severity: 'info' | 'atencao' | 'alerta';
  confidence: string;
  metrics: Metric[];
  actions: InsightAction[];
  narrationText: string;
  status: string;
  createdAt: string;
}

interface MonthlyDigest {
  month: string;
  label: string;
  totalIncome: string;
  totalExpense: string;
  netResult: string;
  isPositive: boolean;
  points: string[];
}

interface AskResult {
  answer: string;
  intent: string;
  periodLabel?: string;
}

export const InsightsPage: React.FC = () => {
  const { activeEntityId, workspace } = useAuth();
  const hasPj = hasPjEntity(workspace?.entities);
  const toast = useToast();
  const [insights, setInsights] = useState<Insight[]>([]);
  const [digest, setDigest] = useState<MonthlyDigest | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [severityFilter, setSeverityFilter] = useState<'todos' | 'alerta' | 'atencao' | 'info'>('todos');

  // "Pergunte às suas finanças" states
  const [question, setQuestion] = useState('');
  const [askLoading, setAskLoading] = useState(false);
  const [askResult, setAskResult] = useState<AskResult | null>(null);

  // "Por que estou vendo isso?" modal state
  const [selectedExplain, setSelectedExplain] = useState<{
    insight: Insight;
    description: string;
    evidenceTransactions: Array<{ id: string; description: string; amount: number; date: string }>;
  } | null>(null);
  const [explainLoading, setExplainLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const [insightsRes, digestRes] = await Promise.all([
        api.get('/insights', { params: { entityId: activeEntityId } }),
        api.get('/insights/digest'),
      ]);
      setInsights(insightsRes.data.items || []);
      setDigest(digestRes.data);
    } catch (err) {
      console.error('Erro ao buscar dados de insights:', err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [activeEntityId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRunDetectors = async () => {
    setRunning(true);
    setActionError(null);
    try {
      await api.post('/insights/run', { entityId: activeEntityId });
      await fetchData();
    } catch (err) {
      console.error('Erro ao reprocessar detectores:', err);
      setActionError('Não foi possível atualizar as análises agora. Tente novamente.');
    } finally {
      setRunning(false);
    }
  };

  const handleAsk = async (queryText?: string) => {
    const q = (queryText || question).trim();
    if (!q) return;

    setAskLoading(true);
    setAskResult(null);
    try {
      const res = await api.post('/insights/ask', { question: q, entityId: activeEntityId });
      setAskResult(res.data);
      if (queryText) setQuestion(queryText);
    } catch (err) {
      setAskResult({ answer: askErrorMessage(err), intent: 'erro' });
    } finally {
      setAskLoading(false);
    }
  };

  const handleDismiss = async (id: string) => {
    try {
      await api.post(`/insights/${id}/dismiss`);
      setInsights((prev) => prev.filter((i) => i.id !== id));
    } catch (err) {
      console.error('Erro ao dispensar insight:', err);
      setActionError('Não foi possível dispensar esta observação. Tente novamente.');
    }
  };

  const handleFeedback = async (id: string, value: 'util' | 'inutil') => {
    try {
      await api.post(`/insights/${id}/feedback`, { value });
      toast.info(value === 'util' ? 'Obrigado pelo feedback!' : 'Feedback registrado. Vamos calibrar as próximas análises.');
    } catch (err) {
      console.error('Erro ao enviar feedback:', err);
      setActionError('Não foi possível registrar seu feedback. Tente novamente.');
    }
  };

  const handleExplain = async (id: string) => {
    setExplainLoading(true);
    try {
      const res = await api.get(`/insights/${id}`);
      setSelectedExplain(res.data);
    } catch (err) {
      console.error('Erro ao explicar insight:', err);
      setActionError('Não foi possível carregar a explicação. Tente novamente.');
    } finally {
      setExplainLoading(false);
    }
  };

  const filteredInsights = insights.filter((i) => {
    if (severityFilter === 'todos') return true;
    return i.severity === severityFilter;
  });

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-ink flex items-center gap-3">
            <Lightbulb size={28} className="text-brand" weight="duotone" />
            Insights & Dicas Financeiras
          </h1>
          <p className="text-sm text-muted mt-1">
            {hasPj
              ? 'Análises automáticas sobre seu faturamento, limites e hábitos de consumo.'
              : 'Análises automáticas sobre suas receitas, despesas e hábitos de consumo.'}
          </p>
        </div>

        <button
          onClick={handleRunDetectors}
          disabled={running}
          className="px-4 py-2.5 rounded-2xl bg-ink/4 hover:bg-ink/8 border border-ink/8 text-xs font-bold text-ink flex items-center justify-center gap-2 transition disabled:opacity-50"
        >
          <ArrowsClockwise size={16} className={running ? 'animate-spin' : ''} weight="bold" />
          {running ? 'Analisando histórico...' : 'Atualizar Análises'}
        </button>
      </div>

      {actionError && (
        <p role="alert" className="p-3 rounded-2xl bg-danger/10 border border-danger/30 text-xs font-semibold text-danger flex items-center gap-2">
          <WarningCircle size={16} weight="bold" />
          {actionError}
        </p>
      )}

      {/* Monthly Digest Card ("Seu mês em 3 pontos") */}
      {digest && (
        <div className="p-6 md:p-8 rounded-3xl bg-gradient-to-br from-card via-card-2 to-card border border-ink/8 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-ink/5 pb-4">
              <div>
                <span className="text-[11px] font-bold text-brand uppercase tracking-wider block mb-1">
                  Resumo Financeiro Mensal
                </span>
                <h2 className="text-xl font-bold text-ink">Seu Mês em 3 Pontos — {digest.label}</h2>
              </div>

              {/* Numbers */}
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                <div>
                  <span className="text-[10px] text-muted uppercase block">Receitas</span>
                  <span className="text-sm font-bold text-success">{digest.totalIncome}</span>
                </div>
                <div>
                  <span className="text-[10px] text-muted uppercase block">Despesas</span>
                  <span className="text-sm font-bold text-danger">{digest.totalExpense}</span>
                </div>
                <div>
                  <span className="text-[10px] text-muted uppercase block">Resultado</span>
                  <span className={`text-base font-extrabold ${digest.isPositive ? 'text-success' : 'text-danger'}`}>
                    {digest.netResult}
                  </span>
                </div>
              </div>
            </div>

            {/* Digest bullet points */}
            <div className="space-y-3">
              {digest.points.map((pt, idx) => (
                <div key={idx} className="flex items-start gap-3">
                  <span className="text-brand font-black text-sm mt-0.5">•</span>
                  <p className="text-sm text-ink-soft leading-relaxed font-medium">{pt}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* "Pergunte às suas finanças" Section */}
      <div className="p-6 rounded-3xl bg-card border border-ink/8 space-y-4">
        <div className="flex items-center gap-2.5">
          <Question size={20} className="text-brand" weight="duotone" />
          <h3 className="text-base font-bold text-ink">Pergunte às suas finanças</h3>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleAsk();
          }}
          className="flex flex-col sm:flex-row gap-2"
        >
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            aria-label="Sua pergunta sobre as finanças"
            maxLength={1000}
            placeholder={askPlaceholder(hasPj)}
            className="flex-1 min-w-0 px-4 py-3 bg-canvas border border-ink/8 rounded-2xl text-sm text-ink focus:outline-none focus:border-primary transition"
          />
          <button
            type="submit"
            disabled={askLoading || !question.trim()}
            className="px-6 py-3 rounded-2xl bg-primary text-on-primary text-sm font-bold shadow-[0_0_15px_rgba(242,201,76,0.3)] hover:scale-[1.02] active:scale-[0.98] transition disabled:opacity-50"
          >
            {askLoading ? 'Consultando...' : 'Perguntar'}
          </button>
        </form>

        {/* Quick Question Pills */}
        <div className="flex flex-wrap gap-2 pt-1">
          {quickQuestions(hasPj).map((pill, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleAsk(pill)}
              className="text-xs px-3 py-1.5 rounded-xl bg-ink/4 hover:bg-ink/7 border border-ink/5 text-muted hover:text-ink transition"
            >
              {pill}
            </button>
          ))}
        </div>

        {/* Answer Balloon */}
        {askResult && (
          <div className="p-4 rounded-2xl bg-canvas border border-primary/30 text-sm text-ink mt-4 space-y-2 animate-in fade-in duration-200">
            <div className="flex items-center gap-2 text-brand text-xs font-bold">
              <Robot size={16} className="text-brand" weight="duotone" />
              Resposta do Assistente MEIster
              {askResult.periodLabel && (
                <span className="text-[10px] text-muted bg-ink/4 px-2 py-0.5 rounded">
                  Período: {askResult.periodLabel}
                </span>
              )}
            </div>
            <p className="whitespace-pre-line text-ink leading-relaxed">{askResult.answer}</p>
          </div>
        )}
      </div>

      {/* Active Insights Feed */}
      <div className="space-y-4">
        {/* Severity Filters */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h3 className="text-lg font-bold text-ink flex items-center gap-2">
            <BellRinging size={20} className="text-brand" weight="duotone" />
            Observações Detectadas ({filteredInsights.length})
          </h3>

          <div className="flex flex-wrap items-center gap-1.5 bg-card p-1 rounded-2xl border border-ink/5">
            {(['todos', 'alerta', 'atencao', 'info'] as const).map((sev) => (
              <button
                key={sev}
                onClick={() => setSeverityFilter(sev)}
                aria-pressed={severityFilter === sev}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition capitalize ${
                  severityFilter === sev
                    ? 'bg-primary text-on-primary'
                    : 'text-muted hover:text-ink'
                }`}
              >
                {sev === 'todos' ? 'Todos' : severityLabel(sev)}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-muted">
            <ArrowsClockwise size={36} className="animate-spin text-brand mb-2 mx-auto" weight="bold" />
            <p className="text-sm font-medium">Buscando observações financeiras...</p>
          </div>
        ) : loadError ? (
          <div role="alert" className="p-12 rounded-3xl bg-card border border-danger/30 text-center space-y-3">
            <WarningCircle size={36} className="text-danger mx-auto" weight="duotone" />
            <h4 className="text-base font-bold text-ink">Não foi possível carregar os insights</h4>
            <p className="text-xs text-muted max-w-md mx-auto">Verifique sua conexão e tente de novo.</p>
            <button
              type="button"
              onClick={fetchData}
              className="px-4 py-2.5 rounded-2xl bg-primary text-on-primary text-xs font-bold"
            >
              Tentar novamente
            </button>
          </div>
        ) : insights.length === 0 ? (
          <div className="p-12 rounded-3xl bg-card border border-ink/5 text-center space-y-2">
            <Lightbulb size={36} className="text-brand mx-auto" weight="duotone" />
            <h4 className="text-base font-bold text-ink">Nada por aqui ainda</h4>
            <p className="text-xs text-muted max-w-md mx-auto">{EMPTY_INSIGHTS_TEXT}</p>
          </div>
        ) : filteredInsights.length === 0 ? (
          <div className="p-12 rounded-3xl bg-card border border-ink/5 text-center space-y-2">
            <CheckCircle size={36} className="text-success mx-auto" weight="duotone" />
            <h4 className="text-base font-bold text-ink">Nenhuma observação neste filtro</h4>
            <p className="text-xs text-muted max-w-md mx-auto">Escolha outro nível de severidade para ver as demais.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredInsights.map((ins) => {
              const isAlert = ins.severity === 'alerta';
              const isWarning = ins.severity === 'atencao';
              const badgeBg = isAlert
                ? 'bg-danger/10 text-danger border-danger/30'
                : isWarning
                ? 'bg-primary/15 text-brand border-primary/30'
                : 'bg-info/15 text-info border-info/30';

              return (
                <div
                  key={ins.id}
                  className="p-6 rounded-3xl bg-card border border-ink/8 hover:border-ink/15 transition flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-3">
                    {/* Header Badge */}
                    <div className="flex items-center justify-between">
                      <span className={`px-2.5 py-1 rounded-xl text-[10px] font-extrabold uppercase border flex items-center gap-1.5 ${badgeBg}`}>
                        {isAlert ? <WarningCircle size={14} weight="bold" /> : isWarning ? <Warning size={14} weight="bold" /> : <Info size={14} weight="bold" />}
                        {severityLabel(ins.severity)}
                      </span>
                      <span className="text-[10px] text-muted font-medium">
                        {new Date(ins.createdAt).toLocaleDateString('pt-BR')}
                      </span>
                    </div>

                    {/* Narration Text */}
                    <p className="text-sm text-ink font-medium leading-relaxed">
                      {ins.narrationText}
                    </p>

                    {/* Metrics Badges */}
                    {ins.metrics && ins.metrics.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {ins.metrics.map((m, mIdx) => (
                          <span
                            key={mIdx}
                            className="text-[11px] font-bold px-2.5 py-1 rounded-xl bg-canvas border border-ink/5 text-ink-soft"
                          >
                            {m.display}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Actions & Feedback */}
                  <div className="pt-3 border-t border-ink/4 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => handleExplain(ins.id)}
                      className="text-xs font-bold text-brand hover:underline flex items-center gap-1"
                    >
                      <Eye size={16} weight="bold" />
                      Por que estou vendo isso?
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        title="Útil"
                        aria-label="Marcar como útil"
                        onClick={() => handleFeedback(ins.id, 'util')}
                        className="p-1.5 rounded-lg text-muted hover:text-success hover:bg-ink/4 transition"
                      >
                        <ThumbsUp size={16} weight="bold" />
                      </button>
                      <button
                        title="Não é útil"
                        aria-label="Marcar como não útil"
                        onClick={() => handleFeedback(ins.id, 'inutil')}
                        className="p-1.5 rounded-lg text-muted hover:text-danger hover:bg-ink/4 transition"
                      >
                        <ThumbsDown size={16} weight="bold" />
                      </button>
                      <button
                        title="Dispensar"
                        aria-label="Dispensar observação"
                        onClick={() => handleDismiss(ins.id)}
                        className="p-1.5 rounded-lg text-muted hover:text-ink hover:bg-ink/4 transition"
                      >
                        <X size={16} weight="bold" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* "Por que estou vendo isso?" Modal */}
      {selectedExplain && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div role="dialog" aria-modal="true" aria-labelledby="explain-title" className="bg-card border border-ink/8 rounded-3xl w-full max-w-lg max-h-[90dvh] overflow-y-auto p-6 md:p-8 shadow-2xl relative space-y-4">
            <button
              onClick={() => setSelectedExplain(null)}
              aria-label="Fechar"
              className="absolute top-6 right-6 text-muted hover:text-ink p-1 rounded-full hover:bg-field transition"
            >
              <X size={20} weight="bold" />
            </button>

            <h3 id="explain-title" className="text-lg font-bold text-ink flex items-center gap-2 pr-8">
              <ChartLineUp size={20} className="text-brand" weight="duotone" />
              Por que você está vendo esta observação?
            </h3>

            <p className="text-xs text-ink-soft leading-relaxed">
              {selectedExplain.description}
            </p>

            <div className="p-3.5 bg-canvas rounded-2xl border border-ink/5 space-y-1.5">
              <span className="text-[10px] font-bold text-muted uppercase tracking-wider block">
                Métricas Calculadas
              </span>
              <div className="space-y-1">
                {(selectedExplain.insight.metrics as Metric[]).map((m, idx) => (
                  <div key={idx} className="flex items-center justify-between text-xs">
                    <span className="text-muted capitalize">{m.key.replace(/_/g, ' ')}:</span>
                    <span className="font-bold text-ink">{m.display}</span>
                  </div>
                ))}
              </div>
            </div>

            {selectedExplain.evidenceTransactions.length > 0 && (
              <div className="space-y-2">
                <span className="text-[10px] font-bold text-muted uppercase tracking-wider block">
                  Últimos Lançamentos de Evidência
                </span>
                <div className="space-y-1.5">
                  {selectedExplain.evidenceTransactions.map((tx) => (
                    <div
                      key={tx.id}
                      className="flex items-center justify-between text-xs p-2 rounded-xl bg-canvas border border-ink/4"
                    >
                      <div className="space-y-0.5">
                        <span className="text-ink font-medium block">{tx.description}</span>
                        <span className="text-[10px] text-muted">{formatIsoDateBR(tx.date)}</span>
                      </div>
                      <span className="font-bold text-ink">{formatEvidenceAmount(tx.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedExplain(null)}
                className="px-5 py-2 rounded-xl bg-ink/4 text-xs font-bold text-ink hover:bg-ink/8 transition"
              >
                Entendi
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InsightsPage;
