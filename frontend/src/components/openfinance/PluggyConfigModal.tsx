import React, { useState, useEffect, useCallback } from 'react';
import api from '../../api/client.js';

interface PluggyConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export const PluggyConfigModal: React.FC<PluggyConfigModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [fetching, setFetching] = useState(false);
  const [configStatus, setConfigStatus] = useState<{
    hasCredentials: boolean;
  } | null>(null);

  const fetchCurrentConfig = useCallback(async () => {
    setFetching(true);
    try {
      const res = await api.get('/openfinance/config');
      setConfigStatus(res.data);
    } catch (err: any) {
      console.error('Erro ao consultar config Pluggy:', err);
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    fetchCurrentConfig();
  }, [isOpen, fetchCurrentConfig]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg rounded-3xl bg-card border border-ink/10 p-6 shadow-2xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-ink/5 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-primary/10 border border-primary/30 flex items-center justify-center text-brand">
              <span className="material-symbols-outlined text-xl">account_balance</span>
            </div>
            <div>
              <h3 className="text-lg font-bold text-ink">Open Finance (Pluggy.ai)</h3>
              <p className="text-xs text-muted">Status da integração bancária automática</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-muted hover:text-ink rounded-xl hover:bg-ink/4 transition"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        {/* Status Badge */}
        {fetching ? (
          <div className="p-3 rounded-2xl bg-ink/4 border border-ink/5 flex items-center gap-2 text-xs text-muted">
            <span className="material-symbols-outlined animate-spin text-sm">sync</span>
            Verificando credenciais no servidor...
          </div>
        ) : configStatus?.hasCredentials ? (
          <div className="p-4 rounded-2xl bg-success/10 border border-success/30 space-y-2">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-success text-base">check_circle</span>
              <span className="text-xs font-bold text-ink">
                Integração Pluggy Ativa
              </span>
            </div>
            <p className="text-xs text-ink-soft">
              As credenciais estão configuradas centralmente no ambiente de deploy da plataforma.
            </p>
          </div>
        ) : (
          <div className="p-4 rounded-2xl bg-primary/10 border border-primary/30 space-y-2">
            <div className="flex items-center gap-2 text-brand">
              <span className="material-symbols-outlined text-base">info</span>
              <span className="text-xs font-bold">Credenciais não configuradas</span>
            </div>
            <p className="text-xs text-ink-soft">
              As credenciais do Open Finance (Pluggy) são gerenciadas exclusivamente no ambiente de infraestrutura pelo administrador da plataforma através das variáveis de ambiente <code className="text-ink font-mono">PLUGGY_CLIENT_ID</code> e <code className="text-ink font-mono">PLUGGY_CLIENT_SECRET</code>.
            </p>
          </div>
        )}

        <div className="text-[11px] text-muted bg-ink/4 p-3.5 rounded-xl border border-ink/4 space-y-1">
          <p className="font-semibold text-ink">Segurança e Isolamento:</p>
          <p>
            Por conformidade e proteção de dados bancários multitenant, credenciais de conectores bancários não podem ser modificadas por contas de usuário na aplicação.
          </p>
        </div>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-ink/5">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-field hover:bg-raised text-ink text-xs font-bold transition"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};

export default PluggyConfigModal;
