import React, { useEffect, useState, useCallback, useMemo } from 'react';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';
import { formatBRL, parseDecimal } from '../lib/money.js';
import { useToast } from '../components/ui/Toast.js';
import Mel from '../components/brand/Mel.js';
import ConfirmDialog from '../components/ui/ConfirmDialog.js';
import MarkDasPaidSheet, { type DasItemForPay } from '../components/fiscal/MarkDasPaidSheet.js';
import {
  CaretLeft,
  CaretRight,
  ArrowSquareOut,
  CheckCircle,
  WarningCircle,
  Clock,
  Storefront,
  Receipt,
  FileText,
  ShieldCheck,
  ArrowsClockwise,
  Info,
} from '../components/ui/icons.js';

type MeiLimitBand = 'ok' | 'atencao' | 'excedido' | 'desenquadramento';

interface MeiLimitData {
  readonly ano: number;
  readonly limite: string;
  readonly limiteComTolerancia: string;
  readonly mesesAtividade: number;
  readonly proporcional: boolean;
  readonly faturamentoAno: string;
  readonly percentualUtilizado: number;
  readonly restante: string;
  readonly status: MeiLimitBand;
  readonly perfilIncompleto: boolean;
  readonly parametrosEstimados: boolean;
}

interface DasItem {
  readonly id: string;
  readonly entityId: string;
  readonly competence: string;
  readonly dueDate: string;
  readonly amount: string;
  readonly status: 'pago' | 'pendente' | 'atrasado';
  readonly paidOn: string | null;
  readonly paidAmount: string | null;
}

interface DasResponse {
  readonly items: readonly DasItem[];
  readonly totais: {
    readonly pago: string;
    readonly pendente: string;
    readonly atrasado: string;
  };
  readonly pgmeiUrl: string;
}

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

function formatCompetence(competence: string): string {
  const [y, m] = competence.split('-').map(Number);
  const name = MONTH_NAMES[(m || 1) - 1] || '';
  return `${name} de ${y}`;
}

function formatDateBR(dateStr?: string | null): string {
  if (!dateStr) return '-';
  const clean = dateStr.slice(0, 10);
  const [y, m, d] = clean.split('-');
  return `${d}/${m}/${y}`;
}

function formatCnpj(cnpj?: string | null): string {
  if (!cnpj) return 'Não cadastrado';
  const digits = cnpj.replace(/\D/g, '');
  if (digits.length !== 14) return cnpj;
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

export const DasPage: React.FC = () => {
  const { workspace, activeEntityId } = useAuth();
  const toast = useToast();

  const [selectedYear, setSelectedYear] = useState<number>(() => new Date().getFullYear());
  const [limitData, setLimitData] = useState<MeiLimitData | null>(null);
  const [dasData, setDasData] = useState<DasResponse | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Sheet de pagamento manual
  const [payingDas, setPayingDas] = useState<DasItemForPay | null>(null);

  // Diálogo para desfazer pagamento
  const [dasToUnmark, setDasToUnmark] = useState<DasItem | null>(null);
  const [unmarkLoading, setUnmarkLoading] = useState(false);

  const targetEntity = useMemo(() => {
    return (
      workspace?.entities.find((e) => e.id === activeEntityId && e.kind === 'pj') ||
      workspace?.entities.find((e) => e.kind === 'pj')
    );
  }, [workspace, activeEntityId]);

  const fetchData = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    else setIsRefreshing(true);

    try {
      const params = {
        entityId: targetEntity?.id,
        year: selectedYear,
      };

      const [limitRes, dasRes] = await Promise.allSettled([
        api.get('/mei/limit', { params }),
        api.get('/das', { params }),
      ]);

      // Um 4xx do limite (perfil MEI incompleto) só esconde o termômetro; falha de rede ou
      // erro do servidor em qualquer chamada vira estado de erro, não "nenhuma guia".
      const isClientError = (r: PromiseSettledResult<unknown>) => {
        if (r.status !== 'rejected') return false;
        const status = (r.reason as { response?: { status?: number } })?.response?.status;
        return typeof status === 'number' && status >= 400 && status < 500;
      };
      const failed =
        dasRes.status === 'rejected' || (limitRes.status === 'rejected' && !isClientError(limitRes));

      setLimitData(limitRes.status === 'fulfilled' ? limitRes.value.data : null);
      setDasData(dasRes.status === 'fulfilled' ? dasRes.value.data : null);
      setLoadError(failed);
      if (failed) toast.error('Não foi possível carregar os dados de impostos.');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [targetEntity?.id, selectedYear, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleConfirmUnmark = async () => {
    if (!dasToUnmark) return;
    setUnmarkLoading(true);
    try {
      await api.delete(`/das/${dasToUnmark.id}/pay`);
      toast.success('Pagamento de DAS desmarcado.');
      setDasToUnmark(null);
      fetchData(true);
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err && (err as { response?: { data?: { message?: string } } }).response?.data?.message
          ? (err as { response: { data: { message: string } } }).response.data.message
          : 'Falha ao desmarcar pagamento.';
      toast.error(msg);
    } finally {
      setUnmarkLoading(false);
    }
  };

  // Mapeamento correto dos 4 estados do termômetro MeiLimitBand
  const limitStatusConfig = useMemo(() => {
    const status = limitData?.status || 'ok';
    switch (status) {
      case 'ok':
        return {
          title: 'Dentro do Limite Anual',
          badgeText: 'Faturamento Saudável',
          badgeClass: 'bg-success/10 text-success border-success/20',
          barColor: 'bg-success',
          melMood: 'happy' as const,
          description: 'Seu faturamento anual está em dia e dentro do teto proporcional do MEI.',
        };
      case 'atencao':
        return {
          title: 'Atenção aos Próximos Faturamentos',
          badgeText: 'Aproximando do Teto',
          badgeClass: 'bg-primary/10 text-brand border-primary/30',
          barColor: 'bg-primary',
          melMood: 'thinking' as const,
          description: 'Você atingiu a faixa de alerta. Planeje as próximas emissões para não ultrapassar o teto.',
        };
      case 'excedido':
        return {
          title: 'Limite Anual Ultrapassado (Tolerância)',
          badgeText: 'Margem de 20%',
          badgeClass: 'bg-danger/10 text-danger border-danger/30',
          barColor: 'bg-danger',
          melMood: 'alert' as const,
          description: 'O faturamento ultrapassou o teto normal, mas está dentro dos 20% de tolerância. Haverá DAS complementar no ano seguinte.',
        };
      case 'desenquadramento':
        return {
          title: 'Desenquadramento Obrigatório do MEI',
          badgeText: 'Excesso Superior a 20%',
          badgeClass: 'bg-danger text-white border-danger font-extrabold',
          barColor: 'bg-danger',
          melMood: 'alert' as const,
          description: 'O faturamento excedeu o teto com tolerância. É necessário migrar para Microempresa (ME) retroativamente.',
        };
      default:
        return {
          title: 'Limite MEI',
          badgeText: 'Monitoramento',
          badgeClass: 'bg-field text-ink-soft',
          barColor: 'bg-success',
          melMood: 'idle' as const,
          description: '',
        };
    }
  }, [limitData?.status]);

  const percentualUtilizado = Math.min(Math.max(limitData?.percentualUtilizado || 0, 0), 100);

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-ink tracking-tight">
              Impostos & DAS MEI
            </h1>
            {isRefreshing && (
              <span className="animate-spin text-brand" title="Atualizando...">
                <ArrowsClockwise size={18} weight="bold" />
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-muted mt-0.5">
            Acompanhe o limite do SIMEI e mantenha suas guias do Simples Nacional em dia.
          </p>
        </div>

        {/* Controles de Ano e Link Oficial PGMEI */}
        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          <div className="flex items-center bg-card rounded-2xl border border-ink/8 p-1 shadow-sm">
            <button
              type="button"
              onClick={() => setSelectedYear((y) => y - 1)}
              aria-label="Ano anterior"
              className="min-h-[44px] min-w-[44px] p-2.5 rounded-xl text-ink hover:bg-field transition flex items-center justify-center"
            >
              <CaretLeft size={18} weight="bold" />
            </button>
            <span className="px-3 text-xs sm:text-sm font-extrabold text-ink whitespace-nowrap min-w-[60px] text-center">
              {selectedYear}
            </span>
            <button
              type="button"
              onClick={() => setSelectedYear((y) => y + 1)}
              aria-label="Próximo ano"
              className="min-h-[44px] min-w-[44px] p-2.5 rounded-xl text-ink hover:bg-field transition flex items-center justify-center"
            >
              <CaretRight size={18} weight="bold" />
            </button>
          </div>

          <a
            href={dasData?.pgmeiUrl || 'https://www8.receita.fazenda.gov.br/SimplesNacional/Aplicacoes/ATSPO/pgmei.app/Identificacao'}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-[44px] px-3.5 py-2 rounded-2xl bg-primary text-on-primary font-bold text-xs hover:bg-primary-deep transition flex items-center gap-2 shadow-[var(--shadow-honey)]"
          >
            <span>Gerar no PGMEI</span>
            <ArrowSquareOut size={16} weight="bold" />
          </a>
        </div>
      </div>

      {/* Cartão de Identificação da Empresa MEI */}
      <div className="card-surface p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-primary-soft flex items-center justify-center text-brand shrink-0">
            <Storefront size={24} weight="duotone" />
          </div>
          <div>
            <h2 className="font-extrabold text-base text-ink">
              {targetEntity?.name || 'Sua Empresa MEI'}
            </h2>
            <div className="flex items-center gap-2 text-xs text-muted mt-0.5">
              <span>CNPJ: {formatCnpj(targetEntity?.cnpj)}</span>
              <span>·</span>
              <span className="text-brand font-semibold">Simples Nacional (SIMEI)</span>
            </div>
          </div>
        </div>

        {limitData?.proporcional && (
          <div className="self-start sm:self-auto px-3 py-1.5 rounded-xl bg-field border border-ink/5 text-xs text-ink-soft">
            <span className="font-bold text-ink">Limite proporcional:</span> {limitData.mesesAtividade} meses de atividade em {selectedYear}
          </div>
        )}
      </div>

      {/* Alertas Fiscais (Perfil Incompleto ou Parâmetros Estimados) */}
      {limitData?.perfilIncompleto && (
        <div className="p-4 bg-primary-soft/70 border border-primary/30 rounded-3xl flex items-start gap-3">
          <Info size={22} className="text-brand shrink-0 mt-0.5" weight="bold" />
          <div className="text-xs text-ink-soft space-y-1">
            <p className="font-bold text-brand">Data de abertura da empresa não cadastrada</p>
            <p>
              O MEIster calculou o limite considerando 12 meses integrais. Se a sua empresa abriu no decorrer deste ano, configure a data de abertura no seu Perfil para calcular o limite proporcional exato.
            </p>
          </div>
        </div>
      )}

      {limitData?.parametrosEstimados && (
        <div className="p-3 bg-card border border-ink/8 rounded-2xl flex items-center gap-2.5 text-xs text-muted">
          <Info size={16} className="text-muted shrink-0" weight="bold" />
          <span>
            Os parâmetros fiscais oficiais para o ano de {selectedYear} ainda não foram consolidados pela Receita Federal; valores estimados com base no exercício anterior.
          </span>
        </div>
      )}

      {/* Termômetro do Limite MEI */}
      {limitData && (
        <div className="card-surface p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Mel size={48} mood={limitStatusConfig.melMood} />
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-extrabold text-base sm:text-lg text-ink">
                    Termômetro de Faturamento MEI
                  </h3>
                  <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${limitStatusConfig.badgeClass}`}>
                    {limitStatusConfig.badgeText}
                  </span>
                </div>
                <p className="text-xs text-muted mt-0.5">{limitStatusConfig.description}</p>
              </div>
            </div>

            <div className="text-left sm:text-right">
              <span className="text-[10px] font-bold text-muted uppercase tracking-wider block">
                Faturamento no Ano
              </span>
              <span className="text-xl sm:text-2xl font-extrabold text-ink tabular">
                {formatBRL(limitData.faturamentoAno)}
              </span>
            </div>
          </div>

          {/* Barra de Progresso do Termômetro */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-bold">
              <span className="text-muted">Utilização do teto anual</span>
              <span className="text-ink">{limitData.percentualUtilizado.toFixed(1)}%</span>
            </div>
            <div className="w-full h-3 bg-field rounded-full overflow-hidden p-0.5">
              <div
                className={`h-full rounded-full transition-all duration-700 ${limitStatusConfig.barColor}`}
                style={{ width: `${percentualUtilizado}%` }}
              />
            </div>
          </div>

          {/* Estatísticas do Limite em Cartões */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
            <div className="p-3.5 bg-canvas rounded-2xl border border-ink/5">
              <span className="text-[10px] font-bold text-muted uppercase tracking-wider block">
                Teto Anual ({selectedYear})
              </span>
              <span className="text-base font-extrabold tabular text-ink">
                {formatBRL(limitData.limite)}
              </span>
            </div>

            <div className="p-3.5 bg-canvas rounded-2xl border border-ink/5">
              <span className="text-[10px] font-bold text-muted uppercase tracking-wider block">
                Saldo Disponível
              </span>
              <span
                className={`text-base font-extrabold tabular ${
                  parseFloat(limitData.restante) < 0 ? 'text-danger' : 'text-success'
                }`}
              >
                {formatBRL(limitData.restante)}
              </span>
            </div>

            <div className="p-3.5 bg-canvas rounded-2xl border border-ink/5">
              <span className="text-[10px] font-bold text-muted uppercase tracking-wider block">
                Teto com 20% Tolerância
              </span>
              <span className="text-base font-extrabold tabular text-ink-soft">
                {formatBRL(limitData.limiteComTolerancia)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Resumo Financeiro das Guias do Ano */}
      {dasData && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="card-surface p-4 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold text-muted uppercase tracking-wider block">
                Total Quitado
              </span>
              <span className="text-lg font-extrabold tabular text-success">
                {formatBRL(dasData.totais.pago)}
              </span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-success/10 text-success flex items-center justify-center">
              <CheckCircle size={22} weight="duotone" />
            </div>
          </div>

          <div className="card-surface p-4 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold text-muted uppercase tracking-wider block">
                A Vencer / Pendente
              </span>
              <span className="text-lg font-extrabold tabular text-brand">
                {formatBRL(dasData.totais.pendente)}
              </span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-primary-soft text-brand flex items-center justify-center">
              <Clock size={22} weight="duotone" />
            </div>
          </div>

          <div className="card-surface p-4 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold text-muted uppercase tracking-wider block">
                Em Atraso
              </span>
              <span className="text-lg font-extrabold tabular text-danger">
                {formatBRL(dasData.totais.atrasado)}
              </span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-danger/10 text-danger flex items-center justify-center">
              <WarningCircle size={22} weight="duotone" />
            </div>
          </div>
        </div>
      )}

      {/* Linha do Tempo Visual das Guias DAS (12 Meses) */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-extrabold text-ink tracking-tight">
            Linha do Tempo das Guias ({selectedYear})
          </h2>
          <span className="text-xs text-muted">
            {dasData?.items.filter((i) => i.status === 'pago').length || 0} de {dasData?.items.length || 0} quitadas
          </span>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" aria-busy="true">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="card-surface p-5 space-y-3">
                <div className="skeleton h-4 w-1/2 rounded-full" />
                <div className="skeleton h-6 w-3/4 rounded-full" />
                <div className="skeleton h-9 w-full rounded-xl" />
              </div>
            ))}
          </div>
        ) : loadError ? (
          <div role="alert" className="text-center py-12 px-4 bg-card rounded-3xl ring-1 ring-ink/8 space-y-3">
            <Mel size={64} mood="alert" />
            <p className="text-sm font-bold text-ink">Não deu para carregar as guias DAS</p>
            <p className="text-xs text-muted">Verifique sua conexão e tente de novo.</p>
            <button
              type="button"
              onClick={() => fetchData()}
              className="min-h-[44px] px-5 py-2.5 rounded-2xl bg-primary text-on-primary font-bold text-sm hover:bg-primary-deep transition inline-flex items-center gap-2"
            >
              <ArrowsClockwise size={18} weight="bold" />
              Tentar de novo
            </button>
          </div>
        ) : !dasData || dasData.items.length === 0 ? (
          <div className="text-center py-12 px-4 bg-card rounded-3xl border border-ink/8">
            <Mel size={64} mood="idle" />
            <p className="text-sm font-bold text-ink mt-3">Nenhuma guia DAS encontrada para {selectedYear}</p>
            <p className="text-xs text-muted mt-1">
              As guias do ano são geradas automaticamente ao cadastrar uma empresa MEI ativa.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {dasData.items.map((item) => {
              const isPago = item.status === 'pago';
              const isAtrasado = item.status === 'atrasado';

              const cardClasses = isPago
                ? 'bg-card border-success/30 shadow-sm'
                : isAtrasado
                ? 'bg-card border-danger/40 shadow-sm ring-1 ring-danger/20'
                : 'bg-card border-ink/8';

              return (
                <div
                  key={item.id}
                  className={`p-4 rounded-3xl border transition flex flex-col justify-between gap-3 ${cardClasses}`}
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-xs font-extrabold text-ink block">
                          {formatCompetence(item.competence)}
                        </span>
                        <span className="text-[11px] text-muted">
                          Vencimento: {formatDateBR(item.dueDate)}
                        </span>
                      </div>

                      {/* Status Badge */}
                      {isPago ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-success/10 text-success text-[11px] font-extrabold">
                          <CheckCircle size={14} weight="bold" />
                          Pago
                        </span>
                      ) : isAtrasado ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-danger/10 text-danger text-[11px] font-extrabold">
                          <WarningCircle size={14} weight="bold" />
                          Atrasado
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-primary-soft text-brand text-[11px] font-bold">
                          <Clock size={14} weight="bold" />
                          Pendente
                        </span>
                      )}
                    </div>

                    <div className="pt-2 border-t border-ink/5 flex items-baseline justify-between">
                      <span className="text-xs text-muted">Valor da Guia:</span>
                      <span className="text-base font-extrabold tabular text-ink">
                        {formatBRL(item.amount)}
                      </span>
                    </div>

                    {isPago && item.paidOn && (
                      <p className="text-[11px] text-success font-medium">
                        Pago em {formatDateBR(item.paidOn)}
                        {item.paidAmount && parseDecimal(item.paidAmount) !== parseDecimal(item.amount)
                          ? ` · ${formatBRL(item.paidAmount)} com encargos`
                          : ''}
                      </p>
                    )}
                  </div>

                  {/* Ação: Pagar ou Desfazer */}
                  <div className="pt-2">
                    {isPago ? (
                      <button
                        type="button"
                        onClick={() => setDasToUnmark(item)}
                        className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-ink/10 bg-field text-muted hover:text-danger hover:bg-danger/10 transition text-xs font-bold"
                      >
                        Desmarcar Pagamento
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setPayingDas(item)}
                        className={`w-full min-h-[44px] px-3 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm ${
                          isAtrasado
                            ? 'bg-danger text-white hover:brightness-110'
                            : 'bg-primary text-on-primary hover:bg-primary-deep'
                        }`}
                      >
                        <CheckCircle size={16} weight="bold" />
                        <span>Marcar como Pago</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Calendário de Obrigações Legais do MEI */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
        <div className="card-surface p-5 space-y-2">
          <div className="flex items-center justify-between">
            <div className="w-10 h-10 rounded-2xl bg-primary-soft text-brand flex items-center justify-center">
              <FileText size={20} weight="duotone" />
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-field text-ink-soft uppercase">
              Anual
            </span>
          </div>
          <h4 className="font-extrabold text-sm text-ink">Declaração Anual (DASN-SIMEI)</h4>
          <p className="text-xs text-muted leading-relaxed">
            Deve ser transmitida até 31 de maio de cada ano contendo o somatório das receitas brutas do ano anterior.
          </p>
        </div>

        <div className="card-surface p-5 space-y-2">
          <div className="flex items-center justify-between">
            <div className="w-10 h-10 rounded-2xl bg-success/10 text-success flex items-center justify-center">
              <ShieldCheck size={20} weight="duotone" />
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-success/10 text-success uppercase">
              Previdência
            </span>
          </div>
          <h4 className="font-extrabold text-sm text-ink">Benefícios e CND Ativa</h4>
          <p className="text-xs text-muted leading-relaxed">
            O pagamento pontual da guia garante sua aposentadoria, auxílio-doença, salário-maternidade e emissão de Certidão Negativa de Débitos.
          </p>
        </div>

        <div className="card-surface p-5 space-y-2">
          <div className="flex items-center justify-between">
            <div className="w-10 h-10 rounded-2xl bg-primary-soft text-brand flex items-center justify-center">
              <Receipt size={20} weight="duotone" />
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-field text-ink-soft uppercase">
              Mensal
            </span>
          </div>
          <h4 className="font-extrabold text-sm text-ink">Relatório Mensal de Receitas</h4>
          <p className="text-xs text-muted leading-relaxed">
            Recomenda-se preencher até o dia 20 de cada mês com as notas fiscais emitidas anexadas para arquivo e controle fiscal.
          </p>
        </div>
      </section>

      {/* Sheet de Registro de Pagamento */}
      <MarkDasPaidSheet
        open={Boolean(payingDas)}
        onClose={() => setPayingDas(null)}
        das={payingDas}
        onSaved={() => fetchData(true)}
      />

      {/* Diálogo de Confirmação para Desmarcar */}
      <ConfirmDialog
        open={Boolean(dasToUnmark)}
        onClose={() => setDasToUnmark(null)}
        onConfirm={handleConfirmUnmark}
        loading={unmarkLoading}
        title="Desmarcar Pagamento de DAS"
        description={`Deseja desmarcar o pagamento da competência ${dasToUnmark ? formatCompetence(dasToUnmark.competence) : ''}? A guia voltará ao status pendente ou em atraso.`}
        confirmLabel="Sim, desmarcar"
        cancelLabel="Cancelar"
        confirmVariant="danger"
      />
    </div>
  );
};

export default DasPage;
