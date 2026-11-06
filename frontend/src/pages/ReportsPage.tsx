import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { motion } from 'motion/react';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';
import { formatBRL } from '../lib/money.js';
import AnimatedNumber from '../components/ui/AnimatedNumber.js';
import Mel from '../components/brand/Mel.js';
import RegisterWithdrawalSheet from '../components/modals/RegisterWithdrawalSheet.js';
import {
  ChartLineUp,
  TrendUp,
  TrendDown,
  Coins,
  Receipt,
  ArrowsClockwise,
  CheckCircle,
  Tag,
  Wallet,
  ArrowSquareOut,
} from '../components/ui/icons.js';

interface MonthComparison {
  readonly monthName: string;
  readonly monthIso: string;
  readonly receita: number;
  readonly despesa: number;
}

interface CategoryBreakdown {
  readonly name: string;
  readonly total: number;
  readonly percent: number;
}

type PeriodFilter = 'mes_atual' | '3_meses' | 'ano_atual';

const MONTH_NAMES_SHORT = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
];

function getPeriodDates(period: PeriodFilter): { startDate: string; endDate: string; label: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const todayIso = now.toISOString().slice(0, 10);

  if (period === 'mes_atual') {
    const firstDay = `${y}-${String(m + 1).padStart(2, '0')}-01`;
    const lastDayOfMonth = new Date(y, m + 1, 0).getDate();
    const lastDay = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDayOfMonth).padStart(2, '0')}`;
    return { startDate: firstDay, endDate: lastDay, label: 'Mês Atual' };
  }
  if (period === '3_meses') {
    const past = new Date(y, m - 2, 1);
    const firstDay = `${past.getFullYear()}-${String(past.getMonth() + 1).padStart(2, '0')}-01`;
    return { startDate: firstDay, endDate: todayIso, label: 'Últimos 3 Meses' };
  }
  // ano_atual
  return { startDate: `${y}-01-01`, endDate: `${y}-12-31`, label: `Ano de ${y}` };
}

export const ReportsPage: React.FC = () => {
  const { workspace, activeEntityId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Period selector
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodFilter>('mes_atual');

  // Business Performance metrics
  const [totalReceitas, setTotalReceitas] = useState(0);
  const [totalDespesas, setTotalDespesas] = useState(0);
  const [lucroLiquido, setLucroLiquido] = useState(0);
  const [proLaboreRetirado, setProLaboreRetirado] = useState(0);
  const [dasPago, setDasPago] = useState(0);

  // Trends & breakdown
  const [monthlyTrends, setMonthlyTrends] = useState<readonly MonthComparison[]>([]);
  const [topExpenses, setTopExpenses] = useState<readonly CategoryBreakdown[]>([]);

  // Pró-labore modal
  const [isWithdrawalSheetOpen, setIsWithdrawalSheetOpen] = useState(false);

  const currentEntity = useMemo(() => {
    return workspace?.entities.find((e) => e.id === activeEntityId);
  }, [workspace, activeEntityId]);

  const isPj = currentEntity?.kind === 'pj';

  const fetchReports = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    else setIsRefreshing(true);

    try {
      const dates = getPeriodDates(selectedPeriod);

      // 1. Fetch dashboard/summary sincronizado com as datas do período selecionado
      const summaryRes = await api.get('/dashboard', {
        params: {
          startDate: dates.startDate,
          endDate: dates.endDate,
          ...(activeEntityId ? { entityId: activeEntityId } : {}),
        },
      });

      const dashData = summaryRes.data || {};
      const periodo = dashData.periodo || {};
      const rec = Number(periodo.totalEntradas ?? 0);
      const desp = Number(periodo.totalDespesas ?? 0);
      const res = Number(periodo.resultado ?? (rec - desp));

      setTotalReceitas(rec);
      setTotalDespesas(desp);
      setLucroLiquido(res);

      // 2. Fetch DAS totals if PJ/MEI
      if (isPj) {
        try {
          const dasRes = await api.get('/das', {
            params: activeEntityId ? { entityId: activeEntityId } : undefined,
          });
          setDasPago(parseFloat(dasRes.data?.totais?.pago || '0'));
        } catch {
          setDasPago(0);
        }
      }

      // 3. Fetch past 6 months to build animated trend chart
      const now = new Date();
      const monthPromises = [];

      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const y = d.getFullYear();
        const m = d.getMonth();
        const monthIso = `${y}-${String(m + 1).padStart(2, '0')}`;
        const lastDay = new Date(y, m + 1, 0).getDate();
        const startDate = `${monthIso}-01`;
        const endDate = `${monthIso}-${String(lastDay).padStart(2, '0')}`;
        const monthName = MONTH_NAMES_SHORT[m] || '';

        monthPromises.push(
          api
            .get('/transactions', {
              params: {
                startDate,
                endDate,
                pageSize: 100,
                ...(activeEntityId ? { entityId: activeEntityId } : {}),
              },
            })
            .then((res) => {
              const resSummary = res.data?.resumo || { totalEntradas: 0, totalDespesas: 0 };
              return {
                monthName,
                monthIso,
                receita: Number(resSummary.totalEntradas || 0),
                despesa: Number(resSummary.totalDespesas || 0),
              };
            })
            .catch(() => ({
              monthName,
              monthIso,
              receita: 0,
              despesa: 0,
            }))
        );
      }

      const trendResults = await Promise.all(monthPromises);
      setMonthlyTrends(trendResults);

      // 4. Fetch transactions respecting the selected period to compute category breakdown & pró-labore
      const allTxRes = await api.get('/transactions', {
        params: {
          pageSize: 100,
          type: 'despesa',
          startDate: dates.startDate,
          endDate: dates.endDate,
          ...(activeEntityId ? { entityId: activeEntityId } : {}),
        },
      });

      const txItems = allTxRes.data?.items || [];
      const catTotals: Record<string, number> = {};
      let totalExpenseSum = 0;
      let ownerWithdrawals = 0;

      for (const tx of txItems) {
        const amt = parseFloat(tx.amount) || 0;
        const isTransfer = tx.transferType === 'transfer';
        const isProLabore =
          tx.transferType === 'pro_labore' ||
          tx.category?.slug === 'pro-labore';

        if (isTransfer) {
          // Transferências entre contas próprias não são despesas operacionais nem pró-labore
          continue;
        }

        if (isProLabore) {
          ownerWithdrawals += amt;
          // Pró-labore / retiradas de titular são transferências de lucro e não despesas operacionais da empresa
          continue;
        }

        totalExpenseSum += amt;
        const catName = tx.category?.name || 'Outras Despesas';
        catTotals[catName] = (catTotals[catName] || 0) + amt;
      }

      setProLaboreRetirado(ownerWithdrawals);

      const top = Object.entries(catTotals)
        .map(([name, total]) => ({
          name,
          total,
          percent: totalExpenseSum > 0 ? (total / totalExpenseSum) * 100 : 0,
        }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 5);

      setTopExpenses(top);
    } catch (err) {
      console.error('Erro ao buscar dados dos relatórios:', err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [activeEntityId, isPj, selectedPeriod]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  // Find max value in monthly trends for chart scaling
  const maxMonthly = useMemo(() => {
    const peak = Math.max(
      ...monthlyTrends.map((t) => Math.max(t.receita, t.despesa)),
      1000
    );
    return peak;
  }, [monthlyTrends]);

  const profitRatio = totalReceitas > 0 ? Math.max(0, (lucroLiquido / totalReceitas) * 100) : 0;
  const expenseRatio = totalReceitas > 0 ? Math.min(100, (totalDespesas / totalReceitas) * 100) : 0;

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-ink tracking-tight">
              Relatórios Financeiros
            </h1>
            {isRefreshing && (
              <span className="animate-spin text-brand" title="Atualizando...">
                <ArrowsClockwise size={18} weight="bold" />
              </span>
            )}
            <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-field text-ink-soft border border-ink/5 uppercase">
              {isPj ? 'Empresa MEI' : 'Pessoa Física'}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-muted mt-0.5">
            Lucratividade real, evolução histórica de receitas e categorização de gastos.
          </p>
        </div>

        {/* Ações e Seletor de Período */}
        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          {/* Seletor de Período */}
          <div className="flex items-center bg-card rounded-2xl border border-ink/8 p-1 shadow-sm">
            {(
              [
                { id: 'mes_atual', label: 'Este Mês' },
                { id: '3_meses', label: '3 Meses' },
                { id: 'ano_atual', label: 'Ano' },
              ] as const
            ).map((p) => {
              const active = selectedPeriod === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setSelectedPeriod(p.id)}
                  className={`min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                    active
                      ? 'bg-primary text-on-primary shadow-sm'
                      : 'text-muted hover:text-ink hover:bg-field'
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          {/* Botão de Retirar Pró-Labore (Apenas para PJ) */}
          {isPj && (
            <button
              type="button"
              onClick={() => setIsWithdrawalSheetOpen(true)}
              className="min-h-[44px] px-4 py-2 rounded-2xl bg-primary text-on-primary font-bold text-xs hover:bg-primary-deep transition flex items-center gap-2 shadow-[var(--shadow-honey)]"
            >
              <Coins size={16} weight="bold" />
              <span>Retirar Pró-Labore</span>
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="card-surface p-12 text-center text-muted flex flex-col items-center justify-center gap-3">
          <Mel size={64} mood="thinking" />
          <p className="text-sm font-semibold text-ink">Calculando métricas e relatórios...</p>
        </div>
      ) : (
        <>
          {/* 1. Desempenho do Período */}
          <section className="card-surface p-6 md:p-8 space-y-6 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-primary-soft text-brand flex items-center justify-center">
                  <ChartLineUp size={22} weight="duotone" />
                </div>
                <div>
                  <h2 className="font-extrabold text-lg text-ink">
                    Resultado Operacional ({getPeriodDates(selectedPeriod).label})
                  </h2>
                  <p className="text-xs text-muted">Balanço consolidado entre entradas e saídas</p>
                </div>
              </div>

              <div className="text-right">
                <span className="text-[10px] font-bold text-muted uppercase tracking-wider block">
                  Margem Líquida
                </span>
                <span className="text-base font-extrabold text-brand tabular">
                  {profitRatio.toFixed(1)}%
                </span>
              </div>
            </div>

            {/* Faturamento e Despesas em Destaque */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
              <div className="p-4 bg-canvas rounded-2xl border border-ink/5">
                <span className="text-xs font-bold uppercase tracking-wider text-muted flex items-center gap-1.5 mb-1">
                  <TrendUp size={16} className="text-success" weight="bold" />
                  Receitas Totais
                </span>
                <span className="text-xl sm:text-2xl font-extrabold text-ink tabular block">
                  <AnimatedNumber value={totalReceitas} />
                </span>
              </div>

              <div className="p-4 bg-canvas rounded-2xl border border-ink/5">
                <span className="text-xs font-bold uppercase tracking-wider text-muted flex items-center gap-1.5 mb-1">
                  <TrendDown size={16} className="text-danger" weight="bold" />
                  Despesas Operacionais
                </span>
                <span className="text-xl sm:text-2xl font-extrabold text-ink tabular block">
                  <AnimatedNumber value={totalDespesas} />
                </span>
              </div>

              <div className="p-4 bg-canvas rounded-2xl border border-ink/5">
                <span className="text-xs font-bold uppercase tracking-wider text-muted flex items-center gap-1.5 mb-1">
                  <Wallet size={16} className="text-brand" weight="bold" />
                  Lucro Líquido Real
                </span>
                <span
                  className={`text-xl sm:text-2xl font-extrabold tabular block ${
                    lucroLiquido >= 0 ? 'text-success' : 'text-danger'
                  }`}
                >
                  <AnimatedNumber value={lucroLiquido} />
                </span>
              </div>
            </div>

            {/* Barra de Proporção Visual Lucro vs Custos */}
            <div className="space-y-1.5 pt-2">
              <div className="w-full h-3 bg-field rounded-full overflow-hidden flex p-0.5">
                <div
                  className="h-full bg-success rounded-l-full transition-all duration-700"
                  style={{ width: `${profitRatio}%` }}
                  title={`Lucro: ${profitRatio.toFixed(1)}%`}
                />
                <div
                  className="h-full bg-danger rounded-r-full transition-all duration-700"
                  style={{ width: `${expenseRatio}%` }}
                  title={`Custos: ${expenseRatio.toFixed(1)}%`}
                />
              </div>
              <div className="flex justify-between text-[11px] text-muted font-bold">
                <span className="text-success">Lucro Operacional: {profitRatio.toFixed(0)}%</span>
                <span className="text-danger">Custos Operacionais: {expenseRatio.toFixed(0)}%</span>
              </div>
            </div>
          </section>

          {/* 2. Gráfico Visual em SVG/Motion de Evolução Mensal (6 Meses) */}
          <section className="card-surface p-6 md:p-8 space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="font-extrabold text-lg text-ink">Evolução Histórica (6 Meses)</h2>
                <p className="text-xs text-muted">Comparativo mês a mês de receitas e despesas</p>
              </div>

              <div className="flex items-center gap-4 text-xs font-bold">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-md bg-success inline-block" />
                  <span className="text-ink-soft">Receitas</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-md bg-danger inline-block" />
                  <span className="text-ink-soft">Despesas</span>
                </div>
              </div>
            </div>

            {/* Área do Gráfico */}
            <div className="h-60 w-full flex items-end justify-between gap-3 sm:gap-6 pt-6 pb-2 border-b border-ink/5">
              {monthlyTrends.map((trend, idx) => {
                const recHeight = maxMonthly > 0 ? (trend.receita / maxMonthly) * 170 : 0;
                const despHeight = maxMonthly > 0 ? (trend.despesa / maxMonthly) * 170 : 0;

                return (
                  <div
                    key={trend.monthIso || idx}
                    className="flex-1 flex flex-col items-center gap-2 group"
                  >
                    <div className="w-full flex items-end justify-center gap-1.5 sm:gap-2 h-44">
                      {/* Barra de Receita */}
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: Math.max(6, recHeight) }}
                        transition={{ duration: 0.8, delay: idx * 0.1, ease: 'easeOut' }}
                        className="w-1/2 max-w-[20px] bg-success rounded-t-xl hover:opacity-85 transition relative group"
                        title={`Receitas em ${trend.monthName}: ${formatBRL(trend.receita)}`}
                      />

                      {/* Barra de Despesa */}
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: Math.max(6, despHeight) }}
                        transition={{ duration: 0.8, delay: idx * 0.1 + 0.05, ease: 'easeOut' }}
                        className="w-1/2 max-w-[20px] bg-danger rounded-t-xl hover:opacity-85 transition relative group"
                        title={`Despesas em ${trend.monthName}: ${formatBRL(trend.despesa)}`}
                      />
                    </div>
                    <span className="text-xs font-bold text-muted uppercase">
                      {trend.monthName}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          {/* 3. Cards Bento: Tributos (DAS) e Pró-Labore (Somente PJ) */}
          {isPj && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Tributos / DAS */}
              <section className="card-surface p-6 flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-primary-soft text-brand flex items-center justify-center">
                        <Receipt size={20} weight="duotone" />
                      </div>
                      <h3 className="font-extrabold text-base text-ink">Tributos Pagos (DAS MEI)</h3>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-success/10 text-success border border-success/20 uppercase">
                      Exercício
                    </span>
                  </div>

                  <div>
                    <span className="text-2xl font-extrabold text-ink tabular block">
                      <AnimatedNumber value={dasPago} />
                    </span>
                    <p className="text-xs text-muted mt-1 leading-relaxed">
                      Total quitado em guias do Simples Nacional no ano corrente.
                    </p>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-ink/5 flex items-center justify-between text-xs text-muted">
                  <span>Previdência (INSS) + ICMS/ISS</span>
                  <a
                    href="/impostos"
                    className="text-brand hover:underline font-bold inline-flex items-center gap-1"
                  >
                    <span>Ver Guias</span>
                    <ArrowSquareOut size={14} weight="bold" />
                  </a>
                </div>
              </section>

              {/* Pró-Labore & Retiradas */}
              <section className="card-surface p-6 flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-primary-soft text-brand flex items-center justify-center">
                        <Coins size={20} weight="duotone" />
                      </div>
                      <h3 className="font-extrabold text-base text-ink">Pró-Labore no Período</h3>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary-soft text-brand uppercase">
                      Remuneração
                    </span>
                  </div>

                  <div>
                    <span className="text-2xl font-extrabold text-ink tabular block">
                      <AnimatedNumber value={proLaboreRetirado} />
                    </span>
                    <p className="text-xs text-muted mt-1 leading-relaxed">
                      Transferências registradas da conta PJ para a sua conta física (PF).
                    </p>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-ink/5 flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1 text-success font-semibold">
                    <CheckCircle size={14} weight="bold" />
                    Separado das contas pessoais
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsWithdrawalSheetOpen(true)}
                    className="text-brand hover:underline font-bold"
                  >
                    Nova Retirada
                  </button>
                </div>
              </section>
            </div>
          )}

          {/* 4. Maiores Despesas por Categoria (Respeitando o período selecionado) */}
          <section className="card-surface p-6 md:p-8 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-extrabold text-lg text-ink">Maiores Despesas por Categoria</h2>
                <p className="text-xs text-muted">
                  Distribuição dos gastos no período: {getPeriodDates(selectedPeriod).label}
                </p>
              </div>
            </div>

            {topExpenses.length === 0 ? (
              <p className="text-xs text-muted py-4 italic">
                Nenhuma despesa registrada para o período selecionado.
              </p>
            ) : (
              <div className="space-y-3.5 pt-2">
                {topExpenses.map((cat) => (
                  <div key={cat.name} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-ink flex items-center gap-1.5">
                        <Tag size={14} className="text-muted" weight="bold" />
                        {cat.name}
                      </span>
                      <span className="font-extrabold tabular text-ink">
                        {formatBRL(cat.total)}{' '}
                        <span className="text-muted font-normal">({cat.percent.toFixed(1)}%)</span>
                      </span>
                    </div>

                    <div className="w-full h-2.5 bg-field rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(cat.percent, 100)}%` }}
                        transition={{ duration: 0.6, ease: 'easeOut' }}
                        className="h-full bg-danger/80 rounded-full"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {/* Sheet para Retirada de Pró-labore */}
      <RegisterWithdrawalSheet
        open={isWithdrawalSheetOpen}
        onClose={() => setIsWithdrawalSheetOpen(false)}
        onSaved={() => fetchReports(true)}
      />
    </div>
  );
};

export default ReportsPage;
