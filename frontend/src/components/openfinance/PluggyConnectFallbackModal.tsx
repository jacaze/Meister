import React, { useState } from 'react';
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

  const pluggyUrl = connectToken ? `https://connect.pluggy.ai/?token=${connectToken}` : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md rounded-3xl bg-[#1c1b1b] border border-[#ffffff1a] p-6 shadow-2xl space-y-6">
        <div className="flex items-center justify-between border-b border-[#ffffff0d] pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#f2c94c]/10 border border-[#f2c94c]/30 flex items-center justify-center text-[#f2c94c]">
              <span className="material-symbols-outlined text-xl">open_in_browser</span>
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Conexão Pluggy Connect</h3>
              <p className="text-xs text-[#99907b]">Assistente de Conexão Open Finance</p>
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

        <div className="space-y-4">
          <p className="text-xs text-[#99907b]">
            Caso o widget flutuante não tenha aberto automaticamente no seu navegador devido a bloqueadores de pop-up, utilize uma das opções abaixo:
          </p>

          {pluggyUrl && (
            <a
              href={pluggyUrl}
              target="_blank"
              rel="noreferrer"
              className="w-full py-3 px-4 rounded-xl bg-[#f2c94c] text-[#131313] text-xs font-bold flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition"
            >
              <span className="material-symbols-outlined text-base">open_in_new</span>
              Abrir Pluggy Connect em Nova Aba
            </a>
          )}

          <div className="relative flex py-2 items-center">
            <div className="flex-grow border-t border-[#ffffff0d]"></div>
            <span className="flex-shrink mx-4 text-[10px] font-bold text-[#555] uppercase">
              ou informe o Item ID manualmente
            </span>
            <div className="flex-grow border-t border-[#ffffff0d]"></div>
          </div>

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
      </div>
    </div>
  );
};
