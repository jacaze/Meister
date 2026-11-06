import React, { useEffect, useState, useRef, useCallback } from 'react';
import api from '../api/client.js';
import {
  BankConnectionsCard,
  type BankConnection,
} from '../components/openfinance/BankConnectionsCard.js';
import { PluggyConfigModal } from '../components/openfinance/PluggyConfigModal.js';
import { PluggyConnectFallbackModal } from '../components/openfinance/PluggyConnectFallbackModal.js';
import { formatBRL } from '../lib/money.js';
import { useToast } from '../components/ui/Toast.js';
import Mel from '../components/brand/Mel.js';
import ConfirmDialog from '../components/ui/ConfirmDialog.js';
import {
  UploadSimple,
  Plus,
  Check,
  X,
  WarningCircle,
  Tag,
  ArrowsClockwise,
  ArrowDown,
  ArrowUp,
  CircleNotch,
} from '../components/ui/icons.js';
import { decodeStatement } from '../lib/statementEncoding.js';

interface Category {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly type: string;
}

interface BankTransactionItem {
  readonly id: string;
  readonly direction: 'in' | 'out';
  readonly amount: string;
  readonly occurredOn: string;
  readonly description: string;
  readonly provider: string;
  readonly status: string;
  readonly suggestedCategoryId?: string;
  readonly isTransferSuspect?: boolean;
}

function formatDateBR(dateStr?: string | null): string {
  if (!dateStr) return '-';
  const clean = dateStr.slice(0, 10);
  const [y, m, d] = clean.split('-');
  return `${d}/${m}/${y}`;
}

export const ReviewInboxPage: React.FC = () => {
  const toast = useToast();
  const [items, setItems] = useState<readonly BankTransactionItem[]>([]);
  const [categories, setCategories] = useState<readonly Category[]>([]);
  const [connections, setConnections] = useState<readonly BankConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'nova' | 'importada' | 'ignorada'>('nova');
  const [selectedCategories, setSelectedCategories] = useState<Record<string, string>>({});

  // Modals state
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);
  const [activeConnectToken, setActiveConnectToken] = useState<string | null>(null);

  // Batch approve dialog
  const [isBatchConfirmOpen, setIsBatchConfirmOpen] = useState(false);
  const [batchLoading, setBatchLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [itemsRes, catsRes, connsRes] = await Promise.all([
        api.get('/imports', { params: { status: statusFilter } }),
        api.get('/categories'),
        api.get('/openfinance/connections'),
      ]);

      const fetchedItems: readonly BankTransactionItem[] = itemsRes.data?.items || [];
      setItems(fetchedItems);
      setCategories(catsRes.data || []);
      setConnections(connsRes.data?.connections || []);

      // Pre-fill categories from suggested
      const catMap: Record<string, string> = {};
      for (const it of fetchedItems) {
        if (it.suggestedCategoryId) {
          catMap[it.id] = it.suggestedCategoryId;
        }
      }
      setSelectedCategories(catMap);
    } catch (err) {
      console.error('Erro ao buscar dados da caixa de revisão:', err);
      toast.error('Não foi possível carregar os lançamentos de extrato.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle OFX / CSV upload with robust latin1 / UTF-8 encoding support
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const buffer = await file.arrayBuffer();
      const isOfx = /\.ofx$/i.test(file.name);
      const provider = isOfx ? 'ofx' : 'csv';

      const text = decodeStatement(buffer);

      const res = await api.post('/imports/statement', {
        content: text,
        provider,
        institution: file.name,
      });

      const count = res.data?.importedCount || 0;
      toast.success(`Extrato processado com sucesso! ${count} novas transações importadas.`);
      setStatusFilter('nova');
      await fetchData();
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err && (err as { response?: { data?: { message?: string } } }).response?.data?.message
          ? (err as { response: { data: { message: string } } }).response.data.message
          : 'Erro ao processar arquivo de extrato.';
      toast.error(msg);
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Direct Pluggy Connect initialization via widget component
  const handleOpenPluggyConnect = async () => {
    setConnecting(true);
    try {
      // 1. Checagem prévia de configuração do Pluggy
      const configRes = await api.get('/openfinance/config');
      if (!configRes.data?.hasCredentials) {
        setIsConfigModalOpen(true);
        return;
      }

      // 2. Obtenção do token de conexão
      const res = await api.post('/openfinance/connect-token');
      const connectToken = res.data?.accessToken || res.data?.connectToken;

      if (!connectToken) {
        throw new Error('Servidor não retornou token de conexão Pluggy.');
      }

      setActiveConnectToken(connectToken);
      setIsConnectModalOpen(true);
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err && (err as { response?: { data?: { message?: string } } }).response?.data?.message
          ? (err as { response: { data: { message: string } } }).response.data.message
          : 'Erro ao iniciar conexão com o conector bancário.';

      toast.error(msg);
      if (
        msg.includes('Credenciais') ||
        msg.includes('autenticação') ||
        msg.includes('invalid') ||
        msg.includes('401')
      ) {
        setIsConfigModalOpen(true);
      }
    } finally {
      setConnecting(false);
    }
  };

  const handleApprove = async (item: BankTransactionItem) => {
    try {
      const categoryId = selectedCategories[item.id] || item.suggestedCategoryId;
      await api.post('/imports/approve', {
        bankTransactionId: item.id,
        categoryId,
      });
      toast.success('Lançamento conciliado e aprovado!');
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err && (err as { response?: { data?: { message?: string } } }).response?.data?.message
          ? (err as { response: { data: { message: string } } }).response.data.message
          : 'Erro ao aprovar lançamento.';
      toast.error(msg);
    }
  };

  const handleIgnore = async (item: BankTransactionItem) => {
    try {
      await api.post('/imports/ignore', { bankTransactionId: item.id });
      toast.info('Lançamento ignorado da fila.');
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err && (err as { response?: { data?: { message?: string } } }).response?.data?.message
          ? (err as { response: { data: { message: string } } }).response.data.message
          : 'Erro ao ignorar lançamento.';
      toast.error(msg);
    }
  };

  // Transações elegíveis para aprovação em lote (exclui suspeitas de transferência interna)
  const eligibleItems = items.filter((it) => !it.isTransferSuspect);
  const suspectItems = items.filter((it) => it.isTransferSuspect);

  const confirmBatchApprove = async () => {
    if (eligibleItems.length === 0) {
      setIsBatchConfirmOpen(false);
      return;
    }

    setBatchLoading(true);
    try {
      const payload = eligibleItems.map((it) => ({
        bankTransactionId: it.id,
        categoryId: selectedCategories[it.id] || it.suggestedCategoryId,
      }));

      const res = await api.post('/imports/batch-approve', { items: payload });
      const approvedCount = res.data?.approvedCount || 0;

      if (approvedCount === eligibleItems.length) {
        toast.success(`Todas as ${approvedCount} transações foram aprovadas com sucesso!`);
      } else {
        toast.warning(
          `${approvedCount} de ${eligibleItems.length} foram aprovadas. Algumas transações falharam e permaneceram na fila.`
        );
      }

      setIsBatchConfirmOpen(false);
      await fetchData();
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err && (err as { response?: { data?: { message?: string } } }).response?.data?.message
          ? (err as { response: { data: { message: string } } }).response.data.message
          : 'Erro ao aprovar em lote.';
      toast.error(msg);
    } finally {
      setBatchLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-ink tracking-tight">
            Extratos & Open Finance
          </h1>
          <p className="text-xs sm:text-sm text-muted mt-0.5">
            Conciliação bancária automática com suporte a Open Finance, arquivos OFX e planilhas CSV.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          <input
            ref={fileInputRef}
            type="file"
            accept=".ofx,.OFX,.csv,.CSV"
            className="hidden"
            onChange={handleFileUpload}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="min-h-[44px] px-4 py-2 rounded-2xl bg-card border border-ink/10 hover:border-ink/20 text-xs font-bold text-ink flex items-center justify-center gap-2 transition disabled:opacity-50"
          >
            {uploading ? (
              <CircleNotch size={16} className="animate-spin text-brand" />
            ) : (
              <UploadSimple size={16} weight="bold" />
            )}
            <span>{uploading ? 'Processando Extrato...' : 'Importar OFX / CSV'}</span>
          </button>

          <button
            type="button"
            onClick={handleOpenPluggyConnect}
            disabled={connecting}
            className="min-h-[44px] px-4 py-2 rounded-2xl bg-primary text-on-primary text-xs font-bold hover:bg-primary-deep transition flex items-center gap-2 shadow-[var(--shadow-honey)] disabled:opacity-50"
          >
            {connecting ? (
              <CircleNotch size={16} className="animate-spin" />
            ) : (
              <Plus size={16} weight="bold" />
            )}
            <span>Conectar Banco</span>
          </button>
        </div>
      </div>

      {/* Cartão de Bancos Conectados */}
      <BankConnectionsCard
        connections={connections}
        onRefresh={fetchData}
        onOpenPluggyConnect={handleOpenPluggyConnect}
        onOpenConfig={() => setIsConfigModalOpen(true)}
      />

      {/* Fila de Revisão de Lançamentos */}
      <div className="card-surface p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-ink/5 pb-4">
          <div>
            <h2 className="text-base sm:text-lg font-extrabold text-ink">Fila de Revisão de Lançamentos</h2>
            <p className="text-xs text-muted">
              Classifique e aprove as transações importadas antes de integrá-las aos seus relatórios.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Status Filter Chips */}
            <div className="flex items-center bg-canvas rounded-2xl p-1 border border-ink/5">
              {(
                [
                  { id: 'nova', label: 'Pendentes' },
                  { id: 'importada', label: 'Aprovadas' },
                  { id: 'ignorada', label: 'Ignoradas' },
                ] as const
              ).map((tab) => {
                const active = statusFilter === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setStatusFilter(tab.id)}
                    className={`min-h-[38px] px-3 py-1 rounded-xl text-xs font-bold transition ${
                      active
                        ? 'bg-card text-ink shadow-sm border border-ink/5'
                        : 'text-muted hover:text-ink'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Botão Aprovar Todos (visível apenas na aba de novas) */}
            {statusFilter === 'nova' && items.length > 0 && (
              <button
                type="button"
                onClick={() => setIsBatchConfirmOpen(true)}
                className="min-h-[44px] px-4 py-2 rounded-2xl bg-success text-ink font-extrabold text-xs hover:bg-success/90 transition flex items-center gap-1.5 shadow-sm"
              >
                <Check size={16} weight="bold" />
                <span>Aprovar Todos ({eligibleItems.length})</span>
              </button>
            )}
          </div>
        </div>

        {/* Alerta de Transações Suspeitas de Transferência */}
        {statusFilter === 'nova' && suspectItems.length > 0 && (
          <div className="p-4 bg-primary-soft/60 border border-primary/30 rounded-2xl flex items-start gap-3">
            <WarningCircle size={20} className="text-brand shrink-0 mt-0.5" weight="bold" />
            <div className="text-xs text-ink-soft space-y-1">
              <p className="font-bold text-brand">
                {suspectItems.length} transação(ões) identificada(s) como possível transferência interna
              </p>
              <p className="leading-relaxed">
                Transações entre sua conta PJ e conta física (PF) são destacadas para que você as revise individualmente. Elas não são incluídas no botão "Aprovar Todos" para evitar distorção do seu faturamento bruto MEI.
              </p>
            </div>
          </div>
        )}

        {/* Lista de Transações */}
        {loading ? (
          <div className="space-y-3" aria-busy="true">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="p-4 bg-canvas rounded-2xl border border-ink/5 flex items-center justify-between gap-4">
                <div className="space-y-2 flex-1">
                  <div className="skeleton h-4 w-1/3 rounded-full" />
                  <div className="skeleton h-3 w-1/4 rounded-full" />
                </div>
                <div className="skeleton h-8 w-24 rounded-xl" />
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-12 px-4 bg-card-2 rounded-2xl ring-1 ring-ink/5 space-y-2">
            <Mel size={64} mood="happy" />
            <p className="text-sm font-bold text-ink">Nenhuma transação {statusFilter === 'nova' ? 'pendente de revisão' : statusFilter}</p>
            <p className="text-xs text-muted max-w-sm mx-auto">
              {statusFilter === 'nova'
                ? 'Todos os extratos bancários importados já foram conciliados.'
                : 'Não há registros com este status no momento.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => {
              const isReceita = item.direction === 'in';
              const isSuspect = item.isTransferSuspect;

              return (
                <div
                  key={item.id}
                  className={`p-4 rounded-2xl border transition flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                    isSuspect
                      ? 'bg-primary-soft/30 border-primary/40 shadow-sm'
                      : 'bg-canvas border-ink/8 hover:border-ink/15'
                  }`}
                >
                  {/* Left: Direction + Info */}
                  <div className="flex items-start gap-3.5 flex-1 min-w-0">
                    <div
                      className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                        isReceita
                          ? 'bg-success/15 text-success'
                          : 'bg-danger/15 text-danger'
                      }`}
                    >
                      {isReceita ? (
                        <ArrowDown size={18} weight="bold" />
                      ) : (
                        <ArrowUp size={18} weight="bold" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-extrabold text-sm text-ink truncate max-w-md">
                          {item.description}
                        </span>
                        {isSuspect && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-primary-soft text-brand border border-primary/30">
                            <WarningCircle size={12} weight="bold" />
                            Possível Transferência Interna
                          </span>
                        )}
                        <span className="text-[10px] font-semibold text-muted uppercase">
                          {item.provider}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 text-xs text-muted">
                        <span>Data: {formatDateBR(item.occurredOn)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Middle: Category Selector */}
                  {statusFilter === 'nova' && (
                    <div className="w-full md:w-56 shrink-0">
                      <select
                        value={selectedCategories[item.id] || item.suggestedCategoryId || ''}
                        onChange={(e) =>
                          setSelectedCategories((prev) => ({
                            ...prev,
                            [item.id]: e.target.value,
                          }))
                        }
                        className="w-full min-h-[44px] px-3 py-2 bg-card border border-ink/10 rounded-xl text-xs font-bold text-ink focus:outline-none focus:border-primary transition"
                      >
                        <option value="">(Selecione a categoria)</option>
                        {categories
                          .filter((c) => (isReceita ? c.type === 'receita' : c.type === 'despesa'))
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                      </select>
                    </div>
                  )}

                  {/* Right: Amount & Actions */}
                  <div className="flex items-center justify-between md:justify-end gap-3 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-ink/5">
                    <span
                      className={`text-base font-extrabold tabular ${
                        isReceita ? 'text-success' : 'text-danger'
                      }`}
                    >
                      {isReceita ? '+' : '-'} {formatBRL(item.amount)}
                    </span>

                    {statusFilter === 'nova' && (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleIgnore(item)}
                          aria-label="Ignorar transação"
                          className="min-h-[44px] min-w-[44px] p-2 text-muted hover:text-danger rounded-xl hover:bg-danger/10 transition flex items-center justify-center border border-ink/5"
                          title="Ignorar transação"
                        >
                          <X size={18} weight="bold" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleApprove(item)}
                          aria-label="Aprovar transação"
                          className="min-h-[44px] px-3 py-2 bg-primary text-on-primary font-bold text-xs rounded-xl hover:bg-primary-deep transition flex items-center gap-1.5 shadow-[var(--shadow-honey)]"
                        >
                          <Check size={16} weight="bold" />
                          <span>Aprovar</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal de Conexão Pluggy (Sheet) */}
      <PluggyConnectFallbackModal
        isOpen={isConnectModalOpen}
        connectToken={activeConnectToken}
        onClose={() => {
          setIsConnectModalOpen(false);
          setActiveConnectToken(null);
        }}
        onSuccess={() => fetchData()}
      />

      {/* Modal de Status de Configuração Pluggy (Sheet) */}
      <PluggyConfigModal
        isOpen={isConfigModalOpen}
        onClose={() => setIsConfigModalOpen(false)}
      />

      {/* Diálogo de Confirmação para Aprovação em Lote */}
      <ConfirmDialog
        open={isBatchConfirmOpen}
        onClose={() => setIsBatchConfirmOpen(false)}
        onConfirm={confirmBatchApprove}
        loading={batchLoading}
        title="Aprovar Todos os Lançamentos"
        description={
          suspectItems.length > 0
            ? `Deseja aprovar ${eligibleItems.length} lançamento(s) elegível(is)? Atenção: ${suspectItems.length} transação(ões) com suspeita de transferência foram preservadas para sua revisão manual.`
            : `Tem certeza de que deseja aprovar todas as ${eligibleItems.length} transações da fila de revisão?`
        }
        confirmLabel="Sim, aprovar lote"
        cancelLabel="Cancelar"
        confirmVariant="primary"
      />
    </div>
  );
};

export default ReviewInboxPage;
