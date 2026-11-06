import React, { useEffect, useState } from 'react';
import Sheet from '../ui/Sheet.js';
import Mel from '../brand/Mel.js';
import { CircleNotch, Check, Coins } from '../ui/icons.js';
import api from '../../api/client.js';
import { useToast } from '../ui/Toast.js';
import { parseBRL } from '../../lib/money.js';
import { celebrate, haptic } from '../../lib/celebrate.js';

interface RegisterWithdrawalSheetProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}

export const RegisterWithdrawalSheet: React.FC<RegisterWithdrawalSheetProps> = ({
  open,
  onClose,
  onSaved,
}) => {
  const toast = useToast();
  const [amount, setAmount] = useState('');
  const [occurredOn, setOccurredOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState('Retirada de Pró-labore');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setAmount('');
      setOccurredOn(new Date().toISOString().slice(0, 10));
      setDescription('Retirada de Pró-labore');
      setError(null);
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const numAmount = parseBRL(amount);
    if (!(numAmount > 0)) {
      setError('Informe um valor de retirada válido e positivo.');
      return;
    }

    if (!occurredOn) {
      setError('Informe a data da retirada.');
      return;
    }

    setLoading(true);
    try {
      // Contrato do backend: POST /owner-withdrawals { amount, occurredOn, description }
      await api.post('/owner-withdrawals', {
        amount: numAmount.toFixed(2),
        occurredOn,
        description: description.trim() || 'Retirada de Pró-labore',
      });

      haptic([12, 40, 12]);
      celebrate('big');
      toast.success('Retirada de pró-labore registrada com sucesso!');
      onSaved();
      onClose();
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err && (err as { response?: { data?: { message?: string } } }).response?.data?.message
          ? (err as { response: { data: { message: string } } }).response.data.message
          : 'Falha ao registrar retirada de pró-labore.';
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
        {loading ? <CircleNotch size={18} className="animate-spin" /> : <Check size={18} weight="bold" />}
        Confirmar Retirada
      </button>
    </div>
  );

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Registrar Pró-labore"
      subtitle="Transferência da conta jurídica (PJ) para a conta física pessoal (PF)."
      icon={<Mel size={44} mood={loading ? 'thinking' : 'happy'} />}
      footer={footer}
    >
      <form onSubmit={handleSubmit} className="space-y-4 py-2">
        {error && (
          <div className="p-3.5 bg-danger/10 border border-danger/20 rounded-2xl text-danger text-xs font-semibold leading-relaxed">
            {error}
          </div>
        )}

        <div className="p-3.5 bg-primary-soft/60 border border-primary/20 rounded-2xl flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary text-on-primary flex items-center justify-center shrink-0">
            <Coins size={20} weight="duotone" />
          </div>
          <p className="text-xs text-ink-soft leading-relaxed">
            O pró-labore é a sua remuneração pelo trabalho na empresa. O MEIster registrará uma saída na conta PJ e uma entrada correspondente na sua conta PF.
          </p>
        </div>

        <div>
          <label className="block text-xs font-bold text-ink uppercase tracking-wider mb-1.5">
            Valor da Retirada (R$)
          </label>
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
            autoFocus
            placeholder="0,00"
            className="w-full min-h-[44px] px-3.5 py-2.5 bg-canvas border border-ink/10 rounded-2xl text-xl font-extrabold tabular text-ink focus:outline-none focus:border-primary transition"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-ink uppercase tracking-wider mb-1.5">
            Data da Transferência
          </label>
          <input
            type="date"
            value={occurredOn}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setOccurredOn(e.target.value)}
            required
            className="w-full min-h-[44px] px-3.5 py-2.5 bg-canvas border border-ink/10 rounded-2xl text-sm font-medium text-ink focus:outline-none focus:border-primary transition"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-ink uppercase tracking-wider mb-1.5">
            Identificação / Descrição
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ex: Pró-labore referente a Outubro"
            className="w-full min-h-[44px] px-3.5 py-2.5 bg-canvas border border-ink/10 rounded-2xl text-sm font-medium text-ink focus:outline-none focus:border-primary transition"
          />
        </div>
      </form>
    </Sheet>
  );
};

export default RegisterWithdrawalSheet;
