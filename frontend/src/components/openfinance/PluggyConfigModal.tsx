import React, { useState, useEffect, useCallback } from 'react';
import api from '../../api/client.js';

interface PluggyConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export const PluggyConfigModal: React.FC<PluggyConfigModalProps> = ({
  isOpen,
  onClose,
  onSaved,
}) => {
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [configStatus, setConfigStatus] = useState<{
    hasCredentials: boolean;
    clientIdMasked: string | null;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

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
    setErrorMessage(null);
    setSuccessMessage(null);
    setClientId('');
    setClientSecret('');
    fetchCurrentConfig();
  }, [isOpen, fetchCurrentConfig]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!clientId.trim() || !clientSecret.trim()) {
      setErrorMessage('Preencha o Client ID e o Client Secret do Pluggy.');
      return;
    }

    setLoading(true);
    try {
      const res = await api.post('/openfinance/config', {
        clientId: clientId.trim(),
        clientSecret: clientSecret.trim(),
      });
      setConfigStatus({
        hasCredentials: res.data.hasCredentials,
        clientIdMasked: res.data.clientIdMasked,
      });
      setSuccessMessage('Credenciais do Pluggy validadas e ativadas com sucesso!');
      onSaved();
    } catch (err: any) {
      const msg = err.response?.data?.message || err.message || 'Falha ao salvar credenciais do Pluggy.';
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async () => {
    if (!confirm('Deseja realmente remover as credenciais do Pluggy?')) return;
    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await api.post('/openfinance/config', {
        clientId: '',
        clientSecret: '',
      });
      setConfigStatus({ hasCredentials: false, clientIdMasked: null });
      setSuccessMessage('Credenciais do Pluggy removidas.');
      onSaved();
    } catch (err: any) {
      setErrorMessage(err.response?.data?.message || 'Erro ao remover credenciais.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg rounded-3xl bg-[#1c1b1b] border border-[#ffffff1a] p-6 shadow-2xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#ffffff0d] pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#f2c94c]/10 border border-[#f2c94c]/30 flex items-center justify-center text-[#f2c94c]">
              <span className="material-symbols-outlined text-xl">account_balance</span>
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Configuração Open Finance (Pluggy)</h3>
              <p className="text-xs text-[#99907b]">Conecte sua conta do desenvolvedor Pluggy.ai</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-[#99907b] hover:text-white rounded-xl hover:bg-[#ffffff0a] transition"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        {/* Status Badge */}
        {fetching ? (
          <div className="p-3 rounded-2xl bg-[#ffffff05] border border-[#ffffff0d] flex items-center gap-2 text-xs text-[#99907b]">
            <span className="material-symbols-outlined animate-spin text-sm">sync</span>
            Verificando credenciais...
          </div>
        ) : configStatus?.hasCredentials ? (
          <div className="p-3.5 rounded-2xl bg-[#27ae60]/10 border border-[#27ae60]/30 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[#27ae60] text-sm">check_circle</span>
              <span className="text-xs font-bold text-white">
                Pluggy Ativo ({configStatus.clientIdMasked})
              </span>
            </div>
            <button
              onClick={handleRemove}
              disabled={loading}
              className="text-[11px] font-bold text-[#eb5757] hover:underline disabled:opacity-50"
            >
              Remover
            </button>
          </div>
        ) : (
          <div className="p-3.5 rounded-2xl bg-[#f2c94c]/10 border border-[#f2c94c]/30 flex items-center gap-2 text-xs text-[#f2c94c]">
            <span className="material-symbols-outlined text-sm">info</span>
            Nenhuma credencial configurada. Preencha seus dados abaixo.
          </div>
        )}

        {/* Feedback Messages */}
        {errorMessage && (
          <div className="p-3.5 rounded-2xl bg-[#eb5757]/10 border border-[#eb5757]/30 text-xs text-[#eb5757] flex items-center gap-2">
            <span className="material-symbols-outlined text-sm shrink-0">error</span>
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="p-3.5 rounded-2xl bg-[#27ae60]/10 border border-[#27ae60]/30 text-xs text-[#27ae60] flex items-center gap-2">
            <span className="material-symbols-outlined text-sm shrink-0">check_circle</span>
            <span>{successMessage}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-[#99907b] mb-1.5">
              Client ID do Pluggy
            </label>
            <input
              type="text"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="ex: 12345678-abcd-ef01-2345-6789abcdef01"
              className="w-full px-4 py-2.5 rounded-xl bg-[#131313] border border-[#ffffff14] text-xs text-white placeholder-[#555] focus:outline-none focus:border-[#f2c94c]"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-[#99907b] mb-1.5">
              Client Secret do Pluggy
            </label>
            <input
              type="password"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              placeholder="Cole seu client secret aqui"
              className="w-full px-4 py-2.5 rounded-xl bg-[#131313] border border-[#ffffff14] text-xs text-white placeholder-[#555] focus:outline-none focus:border-[#f2c94c]"
              required
            />
          </div>

          <div className="text-[11px] text-[#99907b] bg-[#ffffff05] p-3 rounded-xl border border-[#ffffff0a] space-y-1">
            <p className="font-semibold text-white">Como obter suas chaves:</p>
            <p>
              1. Acesse o{' '}
              <a
                href="https://dashboard.pluggy.ai"
                target="_blank"
                rel="noreferrer"
                className="text-[#f2c94c] hover:underline inline-flex items-center gap-0.5"
              >
                Dashboard da Pluggy <span className="material-symbols-outlined text-[10px]">open_in_new</span>
              </a>.
            </p>
            <p>2. No menu lateral, acesse <strong>API Keys</strong>.</p>
            <p>3. Copie o <strong>Client ID</strong> e crie ou copie o <strong>Client Secret</strong>.</p>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#ffffff0d]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-[#99907b] hover:text-white transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 rounded-xl bg-[#f2c94c] text-[#131313] text-xs font-bold hover:scale-[1.02] active:scale-[0.98] transition disabled:opacity-50 flex items-center gap-2"
            >
              {loading && <span className="material-symbols-outlined text-sm animate-spin">sync</span>}
              {loading ? 'Validando...' : 'Salvar e Validar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PluggyConfigModal;
