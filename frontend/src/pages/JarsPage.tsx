import React, { useEffect, useState, useCallback } from 'react';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';

interface JarItem {
  id: string;
  slug: string;
  name: string;
  percent?: number | null;
  fixedAmount?: string | null;
  alocado: string;
  carregado: string;
  totalDisponivelParaGasto: string;
  usado: string;
  disponivel: string;
  percentUsado: number;
  status: 'ok' | 'atencao' | 'estourado';
  categoryIds: string[];
}

interface JarsStatusData {
  planId: string;
  planName: string;
  entityId: string;
  month: string;
  baseMode: string;
  base: string;
  baseInsuficiente: boolean;
  jars: JarItem[];
  semPoteUsado: string;
}

interface JarTemplate {
  slug: string;
  name: string;
  targetKind: 'pj' | 'pf' | 'ambas';
  jars: {
    slug: string;
    name: string;
    percent?: number;
    fixedAmount?: string;
    rollover: boolean;
  }[];
}

interface Category {
  id: string;
  name: string;
  type: string;
}

export const JarsPage: React.FC = () => {
  const { activeEntityId } = useAuth();
  const [statusData, setStatusData] = useState<JarsStatusData | null>(null);
  const [templates, setTemplates] = useState<JarTemplate[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  // Month navigation (YYYY-MM)
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  // Modal states
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [isMapModalOpen, setIsMapModalOpen] = useState(false);

  // Plan modal form state
  const [selectedTemplate, setSelectedTemplate] = useState('mei-empresa');
  const [selectedBaseMode, setSelectedBaseMode] = useState('faturamento_mes_anterior');
  const [fixedAmountInput, setFixedAmountInput] = useState('');
  const [planSubmitting, setPlanSubmitting] = useState(false);

  // Mapping modal form state
  const [categoryMappings, setCategoryMappings] = useState<Record<string, string>>({});
  const [mapSubmitting, setMapSubmitting] = useState(false);

  const fetchJarsStatus = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = { month: currentMonth };
      if (activeEntityId) params.entityId = activeEntityId;
      const res = await api.get('/jars', { params });
      setStatusData(res.data);
    } catch (err) {
      console.error('Erro ao buscar status dos potes:', err);
    } finally {
      setLoading(false);
    }
  }, [activeEntityId, currentMonth]);

  useEffect(() => {
    fetchJarsStatus();
  }, [fetchJarsStatus]);

  useEffect(() => {
    // Fetch templates and categories once
    api.get('/jars/templates')
      .then((res) => setTemplates(res.data))
      .catch(() => {});

    api.get('/categories?type=despesa')
      .then((res) => setCategories(res.data))
      .catch(() => {});
  }, []);

  const handlePrevMonth = () => {
    const [y, m] = currentMonth.split('-').map(Number);
    const date = new Date(y, m - 2, 1);
    setCurrentMonth(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
  };

  const handleNextMonth = () => {
    const [y, m] = currentMonth.split('-').map(Number);
    const date = new Date(y, m, 1);
    setCurrentMonth(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
  };

  const formatCurrency = (val: number | string) => {
    const num = typeof val === 'string' ? parseFloat(val) : val;
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(num || 0);
  };

  const formatMonthLabel = (isoMonth: string) => {
    const [y, m] = isoMonth.split('-').map(Number);
    const date = new Date(y, m - 1, 1);
    return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  };

  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    setPlanSubmitting(true);
    try {
      await api.post('/jars/plan', {
        templateSlug: selectedTemplate,
        baseMode: selectedBaseMode,
        fixedBaseAmount: selectedBaseMode === 'meta_fixa' ? fixedAmountInput : undefined,
        entityId: activeEntityId,
      });
      setIsPlanModalOpen(false);
      fetchJarsStatus();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Falha ao aplicar plano de potes.');
    } finally {
      setPlanSubmitting(false);
    }
  };

  const openMappingModal = () => {
    if (!statusData) return;
    const initialMappings: Record<string, string> = {};
    for (const jar of statusData.jars) {
      for (const catId of jar.categoryIds) {
        initialMappings[catId] = jar.id;
      }
    }
    setCategoryMappings(initialMappings);
    setIsMapModalOpen(true);
  };

  const handleSaveMappings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!statusData) return;
    setMapSubmitting(true);
    try {
      const mappings = Object.entries(categoryMappings)
        .filter(([, jarId]) => Boolean(jarId))
        .map(([categoryId, jarId]) => ({
          categoryId,
          jarId,
        }));

      await api.put('/jars/categories', {
        planId: statusData.planId,
        mappings,
      });
      setIsMapModalOpen(false);
      fetchJarsStatus();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Falha ao salvar mapeamento de categorias.');
    } finally {
      setMapSubmitting(false);
    }
  };

  const getStatusColor = (status: 'ok' | 'atencao' | 'estourado') => {
    switch (status) {
      case 'ok':
        return {
          bar: 'bg-success',
          bg: 'bg-success/10',
          text: 'text-success',
          border: 'border-success/30',
          label: 'Dentro da Meta',
          icon: 'check_circle',
        };
      case 'atencao':
        return {
          bar: 'bg-primary',
          bg: 'bg-primary/10',
          text: 'text-brand',
          border: 'border-primary/30',
          label: 'Atenção (Acima de 80%)',
          icon: 'warning',
        };
      case 'estourado':
        return {
          bar: 'bg-danger',
          bg: 'bg-danger/10',
          text: 'text-danger',
          border: 'border-danger/30',
          label: 'Orçamento Estourado',
          icon: 'error',
        };
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-ink flex items-center gap-2">
            <span className="material-symbols-outlined text-brand text-3xl">savings</span>
            Potes Financeiros
          </h1>
          <p className="text-xs md:text-sm text-ink-soft mt-1">
            Distribuição orçamentária inteligente para proteger seu caixa PJ e PF sem surpresas.
          </p>
        </div>

        {/* Month Selector Buttons */}
        <div className="flex items-center gap-2 bg-card border border-ink/5 rounded-2xl p-1.5 self-start sm:self-auto">
          <button
            onClick={handlePrevMonth}
            className="p-1.5 text-muted hover:text-ink hover:bg-field rounded-xl transition"
            title="Mês Anterior"
          >
            <span className="material-symbols-outlined text-lg">chevron_left</span>
          </button>
          <span className="px-3 text-xs md:text-sm font-bold text-ink capitalize min-w-[130px] text-center">
            {formatMonthLabel(currentMonth)}
          </span>
          <button
            onClick={handleNextMonth}
            className="p-1.5 text-muted hover:text-ink hover:bg-field rounded-xl transition"
            title="Próximo Mês"
          >
            <span className="material-symbols-outlined text-lg">chevron_right</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="bg-card border border-ink/5 rounded-3xl p-12 text-center text-muted flex flex-col items-center justify-center gap-2">
          <span className="material-symbols-outlined text-3xl animate-spin text-brand">sync</span>
          <p className="text-sm font-semibold">Carregando seus potes financeiros...</p>
        </div>
      ) : !statusData ? (
        <div className="bg-card border border-ink/5 rounded-3xl p-12 text-center">
          <p className="text-ink font-bold">Nenhum plano ativo encontrado.</p>
        </div>
      ) : (
        <>
          {/* Summary Hero Banner */}
          <div className="bg-gradient-to-r from-card via-card-2 to-card border border-ink/5 rounded-3xl p-6 md:p-8 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-72 h-72 bg-primary/5 rounded-full blur-3xl pointer-events-none" />

            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-brand border border-primary/20 text-xs font-bold uppercase tracking-wider">
                  <span className="material-symbols-outlined text-sm">tune</span>
                  Plano Ativo: {statusData.planName}
                </div>
                <div className="text-sm text-muted">Base de Alocação Mensal:</div>
                <div className="text-3xl md:text-4xl font-extrabold text-ink">
                  {formatCurrency(statusData.base)}
                </div>
                <p className="text-xs text-muted">
                  {statusData.baseMode === 'faturamento_mes_anterior'
                    ? 'Calculado com base nas receitas do mês anterior.'
                    : statusData.baseMode === 'meta_fixa'
                    ? 'Base fixa configurada manualmente.'
                    : 'Calculado com base nas receitas deste mês.'}
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={() => setIsPlanModalOpen(true)}
                  className="inline-flex items-center gap-2 bg-field hover:bg-raised text-ink font-bold text-xs md:text-sm px-4 py-3 rounded-2xl border border-ink/8 transition"
                >
                  <span className="material-symbols-outlined text-lg text-brand">swap_horiz</span>
                  Alterar Template
                </button>
                <button
                  onClick={openMappingModal}
                  className="inline-flex items-center gap-2 bg-primary hover:bg-primary-soft text-on-primary font-bold text-xs md:text-sm px-4 py-3 rounded-2xl shadow-[0_0_20px_rgba(242,201,76,0.25)] transition"
                >
                  <span className="material-symbols-outlined text-lg">category</span>
                  Mapear Categorias
                </button>
              </div>
            </div>

            {/* Warning if sem pote */}
            {parseFloat(statusData.semPoteUsado) > 0 && (
              <div className="mt-6 pt-4 border-t border-ink/5 flex items-center gap-3 text-xs md:text-sm text-brand bg-primary-soft/5 p-3 rounded-xl border border-primary-soft/20">
                <span className="material-symbols-outlined text-xl text-brand">warning</span>
                <span>
                  Você possui <strong>{formatCurrency(statusData.semPoteUsado)}</strong> em despesas
                  deste mês sem pote atribuído. Clique em <strong>Mapear Categorias</strong> para associá-las.
                </span>
              </div>
            )}
          </div>

          {/* Jars Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {statusData.jars.map((jar) => {
              const colors = getStatusColor(jar.status);
              const percentDisplay = jar.percent != null ? `${jar.percent}%` : 'Fixo';

              return (
                <div
                  key={jar.id}
                  className="bg-card border border-ink/5 rounded-3xl p-6 flex flex-col justify-between hover:border-ink/10 transition-all duration-300 shadow-lg group relative overflow-hidden"
                >
                  <div className="space-y-4">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="font-bold text-base md:text-lg text-ink group-hover:text-brand transition">
                          {jar.name}
                        </h3>
                        <span className="text-[11px] font-bold text-muted uppercase tracking-wider block mt-0.5">
                          Alocação: {percentDisplay}
                          {jar.fixedAmount && ` (R$ ${jar.fixedAmount})`}
                        </span>
                      </div>
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full ${colors.bg} ${colors.text} border ${colors.border}`}
                      >
                        <span className="material-symbols-outlined text-xs">{colors.icon}</span>
                        {colors.label}
                      </span>
                    </div>

                    {/* Available Balance Highlight */}
                    <div className="bg-canvas rounded-2xl p-4 border border-ink/4">
                      <span className="text-[11px] font-semibold text-muted block">
                        Saldo Disponível
                      </span>
                      <div className="text-2xl font-extrabold text-ink mt-1">
                        {formatCurrency(jar.disponivel)}
                      </div>
                      <div className="text-xs text-muted mt-1 flex items-center justify-between">
                        <span>Total p/ gasto: {formatCurrency(jar.totalDisponivelParaGasto)}</span>
                        <span className="font-bold text-ink">{jar.percentUsado.toFixed(1)}% usado</span>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="space-y-1.5">
                      <div className="w-full h-2.5 bg-card-2 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${colors.bar} rounded-full transition-all duration-500`}
                          style={{ width: `${Math.min(100, jar.percentUsado)}%` }}
                        />
                      </div>
                    </div>

                    {/* Breakdown Details */}
                    <div className="space-y-1.5 text-xs text-muted pt-2 border-t border-ink/4">
                      <div className="flex justify-between">
                        <span>Alocado no mês:</span>
                        <span className="text-ink font-semibold">{formatCurrency(jar.alocado)}</span>
                      </div>
                      {parseFloat(jar.carregado) > 0 && (
                        <div className="flex justify-between text-success">
                          <span>Carregado do mês ant. (Rollover):</span>
                          <span className="font-semibold">+{formatCurrency(jar.carregado)}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span>Gasto / Usado no mês:</span>
                        <span className="text-danger font-semibold">-{formatCurrency(jar.usado)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Footer / Categories count */}
                  <div className="mt-4 pt-3 border-t border-ink/4 flex items-center justify-between text-[11px] text-muted">
                    <span>
                      {jar.categoryIds.length}{' '}
                      {jar.categoryIds.length === 1 ? 'categoria vinculada' : 'categorias vinculadas'}
                    </span>
                    <button
                      onClick={openMappingModal}
                      className="text-brand hover:underline font-bold"
                    >
                      Ajustar
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Modal: Switch / Configure Jar Plan */}
      {isPlanModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-sm">
          <div className="bg-card border border-ink/8 rounded-3xl w-full max-w-lg p-6 md:p-8 shadow-2xl relative">
            <button
              onClick={() => setIsPlanModalOpen(false)}
              className="absolute top-6 right-6 text-muted hover:text-ink p-1 rounded-full hover:bg-field transition"
            >
              <span className="material-symbols-outlined text-xl">close</span>
            </button>

            <h2 className="text-xl font-extrabold text-ink mb-1">Configurar Template de Potes</h2>
            <p className="text-xs text-muted mb-6">
              Selecione o modelo orçamentário ideal para sua empresa ou rotina pessoal.
            </p>

            <form onSubmit={handleSavePlan} className="space-y-5">
              {/* Template Choice */}
              <div>
                <label className="text-xs font-bold text-muted uppercase tracking-wider block mb-2">
                  Modelo Orçamentário
                </label>
                <div className="space-y-2">
                  {templates.map((tpl) => (
                    <label
                      key={tpl.slug}
                      className={`flex items-start gap-3 p-3.5 rounded-2xl border cursor-pointer transition ${
                        selectedTemplate === tpl.slug
                          ? 'bg-field border-primary text-ink shadow-sm'
                          : 'bg-canvas border-ink/5 text-muted hover:border-ink/13'
                      }`}
                    >
                      <input
                        type="radio"
                        name="template"
                        value={tpl.slug}
                        checked={selectedTemplate === tpl.slug}
                        onChange={(e) => setSelectedTemplate(e.target.value)}
                        className="mt-1 text-brand focus:ring-0"
                      />
                      <div className="text-xs">
                        <strong className="block text-sm text-ink font-bold">{tpl.name}</strong>
                        <span className="text-muted">
                          {tpl.jars.map((j) => `${j.name} (${j.percent ?? j.fixedAmount}%)`).join(', ')}
                        </span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Base Mode Choice */}
              <div>
                <label className="text-xs font-bold text-muted uppercase tracking-wider block mb-2">
                  Modo de Cálculo da Base
                </label>
                <select
                  value={selectedBaseMode}
                  onChange={(e) => setSelectedBaseMode(e.target.value)}
                  className="w-full bg-canvas text-sm text-ink rounded-xl px-3.5 py-2.5 border border-ink/5 focus:outline-none focus:border-primary"
                >
                  <option value="faturamento_mes_anterior">
                    Faturamento do Mês Anterior (Recomendado para MEI)
                  </option>
                  <option value="receita_mes_atual">Receita Realizada do Mês Atual</option>
                  <option value="meta_fixa">Meta Fixa Manual (R$)</option>
                </select>
              </div>

              {selectedBaseMode === 'meta_fixa' && (
                <div>
                  <label className="text-xs font-bold text-muted uppercase tracking-wider block mb-1">
                    Valor Fixo Mensal (R$)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Ex: 10000.00"
                    value={fixedAmountInput}
                    onChange={(e) => setFixedAmountInput(e.target.value)}
                    required
                    className="w-full bg-canvas text-sm text-ink rounded-xl px-3.5 py-2.5 border border-ink/5 focus:outline-none focus:border-primary"
                  />
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-ink/5">
                <button
                  type="button"
                  onClick={() => setIsPlanModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-muted hover:bg-field transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={planSubmitting}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-primary hover:bg-primary-soft text-on-primary transition disabled:opacity-50"
                >
                  {planSubmitting ? 'Salvando...' : 'Aplicar Plano'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Category to Jar Mapping */}
      {isMapModalOpen && statusData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-sm">
          <div className="bg-card border border-ink/8 rounded-3xl w-full max-w-lg p-6 md:p-8 shadow-2xl relative max-h-[90vh] flex flex-col">
            <button
              onClick={() => setIsMapModalOpen(false)}
              className="absolute top-6 right-6 text-muted hover:text-ink p-1 rounded-full hover:bg-field transition"
            >
              <span className="material-symbols-outlined text-xl">close</span>
            </button>

            <h2 className="text-xl font-extrabold text-ink mb-1">Mapear Categorias para Potes</h2>
            <p className="text-xs text-muted mb-4">
              Cada gasto lançado nessas categorias descontará automaticamente do pote selecionado.
            </p>

            <form onSubmit={handleSaveMappings} className="flex-1 overflow-y-auto space-y-3 pr-1">
              {categories.map((cat) => (
                <div
                  key={cat.id}
                  className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-canvas border border-ink/4"
                >
                  <span className="text-sm font-semibold text-ink">{cat.name}</span>
                  <select
                    value={categoryMappings[cat.id] || ''}
                    onChange={(e) =>
                      setCategoryMappings({ ...categoryMappings, [cat.id]: e.target.value })
                    }
                    className="bg-card-2 text-xs text-ink rounded-xl px-3 py-1.5 border border-ink/5 focus:outline-none focus:border-primary"
                  >
                    <option value="">Sem Pote (Não monitorado)</option>
                    {statusData.jars.map((j) => (
                      <option key={j.id} value={j.id}>
                        {j.name}
                      </option>
                    ))}
                  </select>
                </div>
              ))}

              <div className="sticky bottom-0 bg-card pt-4 border-t border-ink/5 flex items-center justify-end gap-3 mt-4">
                <button
                  type="button"
                  onClick={() => setIsMapModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-muted hover:bg-field transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={mapSubmitting}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-primary hover:bg-primary-soft text-on-primary transition disabled:opacity-50"
                >
                  {mapSubmitting ? 'Salvando...' : 'Salvar Mapeamentos'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default JarsPage;
