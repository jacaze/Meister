import React, { useEffect, useState } from 'react';
import api from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.js';

interface QuickTransactionModalProps {
  readonly onClose: () => void;
  readonly onSaved?: () => void;
}

interface Category {
  id: string;
  name: string;
  type: string;
  slug: string;
}

export const QuickTransactionModal: React.FC<QuickTransactionModalProps> = ({ onClose, onSaved }) => {
  const { workspace, activeEntityId } = useAuth();
  const [type, setType] = useState<'receita' | 'despesa'>('despesa');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('pix');
  const [transactionDate, setTransactionDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [entityId, setEntityId] = useState(activeEntityId || '');
  const [viaPersonalAccount, setViaPersonalAccount] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get(`/categories?type=${type}`)
      .then((res) => {
        setCategories(res.data);
        if (res.data.length > 0) {
          setCategoryId(res.data[0].id);
        } else {
          setCategoryId('');
        }
      })
      .catch(() => {});
  }, [type]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanAmount = amount.replace(',', '.').trim();
    if (!cleanAmount || isNaN(Number(cleanAmount)) || Number(cleanAmount) <= 0) {
      setError('Informe um valor válido e positivo.');
      return;
    }

    if (!description.trim()) {
      setError('Informe a descrição do lançamento.');
      return;
    }

    if (!categoryId) {
      setError('Selecione uma categoria.');
      return;
    }

    setLoading(true);
    try {
      await api.post('/transactions', {
        type,
        amount: Number(cleanAmount).toFixed(2),
        description: description.trim(),
        categoryId,
        paymentMethod,
        transactionDate,
        entityId: entityId || undefined,
        viaPersonalAccount,
      });

      if (onSaved) onSaved();
      onClose();
      // Reload or trigger custom event
      window.dispatchEvent(new CustomEvent('transaction-saved'));
    } catch (err: any) {
      setError(err.response?.data?.message || 'Falha ao salvar lançamento.');
    } finally {
      setLoading(false);
    }
  };

  const selectedEntity = workspace?.entities.find((e) => e.id === entityId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#1c1b1b] border border-[#ffffff14] rounded-3xl w-full max-w-lg p-6 md:p-8 shadow-2xl relative">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-6 right-6 text-[#99907b] hover:text-white p-1 rounded-full hover:bg-[#2a2a2a] transition"
        >
          <span className="material-symbols-outlined text-xl">close</span>
        </button>

        <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2.5">
          <span className="material-symbols-outlined text-[#f2c94c]">add_circle</span>
          Novo Lançamento
        </h2>

        {error && (
          <div className="mb-5 p-3.5 rounded-xl bg-[#93000a]/30 border border-[#ffb4ab]/40 text-[#ffb4ab] text-xs font-semibold">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Type Selector (Receita / Despesa) */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-[#131313] rounded-2xl border border-[#ffffff0d]">
            <button
              type="button"
              onClick={() => setType('despesa')}
              className={`py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
                type === 'despesa'
                  ? 'bg-[#eb5757] text-white shadow-[0_0_15px_rgba(235,87,87,0.3)]'
                  : 'text-[#99907b] hover:text-white'
              }`}
            >
              <span className="material-symbols-outlined text-sm">trending_down</span>
              Despesa (Saída)
            </button>
            <button
              type="button"
              onClick={() => setType('receita')}
              className={`py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
                type === 'receita'
                  ? 'bg-[#27ae60] text-white shadow-[0_0_15px_rgba(39,174,96,0.3)]'
                  : 'text-[#99907b] hover:text-white'
              }`}
            >
              <span className="material-symbols-outlined text-sm">trending_up</span>
              Receita (Entrada)
            </button>
          </div>

          {/* Valor */}
          <div>
            <label className="block text-[11px] font-bold text-[#99907b] uppercase tracking-wider mb-1.5">
              Valor (R$)
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-bold text-[#99907b]">
                R$
              </span>
              <input
                type="text"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0,00"
                className="w-full pl-12 pr-4 py-3 bg-[#131313] border border-[#ffffff14] rounded-2xl text-xl font-bold text-white focus:outline-none focus:border-[#f2c94c] transition"
                autoFocus
              />
            </div>
          </div>

          {/* Descrição */}
          <div>
            <label className="block text-[11px] font-bold text-[#99907b] uppercase tracking-wider mb-1.5">
              Descrição
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex: Venda de serviço, Almoço comercial, Material"
              className="w-full px-4 py-3 bg-[#131313] border border-[#ffffff14] rounded-2xl text-sm font-medium text-white focus:outline-none focus:border-[#f2c94c] transition"
            />
          </div>

          {/* Categoria & Forma de Pagamento */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-[#99907b] uppercase tracking-wider mb-1.5">
                Categoria
              </label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full px-3 py-2.5 bg-[#131313] border border-[#ffffff14] rounded-2xl text-sm text-white focus:outline-none focus:border-[#f2c94c] transition"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[#99907b] uppercase tracking-wider mb-1.5">
                Forma de Pagamento
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full px-3 py-2.5 bg-[#131313] border border-[#ffffff14] rounded-2xl text-sm text-white focus:outline-none focus:border-[#f2c94c] transition capitalize"
              >
                <option value="pix">PIX</option>
                <option value="cartao_debito">Cartão de Débito</option>
                <option value="cartao_credito">Cartão de Crédito</option>
                <option value="dinheiro">Dinheiro</option>
                <option value="boleto">Boleto</option>
                <option value="outro">Outro</option>
              </select>
            </div>
          </div>

          {/* Data & Entidade */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-[#99907b] uppercase tracking-wider mb-1.5">
                Data do Lançamento
              </label>
              <input
                type="date"
                value={transactionDate}
                onChange={(e) => setTransactionDate(e.target.value)}
                className="w-full px-3 py-2.5 bg-[#131313] border border-[#ffffff14] rounded-2xl text-sm text-white focus:outline-none focus:border-[#f2c94c] transition"
              />
            </div>

            {workspace && workspace.entities.length > 1 && (
              <div>
                <label className="block text-[11px] font-bold text-[#99907b] uppercase tracking-wider mb-1.5">
                  Conta / Entidade
                </label>
                <select
                  value={entityId}
                  onChange={(e) => setEntityId(e.target.value)}
                  className="w-full px-3 py-2.5 bg-[#131313] border border-[#ffffff14] rounded-2xl text-sm text-white focus:outline-none focus:border-[#f2c94c] transition"
                >
                  {workspace.entities.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.kind === 'pj' ? '🏢 PJ — ' : '👤 PF — '} {e.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Via Personal Account Checkbox (MEI Reality) */}
          {selectedEntity?.kind === 'pj' && (
            <label className="flex items-center gap-3 p-3 bg-[#131313] rounded-2xl border border-[#ffffff0d] cursor-pointer hover:border-[#f2c94c]/40 transition">
              <input
                type="checkbox"
                checked={viaPersonalAccount}
                onChange={(e) => setViaPersonalAccount(e.target.checked)}
                className="w-4 h-4 rounded text-[#f2c94c] focus:ring-0 bg-[#2a2a2a] border-[#ffffff1a]"
              />
              <span className="text-xs text-[#d0c5af]">
                Pago/recebido através da conta bancária física (PF)?
              </span>
            </label>
          )}

          {/* Buttons */}
          <div className="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-2xl text-sm font-semibold text-[#99907b] hover:text-white hover:bg-[#2a2a2a] transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2.5 rounded-2xl bg-[#f2c94c] text-[#131313] text-sm font-bold shadow-[0_0_20px_rgba(242,201,76,0.3)] hover:scale-[1.02] active:scale-[0.98] transition disabled:opacity-50"
            >
              {loading ? 'Salvando...' : 'Confirmar Lançamento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default QuickTransactionModal;
