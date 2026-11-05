import React, { useEffect, useState } from 'react';
import Sheet from '../ui/Sheet.js';
import Mel from '../brand/Mel.js';
import { CircleNotch, Check, CalendarBlank } from '../ui/icons.js';
import api from '../../api/client.js';
import { useToast } from '../ui/Toast.js';
import { formatBRL, parseBRL } from '../../lib/money.js';
import { celebrate, haptic } from '../../lib/celebrate.js';

export interface DasItemForPay {
  readonly id: string;
  readonly competence: string;
  readonly dueDate: string;
  readonly amount: string;
}

interface MarkDasPaidSheetProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly das: DasItemForPay | null;
  readonly onSaved: () => void;
}

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

function formatCompetence(competence?: string): string {
  if (!competence) return '';
  const [y, m] = competence.split('-').map(Number);
  const name = MONTH_NAMES[(m || 1) - 1] || '';
  return `${name} de ${y}`;
}

export const MarkDasPaidSheet: React.FC<MarkDasPaidSheetProps> = ({
  open,
  onClose,
  das,
  onSaved,
}) => {
  const toast = useToast();
  const [paidOn, setPaidOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [paidAmount, setPaidAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (das) {
      setPaidOn(new Date().toISOString().slice(0, 10));
      setPaidAmount(das.amount || '');
      setError(null);
    }
  }, [das]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!das) return;
    setError(null);

    if (!paidOn) {
      setError('Informe a data do pagamento.');
      return;
    }

    const numAmount = parseBRL(paidAmount);
    if (numAmount <= 0) {
      setError('Informe um valor pago válido.');
      return;
    }

    setLoading(true);
    try {
      await api.post(`/das/${das.id}/pay`, {
        paidOn,
        paidAmount: numAmount.toFixed(2),
      });

      haptic([12, 40, 12]);
      celebrate('small');
      toast.success('Pagamento de DAS registrado com sucesso!');
      onSaved();
      onClose();
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err && (err as { response?: { data?: { message?: string } } }).response?.data?.message
          ? (err as { response: { data: { message: string } } }).response.data.message
          : 'Falha ao registrar pagamento do DAS.';
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
        Confirmar Quitação
      </button>
    </div>
  );

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Registrar Pagamento do DAS"
      subtitle={das ? `Competência: ${formatCompetence(das.competence)}` : 'Guia mensal do MEI'}
      icon={<Mel size={44} mood={loading ? 'thinking' : 'happy'} />}
      footer={footer}
    >
      <form onSubmit={handleSubmit} className="space-y-4 py-2">
        {error && (
          <div className="p-3.5 bg-danger/10 border border-danger/20 rounded-2xl text-danger text-xs font-semibold leading-relaxed">
            {error}
          </div>
        )}

        <div className="p-3.5 bg-canvas rounded-2xl border border-ink/5 flex items-center justify-between">
          <span className="text-xs text-muted">Valor original da guia:</span>
          <span className="text-sm font-extrabold tabular text-ink">
            {formatBRL(das?.amount)}
          </span>
        </div>

        <div>
          <label className="block text-xs font-bold text-ink uppercase tracking-wider mb-1.5">
            Data do Pagamento
          </label>
          <div className="relative">
            <input
              type="date"
              value={paidOn}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setPaidOn(e.target.value)}
              required
              className="w-full min-h-[44px] px-3.5 py-2.5 bg-canvas border border-ink/10 rounded-2xl text-sm font-medium text-ink focus:outline-none focus:border-primary transition"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-ink uppercase tracking-wider mb-1.5">
            Valor Efetivamente Pago (R$)
          </label>
          <input
            type="text"
            inputMode="decimal"
            value={paidAmount}
            onChange={(e) => setPaidAmount(e.target.value)}
            required
            placeholder="0,00"
            className="w-full min-h-[44px] px-3.5 py-2.5 bg-canvas border border-ink/10 rounded-2xl text-base font-extrabold tabular text-ink focus:outline-none focus:border-primary transition"
          />
          <p className="text-[11px] text-muted mt-1">
            Se houve pagamento de juros ou multa por atraso, informe o valor final pago no comprovante.
          </p>
        </div>
      </form>
    </Sheet>
  );
};

export default MarkDasPaidSheet;
