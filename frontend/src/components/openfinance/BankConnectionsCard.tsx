import React, { useState } from 'react';
import api from '../../api/client.js';
import { useToast } from '../ui/Toast.js';
import ConfirmDialog from '../ui/ConfirmDialog.js';
import {
  Bank,
  ArrowsClockwise,
  Trash,
  Plus,
  Gear,
  CircleNotch,
} from '../ui/icons.js';

export interface BankConnection {
  readonly id: string;
  readonly provider: string;
  readonly institution: string;
  readonly status: string;
  readonly itemId: string | null;
  readonly lastSyncAt: string | null;
  readonly accounts: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly kind: string;
  }>;
  readonly totalTransactions: number;
  readonly pendingReviewCount: number;
}

interface BankConnectionsCardProps {
  readonly connections: readonly BankConnection[];
  readonly onRefresh: () => void;
  readonly onOpenPluggyConnect: () => void;
  readonly onOpenConfig: () => void;
}

export const BankConnectionsCard: React.FC<BankConnectionsCardProps> = ({
  connections,
  onRefresh,
  onOpenPluggyConnect,
  onOpenConfig,
}) => {
  const toast = useToast();
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [connectionToDelete, setConnectionToDelete] = useState<BankConnection | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleSync = async (conn: BankConnection) => {
    setSyncingId(conn.id);
    try {
      const res = await api.post(`/openfinance/connections/${conn.id}/sync`);
      const count = res.data?.importedTransactionsCount || 0;
      toast.success(
        `Sincronização concluída para ${conn.institution}! ${count} novos lançamentos importados.`
      );
      onRefresh();
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err && (err as { response?: { data?: { message?: string } } }).response?.data?.message
          ? (err as { response: { data: { message: string } } }).response.data.message
          : 'Falha ao sincronizar conexão com o conector bancário.';
      toast.error(msg);
    } finally {
      setSyncingId(null);
    }
  };

  const confirmDeleteConnection = async () => {
    if (!connectionToDelete) return;
    setDeleting(true);
    try {
      await api.delete(`/openfinance/connections/${connectionToDelete.id}`);
      toast.success(`Instituição "${connectionToDelete.institution}" desconectada.`);
      setConnectionToDelete(null);
      onRefresh();
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err && (err as { response?: { data?: { message?: string } } }).response?.data?.message
          ? (err as { response: { data: { message: string } } }).response.data.message
          : 'Erro ao remover conexão bancária.';
      toast.error(msg);
    } finally {
      setDeleting(false);
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
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return 'Nunca sincronizado';
      return d.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return 'Nunca sincronizado';
    }
  };

  return (
    <div className="card-surface p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-ink/5 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-primary-soft text-brand flex items-center justify-center shrink-0">
            <Bank size={22} weight="duotone" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-extrabold text-ink">Bancos e Contas Conectadas</h2>
            <p className="text-xs text-muted">
              Sincronização via Open Finance Pluggy.ai e importações de extratos
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={onOpenConfig}
            className="min-h-[44px] px-3.5 py-2 rounded-2xl bg-field border border-ink/5 hover:border-ink/15 text-muted hover:text-ink text-xs font-bold transition flex items-center gap-1.5"
            title="Configurações do conector"
          >
            <Gear size={16} weight="bold" />
            <span>Configurações</span>
          </button>

          <button
            type="button"
            onClick={onOpenPluggyConnect}
            className="min-h-[44px] px-4 py-2 rounded-2xl bg-primary text-on-primary text-xs font-bold hover:bg-primary-deep transition flex items-center gap-1.5 shadow-[var(--shadow-honey)]"
          >
            <Plus size={16} weight="bold" />
            <span>Conectar Novo Banco</span>
          </button>
        </div>
      </div>

      {/* List of Connections */}
      {connections.length === 0 ? (
        <div className="text-center py-8 px-4 border border-dashed border-ink/10 rounded-2xl bg-canvas space-y-2">
          <Bank size={36} className="text-muted mx-auto" weight="duotone" />
          <p className="text-xs font-bold text-ink">Nenhuma instituição bancária conectada</p>
          <p className="text-xs text-muted max-w-sm mx-auto">
            Conecte sua conta jurídica ou pessoal via Open Finance para puxar extratos automaticamente, ou importe arquivos OFX / CSV abaixo.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {connections.map((conn) => {
            const isSyncing = syncingId === conn.id;

            return (
              <div
                key={conn.id}
                className="p-4 rounded-2xl bg-canvas border border-ink/8 flex flex-col justify-between gap-3 hover:border-primary/40 transition"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-primary-soft text-brand flex items-center justify-center shrink-0">
                        <Bank size={18} weight="bold" />
                      </div>
                      <div>
                        <h3 className="font-extrabold text-sm text-ink">{conn.institution}</h3>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-success/10 text-success border border-success/20 uppercase tracking-tight">
                          {conn.status}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleSync(conn)}
                        disabled={isSyncing}
                        aria-label={`Sincronizar ${conn.institution}`}
                        className="min-h-[40px] min-w-[40px] p-2 text-muted hover:text-brand rounded-xl hover:bg-field transition disabled:opacity-40 flex items-center justify-center"
                        title="Sincronizar agora"
                      >
                        {isSyncing ? (
                          <CircleNotch size={18} className="animate-spin text-brand" />
                        ) : (
                          <ArrowsClockwise size={18} weight="bold" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConnectionToDelete(conn)}
                        aria-label={`Desconectar ${conn.institution}`}
                        className="min-h-[40px] min-w-[40px] p-2 text-muted hover:text-danger rounded-xl hover:bg-danger/10 transition flex items-center justify-center"
                        title="Desconectar instituição"
                      >
                        <Trash size={18} weight="bold" />
                      </button>
                    </div>
                  </div>

                  {/* Accounts Details */}
                  {conn.accounts && conn.accounts.length > 0 && (
                    <div className="mt-3 space-y-1">
                      {conn.accounts.map((acc) => (
                        <div
                          key={acc.id}
                          className="flex items-center justify-between text-xs py-1 px-2.5 rounded-xl bg-field/60 border border-ink/4"
                        >
                          <span className="font-medium text-ink truncate max-w-[160px]">
                            {acc.name}
                          </span>
                          <span className="text-[10px] text-muted font-bold">
                            {formatKind(acc.kind)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Footer metrics */}
                <div className="pt-2 border-t border-ink/5 flex items-center justify-between text-[11px] text-muted">
                  <span>Última sinc: {formatDate(conn.lastSyncAt)}</span>
                  {conn.pendingReviewCount > 0 ? (
                    <span className="font-bold text-brand bg-primary/10 px-2 py-0.5 rounded-lg">
                      {conn.pendingReviewCount} para revisão
                    </span>
                  ) : (
                    <span className="font-bold text-success">Em dia</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Confirm Dialog para Desconectar */}
      <ConfirmDialog
        open={Boolean(connectionToDelete)}
        onClose={() => setConnectionToDelete(null)}
        onConfirm={confirmDeleteConnection}
        loading={deleting}
        title="Desconectar Instituição Bancária"
        description={`Tem certeza de que deseja desconectar "${connectionToDelete?.institution}"? Os lançamentos bancários pendentes de revisão desta instituição serão removidos.`}
        confirmLabel="Sim, desconectar"
        cancelLabel="Cancelar"
        confirmVariant="danger"
      />
    </div>
  );
};

export default BankConnectionsCard;
