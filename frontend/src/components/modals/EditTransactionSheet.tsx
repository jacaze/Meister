import React, { useEffect, useState } from 'react';
import Sheet from '../ui/Sheet.js';
import { CircleNotch, TrendUp, TrendDown, ArrowsLeftRight } from '../ui/icons.js';
import api from '../../api/client.js';
import { useToast } from '../ui/Toast.js';
import { parseBRL } from '../../lib/money.js';
import { celebrate, haptic } from '../../lib/celebrate.js';

interface Category {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly slug: string;
}

export interface TransactionForEdit {
  readonly id: string;
  readonly description: string;
  readonly amount: string | number;
  readonly type: 'receita' | 'despesa';
  readonly categoryId: string;
  readonly paymentMethod?: string | null;
  readonly transactionDate: string;
  readonly viaPersonalAccount?: boolean;
  readonly transferGroupId?: string | null;
}

interface EditTransactionSheetProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly transaction: TransactionForEdit | null;
  readonly categories: readonly Category[];
  readonly onSaved: () => void;
}

export const EditTransactionSheet: React.FC<EditTransactionSheetProps> = ({
  open,
  onClose,
  transaction,
  categories,
  onSaved,
}) => {
  const toast = useToast();
  const isTransfer = Boolean(transaction?.transferGroupId);
  const [type, setType] = useState<'receita' | 'despesa'>('despesa');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('pix');
  const [transactionDate, setTransactionDate] = useState('');
  const [viaPersonalAccount, setViaPersonalAccount] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (transaction) {
      setType(transaction.type);
      setDescription(transaction.description || '');
      setAmount(String(transaction.amount || ''));
      setCategoryId(transaction.categoryId || '');
      setPaymentMethod(transaction.paymentMethod || 'pix');
      setTransactionDate(transaction.transactionDate ? transaction.transactionDate.slice(0, 10) : '');
      setViaPersonalAccount(Boolean(transaction.viaPersonalAccount));
      setError(null);
    }
  }, [transaction]);

  const filteredCategories = categories.filter((c) => c.type === type);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transaction) return;
    setError(null);

    if (!description.trim()) {
      setError('Informe a descrição do lançamento.');
      return;
    }

    if (!categoryId) {
      setError('Selecione uma categoria.');
      return;
    }

    let numAmount = 0;
    if (!isTransfer) {
      numAmount = parseBRL(amount);
      if (numAmount <= 0) {
        setError('Informe um valor válido e positivo.');
        return;
      }

      if (!transactionDate) {
        setError('Informe a data do lançamento.');
        return;
      }
    }

    setLoading(true);
    try {
      const payload = isTransfer
        ? {
            description: description.trim(),
            categoryId,
            paymentMethod,
            viaPersonalAccount,
          }
        : {
            description: description.trim(),
            amount: numAmount.toFixed(2),
            type,
            categoryId,
            paymentMethod,
            transactionDate,
            viaPersonalAccount,
          };

      await api.put(`/transactions/${transaction.id}`, payload);

      haptic([12, 40, 12]);
      celebrate('small');
      toast.success('Lançamento atualizado com sucesso!');
      onSaved();
      onClose();
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err && (err as { response?: { data?: { message?: string } } }).response?.data?.message
          ? (err as { response: { data: { message: string } } }).response.data.message
          : 'Falha ao atualizar lançamento.';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const footer = (
    <div className="flex items-center gap-3 w-full">
      <button
        type="button"
        onClick={onClose}
        disabled={loading}
        className="flex-1 min-h-[44px] px-4 py-2.5 rounded-2xl border border-ink/10 bg-card text-ink font-bold text-sm hover:bg-field disabled:opacity-50 transition"
      >
        Cancelar
      </button>
      <button
        type="button"
        onClick={handleSubmit}
        disabled={loading}
        className="flex-1 min-h-[44px] px-4 py-2.5 rounded-2xl bg-primary text-on-primary font-bold text-sm hover:bg-primary-deep flex items-center justify-center gap-2 transition disabled:opacity-50 active:scale-95 shadow-[var(--shadow-honey)]"
      >
        {loading && <CircleNotch size={18} className="animate-spin" />}
        Salvar Alterações
      </button>
    </div>
  );

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Editar Lançamento"
      subtitle="Atualize os detalhes da transação financeira."
      footer={footer}
    >
      <form onSubmit={handleSubmit} className="space-y-4 py-2">
        {error && (
          <div className="p-3 bg-danger/10 border border-danger/20 rounded-2xl text-danger text-xs font-semibold leading-relaxed">
            {error}
          </div>
        )}

        {isTransfer && (
          <div className="p-3.5 bg-info/10 border border-info/20 rounded-2xl flex items-start gap-2.5 text-xs text-ink-soft">
            <ArrowsLeftRight size={18} className="text-info shrink-0 mt-0.5" />
            <div>
              <span className="font-bold text-ink block mb-0.5">Transferência entre contas / Pró-labore</span>
              Valor, tipo e data são vinculados às duas pernas da movimentação e gerenciados pela rota de transferências. Você pode editar a descrição, categoria e forma de pagamento.
            </div>
          </div>
        )}

        {/* Tipo: Receita / Despesa */}
        <div>
          <label className="block text-[11px] font-bold text-muted uppercase tracking-wider mb-1.5">
            Tipo de Lançamento {isTransfer && '(Bloqueado por ser transferência)'}
          </label>
          <div className="grid grid-cols-2 gap-2 p-1 bg-field rounded-2xl">
            <button
              type="button"
              disabled={isTransfer}
              onClick={() => {
                if (isTransfer) return;
                setType('receita');
                const firstCat = categories.find((c) => c.type === 'receita');
                if (firstCat) setCategoryId(firstCat.id);
              }}
              className={`min-h-[44px] rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition ${
                type === 'receita'
                  ? 'bg-card text-success shadow-sm border border-success/20'
                  : 'text-muted hover:text-ink'
              } ${isTransfer ? 'opacity-70 cursor-not-allowed' : ''}`}
            >
              <TrendUp size={18} weight="bold" />
              Receita
            </button>
            <button
              type="button"
              disabled={isTransfer}
              onClick={() => {
                if (isTransfer) return;
                setType('despesa');
                const firstCat = categories.find((c) => c.type === 'despesa');
                if (firstCat) setCategoryId(firstCat.id);
              }}
              className={`min-h-[44px] rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition ${
                type === 'despesa'
                  ? 'bg-card text-danger shadow-sm border border-danger/20'
                  : 'text-muted hover:text-ink'
              } ${isTransfer ? 'opacity-70 cursor-not-allowed' : ''}`}
            >
              <TrendDown size={18} weight="bold" />
              Despesa
            </button>
          </div>
        </div>

        {/* Valor e Descrição */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-1">
            <label className="block text-[11px] font-bold text-muted uppercase tracking-wider mb-1.5">
              Valor (R$)
            </label>
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              disabled={isTransfer}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0,00"
              className={`w-full min-h-[44px] px-3.5 py-2.5 border rounded-2xl text-base font-extrabold tabular text-ink focus:outline-none transition ${
                isTransfer
                  ? 'bg-field/70 border-ink/5 cursor-not-allowed text-muted'
                  : 'bg-canvas border-ink/8 focus:border-primary'
              }`}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-[11px] font-bold text-muted uppercase tracking-wider mb-1.5">
              Descrição
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex: Consultoria técnica, Almoço..."
              className="w-full min-h-[44px] px-3.5 py-2.5 bg-canvas border border-ink/8 rounded-2xl text-sm text-ink focus:outline-none focus:border-primary transition"
            />
          </div>
        </div>

        {/* Categoria e Forma de Pagamento */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-bold text-muted uppercase tracking-wider mb-1.5">
              Categoria
            </label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full min-h-[44px] px-3.5 py-2.5 bg-canvas border border-ink/8 rounded-2xl text-sm text-ink focus:outline-none focus:border-primary transition"
            >
              <option value="">Selecione uma categoria...</option>
              {filteredCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-muted uppercase tracking-wider mb-1.5">
              Forma de Pagamento
            </label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="w-full min-h-[44px] px-3.5 py-2.5 bg-canvas border border-ink/8 rounded-2xl text-sm text-ink focus:outline-none focus:border-primary transition"
            >
              <option value="pix">Pix</option>
              <option value="cartao_debito">Cartão de Débito</option>
              <option value="cartao_credito">Cartão de Crédito</option>
              <option value="dinheiro">Dinheiro</option>
              <option value="boleto">Boleto</option>
              <option value="outro">Outro</option>
            </select>
          </div>
        </div>

        {/* Data do Lançamento */}
        <div>
          <label className="block text-[11px] font-bold text-muted uppercase tracking-wider mb-1.5">
            Data do Lançamento
          </label>
          <input
            type="date"
            value={transactionDate}
            disabled={isTransfer}
            onChange={(e) => setTransactionDate(e.target.value)}
            className={`w-full min-h-[44px] px-3.5 py-2.5 border rounded-2xl text-sm text-ink focus:outline-none transition ${
              isTransfer
                ? 'bg-field/70 border-ink/5 cursor-not-allowed text-muted'
                : 'bg-canvas border-ink/8 focus:border-primary'
            }`}
          />
        </div>

        {/* Via Personal Account Checkbox */}
        <label className="flex items-center gap-3 p-3 bg-canvas rounded-2xl border border-ink/5 cursor-pointer hover:border-primary/40 transition">
          <input
            type="checkbox"
            checked={viaPersonalAccount}
            onChange={(e) => setViaPersonalAccount(e.target.checked)}
            className="w-4 h-4 rounded text-brand focus:ring-0 bg-field border-ink/10"
          />
          <span className="text-xs text-ink-soft">
            Pago/recebido através da conta bancária física (PF)?
          </span>
        </label>
      </form>
    </Sheet>
  );
};

export default EditTransactionSheet;
