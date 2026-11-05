import React, { useState, useEffect, useCallback } from 'react';
import Sheet from '../ui/Sheet.js';
import Mel from '../brand/Mel.js';
import { Bank, CheckCircle, Info, CircleNotch } from '../ui/icons.js';
import api from '../../api/client.js';

interface PluggyConfigModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly onSaved?: () => void;
}

export const PluggyConfigModal: React.FC<PluggyConfigModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [fetching, setFetching] = useState(false);
  const [configStatus, setConfigStatus] = useState<{
    readonly hasCredentials: boolean;
  } | null>(null);

  const fetchCurrentConfig = useCallback(async () => {
    setFetching(true);
    try {
      const res = await api.get('/openfinance/config');
      setConfigStatus(res.data);
    } catch (err: unknown) {
      console.error('Erro ao consultar config Pluggy:', err);
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchCurrentConfig();
    }
  }, [isOpen, fetchCurrentConfig]);

  const footer = (
    <div className="flex items-center justify-end gap-3 w-full">
      <button
        type="button"
        onClick={onClose}
        className="min-h-[44px] px-6 py-2.5 rounded-2xl bg-card border border-ink/10 text-ink font-bold text-sm hover:bg-field transition"
      >
        Fechar
      </button>
    </div>
  );

  return (
    <Sheet
      open={isOpen}
      onClose={onClose}
      title="Open Finance (Pluggy.ai)"
      subtitle="Status da integração bancária e segurança de conexões"
      icon={<Mel size={44} mood={fetching ? 'thinking' : 'idle'} />}
      footer={footer}
    >
      <div className="space-y-4 py-2">
        {/* Status Badge */}
        {fetching ? (
          <div className="p-4 rounded-2xl bg-field border border-ink/5 flex items-center gap-2.5 text-xs text-muted">
            <CircleNotch size={18} className="animate-spin text-brand" />
            <span>Verificando credenciais de conexão no servidor...</span>
          </div>
        ) : configStatus?.hasCredentials ? (
          <div className="p-4 rounded-2xl bg-success/10 border border-success/30 space-y-2">
            <div className="flex items-center gap-2 text-success">
              <CheckCircle size={18} weight="bold" />
              <span className="text-xs font-extrabold">
                Integração Open Finance Ativa
              </span>
            </div>
            <p className="text-xs text-ink-soft leading-relaxed">
              As credenciais do conector Pluggy estão ativas no servidor. Suas sincronizações de contas correntes e cartões operam normalmente.
            </p>
          </div>
        ) : (
          <div className="p-4 rounded-2xl bg-primary/10 border border-primary/30 space-y-2">
            <div className="flex items-center gap-2 text-brand">
              <Info size={18} weight="bold" />
              <span className="text-xs font-extrabold">Credenciais não configuradas</span>
            </div>
            <p className="text-xs text-ink-soft leading-relaxed">
              As credenciais do Open Finance (Pluggy) são gerenciadas exclusivamente no ambiente de infraestrutura através das variáveis de ambiente <code className="text-ink font-mono bg-field px-1.5 py-0.5 rounded">PLUGGY_CLIENT_ID</code> e <code className="text-ink font-mono bg-field px-1.5 py-0.5 rounded">PLUGGY_CLIENT_SECRET</code>.
            </p>
          </div>
        )}

        <div className="text-xs text-muted bg-field/50 p-4 rounded-2xl border border-ink/5 space-y-1.5">
          <p className="font-bold text-ink flex items-center gap-1.5">
            <Bank size={16} className="text-brand" weight="duotone" />
            Segurança Bancária e Isolamento:
          </p>
          <p className="leading-relaxed">
            Por conformidade e proteção de dados bancários multitenant, credenciais de conectores bancários não podem ser modificadas por contas de usuário na aplicação.
          </p>
        </div>
      </div>
    </Sheet>
  );
};

export default PluggyConfigModal;
