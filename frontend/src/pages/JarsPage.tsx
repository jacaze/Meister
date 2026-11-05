import React, { useEffect, useState, useCallback, useMemo } from 'react';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';
import { formatBRL } from '../lib/money.js';
import { useToast } from '../components/ui/Toast.js';
import Mel from '../components/brand/Mel.js';
import HoneyJarGraphic from '../components/jars/HoneyJarGraphic.js';
import ConfigurePlanSheet, { type JarTemplate } from '../components/jars/ConfigurePlanSheet.js';
import MapCategoriesSheet from '../components/jars/MapCategoriesSheet.js';
import {
  CaretLeft,
  CaretRight,
  SlidersHorizontal,
  Tag,
  Plus,
  X,
  WarningCircle,
  ArrowsClockwise,
  Jar,
} from '../components/ui/icons.js';

interface JarItem {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly percent?: number | null;
  readonly fixedAmount?: string | null;
  readonly alocado: string;
  readonly carregado: string;
  readonly totalDisponivelParaGasto: string;
  readonly usado: string;
  readonly disponivel: string;
  readonly percentUsado: number;
  readonly status: 'ok' | 'atencao' | 'estourado';
  readonly categoryIds: readonly string[];
}

interface JarsStatusData {
  readonly planId: string;
  readonly planName: string;
  readonly entityId: string;
  readonly month: string;
  readonly baseMode: string;
  readonly base: string;
  readonly baseInsuficiente: boolean;
  readonly jars: readonly JarItem[];
  readonly semPoteUsado: string;
}

interface Category {
  readonly id: string;
  readonly name: string;
  readonly type: string;
}

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

function formatMonthLabel(isoMonth: string): string {
  const [y, m] = (isoMonth || '').split('-').map(Number);
  const name = MONTH_NAMES[(m || 1) - 1] || '';
  return `${name} de ${y}`;
}

function shiftMonth(isoMonth: string, delta: number): string {
  const [y, m] = (isoMonth || '').split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1 + delta, 1));
  const newY = date.getUTCFullYear();
  const newM = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${newY}-${newM}`;
}

function getCurrentIsoMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export const JarsPage: React.FC = () => {
  const { workspace, activeEntityId } = useAuth();
  const toast = useToast();

  const [statusData, setStatusData] = useState<JarsStatusData | null>(null);
  const [templates, setTemplates] = useState<readonly JarTemplate[]>([]);
  const [categories, setCategories] = useState<readonly Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Month navigation (YYYY-MM)
  const [currentMonth, setCurrentMonth] = useState<string>(getCurrentIsoMonth);

  // Modals / Sheets
  const [isPlanSheetOpen, setIsPlanSheetOpen] = useState(false);
  const [isMapSheetOpen, setIsMapSheetOpen] = useState(false);

  const currentEntity = useMemo(() => {
    return workspace?.entities.find((e) => e.id === activeEntityId);
  }, [workspace, activeEntityId]);

  const entityKind = (currentEntity?.kind as 'pj' | 'pf') || 'pj';

  const categoryMap = useMemo(() => {
    const map = new Map<string, Category>();
    for (const c of categories) {
      map.set(c.id, c);
    }
    return map;
  }, [categories]);

  const fetchJarsStatus = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    else setIsRefreshing(true);

    try {
      const params: Record<string, string> = { month: currentMonth };
      if (activeEntityId) params.entityId = activeEntityId;
      const res = await api.get('/jars', { params });
      setStatusData(res.data);
    } catch (err) {
      console.error('Erro ao buscar status dos potes:', err);
      toast.error('Não foi possível carregar os potes deste mês.');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [activeEntityId, currentMonth, toast]);

  useEffect(() => {
    fetchJarsStatus();
  }, [fetchJarsStatus]);

  useEffect(() => {
    // Carrega templates e categorias de despesa
    api.get('/jars/templates')
      .then((res) => setTemplates(res.data || []))
      .catch(() => {});

    api.get('/categories?type=despesa')
      .then((res) => setCategories(res.data || []))
      .catch(() => {});
  }, []);

  const handlePrevMonth = () => {
    setCurrentMonth((prev) => shiftMonth(prev, -1));
  };

  const handleNextMonth = () => {
    setCurrentMonth((prev) => shiftMonth(prev, 1));
  };

  const handleResetCurrentMonth = () => {
    setCurrentMonth(getCurrentIsoMonth());
  };

  const handleRemoveCategory = async (jarId: string, categoryIdToRemove: string) => {
    if (!statusData) return;
    const targetJar = statusData.jars.find((j) => j.id === jarId);
    if (!targetJar) return;

    const remainingCategoryIds = targetJar.categoryIds.filter((id) => id !== categoryIdToRemove);

    try {
      await api.put('/jars/categories', {
        planId: statusData.planId,
        jarId: targetJar.id,
        categoryIds: remainingCategoryIds,
      });
      toast.success('Categoria desvinculada do pote.');
      fetchJarsStatus(true);
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err && (err as { response?: { data?: { message?: string } } }).response?.data?.message
          ? (err as { response: { data: { message: string } } }).response.data.message
          : 'Erro ao desvincular categoria.';
      toast.error(msg);
    }
  };

  // Mapeamento inicial para passar para a Sheet de configuração
  const currentMappings = useMemo(() => {
    const map: Record<string, string> = {};
    if (!statusData) return map;
    for (const jar of statusData.jars) {
      for (const catId of jar.categoryIds) {
        map[catId] = jar.id;
      }
    }
    return map;
  }, [statusData]);

  const semPoteAmount = parseFloat(statusData?.semPoteUsado || '0');

  const getBaseModeLabel = (mode?: string) => {
    switch (mode) {
      case 'mes_atual':
        return 'Faturamento deste mês (tempo real)';
      case 'mes_anterior':
        return 'Faturamento do mês anterior';
      case 'media_3_meses':
        return 'Média dos últimos 3 meses';
      default:
        return mode || 'Faturamento';
    }
  };

  const isCurrentMonthActive = currentMonth === getCurrentIsoMonth();

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16">
      {/* Top Header com Título e Navegação de Mês */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-ink tracking-tight">
              Potes Financeiros
            </h1>
            {isRefreshing && (
              <span className="animate-spin text-brand" title="Atualizando...">
                <ArrowsClockwise size={18} weight="bold" />
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-muted mt-0.5">
            Controle de orçamento por centros de custo e metas de gastos.
          </p>
        </div>

        {/* Controles de Navegação de Mês */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <div className="flex items-center bg-card rounded-2xl border border-ink/8 p-1 shadow-sm">
            <button
              type="button"
              onClick={handlePrevMonth}
              aria-label="Mês anterior"
              className="min-h-[44px] min-w-[44px] p-2.5 rounded-xl text-ink hover:bg-field transition flex items-center justify-center"
            >
              <CaretLeft size={18} weight="bold" />
            </button>
            <span className="px-3 text-xs sm:text-sm font-extrabold text-ink whitespace-nowrap min-w-[130px] text-center">
              {formatMonthLabel(currentMonth)}
            </span>
            <button
              type="button"
              onClick={handleNextMonth}
              aria-label="Próximo mês"
              className="min-h-[44px] min-w-[44px] p-2.5 rounded-xl text-ink hover:bg-field transition flex items-center justify-center"
            >
              <CaretRight size={18} weight="bold" />
            </button>
          </div>

          {!isCurrentMonthActive && (
            <button
              type="button"
              onClick={handleResetCurrentMonth}
              className="min-h-[44px] px-3 py-2 rounded-2xl bg-primary-soft text-brand font-bold text-xs hover:bg-primary-soft/80 transition flex items-center gap-1.5"
            >
              Hoje
            </button>
          )}
        </div>
      </div>

      {/* Ações de Gestão de Potes */}
      {statusData && (
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-card rounded-3xl border border-ink/8 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-primary-soft flex items-center justify-center text-brand shrink-0">
              <Jar size={22} weight="duotone" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-sm text-ink">{statusData.planName}</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-field text-ink-soft border border-ink/5 uppercase">
                  {entityKind.toUpperCase()}
                </span>
              </div>
              <p className="text-xs text-muted">
                Base:{' '}
                <span className="font-semibold text-ink-soft">
                  {getBaseModeLabel(statusData.baseMode)} ({formatBRL(statusData.base)})
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setIsMapSheetOpen(true)}
              className="flex-1 sm:flex-initial min-h-[44px] px-4 py-2 rounded-2xl border border-ink/10 bg-canvas text-ink text-xs font-bold hover:bg-field transition flex items-center justify-center gap-1.5"
            >
              <Tag size={16} weight="bold" />
              Vincular Categorias
            </button>

            <button
              type="button"
              onClick={() => setIsPlanSheetOpen(true)}
              className="flex-1 sm:flex-initial min-h-[44px] px-4 py-2 rounded-2xl bg-primary text-on-primary text-xs font-bold hover:bg-primary-deep transition flex items-center justify-center gap-1.5 shadow-[var(--shadow-honey)]"
            >
              <SlidersHorizontal size={16} weight="bold" />
              Alterar Método
            </button>
          </div>
        </div>
      )}

      {/* Alerta de Base Insuficiente */}
      {statusData?.baseInsuficiente && (
        <div className="p-4 bg-primary-soft/60 border border-primary/30 rounded-3xl flex items-start gap-3.5">
          <Mel size={40} mood="alert" />
          <div className="space-y-1">
            <p className="text-xs font-bold text-brand">Base de faturamento zerada neste período</p>
            <p className="text-xs text-ink-soft leading-relaxed">
              O faturamento base registrado foi de R$ 0,00. Os potes percentuais permanecerão com limite zero até que receitas sejam confirmadas para abastecê-los.
            </p>
          </div>
        </div>
      )}

      {/* Alerta de Despesas Sem Pote */}
      {semPoteAmount > 0 && (
        <div className="p-4 bg-danger/10 border border-danger/20 rounded-3xl flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-danger/20 text-danger flex items-center justify-center shrink-0">
              <WarningCircle size={22} weight="bold" />
            </div>
            <div>
              <p className="text-xs font-bold text-danger">
                Despesas sem pote alocado: {formatBRL(semPoteAmount)}
              </p>
              <p className="text-xs text-muted">
                Existem lançamentos sem categoria mapeada que não estão sendo debitados de nenhum pote.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsMapSheetOpen(true)}
            className="min-h-[44px] px-3.5 py-1.5 rounded-xl bg-danger text-ink font-bold text-xs hover:bg-danger/80 transition shrink-0"
          >
            Mapear Agora
          </button>
        </div>
      )}

      {/* Conteúdo Principal: Lista dos Potes */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" aria-busy="true">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="card-surface p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="skeleton w-16 h-20 rounded-2xl" />
                <div className="space-y-2 flex-1">
                  <div className="skeleton h-4 w-3/4 rounded-full" />
                  <div className="skeleton h-3 w-1/2 rounded-full" />
                </div>
              </div>
              <div className="skeleton h-3 w-full rounded-full" />
              <div className="skeleton h-12 w-full rounded-xl" />
            </div>
          ))}
        </div>
      ) : !statusData || statusData.jars.length === 0 ? (
        /* Empty State */
        <div className="text-center py-16 px-4 bg-card rounded-3xl border border-ink/8 shadow-sm space-y-5">
          <div className="flex justify-center">
            <Mel size={80} mood="happy" />
          </div>
          <div className="max-w-md mx-auto space-y-2">
            <h2 className="text-xl font-extrabold text-ink">Nenhum plano de potes ativado</h2>
            <p className="text-xs text-muted leading-relaxed">
              Organize seus recursos com base na regra de ouro financeira: separe custos, reserva, impostos e pró-labore antes de gastar.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsPlanSheetOpen(true)}
            className="min-h-[44px] px-6 py-3 rounded-2xl bg-primary text-on-primary font-bold text-sm hover:bg-primary-deep transition shadow-[var(--shadow-honey)] inline-flex items-center gap-2"
          >
            <Plus size={18} weight="bold" />
            Ativar Plano de Potes
          </button>
        </div>
      ) : (
        /* Grid de Potes */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {statusData.jars.map((jar) => {
            const level = Math.round(jar.percentUsado || 0);
            const isEstourado = jar.status === 'estourado';
            const isAtencao = jar.status === 'atencao';

            const statusBadgeClasses = isEstourado
              ? 'bg-danger/10 text-danger border border-danger/30'
              : isAtencao
              ? 'bg-primary/10 text-brand border border-primary/30'
              : 'bg-success/10 text-success border border-success/30';

            const statusText = isEstourado
              ? 'Estourou o limite'
              : isAtencao
              ? 'Atenção aos gastos'
              : 'Dentro da meta';

            const progressBarColor = isEstourado
              ? 'bg-danger'
              : isAtencao
              ? 'bg-primary'
              : 'bg-success';

            // Alinhamento sem erro de '%' em valor fixo
            const ruleLabel =
              jar.percent !== null && jar.percent !== undefined
                ? `${jar.percent}% do faturamento`
                : jar.fixedAmount
                ? `${formatBRL(jar.fixedAmount)} fixo`
                : 'Meta personalizada';

            return (
              <div
                key={jar.id}
                className="card-surface p-5 flex flex-col justify-between gap-4 transition hover:shadow-[var(--shadow-float)]"
              >
                {/* Cabeçalho do Pote: Gráfico + Nome + Regra */}
                <div>
                  <div className="flex items-start gap-4">
                    <HoneyJarGraphic
                      id={jar.id}
                      level={level}
                      status={jar.status}
                      size="md"
                    />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-1">
                        <h3 className="font-extrabold text-base text-ink truncate leading-tight">
                          {jar.name}
                        </h3>
                      </div>

                      <p className="text-xs font-semibold text-muted mt-0.5">
                        {ruleLabel}
                      </p>

                      <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-bold tracking-tight">
                        <span className={`px-2 py-0.5 rounded-lg ${statusBadgeClasses}`}>
                          {statusText}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Barra de Progresso com Percentual */}
                  <div className="mt-4 space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className="text-muted">Utilizado</span>
                      <span className={isEstourado ? 'text-danger font-extrabold' : 'text-ink'}>
                        {level}%
                      </span>
                    </div>
                    <div className="w-full h-2.5 bg-field rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${progressBarColor}`}
                        style={{ width: `${Math.min(level, 100)}%` }}
                      />
                    </div>
                  </div>

                  {/* Detalhes Financeiros do Pote */}
                  <div className="mt-4 grid grid-cols-2 gap-2 p-3 bg-canvas rounded-2xl border border-ink/5">
                    <div>
                      <span className="block text-[10px] font-bold text-muted uppercase tracking-wider">
                        Disponível
                      </span>
                      <span
                        className={`text-sm font-extrabold tabular ${
                          parseFloat(jar.disponivel) < 0 ? 'text-danger' : 'text-ink'
                        }`}
                      >
                        {formatBRL(jar.disponivel)}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[10px] font-bold text-muted uppercase tracking-wider">
                        Gasto Total
                      </span>
                      <span className="text-sm font-extrabold tabular text-ink-soft">
                        {formatBRL(jar.usado)}
                      </span>
                    </div>

                    <div className="col-span-2 pt-2 border-t border-ink/5 flex items-center justify-between text-[11px] text-muted">
                      <span>Alocado este mês:</span>
                      <span className="font-bold tabular text-ink-soft">{formatBRL(jar.alocado)}</span>
                    </div>

                    {parseFloat(jar.carregado || '0') > 0 && (
                      <div className="col-span-2 flex items-center justify-between text-[11px] text-brand">
                        <span>Rollover acumulado:</span>
                        <span className="font-bold tabular">+{formatBRL(jar.carregado)}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Categorias Vinculadas */}
                <div className="pt-3 border-t border-ink/5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-muted uppercase tracking-wider">
                      Categorias ({jar.categoryIds.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsMapSheetOpen(true)}
                      className="text-[11px] font-bold text-brand hover:underline inline-flex items-center gap-1"
                    >
                      <Plus size={12} weight="bold" />
                      Vincular
                    </button>
                  </div>

                  {jar.categoryIds.length === 0 ? (
                    <p className="text-xs text-muted italic">Nenhuma categoria atribuída a este pote.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {jar.categoryIds.map((catId) => {
                        const cat = categoryMap.get(catId);
                        const catName = cat?.name || 'Categoria';

                        return (
                          <span
                            key={catId}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-field text-xs font-semibold text-ink border border-ink/5 group"
                          >
                            <span className="truncate max-w-[120px]">{catName}</span>
                            <button
                              type="button"
                              onClick={() => handleRemoveCategory(jar.id, catId)}
                              aria-label={`Desvincular categoria ${catName}`}
                              className="text-muted hover:text-danger p-0.5 rounded transition"
                            >
                              <X size={12} weight="bold" />
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Sheet de Configuração de Plano */}
      <ConfigurePlanSheet
        open={isPlanSheetOpen}
        onClose={() => setIsPlanSheetOpen(false)}
        entityId={activeEntityId}
        entityKind={entityKind}
        templates={templates}
        currentPlanName={statusData?.planName}
        currentBaseMode={statusData?.baseMode}
        onSaved={() => fetchJarsStatus(true)}
      />

      {/* Sheet de Mapeamento de Categorias */}
      {statusData && (
        <MapCategoriesSheet
          open={isMapSheetOpen}
          onClose={() => setIsMapSheetOpen(false)}
          planId={statusData.planId}
          jars={statusData.jars}
          categories={categories}
          initialMappings={currentMappings}
          onSaved={() => fetchJarsStatus(true)}
        />
      )}
    </div>
  );
};

export default JarsPage;
