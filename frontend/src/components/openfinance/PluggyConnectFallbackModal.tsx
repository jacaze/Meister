import React, { useState, useEffect } from 'react';
import api from '../../api/client.js';

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

  useEffect(() => {
    if (!isOpen) return;

    const handleMessage = async (event: MessageEvent) => {
      if (!event.origin || !event.origin.includes('pluggy.ai')) return;

      const raw = event.data;
      if (!raw) return;

      const item = raw?.item || raw?.payload?.item || raw?.data?.item;
      const itemId =
        item?.id ||
        raw?.itemId ||
        raw?.payload?.itemId ||
        raw?.data?.itemId ||
        (typeof raw === 'string' && raw.includes('item_') ? raw : null);

      if (itemId) {
        setLoading(true);
        try {
          await api.post('/openfinance/connect-item', { itemId });
          onSuccess(itemId);
          onClose();
        } catch (err: any) {
          setError(err.response?.data?.message || 'Falha ao vincular conexão bancária.');
        } finally {
          setLoading(false);
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [isOpen, onSuccess, onClose]);

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

  const pluggyUrl = connectToken ? `https://connect.pluggy.ai/?token=${connectToken}&includeSandbox=true` : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl rounded-3xl bg-[#1c1b1b] border border-[#ffffff1a] p-6 shadow-2xl space-y-5">
        <div className="flex items-center justify-between border-b border-[#ffffff0d] pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#f2c94c]/10 border border-[#f2c94c]/30 flex items-center justify-center text-[#f2c94c]">
              <span className="material-symbols-outlined text-xl">account_balance</span>
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Conexão Open Finance (Pluggy)</h3>
              <p className="text-xs text-[#99907b]">Vincule seu banco ou conta Sandbox com segurança</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-[#99907b] hover:text-white rounded-xl hover:bg-[#ffffff0a] transition"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-2xl bg-[#eb5757]/10 border border-[#eb5757]/30 text-xs text-[#eb5757] flex items-center gap-2">
            <span className="material-symbols-outlined text-sm">error</span>
            {error}
          </div>
        )}

        {/* Embedded Pluggy Connect Iframe */}
        {pluggyUrl ? (
          <div className="space-y-3">
            <div className="w-full h-[480px] rounded-2xl overflow-hidden border border-[#ffffff14] bg-white relative">
              {loading && (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-white z-10 backdrop-blur-sm">
                  <div className="text-center space-y-2">
                    <span className="material-symbols-outlined text-3xl animate-spin text-[#f2c94c]">
                      sync
                    </span>
                    <p className="text-xs font-bold">Importando contas e transações...</p>
                  </div>
                </div>
              )}
              <iframe
                src={pluggyUrl}
                title="Pluggy Connect"
                allow="clipboard-read; clipboard-write"
                className="w-full h-full border-0"
              />
            </div>

            <div className="flex items-center justify-between text-xs text-[#99907b] pt-1">
              <span>Prefere abrir em tela cheia?</span>
              <a
                href={pluggyUrl}
                target="_blank"
                rel="noreferrer"
                className="text-[#f2c94c] hover:underline font-bold flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-sm">open_in_new</span>
                Abrir em Nova Aba
              </a>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <form onSubmit={handleManualSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-[#99907b] mb-1">
                  Item ID do Pluggy
                </label>
                <input
                  type="text"
                  value={manualItemId}
                  onChange={(e) => setManualItemId(e.target.value)}
                  placeholder="ex: 12345678-abcd-ef01-2345-6789abcdef01"
                  className="w-full px-4 py-2.5 rounded-xl bg-[#131313] border border-[#ffffff14] text-xs text-white placeholder-[#555] focus:outline-none focus:border-[#f2c94c]"
                />
              </div>

              <button
                type="submit"
                disabled={loading || !manualItemId.trim()}
                className="w-full py-2.5 rounded-xl bg-[#ffffff0a] hover:bg-[#ffffff14] border border-[#ffffff14] text-xs font-bold text-white transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? 'Conectando...' : 'Vincular Item ID'}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};

export default PluggyConnectFallbackModal;
