import React, { useEffect, useState, useCallback } from 'react';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';

interface MonthComparison {
  monthName: string;
  monthIso: string;
  receita: number;
  despesa: number;
}

interface CategoryBreakdown {
  name: string;
  total: number;
  percent: number;
}

export const ReportsPage: React.FC = () => {
  const { activeEntityId, user } = useAuth();
  const [loading, setLoading] = useState(true);

  // Business Performance metrics
  const [totalReceitas, setTotalReceitas] = useState(0);
  const [totalDespesas, setTotalDespesas] = useState(0);
  const [lucroLiquido, setLucroLiquido] = useState(0);
  const [proLaboreRetirado, setProLaboreRetirado] = useState(0);
  const [dasPago, setDasPago] = useState(0);

  // Monthly trends (last 6 months)
  const [monthlyTrends, setMonthlyTrends] = useState<MonthComparison[]>([]);
  const [topExpenses, setTopExpenses] = useState<CategoryBreakdown[]>([]);

  // Pró-labore modal
  const [isWithdrawalModalOpen, setIsWithdrawalModalOpen] = useState(false);
  const [withdrawalAmount, setWithdrawalAmount] = useState('');
  const [withdrawalDate, setWithdrawalDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [withdrawalDesc, setWithdrawalDesc] = useState('Retirada de Pró-Labore');
  const [submittingWithdrawal, setSubmittingWithdrawal] = useState(false);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Fetch dashboard/summary
      const summaryRes = await api.get('/dashboard', {
        params: activeEntityId ? { entityId: activeEntityId } : undefined,
      });

      const data = summaryRes.data;
      const rec = data.totalReceitas || 0;
      const desp = data.totalDespesas || 0;
      setTotalReceitas(rec);
      setTotalDespesas(desp);
      setLucroLiquido(rec - desp);

      // 2. Fetch DAS totals if MEI
      try {
        const dasRes = await api.get('/das', {
          params: activeEntityId ? { entityId: activeEntityId } : undefined,
        });
        setDasPago(parseFloat(dasRes.data.totais.pago) || 0);
      } catch {
        // Ignored if not MEI
      }

      // 3. Fetch past 6 months of transactions to build trend bars
      const now = new Date();
      const monthPromises = [];

      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const monthIso = `${y}-${m}`;
        const lastDay = new Date(y, d.getMonth() + 1, 0).getDate();
        const startDate = `${monthIso}-01`;
        const endDate = `${monthIso}-${String(lastDay).padStart(2, '0')}`;
        const monthName = d.toLocaleDateString('pt-BR', { month: 'short' });

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
              const resSummary = res.data.resumo || { totalEntradas: 0, totalDespesas: 0 };
              return {
                monthName: monthName.replace('.', ''),
                monthIso,
                receita: resSummary.totalEntradas,
                despesa: resSummary.totalDespesas,
              };
            })
            .catch(() => ({
              monthName: monthName.replace('.', ''),
              monthIso,
              receita: 0,
              despesa: 0,
            }))
        );
      }

      const trendResults = await Promise.all(monthPromises);
      setMonthlyTrends(trendResults);

      // 4. Fetch transactions to compute category breakdown and pró-labore
      const allTxRes = await api.get('/transactions', {
        params: {
          pageSize: 100,
          type: 'despesa',
          ...(activeEntityId ? { entityId: activeEntityId } : {}),
        },
      });

      const txItems = allTxRes.data.items || [];
      const catTotals: Record<string, number> = {};
      let totalExpenseSum = 0;
      let ownerWithdrawals = 0;

      for (const tx of txItems) {
        const amt = parseFloat(tx.amount) || 0;
        totalExpenseSum += amt;
        const catName = tx.category?.name || 'Outras Despesas';
        catTotals[catName] = (catTotals[catName] || 0) + amt;

        if (
          tx.category?.slug === 'pro-labore' ||
          tx.description?.toLowerCase().includes('pró-labore') ||
          tx.description?.toLowerCase().includes('retirada')
        ) {
          ownerWithdrawals += amt;
        }
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
    }
  }, [activeEntityId]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const formatCurrency = (val: number | string) => {
    const num = typeof val === 'string' ? parseFloat(val) : val;
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(num || 0);
  };

  const handleCreateWithdrawal = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanAmount = withdrawalAmount.replace(',', '.').trim();
    if (!cleanAmount || isNaN(Number(cleanAmount)) || Number(cleanAmount) <= 0) {
      alert('Informe um valor válido.');
      return;
    }

    setSubmittingWithdrawal(true);
    try {
      await api.post('/owner-withdrawals', {
        amount: Number(cleanAmount).toFixed(2),
        withdrawalDate,
        description: withdrawalDesc.trim(),
      });
      setIsWithdrawalModalOpen(false);
      setWithdrawalAmount('');
      fetchReports();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Falha ao registrar retirada de pró-labore.');
    } finally {
      setSubmittingWithdrawal(false);
    }
  };

  // Find max value in monthly trends for chart scaling
  const maxMonthly = Math.max(
    ...monthlyTrends.map((t) => Math.max(t.receita, t.despesa)),
    1000
  );

  const profitRatio = totalReceitas > 0 ? Math.max(0, (lucroLiquido / totalReceitas) * 100) : 0;
  const expenseRatio = totalReceitas > 0 ? Math.min(100, (totalDespesas / totalReceitas) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-ink flex items-center gap-2">
              <span className="material-symbols-outlined text-brand text-3xl">analytics</span>
              Relatórios Financeiros
            </h1>
            <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-primary/10 text-brand border border-primary/20 uppercase tracking-wider">
              {user?.accountType === 'mei' ? 'Perfil MEI' : 'Perfil PF'}
            </span>
          </div>
          <p className="text-xs md:text-sm text-ink-soft mt-1">
            Visão aprofundada de receitas, lucratividade real e evolução do seu negócio.
          </p>
        </div>

        <button
          onClick={() => setIsWithdrawalModalOpen(true)}
          className="inline-flex items-center gap-2 bg-primary hover:bg-primary-soft text-on-primary font-bold text-xs md:text-sm px-4 py-3 rounded-2xl shadow-[0_0_20px_rgba(242,201,76,0.25)] transition self-start sm:self-auto"
        >
          <span className="material-symbols-outlined text-lg font-bold">payments</span>
          Retirar Pró-Labore
        </button>
      </div>

      {loading ? (
        <div className="bg-card border border-ink/5 rounded-3xl p-12 text-center text-muted flex flex-col items-center justify-center gap-2">
          <span className="material-symbols-outlined text-3xl animate-spin text-brand">sync</span>
          <p className="text-sm font-semibold">Gerando relatórios e análises...</p>
        </div>
      ) : (
        <>
          {/* 1. Desempenho Empresarial Hero Card */}
          <section className="bg-card border border-ink/5 rounded-3xl p-6 md:p-8 shadow-xl relative overflow-hidden">
            <div className="absolute -top-10 -right-10 w-44 h-44 bg-primary/5 rounded-full blur-3xl pointer-events-none" />

            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-2xl bg-field text-brand flex items-center justify-center">
                <span className="material-symbols-outlined text-xl">monitoring</span>
              </div>
              <h3 className="font-extrabold text-lg md:text-xl text-ink">
                Desempenho Geral do Período
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {/* Faturamento */}
              <div className="border-b sm:border-b-0 sm:border-r border-ink/5 pb-4 sm:pb-0 sm:pr-6">
                <span className="text-xs font-bold uppercase tracking-wider text-muted flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm text-success">arrow_upward</span>
                  Faturamento Total (Receitas)
                </span>
                <span className="text-2xl md:text-3xl font-extrabold text-ink mt-1 block">
                  {formatCurrency(totalReceitas)}
                </span>
              </div>

              {/* Custos Operacionais */}
              <div className="sm:pl-2">
                <span className="text-xs font-bold uppercase tracking-wider text-muted flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm text-danger">arrow_downward</span>
                  Custos & Despesas Operacionais
                </span>
                <span className="text-2xl md:text-3xl font-extrabold text-ink mt-1 block">
                  {formatCurrency(totalDespesas)}
                </span>
              </div>
            </div>

            {/* Lucro Líquido Box */}
            <div className="mt-6 pt-6 border-t border-ink/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-canvas p-5 rounded-2xl border border-ink/4">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-muted block">
                  Lucro Líquido Real
                </span>
                <span
                  className={`text-2xl md:text-3xl font-extrabold mt-0.5 block ${
                    lucroLiquido >= 0 ? 'text-success' : 'text-danger'
                  }`}
                >
                  {formatCurrency(lucroLiquido)}
                </span>
              </div>

              <div className="text-right text-xs text-muted">
                <span>Margem Líquida: </span>
                <strong className="text-ink font-bold">{profitRatio.toFixed(1)}%</strong>
              </div>
            </div>

            {/* Visual ratio bar */}
            <div className="mt-4 space-y-1">
              <div className="w-full h-2.5 bg-card-2 rounded-full overflow-hidden flex">
                <div
                  className="h-full bg-success transition-all duration-500"
                  style={{ width: `${profitRatio}%` }}
                  title={`Lucro: ${profitRatio.toFixed(1)}%`}
                />
                <div
                  className="h-full bg-danger transition-all duration-500"
                  style={{ width: `${expenseRatio}%` }}
                  title={`Custos: ${expenseRatio.toFixed(1)}%`}
                />
              </div>
              <div className="flex justify-between text-[10px] text-muted">
                <span className="text-success">● Lucro Líquido ({profitRatio.toFixed(0)}%)</span>
                <span className="text-danger">● Despesas ({expenseRatio.toFixed(0)}%)</span>
              </div>
            </div>
          </section>

          {/* 2. Receita vs Despesa Monthly Bar Chart */}
          <section className="bg-card border border-ink/5 rounded-3xl p-6 md:p-8 shadow-xl">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="font-extrabold text-lg text-ink">Receita vs Despesa</h3>
                <p className="text-xs text-muted">Histórico comparativo dos últimos 6 meses</p>
              </div>
              <div className="flex items-center gap-4 text-xs font-semibold">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-success" />
                  <span className="text-ink-soft">Receitas</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-danger" />
                  <span className="text-ink-soft">Despesas</span>
                </div>
              </div>
            </div>

            {/* Chart Area */}
            <div className="h-56 w-full flex items-end justify-between gap-3 sm:gap-6 px-2 pt-6 pb-2 border-b border-ink/5">
              {monthlyTrends.map((trend, idx) => {
                const recHeight = maxMonthly > 0 ? (trend.receita / maxMonthly) * 160 : 0;
                const despHeight = maxMonthly > 0 ? (trend.despesa / maxMonthly) * 160 : 0;

                return (
                  <div key={trend.monthIso || idx} className="flex-1 flex flex-col items-center gap-2">
                    <div className="w-full flex items-end justify-center gap-1.5 h-44">
                      {/* Receita bar */}
                      <div
                        className="w-1/2 max-w-[16px] bg-success rounded-t-lg transition-all duration-500 hover:opacity-80"
                        style={{ height: `${Math.max(4, recHeight)}px` }}
                        title={`Receitas: ${formatCurrency(trend.receita)}`}
                      />
                      {/* Despesa bar */}
                      <div
                        className="w-1/2 max-w-[16px] bg-danger rounded-t-lg transition-all duration-500 hover:opacity-80"
                        style={{ height: `${Math.max(4, despHeight)}px` }}
                        title={`Despesas: ${formatCurrency(trend.despesa)}`}
                      />
                    </div>
                    <span className="text-[11px] font-bold text-muted uppercase">
                      {trend.monthName}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          {/* 3. Bento Grid: Tributos (DAS) & Pró-Labore */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Tributos / DAS */}
            <section className="bg-card border border-ink/5 rounded-3xl p-6 flex flex-col justify-between shadow-lg">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-brand text-xl">
                      receipt_long
                    </span>
                    <h4 className="font-bold text-base text-ink">Tributos (DAS MEI)</h4>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-success/10 text-success border border-success/20">
                    Exercício Ativo
                  </span>
                </div>

                <div>
                  <div className="text-2xl font-extrabold text-ink">
                    {formatCurrency(dasPago)}
                  </div>
                  <p className="text-xs text-muted mt-1">
                    Total recolhido em impostos federais e previdenciários neste ano.
                  </p>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-ink/4 flex items-center justify-between text-xs text-muted">
                <span>INSS + ICMS / ISS integrados</span>
                <a href="/impostos" className="text-brand hover:underline font-bold">
                  Ver Guias DAS
                </a>
              </div>
            </section>

            {/* Pró-Labore */}
            <section className="bg-card border border-ink/5 rounded-3xl p-6 flex flex-col justify-between shadow-lg relative overflow-hidden">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-success text-xl">
                      payments
                    </span>
                    <h4 className="font-bold text-base text-ink">Pró-Labore & Retiradas</h4>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-brand border border-primary/20">
                    Remuneração
                  </span>
                </div>

                <div>
                  <div className="text-2xl font-extrabold text-ink">
                    {formatCurrency(proLaboreRetirado)}
                  </div>
                  <p className="text-xs text-muted mt-1">
                    Transferências de rendimento da conta PJ para a sua conta PF.
                  </p>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-ink/4 flex items-center justify-between text-xs text-muted">
                <span className="flex items-center gap-1 text-success">
                  <span className="material-symbols-outlined text-sm">check_circle</span>
                  Separado das contas pessoais
                </span>
                <button
                  onClick={() => setIsWithdrawalModalOpen(true)}
                  className="text-brand hover:underline font-bold"
                >
                  Nova Retirada
                </button>
              </div>
            </section>
          </div>

          {/* 4. Top Categorias de Despesas */}
          {topExpenses.length > 0 && (
            <section className="bg-card border border-ink/5 rounded-3xl p-6 shadow-xl">
              <h3 className="font-extrabold text-lg text-ink mb-4">
                Maiores Despesas por Categoria
              </h3>
              <div className="space-y-3">
                {topExpenses.map((cat) => (
                  <div key={cat.name} className="space-y-1">
                    <div className="flex justify-between text-xs font-semibold">
                      <span className="text-ink">{cat.name}</span>
                      <span className="text-ink font-bold">
                        {formatCurrency(cat.total)}{' '}
                        <span className="text-muted">({cat.percent.toFixed(1)}%)</span>
                      </span>
                    </div>
                    <div className="w-full h-2 bg-canvas rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full"
                        style={{ width: `${Math.min(100, cat.percent)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {/* Modal: Retirada de Pró-Labore */}
      {isWithdrawalModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-sm">
          <div className="bg-card border border-ink/8 rounded-3xl w-full max-w-md p-6 shadow-2xl relative">
            <button
              onClick={() => setIsWithdrawalModalOpen(false)}
              className="absolute top-6 right-6 text-muted hover:text-ink p-1 rounded-full hover:bg-field transition"
            >
              <span className="material-symbols-outlined text-xl">close</span>
            </button>

            <h3 className="text-xl font-extrabold text-ink mb-1">Retirada de Pró-Labore</h3>
            <p className="text-xs text-muted mb-5">
              Registra uma despesa de transferência na PJ e uma receita de pró-labore na PF.
            </p>

            <form onSubmit={handleCreateWithdrawal} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-muted uppercase tracking-wider block mb-1">
                  Valor da Retirada (R$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="Ex: 3500.00"
                  value={withdrawalAmount}
                  onChange={(e) => setWithdrawalAmount(e.target.value)}
                  required
                  className="w-full bg-canvas text-sm text-ink rounded-xl px-3.5 py-2.5 border border-ink/5 focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-muted uppercase tracking-wider block mb-1">
                  Data da Retirada
                </label>
                <input
                  type="date"
                  value={withdrawalDate}
                  onChange={(e) => setWithdrawalDate(e.target.value)}
                  required
                  className="w-full bg-canvas text-sm text-ink rounded-xl px-3.5 py-2.5 border border-ink/5 focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-muted uppercase tracking-wider block mb-1">
                  Descrição
                </label>
                <input
                  type="text"
                  value={withdrawalDesc}
                  onChange={(e) => setWithdrawalDesc(e.target.value)}
                  required
                  className="w-full bg-canvas text-sm text-ink rounded-xl px-3.5 py-2.5 border border-ink/5 focus:outline-none focus:border-primary"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-ink/5">
                <button
                  type="button"
                  onClick={() => setIsWithdrawalModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-muted hover:bg-field transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submittingWithdrawal}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-primary hover:bg-primary-soft text-on-primary transition disabled:opacity-50"
                >
                  {submittingWithdrawal ? 'Processando...' : 'Confirmar Retirada'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportsPage;
