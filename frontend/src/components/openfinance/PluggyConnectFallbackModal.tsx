import React, { useState } from 'react';
import { PluggyConnect } from 'react-pluggy-connect';
import api from '../../api/client.js';
import Portal from '../ui/Portal.js';

interface PluggyConnectFallbackModalProps {
  isOpen: boolean;
  connectToken: string | null;
  onClose: () => void;
  onSuccess: (itemId: string) => void;
}

export const PluggyConnectFallbackModal: React.FC<PluggyConnectFallbackModalProps> = ({
  isOpen,
  connectToken,
  onClose,
  onSuccess,
}) => {
  const [manualItemId, setManualItemId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualItemId.trim()) return;

    setLoading(true);
    setError(null);
    try {
      await api.post('/openfinance/connect-item', { itemId: manualItemId.trim() });
      onSuccess(manualItemId.trim());
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Falha ao conectar Item ID.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Portal>
    <div className="fixed inset-0 z-[70] flex items-end md:items-center justify-center md:p-4 bg-ink/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl max-h-[92dvh] overflow-y-auto overscroll-contain rounded-t-[28px] md:rounded-3xl bg-card border border-ink/10 p-5 md:p-6 pb-[max(20px,env(safe-area-inset-bottom))] shadow-2xl space-y-5">
        <div className="flex items-center justify-between border-b border-ink/5 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-primary/10 border border-primary/30 flex items-center justify-center text-brand">
              <span className="material-symbols-outlined text-xl">account_balance</span>
            </div>
            <div>
              <h3 className="text-base font-bold text-ink">Conexão Open Finance (Pluggy)</h3>
              <p className="text-xs text-muted">Vincule seu banco ou conta Sandbox com segurança</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-muted hover:text-ink rounded-xl hover:bg-ink/4 transition"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-2xl bg-danger/10 border border-danger/30 text-xs text-danger flex items-center gap-2">
            <span className="material-symbols-outlined text-sm">error</span>
            {error}
          </div>
        )}

        {/* Official Pluggy Connect React Component */}
        {connectToken ? (
          <div className="w-full min-h-[480px] rounded-2xl overflow-hidden bg-white relative flex items-center justify-center">
            {loading && (
              <div className="absolute inset-0 bg-ink/40 flex items-center justify-center text-ink z-20 backdrop-blur-sm">
                <div className="text-center space-y-2">
                  <span className="material-symbols-outlined text-3xl animate-spin text-brand">
                    sync
                  </span>
                  <p className="text-xs font-bold">Importando contas e transações...</p>
                </div>
              </div>
            )}
            <div className="w-full h-full min-h-[480px]">
              <PluggyConnect
                connectToken={connectToken}
                includeSandbox={true}
                onSuccess={async (data: any) => {
                  const itemId = data?.item?.id || data?.itemId;
                  if (itemId) {
                    setLoading(true);
                    try {
                      const res = await api.post('/openfinance/connect-item', { itemId });
                      alert(
                        `Conta bancária vinculada com sucesso! ${
                          res.data?.importedTransactionsCount || 0
                        } lançamentos importados para revisão.`
                      );
                      onSuccess(itemId);
                      onClose();
                    } catch (err: any) {
                      setError(err.response?.data?.message || 'Falha ao vincular conexão bancária.');
                    } finally {
                      setLoading(false);
                    }
                  }
                }}
                onError={(err: any) => {
                  console.error('PluggyConnect error:', err);
                  setError(err?.message || 'Erro ao conectar à instituição bancária.');
                }}
                onClose={onClose}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <form onSubmit={handleManualSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-muted mb-1">
                  Item ID do Pluggy
                </label>
                <input
                  type="text"
                  value={manualItemId}
                  onChange={(e) => setManualItemId(e.target.value)}
                  placeholder="ex: 12345678-abcd-ef01-2345-6789abcdef01"
                  className="w-full px-4 py-2.5 rounded-xl bg-canvas border border-ink/8 text-xs text-ink placeholder-faint focus:outline-none focus:border-primary"
                />
              </div>

              <button
                type="submit"
                disabled={loading || !manualItemId.trim()}
                className="w-full py-2.5 rounded-xl bg-ink/4 hover:bg-ink/8 border border-ink/8 text-xs font-bold text-ink transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? 'Conectando...' : 'Vincular Item ID'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
    </Portal>
  );
};

export default PluggyConnectFallbackModal;
