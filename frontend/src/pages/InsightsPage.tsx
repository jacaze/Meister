import React, { useEffect, useState, useCallback } from 'react';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';

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
  const { activeEntityId } = useAuth();
  const [insights, setInsights] = useState<Insight[]>([]);
  const [digest, setDigest] = useState<MonthlyDigest | null>(null);
  const [loading, setLoading] = useState(true);
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
    try {
      const [insightsRes, digestRes] = await Promise.all([
        api.get('/insights', { params: { entityId: activeEntityId } }),
        api.get('/insights/digest'),
      ]);
      setInsights(insightsRes.data.items || []);
      setDigest(digestRes.data);
    } catch (err) {
      console.error('Erro ao buscar dados de insights:', err);
    } finally {
      setLoading(false);
    }
  }, [activeEntityId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRunDetectors = async () => {
    setRunning(true);
    try {
      await api.post('/insights/run', { entityId: activeEntityId });
      await fetchData();
    } catch (err) {
      console.error('Erro ao reprocessar detectores:', err);
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
      const res = await api.post('/insights/ask', { question: q });
      setAskResult(res.data);
      if (queryText) setQuestion(queryText);
    } catch (err: any) {
      setAskResult({
        answer: err.response?.data?.message || 'Falha ao processar a pergunta. Tente novamente.',
        intent: 'erro',
      });
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
    }
  };

  const handleFeedback = async (id: string, value: 'util' | 'inutil') => {
    try {
      await api.post(`/insights/${id}/feedback`, { value });
      alert(value === 'util' ? 'Obrigado pelo feedback!' : 'Feedback registrado. Vamos calibrar as próximas análises.');
    } catch (err) {
      console.error('Erro ao enviar feedback:', err);
    }
  };

  const handleExplain = async (id: string) => {
    setExplainLoading(true);
    try {
      const res = await api.get(`/insights/${id}`);
      setSelectedExplain(res.data);
    } catch (err) {
      console.error('Erro ao explicar insight:', err);
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
            <span className="material-symbols-outlined text-brand text-3xl">lightbulb</span>
            Insights & Dicas Financeiras
          </h1>
          <p className="text-sm text-muted mt-1">
            Análises automáticas sobre seu faturamento, limites e hábitos de consumo.
          </p>
        </div>

        <button
          onClick={handleRunDetectors}
          disabled={running}
          className="px-4 py-2.5 rounded-2xl bg-ink/4 hover:bg-ink/8 border border-ink/8 text-xs font-bold text-ink flex items-center justify-center gap-2 transition disabled:opacity-50"
        >
          <span className={`material-symbols-outlined text-sm ${running ? 'animate-spin' : ''}`}>
            sync
          </span>
          {running ? 'Analisando histórico...' : 'Atualizar Análises'}
        </button>
      </div>

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
              <div className="flex items-center gap-6">
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
          <span className="material-symbols-outlined text-brand">help</span>
          <h3 className="text-base font-bold text-ink">Pergunte às suas finanças</h3>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleAsk();
          }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ex: Quanto gastei com alimentação este mês? / Como está meu limite MEI?"
            className="flex-1 px-4 py-3 bg-canvas border border-ink/8 rounded-2xl text-sm text-ink focus:outline-none focus:border-primary transition"
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
          {[
            'Qual é o meu saldo atual em caixa?',
            'Como está o meu limite anual do MEI?',
            'Qual é a situação das minhas guias de DAS?',
            'Como estão os meus potes financeiros?',
            'Quanto gastei com mercadorias e insumos este mês?',
          ].map((pill, idx) => (
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
              <span className="material-symbols-outlined text-sm">smart_toy</span>
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
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-ink flex items-center gap-2">
            <span className="material-symbols-outlined text-brand">notifications_active</span>
            Observações Detectadas ({filteredInsights.length})
          </h3>

          <div className="flex items-center gap-1.5 bg-card p-1 rounded-2xl border border-ink/5">
            {(['todos', 'alerta', 'atencao', 'info'] as const).map((sev) => (
              <button
                key={sev}
                onClick={() => setSeverityFilter(sev)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition capitalize ${
                  severityFilter === sev
                    ? 'bg-primary text-on-primary'
                    : 'text-muted hover:text-ink'
                }`}
              >
                {sev === 'todos' ? 'Todos' : sev === 'atencao' ? 'Atenção' : sev}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-muted">
            <span className="material-symbols-outlined text-4xl animate-spin text-brand mb-2">sync</span>
            <p className="text-sm font-medium">Buscando observações financeiras...</p>
          </div>
        ) : filteredInsights.length === 0 ? (
          <div className="p-12 rounded-3xl bg-card border border-ink/5 text-center space-y-2">
            <span className="material-symbols-outlined text-4xl text-success">check_circle</span>
            <h4 className="text-base font-bold text-ink">Tudo sob controle!</h4>
            <p className="text-xs text-muted max-w-md mx-auto">
              Nenhuma anomalia, gasto incomum ou estouro de pote foi detectado para os filtros selecionados.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredInsights.map((ins) => {
              const isAlert = ins.severity === 'alerta';
              const isWarning = ins.severity === 'atencao';
              const badgeBg = isAlert
                ? 'bg-danger/15 text-danger border-danger/30'
                : isWarning
                ? 'bg-primary/15 text-brand border-primary/30'
                : 'bg-info/15 text-info border-info/30';

              const icon = isAlert ? 'error' : isWarning ? 'warning' : 'info';

              return (
                <div
                  key={ins.id}
                  className="p-6 rounded-3xl bg-card border border-ink/8 hover:border-ink/15 transition flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-3">
                    {/* Header Badge */}
                    <div className="flex items-center justify-between">
                      <span className={`px-2.5 py-1 rounded-xl text-[10px] font-extrabold uppercase border flex items-center gap-1.5 ${badgeBg}`}>
                        <span className="material-symbols-outlined text-xs">{icon}</span>
                        {ins.severity}
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
                      <span className="material-symbols-outlined text-sm">visibility</span>
                      Por que estou vendo isso?
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        title="Útil"
                        onClick={() => handleFeedback(ins.id, 'util')}
                        className="p-1.5 rounded-lg text-muted hover:text-success hover:bg-ink/4 transition"
                      >
                        <span className="material-symbols-outlined text-sm">thumb_up</span>
                      </button>
                      <button
                        title="Não é útil"
                        onClick={() => handleFeedback(ins.id, 'inutil')}
                        className="p-1.5 rounded-lg text-muted hover:text-danger hover:bg-ink/4 transition"
                      >
                        <span className="material-symbols-outlined text-sm">thumb_down</span>
                      </button>
                      <button
                        title="Dispensar"
                        onClick={() => handleDismiss(ins.id)}
                        className="p-1.5 rounded-lg text-muted hover:text-ink hover:bg-ink/4 transition"
                      >
                        <span className="material-symbols-outlined text-sm">close</span>
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
          <div className="bg-card border border-ink/8 rounded-3xl w-full max-w-lg p-6 md:p-8 shadow-2xl relative space-y-4">
            <button
              onClick={() => setSelectedExplain(null)}
              className="absolute top-6 right-6 text-muted hover:text-ink p-1 rounded-full hover:bg-field transition"
            >
              <span className="material-symbols-outlined text-xl">close</span>
            </button>

            <h3 className="text-lg font-bold text-ink flex items-center gap-2">
              <span className="material-symbols-outlined text-brand">analytics</span>
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
                        <span className="text-[10px] text-muted">{tx.date}</span>
                      </div>
                      <span className="font-bold text-ink">R$ {tx.amount.toFixed(2)}</span>
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
