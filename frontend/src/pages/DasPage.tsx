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
        return 'bg-[#27ae60]';
      case 'alerta_80':
        return 'bg-[#f2c94c]';
      case 'estourou_100':
      case 'estourou_120':
        return 'bg-[#eb5757]';
      default:
        return 'bg-[#27ae60]';
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
            <span className="material-symbols-outlined text-[#f2c94c] text-3xl">account_balance</span>
            Impostos & DAS MEI
          </h1>
          <p className="text-xs md:text-sm text-[#d0c5af] mt-1">
            Controle fiscal do Simples Nacional MEI, guia mensal e termômetro do limite de faturamento.
          </p>
        </div>

        {/* Year Selector */}
        <div className="flex items-center gap-2 bg-[#1c1b1b] border border-[#ffffff0d] rounded-2xl p-1.5 self-start sm:self-auto">
          <button
            onClick={() => setSelectedYear((y) => y - 1)}
            className="p-1.5 text-[#99907b] hover:text-white hover:bg-[#2a2a2a] rounded-xl transition"
          >
            <span className="material-symbols-outlined text-lg">chevron_left</span>
          </button>
          <span className="px-3 text-xs md:text-sm font-bold text-white min-w-[70px] text-center">
            {selectedYear}
          </span>
          <button
            onClick={() => setSelectedYear((y) => y + 1)}
            className="p-1.5 text-[#99907b] hover:text-white hover:bg-[#2a2a2a] rounded-xl transition"
          >
            <span className="material-symbols-outlined text-lg">chevron_right</span>
          </button>
        </div>
      </div>

      {/* MEI Company Header Info */}
      <section className="bg-[#1c1b1b] border border-[#ffffff0d] rounded-3xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-lg">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-[#f2c94c]/10 border border-[#f2c94c]/20 flex items-center justify-center text-[#f2c94c] shrink-0">
            <span className="material-symbols-outlined text-2xl">storefront</span>
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-white">
              {targetEntity?.name || 'Sua Empresa MEI'}
            </h2>
            <p className="text-xs text-[#99907b] mt-0.5">
              CNPJ: {formatCnpj(targetEntity?.cnpj)} • Atividade:{' '}
              <span className="capitalize text-[#d0c5af] font-semibold">
                {targetEntity?.activity || 'Serviços'}
              </span>
            </p>
          </div>
        </div>

        <a
          href={dasData?.pgmeiUrl || 'https://www8.receita.fazenda.gov.br/'}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 bg-[#2a2a2a] hover:bg-[#353534] text-white text-xs font-bold px-4 py-2.5 rounded-xl border border-[#ffffff14] transition self-start sm:self-auto"
        >
          <span className="material-symbols-outlined text-base text-[#f2c94c]">open_in_new</span>
          Portal PGMEI Oficial
        </a>
      </section>

      {/* MEI Thermometer Limit Card */}
      {limitData && (
        <section className="bg-gradient-to-br from-[#1c1b1b] to-[#201f1f] border border-[#ffffff0d] rounded-3xl p-6 md:p-8 shadow-xl relative overflow-hidden">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-2 max-w-xl">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[#99907b]">
                  Termômetro de Limite MEI ({limitData.ano})
                </span>
                {limitData.proporcional && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#f2c94c]/10 text-[#f2c94c] border border-[#f2c94c]/20">
                    Proporcional ({limitData.mesesAtividade} meses)
                  </span>
                )}
              </div>

              <div className="text-3xl md:text-4xl font-extrabold text-white">
                {formatCurrency(limitData.faturamentoAno)}
                <span className="text-sm md:text-base font-normal text-[#99907b] ml-2">
                  / {formatCurrency(limitData.limite)}
                </span>
              </div>

              <p className="text-xs text-[#99907b]">
                {limitData.status === 'seguro' && (
                  <span className="text-[#27ae60] font-semibold flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm">verified</span>
                    Faturamento dentro da faixa segura. Restam {formatCurrency(limitData.restante)} para o limite anual.
                  </span>
                )}
                {limitData.status === 'alerta_80' && (
                  <span className="text-[#f2c94c] font-semibold flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm">warning</span>
                    Atenção: Mais de 80% do limite atingido! Planeje uma transição para ME se o ritmo continuar.
                  </span>
                )}
                {(limitData.status === 'estourou_100' || limitData.status === 'estourou_120') && (
                  <span className="text-[#eb5757] font-semibold flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm">error</span>
                    Limite do MEI excedido ({limitData.percentualUtilizado.toFixed(1)}%). O desenquadramento é obrigatório.
                  </span>
                )}
              </p>
            </div>

            {/* Percentage Circle / Badge */}
            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="text-2xl font-extrabold text-white">
                  {limitData.percentualUtilizado.toFixed(1)}%
                </div>
                <span className="text-[11px] text-[#99907b] uppercase font-bold tracking-wider">
                  Utilizado
                </span>
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mt-6 space-y-2">
            <div className="w-full h-3 bg-[#131313] rounded-full overflow-hidden p-0.5 border border-[#ffffff08]">
              <div
                className={`h-full ${getLimitBarColor(limitData.status)} rounded-full transition-all duration-700`}
                style={{ width: `${Math.min(100, limitData.percentualUtilizado)}%` }}
              />
            </div>
            <div className="flex justify-between text-[11px] text-[#99907b]">
              <span>R$ 0,00</span>
              <span className="text-[#f2c94c] font-bold">80% Alerta</span>
              <span>100% {formatCurrency(limitData.limite)}</span>
            </div>
          </div>
        </section>
      )}

      {/* Highlights: Current/Next DAS & Totals */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Next Pending DAS Hero Card */}
        <div className="lg:col-span-2 bg-[#1c1b1b] border border-[#ffffff0d] rounded-3xl p-6 md:p-8 flex flex-col justify-between shadow-lg relative overflow-hidden">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-[#99907b]">
                DAS MEI - Próximo Vencimento
              </span>
              {nextPending ? (
                <span
                  className={`text-[11px] font-bold px-3 py-1 rounded-full border ${
                    nextPending.status === 'atrasado'
                      ? 'bg-[#eb5757]/10 text-[#eb5757] border-[#eb5757]/30'
                      : 'bg-[#f2c94c]/10 text-[#f2c94c] border-[#f2c94c]/30'
                  }`}
                >
                  {nextPending.status === 'atrasado' ? 'Vencido' : 'Pendente'}
                </span>
              ) : (
                <span className="text-[11px] font-bold px-3 py-1 rounded-full bg-[#27ae60]/10 text-[#27ae60] border border-[#27ae60]/30">
                  Tudo em Dia
                </span>
              )}
            </div>

            {nextPending ? (
              <div>
                <div className="text-3xl md:text-4xl font-extrabold text-white">
                  {formatCurrency(nextPending.amount)}
                </div>
                <p className="text-xs text-[#99907b] mt-1">
                  Competência: <strong>{formatCompetence(nextPending.competence)}</strong> •
                  Vencimento: <strong className="text-white">{formatDate(nextPending.dueDate)}</strong>
                </p>
              </div>
            ) : (
              <div>
                <div className="text-2xl font-extrabold text-white">Nenhuma guia pendente!</div>
                <p className="text-xs text-[#99907b] mt-1">
                  Todos os tributos do ano {selectedYear} já foram liquidados ou estão em dia.
                </p>
              </div>
            )}
          </div>

          {nextPending && (
            <div className="pt-6 border-t border-[#ffffff0d] flex flex-wrap items-center gap-3 mt-6">
              <button
                onClick={() => handleOpenPayModal(nextPending)}
                className="bg-[#f2c94c] hover:bg-[#ffe8ad] text-[#131313] font-bold text-xs md:text-sm px-5 py-3 rounded-2xl shadow-[0_0_20px_rgba(242,201,76,0.25)] transition flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-lg">check_circle</span>
                Marcar como Pago
              </button>
              <button
                onClick={handleCopyPix}
                className="bg-[#2a2a2a] hover:bg-[#353534] text-white font-bold text-xs md:text-sm px-4 py-3 rounded-2xl border border-[#ffffff14] transition flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-lg text-[#f2c94c]">
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
          <div className="bg-[#1c1b1b] border border-[#ffffff0d] rounded-2xl p-4 flex items-center justify-between shadow-lg">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#99907b] block">
                Total Pago em {selectedYear}
              </span>
              <span className="text-xl font-extrabold text-[#27ae60] mt-1 block">
                {formatCurrency(dasData?.totais.pago)}
              </span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-[#27ae60]/10 text-[#27ae60] flex items-center justify-center">
              <span className="material-symbols-outlined text-xl">check</span>
            </div>
          </div>

          {/* Pendente */}
          <div className="bg-[#1c1b1b] border border-[#ffffff0d] rounded-2xl p-4 flex items-center justify-between shadow-lg">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#99907b] block">
                Total Pendente
              </span>
              <span className="text-xl font-extrabold text-[#f2c94c] mt-1 block">
                {formatCurrency(dasData?.totais.pendente)}
              </span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-[#f2c94c]/10 text-[#f2c94c] flex items-center justify-center">
              <span className="material-symbols-outlined text-xl">schedule</span>
            </div>
          </div>

          {/* Atrasado */}
          <div className="bg-[#1c1b1b] border border-[#ffffff0d] rounded-2xl p-4 flex items-center justify-between shadow-lg">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#99907b] block">
                Total Vencido / Atrasado
              </span>
              <span className="text-xl font-extrabold text-[#eb5757] mt-1 block">
                {formatCurrency(dasData?.totais.atrasado)}
              </span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-[#eb5757]/10 text-[#eb5757] flex items-center justify-center">
              <span className="material-symbols-outlined text-xl">priority_high</span>
            </div>
          </div>
        </div>
      </div>

      {/* Full Monthly DAS Table */}
      <section className="bg-[#1c1b1b] border border-[#ffffff0d] rounded-3xl overflow-hidden shadow-lg">
        <div className="p-6 border-b border-[#ffffff08] flex items-center justify-between">
          <h3 className="font-bold text-lg text-white">Guias Mensais do Exercício {selectedYear}</h3>
          <span className="text-xs text-[#99907b]">
            {dasData?.items.length || 0} competências geradas
          </span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-[#99907b] flex flex-col items-center justify-center gap-2">
            <span className="material-symbols-outlined text-3xl animate-spin text-[#f2c94c]">
              sync
            </span>
            <p className="text-sm font-semibold">Carregando guias...</p>
          </div>
        ) : !dasData || dasData.items.length === 0 ? (
          <div className="p-12 text-center text-[#99907b]">
            <p>Nenhuma guia DAS encontrada para este ano.</p>
          </div>
        ) : (
          <div className="divide-y divide-[#ffffff08]">
            {dasData.items.map((item) => {
              const isPago = item.status === 'pago';
              const isAtrasado = item.status === 'atrasado';

              return (
                <div
                  key={item.id}
                  className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-[#201f1f]/50 transition"
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border ${
                        isPago
                          ? 'bg-[#27ae60]/10 border-[#27ae60]/20 text-[#27ae60]'
                          : isAtrasado
                          ? 'bg-[#eb5757]/10 border-[#eb5757]/20 text-[#eb5757]'
                          : 'bg-[#f2c94c]/10 border-[#f2c94c]/20 text-[#f2c94c]'
                      }`}
                    >
                      <span className="material-symbols-outlined text-xl">
                        {isPago ? 'check' : isAtrasado ? 'warning' : 'receipt'}
                      </span>
                    </div>

                    <div>
                      <h4 className="font-bold text-sm sm:text-base text-white capitalize">
                        {formatCompetence(item.competence)}
                      </h4>
                      <p className="text-xs text-[#99907b] mt-0.5">
                        Vencimento: <span className="text-[#e5e2e1]">{formatDate(item.dueDate)}</span>
                        {item.paidOn && (
                          <span className="text-[#27ae60] ml-2">
                            • Pago em {formatDate(item.paidOn)}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-4">
                    <div className="text-right">
                      <div className="font-extrabold text-base sm:text-lg text-white">
                        {formatCurrency(item.paidAmount || item.amount)}
                      </div>
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider block ${
                          isPago
                            ? 'text-[#27ae60]'
                            : isAtrasado
                            ? 'text-[#eb5757]'
                            : 'text-[#f2c94c]'
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
                          className="px-3 py-1.5 rounded-xl text-xs font-semibold text-[#99907b] hover:text-[#ffb4ab] hover:bg-[#2a2a2a] transition border border-[#ffffff0d]"
                        >
                          Desfazer
                        </button>
                      ) : (
                        <button
                          onClick={() => handleOpenPayModal(item)}
                          disabled={actionLoading}
                          className="px-4 py-2 rounded-xl text-xs font-bold bg-[#f2c94c] hover:bg-[#ffe8ad] text-[#131313] transition shadow-sm"
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
        <div className="bg-[#1c1b1b] border border-[#ffffff0d] rounded-2xl p-5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="material-symbols-outlined text-[#f2c94c] text-2xl">description</span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-[#27ae60]/10 text-[#27ae60] border border-[#27ae60]/20">
              Anual
            </span>
          </div>
          <h4 className="font-bold text-base text-white">Declaração Anual (DASN)</h4>
          <p className="text-xs text-[#99907b]">
            Entregue até o último dia útil de maio de cada ano via portal do Empreendedor.
          </p>
        </div>

        {/* Regularidade Fiscal */}
        <div className="bg-[#1c1b1b] border border-[#ffffff0d] rounded-2xl p-5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="material-symbols-outlined text-[#27ae60] text-2xl">verified_user</span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-[#27ae60]/10 text-[#27ae60] border border-[#27ae60]/20">
              Certidão Negativa
            </span>
          </div>
          <h4 className="font-bold text-base text-white">Regularidade Fiscal</h4>
          <p className="text-xs text-[#99907b]">
            Mantenha suas guias DAS quitadas para garantir emissão de CND e benefícios do INSS.
          </p>
        </div>

        {/* Relatório Mensal de Receitas */}
        <div className="bg-[#1c1b1b] border border-[#ffffff0d] rounded-2xl p-5 space-y-2">
          <div className="flex items-center justify-between">
            <span className="material-symbols-outlined text-[#ffe8ad] text-2xl">folder_shared</span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-[#f2c94c]/10 text-[#f2c94c] border border-[#f2c94c]/20">
              Mensal
            </span>
          </div>
          <h4 className="font-bold text-base text-white">Relatório Mensal de Receitas</h4>
          <p className="text-xs text-[#99907b]">
            Preencha até o dia 20 de cada mês com as notas fiscais anexadas para arquivo próprio.
          </p>
        </div>
      </section>

      {/* Pay Modal */}
      {payingDas && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="bg-[#1c1b1b] border border-[#ffffff14] rounded-3xl w-full max-w-md p-6 shadow-2xl relative">
            <button
              onClick={() => setPayingDas(null)}
              className="absolute top-6 right-6 text-[#99907b] hover:text-white p-1 rounded-full hover:bg-[#2a2a2a] transition"
            >
              <span className="material-symbols-outlined text-xl">close</span>
            </button>

            <h3 className="text-xl font-extrabold text-white mb-1">Registrar Pagamento de DAS</h3>
            <p className="text-xs text-[#99907b] mb-5">
              Competência: <strong>{formatCompetence(payingDas.competence)}</strong>
            </p>

            <form onSubmit={handleConfirmPayment} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-[#99907b] uppercase tracking-wider block mb-1">
                  Data do Pagamento
                </label>
                <input
                  type="date"
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                  required
                  className="w-full bg-[#131313] text-sm text-[#e5e2e1] rounded-xl px-3.5 py-2.5 border border-[#ffffff0d] focus:outline-none focus:border-[#f2c94c]"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-[#99907b] uppercase tracking-wider block mb-1">
                  Valor Pago (R$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  required
                  className="w-full bg-[#131313] text-sm text-[#e5e2e1] rounded-xl px-3.5 py-2.5 border border-[#ffffff0d] focus:outline-none focus:border-[#f2c94c]"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#ffffff0d]">
                <button
                  type="button"
                  onClick={() => setPayingDas(null)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-[#99907b] hover:bg-[#2a2a2a] transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-[#f2c94c] hover:bg-[#ffe8ad] text-[#131313] transition disabled:opacity-50"
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
