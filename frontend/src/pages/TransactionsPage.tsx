import React, { useEffect, useState, useCallback, useRef } from 'react';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';
import QuickTransactionModal from '../components/modals/QuickTransactionModal.js';
import EditTransactionSheet from '../components/modals/EditTransactionSheet.js';
import ConfirmDialog from '../components/ui/ConfirmDialog.js';
import AnimatedNumber from '../components/ui/AnimatedNumber.js';
import { formatBRL, parseBRL } from '../lib/money.js';
import { useToast } from '../components/ui/Toast.js';
import Mel from '../components/brand/Mel.js';
import {
  Receipt,
  Plus,
  MagnifyingGlass,
  X,
  Trash,
  PencilSimple,
  TrendUp,
  TrendDown,
  Wallet,
  Funnel,
  CaretLeft,
  CaretRight,
  ArrowsClockwise,
} from '../components/ui/icons.js';

interface Category {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly type: string;
}

interface Transaction {
  readonly id: string;
  readonly description: string;
  readonly amount: string | number;
  readonly type: 'receita' | 'despesa';
  readonly paymentMethod?: string | null;
  readonly transactionDate: string;
  readonly categoryId: string;
  readonly entityId?: string | null;
  readonly viaPersonalAccount?: boolean;
  readonly category?: {
    readonly id: string;
    readonly name: string;
    readonly slug: string;
  };
}

interface PaginationData {
  readonly pagina: number;
  readonly limite: number;
  readonly total: number;
  readonly totalPaginas: number;
}

interface SummaryData {
  readonly totalEntradas: number;
  readonly totalDespesas: number;
  readonly resultado: number;
}

interface GroupedDay {
  readonly date: string;
  readonly items: readonly Transaction[];
  readonly totalReceitas: number;
  readonly totalDespesas: number;
}

function getTodayIsoSP(): string {
  const now = new Date();
  return now.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

function getYesterdayIsoSP(): string {
  const now = new Date();
  now.setDate(now.getDate() - 1);
  return now.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

const MONTH_NAMES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

function formatDayHeader(dateIso: string): string {
  const clean = (dateIso || '').slice(0, 10);
  if (!clean || clean.length < 10) return 'Data não informada';
  const today = getTodayIsoSP();
  const yesterday = getYesterdayIsoSP();

  const [y, m, d] = clean.split('-');
  const dayNum = parseInt(d, 10);
  const monthName = MONTH_NAMES[parseInt(m, 10) - 1] || '';

  if (clean === today) {
    return `Hoje, ${dayNum} de ${monthName}`;
  }
  if (clean === yesterday) {
    return `Ontem, ${dayNum} de ${monthName}`;
  }
  return `${dayNum} de ${monthName} de ${y}`;
}

function getPaymentMethodLabel(method?: string | null): string {
  switch (method) {
    case 'pix':
      return 'Pix';
    case 'cartao_credito':
      return 'Crédito';
    case 'cartao_debito':
      return 'Débito';
    case 'boleto':
      return 'Boleto';
    case 'dinheiro':
      return 'Dinheiro';
    default:
      return 'Outro';
  }
}

export const TransactionsPage: React.FC = () => {
  const { activeEntityId } = useAuth();
  const toast = useToast();

  const [transactions, setTransactions] = useState<readonly Transaction[]>([]);
  const [categories, setCategories] = useState<readonly Category[]>([]);
  const [summary, setSummary] = useState<SummaryData>({
    totalEntradas: 0,
    totalDespesas: 0,
    resultado: 0,
  });
  const [pagination, setPagination] = useState<PaginationData>({
    pagina: 1,
    limite: 20,
    total: 0,
    totalPaginas: 1,
  });

  // Filters
  const [typeFilter, setTypeFilter] = useState<'todas' | 'receita' | 'despesa'>('todas');
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // UI state
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [transactionToDelete, setTransactionToDelete] = useState<Transaction | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Debounce search input (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Ref to cancel ongoing request
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchTransactions = useCallback(async (page: number = 1) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setFetchError(null);

    try {
      const params: Record<string, string | number> = {
        page,
        pageSize: 20,
      };

      if (activeEntityId) params.entityId = activeEntityId;
      if (typeFilter !== 'todas') params.type = typeFilter;
      if (debouncedSearch) params.search = debouncedSearch;
      if (selectedCategory) params.categoryId = selectedCategory;
      if (selectedPaymentMethod) params.paymentMethod = selectedPaymentMethod;
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;

      const res = await api.get('/transactions', {
        params,
        signal: controller.signal,
      });

      setTransactions(res.data.items || []);
      if (res.data.paginacao) {
        setPagination(res.data.paginacao);
      }
      if (res.data.resumo) {
        setSummary({
          totalEntradas: parseBRL(res.data.resumo.totalEntradas),
          totalDespesas: parseBRL(res.data.resumo.totalDespesas),
          resultado: parseBRL(res.data.resumo.resultado),
        });
      }
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'name' in err && (err as { name: string }).name === 'CanceledError') {
        return; // Requisição abortada
      }
      const msg =
        err && typeof err === 'object' && 'response' in err && (err as { response?: { data?: { message?: string } } }).response?.data?.message
          ? (err as { response: { data: { message: string } } }).response.data.message
          : 'Falha ao buscar lançamentos. Verifique os filtros ou tente novamente.';
      console.error('Erro ao buscar lançamentos:', err);
      setFetchError(msg);
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  }, [activeEntityId, typeFilter, debouncedSearch, selectedCategory, selectedPaymentMethod, startDate, endDate]);

  // Load categories
  useEffect(() => {
    api.get('/categories')
      .then((res) => setCategories(res.data))
      .catch(() => {});
  }, []);

  // Fetch when filters change
  useEffect(() => {
    fetchTransactions(1);
  }, [fetchTransactions]);

  // Single refresh listener (evita 2 fetches concorrentes)
  useEffect(() => {
    const handleSaved = () => {
      fetchTransactions(pagination.pagina);
    };
    window.addEventListener('transaction-saved', handleSaved);
    return () => window.removeEventListener('transaction-saved', handleSaved);
  }, [fetchTransactions, pagination.pagina]);

  const confirmDelete = async () => {
    if (!transactionToDelete) return;
    setDeleting(true);
    try {
      await api.delete(`/transactions/${transactionToDelete.id}`);
      toast.success('Lançamento excluído com sucesso.');
      // Bug fix: Se era o último item da página atual e não estamos na página 1, volta uma página
      const targetPage = transactions.length === 1 && pagination.pagina > 1 ? pagination.pagina - 1 : pagination.pagina;
      fetchTransactions(targetPage);
      setTransactionToDelete(null);
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err && (err as { response?: { data?: { message?: string } } }).response?.data?.message
          ? (err as { response: { data: { message: string } } }).response.data.message
          : 'Falha ao excluir lançamento.';
      toast.error(msg);
    } finally {
      setDeleting(false);
    }
  };

  // Group transactions by date
  const groupedDays: readonly GroupedDay[] = React.useMemo(() => {
    const map = new Map<string, { items: Transaction[]; totalReceitas: number; totalDespesas: number }>();
    for (const tx of transactions) {
      const key = (tx.transactionDate || '').slice(0, 10);
      const existing = map.get(key) || { items: [], totalReceitas: 0, totalDespesas: 0 };
      existing.items.push(tx);
      const numAmount = parseBRL(tx.amount);
      if (tx.type === 'receita') {
        existing.totalReceitas += numAmount;
      } else {
        existing.totalDespesas += numAmount;
      }
      map.set(key, existing);
    }

    return Array.from(map.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, data]) => ({
        date,
        items: data.items,
        totalReceitas: data.totalReceitas,
        totalDespesas: data.totalDespesas,
      }));
  }, [transactions]);

  const clearFilters = () => {
    setTypeFilter('todas');
    setSearchInput('');
    setSelectedCategory('');
    setSelectedPaymentMethod('');
    setStartDate('');
    setEndDate('');
  };

  const hasActiveFilters = Boolean(
    typeFilter !== 'todas' ||
    searchInput ||
    selectedCategory ||
    selectedPaymentMethod ||
    startDate ||
    endDate
  );

  return (
    <div className="space-y-6">
      {/* Header with Title and Action Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-ink flex items-center gap-2.5">
            <span className="w-10 h-10 rounded-2xl bg-primary/20 flex items-center justify-center text-brand">
              <Receipt size={24} weight="duotone" />
            </span>
            Lançamentos
          </h1>
          <p className="text-xs md:text-sm text-ink-soft mt-1">
            Gestão detalhada do seu fluxo financeiro com rastreio de categorias e contas.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsCreateOpen(true)}
          className="min-h-[44px] inline-flex items-center justify-center gap-2 bg-primary hover:bg-primary-deep text-on-primary font-bold text-sm px-5 py-2.5 rounded-2xl shadow-[var(--shadow-honey)] transition active:scale-95"
        >
          <Plus size={20} weight="bold" />
          Novo Lançamento
        </button>
      </div>

      {/* Summary Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Entradas */}
        <div className="card-surface p-4 sm:p-5 flex items-center justify-between">
          <div className="min-w-0">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted block">
              Total Receitas
            </span>
            <span className="text-xl sm:text-2xl font-extrabold text-success mt-1 block tabular truncate">
              <AnimatedNumber value={summary.totalEntradas} />
            </span>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-success/10 border border-success/20 flex items-center justify-center text-success shrink-0">
            <TrendUp size={24} weight="bold" />
          </div>
        </div>

        {/* Despesas */}
        <div className="card-surface p-4 sm:p-5 flex items-center justify-between">
          <div className="min-w-0">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted block">
              Total Despesas
            </span>
            <span className="text-xl sm:text-2xl font-extrabold text-danger mt-1 block tabular truncate">
              <AnimatedNumber value={summary.totalDespesas} />
            </span>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-danger/10 border border-danger/20 flex items-center justify-center text-danger shrink-0">
            <TrendDown size={24} weight="bold" />
          </div>
        </div>

        {/* Saldo Líquido */}
        <div className="card-surface p-4 sm:p-5 flex items-center justify-between">
          <div className="min-w-0">
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted block">
              Saldo do Período
            </span>
            <span
              className={`text-xl sm:text-2xl font-extrabold mt-1 block tabular truncate ${
                summary.resultado >= 0 ? 'text-brand' : 'text-danger'
              }`}
            >
              <AnimatedNumber value={summary.resultado} />
            </span>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-primary/20 border border-primary/30 flex items-center justify-center text-brand shrink-0">
            <Wallet size={24} weight="bold" />
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="card-surface p-4 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Chips de Tipo */}
          <div className="flex items-center gap-1.5 p-1 bg-field rounded-2xl border border-ink/5 self-start">
            <button
              type="button"
              onClick={() => setTypeFilter('todas')}
              className={`min-h-[44px] px-3.5 py-1.5 rounded-xl text-xs font-bold transition ${
                typeFilter === 'todas'
                  ? 'bg-card text-brand shadow-sm border border-ink/5'
                  : 'text-muted hover:text-ink'
              }`}
            >
              Todas
            </button>
            <button
              type="button"
              onClick={() => setTypeFilter('receita')}
              className={`min-h-[44px] px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                typeFilter === 'receita'
                  ? 'bg-success/15 text-success border border-success/30 shadow-sm'
                  : 'text-muted hover:text-ink'
              }`}
            >
              <TrendUp size={16} weight="bold" />
              Receitas
            </button>
            <button
              type="button"
              onClick={() => setTypeFilter('despesa')}
              className={`min-h-[44px] px-3.5 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                typeFilter === 'despesa'
                  ? 'bg-danger/15 text-danger border border-danger/30 shadow-sm'
                  : 'text-muted hover:text-ink'
              }`}
            >
              <TrendDown size={16} weight="bold" />
              Despesas
            </button>
          </div>

          {/* Busca e botão de filtros */}
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <div className="relative flex-1">
              <MagnifyingGlass size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
              <input
                type="text"
                placeholder="Buscar por descrição..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="w-full min-h-[44px] bg-canvas text-sm text-ink rounded-2xl pl-10 pr-9 py-2 border border-ink/8 focus:outline-none focus:border-primary placeholder:text-muted"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => setSearchInput('')}
                  aria-label="Limpar busca"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg flex items-center justify-center text-muted hover:text-ink"
                >
                  <X size={16} weight="bold" />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowFilters((prev) => !prev)}
              aria-label="Filtrar lançamentos"
              className={`min-h-[44px] min-w-[44px] px-3 py-2 rounded-2xl border text-xs font-bold flex items-center gap-1.5 transition ${
                showFilters || hasActiveFilters
                  ? 'bg-primary/20 text-brand border-primary/40'
                  : 'bg-card text-muted border-ink/10 hover:text-ink hover:bg-field'
              }`}
            >
              <Funnel size={18} weight="bold" />
              <span className="hidden sm:inline">Filtros</span>
              {hasActiveFilters && (
                <span className="w-2 h-2 rounded-full bg-brand" />
              )}
            </button>
          </div>
        </div>

        {/* Painel colapsável de filtros secundários */}
        {showFilters && (
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-3 border-t border-ink/5">
            <div>
              <label htmlFor="filter-cat" className="text-[10px] font-bold uppercase tracking-wider text-muted block mb-1">
                Categoria
              </label>
              <select
                id="filter-cat"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full min-h-[44px] bg-canvas text-xs text-ink rounded-xl px-3 py-2 border border-ink/8 focus:outline-none focus:border-primary"
              >
                <option value="">Todas as Categorias</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="filter-payment" className="text-[10px] font-bold uppercase tracking-wider text-muted block mb-1">
                Forma de Pagamento
              </label>
              <select
                id="filter-payment"
                value={selectedPaymentMethod}
                onChange={(e) => setSelectedPaymentMethod(e.target.value)}
                className="w-full min-h-[44px] bg-canvas text-xs text-ink rounded-xl px-3 py-2 border border-ink/8 focus:outline-none focus:border-primary"
              >
                <option value="">Todas as Formas</option>
                <option value="pix">Pix</option>
                <option value="cartao_credito">Cartão de Crédito</option>
                <option value="cartao_debito">Cartão de Débito</option>
                <option value="boleto">Boleto</option>
                <option value="dinheiro">Dinheiro</option>
                <option value="outro">Outro</option>
              </select>
            </div>

            <div>
              <label htmlFor="filter-start-date" className="text-[10px] font-bold uppercase tracking-wider text-muted block mb-1">
                Data Inicial
              </label>
              <input
                id="filter-start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full min-h-[44px] bg-canvas text-xs text-ink rounded-xl px-3 py-2 border border-ink/8 focus:outline-none focus:border-primary"
              />
            </div>

            <div>
              <label htmlFor="filter-end-date" className="text-[10px] font-bold uppercase tracking-wider text-muted block mb-1">
                Data Final
              </label>
              <input
                id="filter-end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full min-h-[44px] bg-canvas text-xs text-ink rounded-xl px-3 py-2 border border-ink/8 focus:outline-none focus:border-primary"
              />
            </div>

            {hasActiveFilters && (
              <div className="sm:col-span-4 flex justify-end pt-1">
                <button
                  type="button"
                  onClick={clearFilters}
                  className="min-h-[44px] px-3 py-1.5 text-xs font-bold text-muted hover:text-danger flex items-center gap-1.5 transition"
                >
                  <X size={16} weight="bold" />
                  Limpar todos os filtros
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Lista de Lançamentos Agrupada por Dia */}
      <div className="card-surface overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-4">
            <div className="h-6 w-36 rounded-lg skeleton" />
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-16 rounded-2xl skeleton" />
              ))}
            </div>
          </div>
        ) : fetchError ? (
          <div className="p-10 text-center flex flex-col items-center justify-center gap-3">
            <Mel mood="alert" size={88} animated={false} />
            <div>
              <p className="text-base font-bold text-ink">Erro ao carregar lançamentos</p>
              <p className="text-xs text-muted mt-1 max-w-sm">{fetchError}</p>
            </div>
            <button
              type="button"
              onClick={() => fetchTransactions(1)}
              className="min-h-[44px] mt-2 inline-flex items-center gap-2 bg-primary text-on-primary font-bold text-xs px-4 py-2.5 rounded-xl transition hover:bg-primary-deep"
            >
              <ArrowsClockwise size={16} weight="bold" />
              Tentar novamente
            </button>
          </div>
        ) : transactions.length === 0 ? (
          <div className="p-12 text-center flex flex-col items-center justify-center gap-3">
            <Mel mood="thinking" size={96} animated={false} />
            <div>
              <p className="text-base font-bold text-ink">Nenhum lançamento encontrado</p>
              <p className="text-xs text-muted mt-1 max-w-xs">
                {hasActiveFilters
                  ? 'Nenhum resultado para os filtros atuais. Tente limpar os filtros para ver outros lançamentos.'
                  : 'Seu caixa está vazio. Registre suas receitas e despesas para acompanhar seu saldo.'}
              </p>
            </div>
            {hasActiveFilters ? (
              <button
                type="button"
                onClick={clearFilters}
                className="min-h-[44px] mt-2 inline-flex items-center gap-2 bg-field text-ink font-bold text-xs px-4 py-2.5 rounded-xl hover:bg-card-2 transition"
              >
                Limpar filtros
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIsCreateOpen(true)}
                className="min-h-[44px] mt-2 inline-flex items-center gap-2 bg-primary hover:bg-primary-deep text-on-primary font-bold text-xs px-4 py-2.5 rounded-xl transition shadow-[var(--shadow-honey)]"
              >
                <Plus size={16} weight="bold" />
                Criar primeiro lançamento
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-ink/5">
            {groupedDays.map((group) => (
              <div key={group.date} className="p-4 sm:p-5 space-y-2.5">
                {/* Cabeçalho do Dia com subtotais */}
                <div className="flex items-center justify-between gap-2 px-1">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-muted">
                    {formatDayHeader(group.date)}
                  </span>
                  <div className="flex items-center gap-2 text-xs font-bold tabular">
                    {group.totalReceitas > 0 && (
                      <span className="text-success">+{formatBRL(group.totalReceitas)}</span>
                    )}
                    {group.totalDespesas > 0 && (
                      <span className="text-danger">-{formatBRL(group.totalDespesas)}</span>
                    )}
                  </div>
                </div>

                {/* Itens do Dia */}
                <div className="space-y-2">
                  {group.items.map((tx) => {
                    const isReceita = tx.type === 'receita';
                    const numAmount = parseBRL(tx.amount);

                    return (
                      <div
                        key={tx.id}
                        className="p-3.5 sm:p-4 rounded-2xl bg-canvas border border-ink/5 flex items-center justify-between gap-3 hover:border-primary/30 transition group"
                      >
                        {/* Ícone e Detalhes */}
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border ${
                              isReceita
                                ? 'bg-success/10 border-success/20 text-success'
                                : 'bg-danger/10 border-danger/20 text-danger'
                            }`}
                          >
                            {isReceita ? (
                              <TrendUp size={20} weight="bold" />
                            ) : (
                              <TrendDown size={20} weight="bold" />
                            )}
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-sm text-ink truncate max-w-[180px] sm:max-w-md">
                                {tx.description}
                              </span>
                              {tx.viaPersonalAccount && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/20 text-brand border border-primary/30">
                                  Conta PF
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2 mt-0.5 flex-wrap text-xs text-muted">
                              <span className="text-ink-soft font-medium">
                                {tx.category?.name || 'Sem categoria'}
                              </span>
                              <span>•</span>
                              <span>{getPaymentMethodLabel(tx.paymentMethod)}</span>
                            </div>
                          </div>
                        </div>

                        {/* Valor e Ações */}
                        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                          <span
                            className={`font-extrabold text-sm sm:text-base tabular ${
                              isReceita ? 'text-success' : 'text-danger'
                            }`}
                          >
                            {isReceita ? '+' : '-'} {formatBRL(numAmount)}
                          </span>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setEditingTransaction(tx)}
                              aria-label={`Editar ${tx.description}`}
                              className="min-h-[44px] min-w-[44px] p-2 text-muted hover:text-ink hover:bg-field rounded-xl transition flex items-center justify-center"
                            >
                              <PencilSimple size={18} weight="bold" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setTransactionToDelete(tx)}
                              aria-label={`Excluir ${tx.description}`}
                              className="min-h-[44px] min-w-[44px] p-2 text-muted hover:text-danger hover:bg-field rounded-xl transition flex items-center justify-center"
                            >
                              <Trash size={18} weight="bold" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination Footer */}
        {pagination.totalPaginas > 1 && (
          <div className="p-4 bg-field/40 border-t border-ink/5 flex items-center justify-between text-xs text-muted">
            <span className="text-muted">
              Mostrando {transactions.length} de {pagination.total} lançamentos (Página{' '}
              {pagination.pagina} de {pagination.totalPaginas})
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => fetchTransactions(pagination.pagina - 1)}
                disabled={pagination.pagina <= 1}
                aria-label="Página anterior"
                className="min-h-[44px] px-3.5 py-1.5 rounded-xl bg-card text-ink hover:bg-field disabled:opacity-40 transition font-bold flex items-center gap-1 border border-ink/5"
              >
                <CaretLeft size={16} weight="bold" />
                <span className="hidden sm:inline">Anterior</span>
              </button>
              <button
                type="button"
                onClick={() => fetchTransactions(pagination.pagina + 1)}
                disabled={pagination.pagina >= pagination.totalPaginas}
                aria-label="Próxima página"
                className="min-h-[44px] px-3.5 py-1.5 rounded-xl bg-card text-ink hover:bg-field disabled:opacity-40 transition font-bold flex items-center gap-1 border border-ink/5"
              >
                <span className="hidden sm:inline">Próxima</span>
                <CaretRight size={16} weight="bold" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Sheet de Criação */}
      {isCreateOpen && (
        <QuickTransactionModal
          onClose={() => setIsCreateOpen(false)}
        />
      )}

      {/* Sheet de Edição */}
      <EditTransactionSheet
        open={Boolean(editingTransaction)}
        onClose={() => setEditingTransaction(null)}
        transaction={editingTransaction}
        categories={categories}
        onSaved={() => fetchTransactions(pagination.pagina)}
      />

      {/* Diálogo de Confirmação de Exclusão */}
      <ConfirmDialog
        open={Boolean(transactionToDelete)}
        onClose={() => setTransactionToDelete(null)}
        onConfirm={confirmDelete}
        loading={deleting}
        title="Excluir Lançamento"
        description={`Tem certeza de que deseja excluir o lançamento "${transactionToDelete?.description || ''}" no valor de ${formatBRL(transactionToDelete?.amount)}? Essa ação não pode ser desfeita.`}
        confirmLabel="Sim, excluir"
        cancelLabel="Cancelar"
        confirmVariant="danger"
      />
    </div>
  );
};

export default TransactionsPage;
