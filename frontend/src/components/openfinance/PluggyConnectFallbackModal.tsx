import React, { useState } from 'react';
import { PluggyConnect } from 'react-pluggy-connect';
import api from '../../api/client.js';
import Sheet from '../ui/Sheet.js';
import Mel from '../brand/Mel.js';
import { Bank, CircleNotch, WarningCircle } from '../ui/icons.js';
import { useToast } from '../ui/Toast.js';
import { celebrate, haptic } from '../../lib/celebrate.js';

interface PluggyConnectFallbackModalProps {
  readonly isOpen: boolean;
  readonly connectToken: string | null;
  readonly onClose: () => void;
  readonly onSuccess: (itemId: string) => void;
}

export const PluggyConnectFallbackModal: React.FC<PluggyConnectFallbackModalProps> = ({
  isOpen,
  connectToken,
  onClose,
  onSuccess,
}) => {
  const toast = useToast();
  const [manualItemId, setManualItemId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualItemId.trim()) return;

    setLoading(true);
    setError(null);
    try {
      await api.post('/openfinance/connect-item', { itemId: manualItemId.trim() });
      haptic([12, 40, 12]);
      celebrate('small');
      toast.success('Instituição conectada com sucesso!');
      onSuccess(manualItemId.trim());
      onClose();
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err && (err as { response?: { data?: { message?: string } } }).response?.data?.message
          ? (err as { response: { data: { message: string } } }).response.data.message
          : 'Falha ao conectar Item ID.';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const footer = (
    <div className="flex items-center justify-end gap-3 w-full">
      <button
        type="button"
        onClick={onClose}
        disabled={loading}
        className="min-h-[44px] px-6 py-2.5 rounded-2xl bg-card border border-ink/10 text-ink font-bold text-sm hover:bg-field disabled:opacity-50 transition"
      >
        Cancelar
      </button>
    </div>
  );

  return (
    <Sheet
      open={isOpen}
      onClose={onClose}
      title="Conectar Banco via Open Finance"
      subtitle="Vincule suas contas bancárias de forma segura através da Pluggy.ai"
      icon={<Mel size={44} mood={loading ? 'thinking' : 'idle'} />}
      footer={footer}
    >
      <div className="space-y-4 py-2">
        {error && (
          <div className="p-3.5 bg-danger/10 border border-danger/30 rounded-2xl text-xs font-semibold text-danger flex items-center gap-2">
            <WarningCircle size={18} weight="bold" />
            <span>{error}</span>
          </div>
        )}

        {/* Official Pluggy Connect React Component */}
        {connectToken ? (
          <div className="w-full min-h-[440px] rounded-2xl overflow-hidden bg-white border border-ink/10 relative flex items-center justify-center">
            {loading && (
              <div className="absolute inset-0 bg-ink/40 flex items-center justify-center text-ink z-20 backdrop-blur-sm">
                <div className="text-center space-y-2">
                  <CircleNotch size={32} className="animate-spin text-brand mx-auto" />
                  <p className="text-xs font-bold text-on-primary">Importando contas e transações...</p>
                </div>
              </div>
            )}
            <div className="w-full h-full min-h-[440px]">
              <PluggyConnect
                connectToken={connectToken}
                includeSandbox={Boolean(import.meta.env.DEV)}
                onSuccess={async (data: any) => {
                  const itemId = data?.item?.id || data?.itemId;
                  if (itemId) {
                    setLoading(true);
                    try {
                      const res = await api.post('/openfinance/connect-item', { itemId });
                      haptic([12, 40, 12]);
                      celebrate('big');
                      const count = res.data?.importedTransactionsCount || 0;
                      toast.success(`Conta bancária vinculada com sucesso! ${count} lançamentos importados para revisão.`);
                      onSuccess(itemId);
                      onClose();
                    } catch (err: unknown) {
                      const msg =
                        err && typeof err === 'object' && 'response' in err && (err as { response?: { data?: { message?: string } } }).response?.data?.message
                          ? (err as { response: { data: { message: string } } }).response.data.message
                          : 'Falha ao vincular Item bancário.';
                      setError(msg);
                      toast.error(msg);
                    } finally {
                      setLoading(false);
                    }
                  }
                }}
                onError={(err: any) => {
                  console.error('PluggyConnect error:', err);
                  const msg = err?.message || 'Erro durante a conexão com a instituição financeira.';
                  setError(msg);
                  toast.error(msg);
                }}
                onClose={onClose}
              />
            </div>
          </div>
        ) : (
          /* Manual Item ID Fallback */
          <form onSubmit={handleManualSubmit} className="space-y-4 pt-2">
            <div className="p-4 rounded-2xl bg-primary-soft/60 border border-primary/20 space-y-1.5 text-xs text-ink-soft">
              <p className="font-bold text-brand flex items-center gap-1.5">
                <Bank size={16} weight="duotone" />
                Vínculo Direto de Item Bancário
              </p>
              <p className="leading-relaxed">
                Se você já possui um Item ID gerado pelo dashboard da Pluggy ou ambiente de testes, informe o identificador abaixo para sincronizar.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-ink uppercase tracking-wider mb-1.5">
                Pluggy Item ID
              </label>
              <input
                type="text"
                value={manualItemId}
                onChange={(e) => setManualItemId(e.target.value)}
                placeholder="Ex: 88bb45e1-95b6-4b68-98e3-09403a7469a4"
                required
                className="w-full min-h-[44px] px-3.5 py-2.5 bg-canvas border border-ink/10 rounded-2xl text-sm font-mono text-ink focus:outline-none focus:border-primary transition"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full min-h-[44px] px-4 py-2.5 rounded-2xl bg-primary text-on-primary font-bold text-sm hover:bg-primary-deep transition flex items-center justify-center gap-2 disabled:opacity-50 shadow-[var(--shadow-honey)]"
            >
              {loading && <CircleNotch size={18} className="animate-spin" />}
              Vincular Item Manualmente
            </button>
          </form>
        )}
      </div>
    </Sheet>
  );
};

export default PluggyConnectFallbackModal;
