import React, { useState } from 'react';
import api from '../../api/client.js';

export interface BankConnection {
  id: string;
  provider: string;
  institution: string;
  status: string;
  itemId: string | null;
  lastSyncAt: string | null;
  accounts: Array<{
    id: string;
    name: string;
    kind: string;
  }>;
  totalTransactions: number;
  pendingReviewCount: number;
}

interface BankConnectionsCardProps {
  connections: BankConnection[];
  onRefresh: () => void;
  onOpenPluggyConnect: () => void;
  onOpenConfig: () => void;
}

export const BankConnectionsCard: React.FC<BankConnectionsCardProps> = ({
  connections,
  onRefresh,
  onOpenPluggyConnect,
  onOpenConfig,
}) => {
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleSync = async (conn: BankConnection) => {
    setSyncingId(conn.id);
    try {
      const res = await api.post(`/openfinance/connections/${conn.id}/sync`);
      alert(
        `Sincronização concluída para ${conn.institution}! ` +
          `${res.data.importedTransactionsCount} novas transações importadas.`
      );
      onRefresh();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Falha ao sincronizar conexão com o Pluggy.');
    } finally {
      setSyncingId(null);
    }
  };

  const handleDelete = async (conn: BankConnection) => {
    if (
      !confirm(
        `Tem certeza que deseja desconectar a instituição "${conn.institution}"? Lançamentos não aprovados serão removidos.`
      )
    ) {
      return;
    }

    setDeletingId(conn.id);
    try {
      await api.delete(`/openfinance/connections/${conn.id}`);
      onRefresh();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Erro ao remover conexão bancária.');
    } finally {
      setDeletingId(null);
    }
  };

  const formatKind = (kind: string) => {
    switch (kind) {
      case 'conta_corrente':
        return 'Conta Corrente';
      case 'cartao_credito':
        return 'Cartão de Crédito';
      case 'poupanca':
        return 'Poupança';
      default:
        return 'Conta';
    }
  };

  const formatDate = (isoString: string | null) => {
    if (!isoString) return 'Nunca sincronizado';
    const d = new Date(isoString);
    return d.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="rounded-3xl bg-[#1c1b1b] border border-[#ffffff0d] p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#ffffff0d] pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#f2c94c]/10 border border-[#f2c94c]/30 flex items-center justify-center text-[#f2c94c]">
            <span className="material-symbols-outlined text-xl">hub</span>
          </div>
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              Bancos Conectados (Open Finance)
              <span className="text-[10px] uppercase font-black px-2 py-0.5 rounded bg-[#f2c94c]/20 text-[#f2c94c]">
                Pluggy AI
              </span>
            </h3>
            <p className="text-xs text-[#99907b]">
              Sincronize automaticamente transações de contas PJ e PF
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onOpenConfig}
            className="p-2.5 rounded-2xl bg-[#ffffff0a] hover:bg-[#ffffff14] border border-[#ffffff14] text-xs font-bold text-[#99907b] hover:text-white transition flex items-center gap-1.5"
            title="Configurar credenciais da API Pluggy"
          >
            <span className="material-symbols-outlined text-base">settings</span>
            <span className="hidden sm:inline">Chaves Pluggy</span>
          </button>

          <button
            onClick={onOpenPluggyConnect}
            className="px-4 py-2.5 rounded-2xl bg-[#f2c94c] text-[#131313] text-xs font-bold shadow-[0_0_15px_rgba(242,201,76,0.25)] hover:scale-[1.02] active:scale-[0.98] transition flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-base">add_link</span>
            Conectar Banco
          </button>
        </div>
      </div>

      {/* Connection List */}
      {connections.length === 0 ? (
        <div className="p-6 rounded-2xl bg-[#131313] border border-[#ffffff0a] text-center space-y-2">
          <span className="material-symbols-outlined text-3xl text-[#99907b]">account_balance</span>
          <p className="text-xs font-semibold text-white">Nenhum banco conectado via Open Finance</p>
          <p className="text-[11px] text-[#99907b] max-w-sm mx-auto">
            Clique em "Conectar Banco" para vincular seu Nubank, Itaú, Inter, Mercado Pago, Santander ou contas Sandbox.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {connections.map((conn) => {
            const isSyncing = syncingId === conn.id;
            const isDeleting = deletingId === conn.id;

            return (
              <div
                key={conn.id}
                className="p-4 rounded-2xl bg-[#131313] border border-[#ffffff14] flex flex-col justify-between gap-4"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-[#ffffff0a] border border-[#ffffff14] flex items-center justify-center text-[#f2c94c]">
                        <span className="material-symbols-outlined text-lg">account_balance</span>
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-white">{conn.institution}</h4>
                        <span className="text-[10px] text-[#99907b]">
                          {conn.accounts.length} {conn.accounts.length === 1 ? 'conta' : 'contas'} vinculada(s)
                        </span>
                      </div>
                    </div>

                    <span
                      className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded ${
                        conn.status === 'ativa'
                          ? 'bg-[#27ae60]/15 text-[#27ae60] border border-[#27ae60]/30'
                          : 'bg-[#eb5757]/15 text-[#eb5757] border border-[#eb5757]/30'
                      }`}
                    >
                      {conn.status}
                    </span>
                  </div>

                  {/* Accounts badges */}
                  <div className="flex flex-wrap gap-1.5">
                    {conn.accounts.map((acc) => (
                      <span
                        key={acc.id}
                        className="text-[11px] font-medium px-2 py-0.5 rounded-lg bg-[#ffffff08] border border-[#ffffff0f] text-[#ccc]"
                      >
                        {acc.name} ({formatKind(acc.kind)})
                      </span>
                    ))}
                  </div>

                  <div className="text-[11px] text-[#99907b] flex items-center justify-between pt-1">
                    <span>Último sync: {formatDate(conn.lastSyncAt)}</span>
                    {conn.pendingReviewCount > 0 && (
                      <span className="text-[#f2c94c] font-bold">
                        {conn.pendingReviewCount} pendente(s)
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-2 border-t border-[#ffffff0a] pt-3">
                  <button
                    onClick={() => handleDelete(conn)}
                    disabled={isDeleting || isSyncing}
                    className="p-2 rounded-xl text-[#99907b] hover:text-[#eb5757] hover:bg-[#ffffff0a] transition disabled:opacity-50"
                    title="Desconectar banco"
                  >
                    <span className="material-symbols-outlined text-sm">
                      {isDeleting ? 'hourglass_top' : 'delete'}
                    </span>
                  </button>

                  <button
                    onClick={() => handleSync(conn)}
                    disabled={isSyncing || isDeleting}
                    className="px-3 py-1.5 rounded-xl bg-[#ffffff0a] hover:bg-[#ffffff14] border border-[#f2c94c]/30 text-xs font-bold text-[#f2c94c] transition disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <span
                      className={`material-symbols-outlined text-sm ${
                        isSyncing ? 'animate-spin' : ''
                      }`}
                    >
                      sync
                    </span>
                    {isSyncing ? 'Sincronizando...' : 'Sincronizar'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default BankConnectionsCard;
