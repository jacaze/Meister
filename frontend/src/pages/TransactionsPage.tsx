import React, { useEffect, useState, useCallback } from 'react';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';
import QuickTransactionModal from '../components/modals/QuickTransactionModal.js';

interface Category {
  id: string;
  name: string;
  slug: string;
  type: string;
}

interface Transaction {
  id: string;
  description: string;
  amount: string | number;
  type: 'receita' | 'despesa';
  paymentMethod?: string | null;
  transactionDate: string;
  categoryId: string;
  entityId?: string | null;
  viaPersonalAccount?: boolean;
  category?: {
    id: string;
    name: string;
    slug: string;
  };
}

interface PaginationData {
  pagina: number;
  limite: number;
  total: number;
  totalPaginas: number;
}

interface SummaryData {
  totalEntradas: number;
  totalDespesas: number;
  resultado: number;
}

export const TransactionsPage: React.FC = () => {
  const { activeEntityId } = useAuth();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
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
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // UI state
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchTransactions = useCallback(async (page: number = 1) => {
    setLoading(true);
    try {
      const params: Record<string, any> = {
        page,
        pageSize: 20,
      };

      if (activeEntityId) params.entityId = activeEntityId;
      if (typeFilter !== 'todas') params.type = typeFilter;
      if (searchTerm.trim()) params.search = searchTerm.trim();
      if (selectedCategory) params.categoryId = selectedCategory;
      if (selectedPaymentMethod) params.paymentMethod = selectedPaymentMethod;
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;

      const res = await api.get('/transactions', { params });
      setTransactions(res.data.items || []);
      if (res.data.paginacao) {
        setPagination(res.data.paginacao);
      }
      if (res.data.resumo) {
        setSummary(res.data.resumo);
      }
    } catch (err) {
      console.error('Erro ao buscar lançamentos:', err);
    } finally {
      setLoading(false);
    }
  }, [activeEntityId, typeFilter, searchTerm, selectedCategory, selectedPaymentMethod, startDate, endDate]);

  useEffect(() => {
    api.get('/categories')
      .then((res) => setCategories(res.data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchTransactions(1);
  }, [fetchTransactions]);

  useEffect(() => {
    const handleSaved = () => fetchTransactions(pagination.pagina);
    window.addEventListener('transaction-saved', handleSaved);
    return () => window.removeEventListener('transaction-saved', handleSaved);
  }, [fetchTransactions, pagination.pagina]);

  const handleDelete = async (id: string) => {
    if (!window.confirm('Tem certeza de que deseja excluir este lançamento?')) {
      return;
    }
    setDeletingId(id);
    try {
      await api.delete(`/transactions/${id}`);
      fetchTransactions(pagination.pagina);
    } catch (_err) {
      alert('Falha ao excluir lançamento.');
    } finally {
      setDeletingId(null);
    }
  };

  const formatCurrency = (val: number | string) => {
    const num = typeof val === 'string' ? parseFloat(val) : val;
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(num || 0);
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const cleanDate = dateStr.slice(0, 10);
    const [year, month, day] = cleanDate.split('-');
    return `${day}/${month}/${year}`;
  };

  const getPaymentMethodLabel = (method?: string | null) => {
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
  };

  return (
    <div className="space-y-6">
      {/* Header with Title and Action Button */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
            <span className="material-symbols-outlined text-[#f2c94c] text-3xl">receipt_long</span>
            Lançamentos
          </h1>
          <p className="text-xs md:text-sm text-[#d0c5af] mt-1">
            Gestão detalhada do seu fluxo financeiro com rastreio de categorias e contas.
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center justify-center gap-2 bg-[#f2c94c] hover:bg-[#ffe8ad] text-[#131313] font-bold text-sm px-5 py-3 rounded-2xl shadow-[0_0_20px_rgba(242,201,76,0.3)] transition active:scale-95"
        >
          <span className="material-symbols-outlined text-xl font-bold">add</span>
          Novo Lançamento
        </button>
      </div>

      {/* Summary Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Entradas */}
        <div className="bg-[#1c1b1b] border border-[#ffffff0d] rounded-2xl p-4 sm:p-5 flex items-center justify-between shadow-lg">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#99907b] block">
              Total Receitas
            </span>
            <span className="text-xl sm:text-2xl font-extrabold text-[#27ae60] mt-1 block">
              {formatCurrency(summary.totalEntradas)}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-[#27ae60]/10 border border-[#27ae60]/20 flex items-center justify-center text-[#27ae60]">
            <span className="material-symbols-outlined text-2xl">arrow_upward</span>
          </div>
        </div>

        {/* Despesas */}
        <div className="bg-[#1c1b1b] border border-[#ffffff0d] rounded-2xl p-4 sm:p-5 flex items-center justify-between shadow-lg">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#99907b] block">
              Total Despesas
            </span>
            <span className="text-xl sm:text-2xl font-extrabold text-[#eb5757] mt-1 block">
              {formatCurrency(summary.totalDespesas)}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-[#eb5757]/10 border border-[#eb5757]/20 flex items-center justify-center text-[#eb5757]">
            <span className="material-symbols-outlined text-2xl">arrow_downward</span>
          </div>
        </div>

        {/* Saldo Líquido */}
        <div className="bg-[#1c1b1b] border border-[#ffffff0d] rounded-2xl p-4 sm:p-5 flex items-center justify-between shadow-lg">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#99907b] block">
              Saldo Líquido
            </span>
            <span
              className={`text-xl sm:text-2xl font-extrabold mt-1 block ${
                summary.resultado >= 0 ? 'text-[#f2c94c]' : 'text-[#ffb4ab]'
              }`}
            >
              {formatCurrency(summary.resultado)}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-[#f2c94c]/10 border border-[#f2c94c]/20 flex items-center justify-center text-[#f2c94c]">
            <span className="material-symbols-outlined text-2xl">account_balance_wallet</span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-[#1c1b1b] border border-[#ffffff0d] rounded-2xl p-4 space-y-4">
        {/* Type Filter Pills & Search */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Pills */}
          <div className="flex items-center gap-1.5 bg-[#131313] p-1 rounded-xl border border-[#ffffff0d] self-start">
            <button
              onClick={() => setTypeFilter('todas')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                typeFilter === 'todas'
                  ? 'bg-[#2a2a2a] text-[#f2c94c] shadow-sm'
                  : 'text-[#99907b] hover:text-white'
              }`}
            >
              Todas
            </button>
            <button
              onClick={() => setTypeFilter('receita')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 ${
                typeFilter === 'receita'
                  ? 'bg-[#27ae60]/20 text-[#27ae60] border border-[#27ae60]/30'
                  : 'text-[#99907b] hover:text-white'
              }`}
            >
              <span className="material-symbols-outlined text-sm">arrow_upward</span>
              Receitas
            </button>
            <button
              onClick={() => setTypeFilter('despesa')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 ${
                typeFilter === 'despesa'
                  ? 'bg-[#eb5757]/20 text-[#eb5757] border border-[#eb5757]/30'
                  : 'text-[#99907b] hover:text-white'
              }`}
            >
              <span className="material-symbols-outlined text-sm">arrow_downward</span>
              Despesas
            </button>
          </div>

          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#99907b] text-lg">
              search
            </span>
            <input
              type="text"
              placeholder="Buscar por descrição..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-[#131313] text-sm text-[#e5e2e1] rounded-xl pl-9 pr-4 py-2 border border-[#ffffff0d] focus:outline-none focus:border-[#f2c94c] placeholder-[#99907b]"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#99907b] hover:text-white"
              >
                <span className="material-symbols-outlined text-base">close</span>
              </button>
            )}
          </div>
        </div>

        {/* Detailed Secondary Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2 border-t border-[#ffffff08]">
          {/* Category */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-[#99907b] block mb-1">
              Categoria
            </label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full bg-[#131313] text-xs text-[#e5e2e1] rounded-lg px-2.5 py-2 border border-[#ffffff0d] focus:outline-none focus:border-[#f2c94c]"
            >
              <option value="">Todas as Categorias</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Payment Method */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-[#99907b] block mb-1">
              Forma de Pagamento
            </label>
            <select
              value={selectedPaymentMethod}
              onChange={(e) => setSelectedPaymentMethod(e.target.value)}
              className="w-full bg-[#131313] text-xs text-[#e5e2e1] rounded-lg px-2.5 py-2 border border-[#ffffff0d] focus:outline-none focus:border-[#f2c94c]"
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

          {/* Start Date */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-[#99907b] block mb-1">
              Data Inicial
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full bg-[#131313] text-xs text-[#e5e2e1] rounded-lg px-2.5 py-1.5 border border-[#ffffff0d] focus:outline-none focus:border-[#f2c94c]"
            />
          </div>

          {/* End Date */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-[#99907b] block mb-1">
              Data Final
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full bg-[#131313] text-xs text-[#e5e2e1] rounded-lg px-2.5 py-1.5 border border-[#ffffff0d] focus:outline-none focus:border-[#f2c94c]"
            />
          </div>
        </div>
      </div>

      {/* Transactions List */}
      <div className="bg-[#1c1b1b] border border-[#ffffff0d] rounded-2xl overflow-hidden shadow-lg">
        {loading ? (
          <div className="p-12 text-center text-[#99907b] flex flex-col items-center justify-center gap-2">
            <span className="material-symbols-outlined text-3xl animate-spin text-[#f2c94c]">
              sync
            </span>
            <p className="text-sm font-semibold">Carregando lançamentos...</p>
          </div>
        ) : transactions.length === 0 ? (
          <div className="p-12 text-center text-[#99907b] flex flex-col items-center justify-center gap-3">
            <div className="w-16 h-16 rounded-full bg-[#2a2a2a] flex items-center justify-center text-[#99907b]">
              <span className="material-symbols-outlined text-3xl">receipt_long</span>
            </div>
            <div>
              <p className="text-base font-bold text-white">Nenhum lançamento encontrado</p>
              <p className="text-xs text-[#99907b] mt-1">
                Tente ajustar os filtros ou crie um novo lançamento financeiro.
              </p>
            </div>
            <button
              onClick={() => setIsModalOpen(true)}
              className="mt-2 inline-flex items-center gap-2 bg-[#f2c94c] hover:bg-[#ffe8ad] text-[#131313] font-bold text-xs px-4 py-2.5 rounded-xl transition"
            >
              <span className="material-symbols-outlined text-base">add</span>
              Criar Lançamento
            </button>
          </div>
        ) : (
          <div className="divide-y divide-[#ffffff08]">
            {transactions.map((tx) => {
              const isReceita = tx.type === 'receita';
              const isDeleting = deletingId === tx.id;

              return (
                <div
                  key={tx.id}
                  className="p-4 sm:p-5 flex items-center justify-between hover:bg-[#201f1f]/50 transition group"
                >
                  {/* Left: Icon and Details */}
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div
                      className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 border ${
                        isReceita
                          ? 'bg-[#27ae60]/10 border-[#27ae60]/20 text-[#27ae60]'
                          : 'bg-[#eb5757]/10 border-[#eb5757]/20 text-[#eb5757]'
                      }`}
                    >
                      <span className="material-symbols-outlined text-2xl">
                        {isReceita ? 'trending_up' : 'trending_down'}
                      </span>
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm sm:text-base text-white truncate max-w-[200px] sm:max-w-md">
                          {tx.description}
                        </span>
                        {tx.viaPersonalAccount && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#f2c94c]/10 text-[#f2c94c] border border-[#f2c94c]/20">
                            Conta PF
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2 mt-1 flex-wrap text-xs text-[#99907b]">
                        <span className="text-[#d0c5af] font-medium">
                          {tx.category?.name || 'Sem categoria'}
                        </span>
                        <span>•</span>
                        <span>{getPaymentMethodLabel(tx.paymentMethod)}</span>
                        <span>•</span>
                        <span>{formatDate(tx.transactionDate)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Amount & Delete Button */}
                  <div className="flex items-center gap-4 shrink-0 pl-2">
                    <span
                      className={`font-extrabold text-sm sm:text-base ${
                        isReceita ? 'text-[#27ae60]' : 'text-[#eb5757]'
                      }`}
                    >
                      {isReceita ? '+' : '-'} {formatCurrency(tx.amount)}
                    </span>

                    <button
                      onClick={() => handleDelete(tx.id)}
                      disabled={isDeleting}
                      title="Excluir lançamento"
                      className="p-2 text-[#99907b] hover:text-[#eb5757] hover:bg-[#2a2a2a] rounded-xl transition opacity-70 group-hover:opacity-100 disabled:opacity-30"
                    >
                      <span className="material-symbols-outlined text-lg">
                        {isDeleting ? 'sync' : 'delete'}
                      </span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination Footer */}
        {pagination.totalPaginas > 1 && (
          <div className="p-4 bg-[#131313] border-t border-[#ffffff0d] flex items-center justify-between text-xs text-[#99907b]">
            <span>
              Mostrando {transactions.length} de {pagination.total} lançamentos (Página{' '}
              {pagination.pagina} de {pagination.totalPaginas})
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => fetchTransactions(pagination.pagina - 1)}
                disabled={pagination.pagina <= 1}
                className="px-3 py-1.5 rounded-lg bg-[#201f1f] text-white hover:bg-[#2a2a2a] disabled:opacity-40 transition font-bold"
              >
                Anterior
              </button>
              <button
                onClick={() => fetchTransactions(pagination.pagina + 1)}
                disabled={pagination.pagina >= pagination.totalPaginas}
                className="px-3 py-1.5 rounded-lg bg-[#201f1f] text-white hover:bg-[#2a2a2a] disabled:opacity-40 transition font-bold"
              >
                Próxima
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Quick Transaction Modal */}
      {isModalOpen && (
        <QuickTransactionModal
          onClose={() => setIsModalOpen(false)}
          onSaved={() => fetchTransactions(1)}
        />
      )}
    </div>
  );
};

export default TransactionsPage;
