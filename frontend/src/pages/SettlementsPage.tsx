import React, { useEffect, useState } from 'react';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';
import { useToast } from '../components/ui/Toast.js';
import { ArrowCounterClockwise, CheckCircle, CircleNotch, Handshake } from '../components/ui/icons.js';
import { entityLabel } from '../lib/bankAccountEntity.js';
import { formatBRL } from '../lib/money.js';

interface SettlementItem {
  readonly id: string;
  readonly debtorEntityId: string;
  readonly creditorEntityId: string;
  readonly amount: string;
  readonly status: 'aberto' | 'acertado' | 'cancelado';
  readonly settledVia: 'transferencia' | 'abatimento' | null;
  readonly description: string;
  readonly transactionDate: string;
}

interface Balance {
  readonly debtorEntityId: string;
  readonly creditorEntityId: string;
  readonly total: string;
}

const VIA_LABEL: Record<string, string> = { transferencia: 'transferência', abatimento: 'abatimento' };

function errorMessage(err: unknown, fallback: string): string {
  return err && typeof err === 'object' && 'response' in err && (err as { response?: { data?: { message?: string } } }).response?.data?.message
    ? (err as { response: { data: { message: string } } }).response.data.message
    : fallback;
}

// Acertos entre entidades (tarefa 18): quem deve a quem quando o dinheiro de uma pagou o gasto de outra
export const SettlementsPage: React.FC = () => {
  const { workspace } = useAuth();
  const toast = useToast();
  const [filter, setFilter] = useState<'aberto' | 'acertado'>('aberto');
  const [items, setItems] = useState<SettlementItem[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const entities = workspace?.entities ?? [];
  const nameOf = (id: string) => {
    const e = entities.find((x) => x.id === id);
    return e ? entityLabel(e) : 'Entidade arquivada';
  };

  const [reloadKey, setReloadKey] = useState(0);
  const reload = () => setReloadKey((k) => k + 1);

  useEffect(() => {
    let active = true;
    api
      .get(`/settlements?status=${filter}`)
      .then((res) => {
        if (!active) return;
        setItems(res.data.items);
        setBalances(res.data.balances);
      })
      .catch((err: unknown) => {
        if (active) toast.error(errorMessage(err, 'Não foi possível carregar os acertos.'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [filter, reloadKey, toast]);

  const settle = async (id: string, via: 'transferencia' | 'abatimento') => {
    setBusyId(id);
    try {
      await api.post(`/settlements/${id}/settle`, { via });
      toast.success('Acerto marcado como feito.');
      reload();
    } catch (err: unknown) {
      toast.error(errorMessage(err, 'Não foi possível marcar o acerto.'));
    } finally {
      setBusyId(null);
    }
  };

  const reopen = async (id: string) => {
    setBusyId(id);
    try {
      await api.post(`/settlements/${id}/reopen`);
      toast.info('Acerto reaberto.');
      reload();
    } catch (err: unknown) {
      toast.error(errorMessage(err, 'Não foi possível reabrir o acerto.'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-ink flex items-center gap-2">
          <Handshake size={28} weight="duotone" className="text-brand" />
          Acertos
        </h1>
        <p className="text-sm text-muted">
          Quando o dinheiro de um paga o gasto de outro (ex.: o cartão pessoal pagando algo da empresa), o Meister anota quem deve a quem.
        </p>
      </div>

      {filter === 'aberto' && balances.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {balances.map((b) => (
            <div key={`${b.debtorEntityId}-${b.creditorEntityId}`} className="card-surface p-4">
              <p className="text-xs text-muted font-bold">Saldo em aberto</p>
              <p className="text-sm text-ink mt-1">
                <span className="font-extrabold">{nameOf(b.debtorEntityId)}</span> deve a{' '}
                <span className="font-extrabold">{nameOf(b.creditorEntityId)}</span>
              </p>
              <p className="text-2xl font-extrabold text-brand tabular mt-1">{formatBRL(b.total)}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2" role="tablist" aria-label="Situação dos acertos">
        {(['aberto', 'acertado'] as const).map((f) => (
          <button
            key={f}
            type="button"
            role="tab"
            aria-selected={filter === f}
            onClick={() => {
              if (f === filter) return;
              setLoading(true);
              setFilter(f);
            }}
            className={`min-h-[40px] px-4 rounded-xl text-sm font-bold transition ${
              filter === f ? 'bg-primary text-on-primary' : 'bg-card text-ink ring-1 ring-ink/10'
            }`}
          >
            {f === 'aberto' ? 'Em aberto' : 'Acertados'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <CircleNotch size={28} className="animate-spin text-brand" />
        </div>
      ) : items.length === 0 ? (
        <div className="card-surface p-8 text-center space-y-1">
          <p className="text-sm font-bold text-ink">
            {filter === 'aberto' ? 'Nenhum acerto pendente' : 'Nenhum acerto feito ainda'}
          </p>
          <p className="text-xs text-muted">
            Ao lançar um gasto, escolha em "Pago com o dinheiro de" quem pagou. Se for outra pessoa ou empresa, o acerto aparece aqui.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((s) => (
            <div key={s.id} className="card-surface p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-ink truncate">{s.description}</p>
                <p className="text-xs text-muted">
                  {nameOf(s.debtorEntityId)} deve a {nameOf(s.creditorEntityId)} · {s.transactionDate.split('-').reverse().join('/')}
                  {s.settledVia && ` · acertado por ${VIA_LABEL[s.settledVia]}`}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-base font-extrabold tabular text-ink">{formatBRL(s.amount)}</span>
                {s.status === 'aberto' ? (
                  <>
                    <button
                      type="button"
                      disabled={busyId === s.id}
                      onClick={() => settle(s.id, 'transferencia')}
                      className="min-h-[40px] px-3 rounded-xl bg-primary text-on-primary text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <CheckCircle size={16} weight="bold" />
                      Transferi
                    </button>
                    <button
                      type="button"
                      disabled={busyId === s.id}
                      onClick={() => settle(s.id, 'abatimento')}
                      className="min-h-[40px] px-3 rounded-xl bg-card ring-1 ring-ink/10 text-ink text-xs font-bold disabled:opacity-50"
                    >
                      Abater
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    disabled={busyId === s.id}
                    onClick={() => reopen(s.id)}
                    className="min-h-[40px] px-3 rounded-xl bg-card ring-1 ring-ink/10 text-ink text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <ArrowCounterClockwise size={16} weight="bold" />
                    Desfazer
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SettlementsPage;
