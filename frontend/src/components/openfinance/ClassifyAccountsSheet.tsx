import React, { useState } from 'react';
import api from '../../api/client.js';
import Sheet from '../ui/Sheet.js';
import { Bank, CircleNotch, WarningCircle } from '../ui/icons.js';
import { useToast } from '../ui/Toast.js';
import { entityLabel, missingSelections, type EntityOption } from '../../lib/bankAccountEntity.js';

export interface AccountToClassify {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly entityId: string | null;
}

interface ClassifyAccountsSheetProps {
  readonly open: boolean;
  readonly accounts: readonly AccountToClassify[];
  readonly entities: readonly EntityOption[];
  readonly onClose: () => void;
  readonly onSaved: () => void;
}

const KIND_LABEL: Record<string, string> = {
  conta_corrente: 'Conta corrente',
  cartao_credito: 'Cartão de crédito',
  poupanca: 'Poupança',
};

export const ClassifyAccountsSheet: React.FC<ClassifyAccountsSheetProps> = ({
  open,
  accounts,
  entities,
  onClose,
  onSaved,
}) => {
  const toast = useToast();
  // O pai remonta a folha (key) a cada lista de contas, então o estado inicial vem das props
  const [selections, setSelections] = useState<Record<string, string>>(() =>
    Object.fromEntries(accounts.map((a) => [a.id, a.entityId ?? '']))
  );
  const [missing, setMissing] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const choose = (accountId: string, entityId: string) => {
    setSelections((prev) => ({ ...prev, [accountId]: entityId }));
    setMissing((prev) => prev.filter((id) => id !== accountId));
  };

  const save = async () => {
    const pending = missingSelections(accounts, selections);
    if (pending.length > 0) {
      setMissing(pending);
      return;
    }
    setSaving(true);
    try {
      for (const account of accounts) {
        const entityId = selections[account.id]!;
        if (entityId !== account.entityId) {
          await api.patch(`/openfinance/bank-accounts/${account.id}`, { entityId });
        }
      }
      toast.success('Contas classificadas.');
      onSaved();
      onClose();
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err && (err as { response?: { data?: { message?: string } } }).response?.data?.message
          ? (err as { response: { data: { message: string } } }).response.data.message
          : 'Não foi possível salvar. Tente de novo.';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const footer = (
    <div className="flex items-center justify-end gap-3 w-full">
      <button
        type="button"
        onClick={onClose}
        disabled={saving}
        className="min-h-[44px] px-5 py-2.5 rounded-2xl bg-card border border-ink/10 text-ink font-bold text-sm hover:bg-field disabled:opacity-50 transition"
      >
        Depois
      </button>
      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="min-h-[44px] px-6 py-2.5 rounded-2xl bg-primary text-on-primary font-bold text-sm hover:bg-primary-deep transition flex items-center gap-2 disabled:opacity-50"
      >
        {saving && <CircleNotch size={16} className="animate-spin" />}
        Salvar
      </button>
    </div>
  );

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="De quem são estas contas?"
      subtitle="Assim cada lançamento cai no lugar certo: suas finanças pessoais ou a empresa."
      icon={<Bank size={28} weight="duotone" className="text-brand" />}
      footer={footer}
    >
      <div className="space-y-3 py-2">
        {accounts.map((account) => {
          const isMissing = missing.includes(account.id);
          return (
            <div
              key={account.id}
              className={`p-3.5 rounded-2xl border ${isMissing ? 'border-danger/40 bg-danger/5' : 'border-ink/8 bg-canvas'} space-y-2.5`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-sm text-ink truncate">{account.name}</span>
                <span className="text-[11px] text-muted font-bold shrink-0">{KIND_LABEL[account.kind] ?? 'Conta'}</span>
              </div>
              <div role="radiogroup" aria-label={`De quem é ${account.name}`} className="flex flex-wrap gap-2">
                {entities.map((entity) => {
                  const active = selections[account.id] === entity.id;
                  return (
                    <button
                      key={entity.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => choose(account.id, entity.id)}
                      className={`min-h-[40px] px-4 py-2 rounded-xl text-sm font-bold border transition ${
                        active
                          ? 'bg-primary text-on-primary border-primary'
                          : 'bg-card text-ink border-ink/10 hover:border-primary/40'
                      }`}
                    >
                      {entityLabel(entity)}
                    </button>
                  );
                })}
              </div>
              {isMissing && (
                <p className="text-xs font-semibold text-danger flex items-center gap-1.5">
                  <WarningCircle size={14} weight="bold" />
                  Escolha de quem é esta conta.
                </p>
              )}
            </div>
          );
        })}
      </div>
    </Sheet>
  );
};

export default ClassifyAccountsSheet;
