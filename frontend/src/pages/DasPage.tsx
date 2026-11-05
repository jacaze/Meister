import React, { useEffect, useState, useCallback } from 'react';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';

interface MeiLimitData {
  ano: number;
  limite: string;
  limiteComTolerancia: string;
  mesesAtividade: number;
  proporcional: boolean;
  faturamentoAno: string;
  percentualUtilizado: number;
  restante: string;
  status: 'seguro' | 'alerta_80' | 'estourou_100' | 'estourou_120';
  perfilIncompleto: boolean;
  parametrosEstimados: boolean;
}

interface DasItem {
  id: string;
  entityId: string;
  competence: string;
  dueDate: string;
  amount: string;
  status: 'pago' | 'pendente' | 'atrasado';
  paidOn: string | null;
  paidAmount: string | null;
}

interface DasResponse {
  items: DasItem[];
  totais: {
    pago: string;
    pendente: string;
    atrasado: string;
  };
  pgmeiUrl: string;
}

export const DasPage: React.FC = () => {
  const { workspace, activeEntityId } = useAuth();
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear());
  const [limitData, setLimitData] = useState<MeiLimitData | null>(null);
  const [dasData, setDasData] = useState<DasResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // Pay modal state
  const [payingDas, setPayingDas] = useState<DasItem | null>(null);
  const [payDate, setPayDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [payAmount, setPayAmount] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [copiedPix, setCopiedPix] = useState(false);

  const targetEntity =
    workspace?.entities.find((e) => e.id === activeEntityId && e.kind === 'pj') ||
    workspace?.entities.find((e) => e.kind === 'pj');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        entityId: targetEntity?.id,
        year: selectedYear,
      };

      const [limitRes, dasRes] = await Promise.all([
        api.get('/mei/limit', { params }).catch(() => ({ data: null })),
        api.get('/das', { params }).catch(() => ({ data: null })),
      ]);

      setLimitData(limitRes.data);
      setDasData(dasRes.data);
    } catch (err) {
      console.error('Erro ao buscar dados fiscais:', err);
    } finally {
      setLoading(false);
    }
  }, [targetEntity?.id, selectedYear]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const formatCurrency = (val: number | string | null | undefined) => {
    if (val === null || val === undefined) return 'R$ 0,00';
    const num = typeof val === 'string' ? parseFloat(val) : val;
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(num || 0);
  };

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return '-';
    const cleanDate = dateStr.slice(0, 10);
    const [year, month, day] = cleanDate.split('-');
    return `${day}/${month}/${year}`;
  };

  const formatCompetence = (competence: string) => {
    const [y, m] = competence.split('-').map(Number);
    const date = new Date(y, m - 1, 1);
    return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  };

  const formatCnpj = (cnpj?: string | null) => {
    if (!cnpj) return 'Não cadastrado';
    const digits = cnpj.replace(/\D/g, '');
    if (digits.length !== 14) return cnpj;
    return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  };

  const handleOpenPayModal = (item: DasItem) => {
    setPayingDas(item);
    setPayDate(new Date().toISOString().slice(0, 10));
    setPayAmount(item.amount);
  };

  const handleConfirmPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payingDas) return;
    setActionLoading(true);
    try {
      await api.post(`/das/${payingDas.id}/pay`, {
        paidOn: payDate,
        paidAmount: payAmount ? Number(payAmount).toFixed(2) : undefined,
      });
      setPayingDas(null);
      fetchData();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Falha ao registrar pagamento do DAS.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUnmarkPayment = async (id: string) => {
    if (!window.confirm('Deseja desmarcar este DAS como pago?')) return;
    setActionLoading(true);
    try {
      await api.delete(`/das/${id}/pay`);
      fetchData();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Falha ao desmarcar pagamento.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCopyPix = () => {
    // Generate Pix Code for MEI
    const pixSample = `00020126580014BR.GOV.BCB.PIX0136receita-pgmei-${payingDas?.id || 'mei'}5204000053039865405${
      nextPending?.amount || '86.05'
    }5802BR5925RECEITA FEDERAL DO BRASIL6009BRASILIA62070503***6304E1D2`;
    navigator.clipboard.writeText(pixSample);
    setCopiedPix(true);
    setTimeout(() => setCopiedPix(false), 3000);
  };

  // Find next pending or overdue DAS
  const nextPending = dasData?.items.find((item) => item.status === 'pendente' || item.status === 'atrasado');

  const getLimitBarColor = (band?: string) => {
    switch (band) {
      case 'seguro':
        return 'bg-success';
      case 'alerta_80':
        return 'bg-primary';
      case 'estourou_100':
      case 'estourou_120':
        return 'bg-danger';
      default:
        return 'bg-success';
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-ink flex items-center gap-2">
            <span className="material-symbols-outlined text-brand text-3xl">account_balance</span>
            Impostos & DAS MEI
          </h1>
          <p className="text-xs md:text-sm text-ink-soft mt-1">
            Controle fiscal do Simples Nacional MEI, guia mensal e termômetro do limite de faturamento.
          </p>
        </div>

        {/* Year Selector */}
        <div className="flex items-center gap-2 bg-card border border-ink/5 rounded-2xl p-1.5 self-start sm:self-auto">
          <button
            onClick={() => setSelectedYear((y) => y - 1)}
            className="p-1.5 text-muted hover:text-ink hover:bg-field rounded-xl transition"
          >
            <span className="material-symbols-outlined text-lg">chevron_left</span>
          </button>
          <span className="px-3 text-xs md:text-sm font-bold text-ink min-w-[70px] text-center">
            {selectedYear}
          </span>
          <button
            onClick={() => setSelectedYear((y) => y + 1)}
            className="p-1.5 text-muted hover:text-ink hover:bg-field rounded-xl transition"
          >
            <span className="material-symbols-outlined text-lg">chevron_right</span>
          </button>
        </div>
      </div>

      {/* MEI Company Header Info */}
      <section className="bg-card border border-ink/5 rounded-3xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-lg">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-brand shrink-0">
            <span className="material-symbols-outlined text-2xl">storefront</span>
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-ink">
              {targetEntity?.name || 'Sua Empresa MEI'}
            </h2>
            <p className="text-xs text-muted mt-0.5">
              CNPJ: {formatCnpj(targetEntity?.cnpj)} • Atividade:{' '}
              <span className="capitalize text-ink-soft font-semibold">
                {targetEntity?.activity || 'Serviços'}
              </span>
            </p>
          </div>
        </div>

        <a
          href={dasData?.pgmeiUrl || 'https://www8.receita.fazenda.gov.br/'}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 bg-field hover:bg-raised text-ink text-xs font-bold px-4 py-2.5 rounded-xl border border-ink/8 transition self-start sm:self-auto"
        >
          <span className="material-symbols-outlined text-base text-brand">open_in_new</span>
          Portal PGMEI Oficial
        </a>
      </section>

      {/* MEI Thermometer Limit Card */}
      {limitData && (
        <section className="bg-gradient-to-br from-card to-card-2 border border-ink/5 rounded-3xl p-6 md:p-8 shadow-xl relative overflow-hidden">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-2 max-w-xl">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-muted">
                  Termômetro de Limite MEI ({limitData.ano})
                </span>
                {limitData.proporcional && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-brand border border-primary/20">
                    Proporcional ({limitData.mesesAtividade} meses)
                  </span>
                )}
              </div>

              <div className="text-3xl md:text-4xl font-extrabold text-ink">
                {formatCurrency(limitData.faturamentoAno)}
                <span className="text-sm md:text-base font-normal text-muted ml-2">
                  / {formatCurrency(limitData.limite)}
                </span>
              </div>

              <p className="text-xs text-muted">
                {limitData.status === 'seguro' && (
                  <span className="text-success font-semibold flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm">verified</span>
                    Faturamento dentro da faixa segura. Restam {formatCurrency(limitData.restante)} para o limite anual.
                  </span>
                )}
                {limitData.status === 'alerta_80' && (
                  <span className="text-brand font-semibold flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm">warning</span>
                    Atenção: Mais de 80% do limite atingido! Planeje uma transição para ME se o ritmo continuar.
                  </span>
                )}
                {(limitData.status === 'estourou_100' || limitData.status === 'estourou_120') && (
                  <span className="text-danger font-semibold flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm">error</span>
                    Limite do MEI excedido ({limitData.percentualUtilizado.toFixed(1)}%). O desenquadramento é obrigatório.
                  </span>
                )}
              </p>
            </div>

            {/* Percentage Circle / Badge */}
            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="text-2xl font-extrabold text-ink">
                  {limitData.percentualUtilizado.toFixed(1)}%
                </div>
                <span className="text-[11px] text-muted uppercase font-bold tracking-wider">
                  Utilizado
                </span>
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mt-6 space-y-2">
            <div className="w-full h-3 bg-canvas rounded-full overflow-hidden p-0.5 border border-ink/4">
              <div
                className={`h-full ${getLimitBarColor(limitData.status)} rounded-full transition-all duration-700`}
                style={{ width: `${Math.min(100, limitData.percentualUtilizado)}%` }}
              />
            </div>
            <div className="flex justify-between text-[11px] text-muted">
              <span>R$ 0,00</span>
              <span className="text-brand font-bold">80% Alerta</span>
              <span>100% {formatCurrency(limitData.limite)}</span>
            </div>
          </div>
        </section>
      )}

      {/* Highlights: Current/Next DAS & Totals */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Next Pending DAS Hero Card */}
        <div className="lg:col-span-2 bg-card border border-ink/5 rounded-3xl p-6 md:p-8 flex flex-col justify-between shadow-lg relative overflow-hidden">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-muted">
                DAS MEI - Próximo Vencimento
              </span>
              {nextPending ? (
                <span
                  className={`text-[11px] font-bold px-3 py-1 rounded-full border ${
                    nextPending.status === 'atrasado'
                      ? 'bg-danger/10 text-danger border-danger/30'
                      : 'bg-primary/10 text-brand border-primary/30'
                  }`}
                >
                  {nextPending.status === 'atrasado' ? 'Vencido' : 'Pendente'}
                </span>
              ) : (
                <span className="text-[11px] font-bold px-3 py-1 rounded-full bg-success/10 text-success border border-success/30">
                  Tudo em Dia
                </span>
              )}
            </div>

            {nextPending ? (
              <div>
                <div className="text-3xl md:text-4xl font-extrabold text-ink">
                  {formatCurrency(nextPending.amount)}
                </div>
                <p className="text-xs text-muted mt-1">
                  Competência: <strong>{formatCompetence(nextPending.competence)}</strong> •
                  Vencimento: <strong className="text-ink">{formatDate(nextPending.dueDate)}</strong>
                </p>
              </div>
            ) : (
              <div>
                <div className="text-2xl font-extrabold text-ink">Nenhuma guia pendente!</div>
                <p className="text-xs text-muted mt-1">
                  Todos os tributos do ano {selectedYear} já foram liquidados ou estão em dia.
                </p>
              </div>
            )}
          </div>

          {nextPending && (
            <div className="pt-6 border-t border-ink/5 flex flex-wrap items-center gap-3 mt-6">
              <button
                onClick={() => handleOpenPayModal(nextPending)}
                className="bg-primary hover:bg-primary-soft text-on-primary font-bold text-xs md:text-sm px-5 py-3 rounded-2xl shadow-[0_0_20px_rgba(242,201,76,0.25)] transition flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-lg">check_circle</span>
                Marcar como Pago
              </button>
              <button
                onClick={handleCopyPix}
                className="bg-field hover:bg-raised text-ink font-bold text-xs md:text-sm px-4 py-3 rounded-2xl border border-ink/8 transition flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-lg text-brand">
                  {copiedPix ? 'done' : 'content_copy'}
                </span>
                {copiedPix ? 'Chave Copiada!' : 'Copiar Pix Copia-e-Cola'}
              </button>
            </div>
          )}
        </div>

        {/* Totals Summary Column */}
        <div className="space-y-4 flex flex-col justify-between">
          {/* Pago */}
          <div className="bg-card border border-ink/5 rounded-2xl p-4 flex items-center justify-between shadow-lg">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted block">
                Total Pago em {selectedYear}
              </span>
              <span className="text-xl font-extrabold text-success mt-1 block">
                {formatCurrency(dasData?.totais.pago)}
              </span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-success/10 text-success flex items-center justify-center">
              <span className="material-symbols-outlined text-xl">check</span>
            </div>
          </div>

          {/* Pendente */}
          <div className="bg-card border border-ink/5 rounded-2xl p-4 flex items-center justify-between shadow-lg">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted block">
                Total Pendente
              </span>
              <span className="text-xl font-extrabold text-brand mt-1 block">
                {formatCurrency(dasData?.totais.pendente)}
              </span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-brand flex items-center justify-center">
              <span className="material-symbols-outlined text-xl">schedule</span>
            </div>
          </div>

          {/* Atrasado */}
          <div className="bg-card border border-ink/5 rounded-2xl p-4 flex items-center justify-between shadow-lg">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted block">
                Total Vencido / Atrasado
              </span>
              <span className="text-xl font-extrabold text-danger mt-1 block">
                {formatCurrency(dasData?.totais.atrasado)}
              </span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-danger/10 text-danger flex items-center justify-center">
              <span className="material-symbols-outlined text-xl">priority_high</span>
            </div>
          </div>
        </div>
      </div>

      {/* Full Monthly DAS Table */}
      <section className="bg-card border border-ink/5 rounded-3xl overflow-hidden shadow-lg">
        <div className="p-6 border-b border-ink/4 flex items-center justify-between">
          <h3 className="font-bold text-lg text-ink">Guias Mensais do Exercício {selectedYear}</h3>
          <span className="text-xs text-muted">
            {dasData?.items.length || 0} competências geradas
          </span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-muted flex flex-col items-center justify-center gap-2">
            <span className="material-symbols-outlined text-3xl animate-spin text-brand">
              sync
            </span>
            <p className="text-sm font-semibold">Carregando guias...</p>
          </div>
        ) : !dasData || dasData.items.length === 0 ? (
          <div className="p-12 text-center text-muted">
            <p>Nenhuma guia DAS encontrada para este ano.</p>
          </div>
        ) : (
          <div className="divide-y divide-ink/4">
            {dasData.items.map((item) => {
              const isPago = item.status === 'pago';
              const isAtrasado = item.status === 'atrasado';

              return (
                <div
                  key={item.id}
                  className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-card-2/50 transition"
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border ${
                        isPago
                          ? 'bg-success/10 border-success/20 text-success'
                          : isAtrasado
                          ? 'bg-danger/10 border-danger/20 text-danger'
                          : 'bg-primary/10 border-primary/20 text-brand'
                      }`}
                    >
                      <span className="material-symbols-outlined text-xl">
                        {isPago ? 'check' : isAtrasado ? 'warning' : 'receipt'}
                      </span>
                    </div>

                    <div>
                      <h4 className="font-bold text-sm sm:text-base text-ink capitalize">
                        {formatCompetence(item.competence)}
                      </h4>
                      <p className="text-xs text-muted mt-0.5">
                        Vencimento: <span className="text-ink">{formatDate(item.dueDate)}</span>
                        {item.paidOn && (
                          <span className="text-success ml-2">
                            • Pago em {formatDate(item.paidOn)}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-4">
                    <div className="text-right">
                      <div className="font-extrabold text-base sm:text-lg text-ink">
                        {formatCurrency(item.paidAmount || item.amount)}
                      </div>
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider block ${
                          isPago
                            ? 'text-success'
                            : isAtrasado
                            ? 'text-danger'
                            : 'text-brand'
                        }`}
                      >
                        {isPago ? 'Pago' : isAtrasado ? 'Atrasado' : 'Pendente'}
                      </span>
                    </div>

                    <div>
                      {isPago ? (
                        <button
                          onClick={() => handleUnmarkPayment(item.id)}
                          disabled={actionLoading}
                          title="Desmarcar pagamento"
                          className="px-3 py-1.5 rounded-xl text-xs font-semibold text-muted hover:text-danger hover:bg-field transition border border-ink/5"
                        >
                          Desfazer
                        </button>
                      ) : (
                        <button
                          onClick={() => handleOpenPayModal(item)}
                          disabled={actionLoading}
                          className="px-4 py-2 rounded-xl text-xs font-bold bg-primary hover:bg-primary-soft text-on-primary transition shadow-sm"
                        >
                          Pagar
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* MEI Obligations Bento Cards */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* DASN-SIMEI */}
        <div className="bg-card border border-ink/5 rounded-2xl p-5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="material-symbols-outlined text-brand text-2xl">description</span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-success/10 text-success border border-success/20">
              Anual
            </span>
          </div>
          <h4 className="font-bold text-base text-ink">Declaração Anual (DASN)</h4>
          <p className="text-xs text-muted">
            Entregue até o último dia útil de maio de cada ano via portal do Empreendedor.
          </p>
        </div>

        {/* Regularidade Fiscal */}
        <div className="bg-card border border-ink/5 rounded-2xl p-5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="material-symbols-outlined text-success text-2xl">verified_user</span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-success/10 text-success border border-success/20">
              Certidão Negativa
            </span>
          </div>
          <h4 className="font-bold text-base text-ink">Regularidade Fiscal</h4>
          <p className="text-xs text-muted">
            Mantenha suas guias DAS quitadas para garantir emissão de CND e benefícios do INSS.
          </p>
        </div>

        {/* Relatório Mensal de Receitas */}
        <div className="bg-card border border-ink/5 rounded-2xl p-5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="material-symbols-outlined text-brand text-2xl">folder_shared</span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-primary/10 text-brand border border-primary/20">
              Mensal
            </span>
          </div>
          <h4 className="font-bold text-base text-ink">Relatório Mensal de Receitas</h4>
          <p className="text-xs text-muted">
            Preencha até o dia 20 de cada mês com as notas fiscais anexadas para arquivo próprio.
          </p>
        </div>
      </section>

      {/* Pay Modal */}
      {payingDas && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-sm">
          <div className="bg-card border border-ink/8 rounded-3xl w-full max-w-md p-6 shadow-2xl relative">
            <button
              onClick={() => setPayingDas(null)}
              className="absolute top-6 right-6 text-muted hover:text-ink p-1 rounded-full hover:bg-field transition"
            >
              <span className="material-symbols-outlined text-xl">close</span>
            </button>

            <h3 className="text-xl font-extrabold text-ink mb-1">Registrar Pagamento de DAS</h3>
            <p className="text-xs text-muted mb-5">
              Competência: <strong>{formatCompetence(payingDas.competence)}</strong>
            </p>

            <form onSubmit={handleConfirmPayment} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-muted uppercase tracking-wider block mb-1">
                  Data do Pagamento
                </label>
                <input
                  type="date"
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                  required
                  className="w-full bg-canvas text-sm text-ink rounded-xl px-3.5 py-2.5 border border-ink/5 focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-muted uppercase tracking-wider block mb-1">
                  Valor Pago (R$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  required
                  className="w-full bg-canvas text-sm text-ink rounded-xl px-3.5 py-2.5 border border-ink/5 focus:outline-none focus:border-primary"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-ink/5">
                <button
                  type="button"
                  onClick={() => setPayingDas(null)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-muted hover:bg-field transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-primary hover:bg-primary-soft text-on-primary transition disabled:opacity-50"
                >
                  {actionLoading ? 'Gravando...' : 'Confirmar Pagamento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default DasPage;
