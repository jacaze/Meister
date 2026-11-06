import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';
import { useToast } from '../components/ui/Toast.js';
import ConfirmDialog from '../components/ui/ConfirmDialog.js';
import {
  UserCircle,
  Gear,
  Storefront,
  TelegramLogo,
  ShieldCheck,
  SignOut,
  CheckCircle,
  WarningCircle,
  CircleNotch,
  ArrowSquareOut,
  FileText,
} from '../components/ui/icons.js';
import { todayLocalIso } from '../lib/date.js';

// Algoritmo oficial de validação de dígitos verificadores do CNPJ
function isValidCnpj(cnpj: string): boolean {
  const digits = cnpj.replace(/\D/g, '');
  if (digits.length !== 14) return false;
  if (/^(\d)\1+$/.test(digits)) return false;

  const calcDigit = (slice: string, factors: number[]): number => {
    let sum = 0;
    for (let i = 0; i < slice.length; i++) {
      sum += Number(slice[i]) * factors[i];
    }
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  const d1 = calcDigit(digits.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  if (d1 !== Number(digits[12])) return false;

  const d2 = calcDigit(digits.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d2 === Number(digits[13]);
}

function formatCnpj(val: string): string {
  const digits = val.replace(/\D/g, '').slice(0, 14);
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  if (digits.length <= 12)
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12, 14)}`;
}

export const ProfilePage: React.FC = () => {
  const { user, workspace, refreshWorkspace, logout } = useAuth();
  const toast = useToast();

  const pjEntity = useMemo(() => {
    return workspace?.entities.find((e) => e.kind === 'pj');
  }, [workspace]);

  // Form states for business profile
  const [cnpj, setCnpj] = useState('');
  const [legalName, setLegalName] = useState('');
  const [tradeName, setTradeName] = useState('');
  const [openedOn, setOpenedOn] = useState('');
  const [activity, setActivity] = useState<'comercio' | 'servicos' | 'misto'>('servicos');
  const [isFormDirty, setIsFormDirty] = useState(false);
  const [formInitialized, setFormInitialized] = useState(false);
  const [saving, setSaving] = useState(false);

  // Telegram Link State
  const [telegramStatus, setTelegramStatus] = useState<{
    readonly linked: boolean;
    readonly chatId?: string;
    readonly linkedAt?: string;
  } | null>(null);
  const [botUrl, setBotUrl] = useState<string | null>(null);
  const [telegramLoading, setTelegramLoading] = useState(false);

  // Dialogs
  const [isLogoutDialogOpen, setIsLogoutDialogOpen] = useState(false);
  const [isUnlinkDialogOpen, setIsUnlinkDialogOpen] = useState(false);
  const [exportingData, setExportingData] = useState(false);

  const fetchTelegramStatus = useCallback(async () => {
    try {
      const res = await api.get('/telegram/status');
      setTelegramStatus(res.data);
    } catch {
      // Endpoint opcional se bot não configurado
    }
  }, []);

  useEffect(() => {
    fetchTelegramStatus();
  }, [fetchTelegramStatus]);

  // Popula o formulário apenas uma vez quando a entidade carregar, evitando sobrescrever a digitação do usuário
  useEffect(() => {
    if (pjEntity && !formInitialized) {
      setCnpj(pjEntity.cnpj ? formatCnpj(pjEntity.cnpj) : '');
      setLegalName(pjEntity.legalName || '');
      setTradeName(pjEntity.tradeName || '');
      setTradeName(pjEntity.name || '');
      setOpenedOn(pjEntity.openedOn ? pjEntity.openedOn.slice(0, 10) : '');
      setActivity(pjEntity.activity || 'servicos');
      setFormInitialized(true);
    }
  }, [pjEntity, formInitialized]);

  const handleCnpjChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatCnpj(e.target.value);
    setCnpj(formatted);
    setIsFormDirty(true);
  };

  const handleSaveBusinessProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pjEntity) return;

    const cleanCnpj = cnpj.replace(/\D/g, '');
    if (!cleanCnpj) {
      toast.error('Informe o CNPJ da sua empresa MEI.');
      return;
    }

    if (!isValidCnpj(cleanCnpj)) {
      toast.error('CNPJ inválido. Verifique os dígitos informados.');
      return;
    }

    if (!openedOn) {
      toast.error('Informe a data de abertura do MEI para o cálculo do limite anual.');
      return;
    }

    setSaving(true);
    try {
      await api.put(`/entities/${pjEntity.id}/business-profile`, {
        cnpj: cleanCnpj,
        legalName: legalName.trim() || null,
        tradeName: tradeName.trim() || null,
        openedOn,
        activity,
      });

      await refreshWorkspace();
      setIsFormDirty(false);
      toast.success('Dados da empresa MEI atualizados com sucesso!');
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err && (err as { response?: { data?: { message?: string } } }).response?.data?.message
          ? (err as { response: { data: { message: string } } }).response.data.message
          : 'Erro ao salvar perfil empresarial.';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateTelegramLink = async () => {
    setTelegramLoading(true);
    try {
      const res = await api.post('/telegram/link-token');
      const url = res.data?.botUrl;

      // Validação estrita de segurança da URL
      if (typeof url === 'string' && url.startsWith('https://t.me/')) {
        setBotUrl(url);
        toast.info('Link do Telegram gerado! Clique no botão abaixo para iniciar.');
      } else {
        throw new Error('A URL retornada para o bot do Telegram é inválida.');
      }
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err && (err as { response?: { data?: { message?: string } } }).response?.data?.message
          ? (err as { response: { data: { message: string } } }).response.data.message
          : 'Erro ao gerar link de conexão com Telegram.';
      toast.error(msg);
    } finally {
      setTelegramLoading(false);
    }
  };

  const confirmUnlinkTelegram = async () => {
    setTelegramLoading(true);
    try {
      await api.post('/telegram/unlink');
      setBotUrl(null);
      await fetchTelegramStatus();
      setIsUnlinkDialogOpen(false);
      toast.success('Telegram desvinculado com sucesso.');
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err && (err as { response?: { data?: { message?: string } } }).response?.data?.message
          ? (err as { response: { data: { message: string } } }).response.data.message
          : 'Erro ao desvincular Telegram.';
      toast.error(msg);
    } finally {
      setTelegramLoading(false);
    }
  };

  const handleExportData = async () => {
    setExportingData(true);
    try {
      const res = await api.get('/me/export');
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
      const objectUrl = URL.createObjectURL(blob);
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', objectUrl);
      downloadAnchor.setAttribute('download', `meister-export-lgpd-${todayLocalIso()}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      setTimeout(() => {
        URL.revokeObjectURL(objectUrl);
      }, 1000);

      toast.success('Portabilidade de dados (LGPD) concluída com sucesso!');
    } catch {
      toast.error('Erro ao exportar dados da conta.');
    } finally {
      setExportingData(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-16">
      {/* Top Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-ink tracking-tight flex items-center gap-2.5">
          <Gear size={28} className="text-brand" weight="duotone" />
          Perfil & Configurações
        </h1>
        <p className="text-xs sm:text-sm text-muted mt-0.5">
          Gerenciamento da sua conta, parâmetros fiscais da empresa e integrações ativas.
        </p>
      </div>

      {/* 1. Conta & Segurança */}
      <section className="card-surface p-6 md:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-primary text-on-primary flex items-center justify-center font-extrabold text-2xl shadow-[var(--shadow-honey)]">
              {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-ink">{user?.name}</h2>
              <p className="text-xs text-muted">{user?.email}</p>
              <span className="inline-block mt-1 text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-field text-brand uppercase tracking-wider border border-ink/5">
                {user?.accountType === 'mei' ? 'Conta MEI (PJ + PF)' : 'Pessoa Física'}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsLogoutDialogOpen(true)}
            className="min-h-[44px] px-4 py-2 rounded-2xl text-xs font-bold text-danger bg-danger/10 hover:bg-danger/20 border border-danger/20 transition flex items-center gap-1.5 self-start sm:self-auto"
          >
            <SignOut size={16} weight="bold" />
            <span>Encerrar Sessão</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-muted pt-4 border-t border-ink/5">
          <div>
            <span className="block text-[10px] uppercase font-bold text-muted tracking-wider">
              Workspace Ativo
            </span>
            <span className="font-extrabold text-ink text-sm">{workspace?.workspace?.name || 'Meu Negócio'}</span>
            <span className="text-[11px] font-mono text-muted block mt-0.5">{workspace?.workspace?.id}</span>
          </div>

          <div>
            <span className="block text-[10px] uppercase font-bold text-muted tracking-wider">
              Identificador de Usuário
            </span>
            <span className="font-mono text-ink-soft text-xs break-all">{user?.id}</span>
          </div>
        </div>
      </section>

      {/* 2. Dados do MEI (Exibido e editável se o workspace possuir entidade PJ) */}
      {pjEntity && (
        <section className="card-surface p-6 md:p-8 space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-primary-soft text-brand flex items-center justify-center shrink-0">
              <Storefront size={22} weight="duotone" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-ink">Dados da Empresa MEI</h2>
              <p className="text-xs text-muted">
                Parâmetros fiscais oficiais registrados na Receita Federal do Brasil
              </p>
            </div>
          </div>

          <form onSubmit={handleSaveBusinessProfile} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* CNPJ */}
              <div>
                <label className="block text-xs font-bold text-ink uppercase tracking-wider mb-1.5">
                  CNPJ
                </label>
                <input
                  type="text"
                  placeholder="00.000.000/0000-00"
                  value={cnpj}
                  onChange={handleCnpjChange}
                  maxLength={18}
                  className="w-full min-h-[44px] bg-canvas text-sm font-mono text-ink rounded-2xl px-3.5 py-2.5 border border-ink/10 focus:outline-none focus:border-primary transition"
                />
              </div>

              {/* Data de Abertura */}
              <div>
                <label className="block text-xs font-bold text-ink uppercase tracking-wider mb-1.5">
                  Data de Abertura do MEI
                </label>
                <input
                  type="date"
                  min="2009-07-01"
                  max={todayLocalIso()}
                  value={openedOn}
                  onChange={(e) => {
                    setOpenedOn(e.target.value);
                    setIsFormDirty(true);
                  }}
                  className="w-full min-h-[44px] bg-canvas text-sm text-ink rounded-2xl px-3.5 py-2.5 border border-ink/10 focus:outline-none focus:border-primary transition"
                />
                <span className="text-[11px] text-muted mt-1 block">
                  Define o cálculo proporcional exato do limite anual do MEI.
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Razão Social */}
              <div>
                <label className="block text-xs font-bold text-ink uppercase tracking-wider mb-1.5">
                  Razão Social (Nome Oficial)
                </label>
                <input
                  type="text"
                  placeholder="Ex: João Silva 12345678900"
                  value={legalName}
                  onChange={(e) => {
                    setLegalName(e.target.value);
                    setIsFormDirty(true);
                  }}
                  className="w-full min-h-[44px] bg-canvas text-sm text-ink rounded-2xl px-3.5 py-2.5 border border-ink/10 focus:outline-none focus:border-primary transition"
                />
              </div>

              {/* Nome Fantasia */}
              <div>
                <label className="block text-xs font-bold text-ink uppercase tracking-wider mb-1.5">
                  Nome Fantasia / Marca
                </label>
                <input
                  type="text"
                  placeholder="Ex: Consultoria Silva"
                  value={tradeName}
                  onChange={(e) => {
                    setTradeName(e.target.value);
                    setIsFormDirty(true);
                  }}
                  className="w-full min-h-[44px] bg-canvas text-sm text-ink rounded-2xl px-3.5 py-2.5 border border-ink/10 focus:outline-none focus:border-primary transition"
                />
              </div>
            </div>

            {/* Atividade Principal */}
            <div>
              <label className="block text-xs font-bold text-ink uppercase tracking-wider mb-2">
                Atividade Principal (Regulamenta o valor do DAS mensal)
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  { id: 'comercio', title: 'Comércio / Indústria', detail: 'ICMS (+ R$ 1,00)' },
                  { id: 'servicos', title: 'Serviços', detail: 'ISS (+ R$ 5,00)' },
                  { id: 'misto', title: 'Comércio & Serviços', detail: 'ICMS + ISS (+ R$ 6,00)' },
                ].map((act) => {
                  const isSelected = activity === act.id;
                  return (
                    <div
                      key={act.id}
                      onClick={() => {
                        setActivity(act.id as any);
                        setIsFormDirty(true);
                      }}
                      className={`p-3.5 rounded-2xl border cursor-pointer transition ${
                        isSelected
                          ? 'bg-card border-brand shadow-sm ring-1 ring-brand'
                          : 'bg-canvas border-ink/10 hover:border-ink/20'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${
                          isSelected ? 'border-brand bg-primary' : 'border-ink/30'
                        }`} />
                        <span className="font-extrabold text-xs text-ink">{act.title}</span>
                      </div>
                      <span className="text-[11px] text-muted pl-5">{act.detail}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="pt-3 flex justify-end">
              <button
                type="submit"
                disabled={saving || !isFormDirty}
                className="min-h-[44px] px-6 py-2.5 rounded-2xl bg-primary text-on-primary font-bold text-xs hover:bg-primary-deep transition flex items-center justify-center gap-2 shadow-[var(--shadow-honey)] disabled:opacity-50"
              >
                {saving && <CircleNotch size={16} className="animate-spin" />}
                <span>Salvar Dados da Empresa</span>
              </button>
            </div>
          </form>
        </section>
      )}

      {/* 3. Telegram & Notificações (Funciona para MEI e PF) */}
      <section className="card-surface p-6 md:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-primary-soft text-brand flex items-center justify-center shrink-0">
              <TelegramLogo size={22} weight="fill" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-extrabold text-ink">Assistente Telegram & IA</h2>
                {telegramStatus?.linked ? (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-success/10 text-success border border-success/30 uppercase">
                    Conectado
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-field text-muted uppercase">
                    Não Vinculado
                  </span>
                )}
              </div>
              <p className="text-xs text-muted mt-0.5">
                Lance despesas por áudio, fotos de notas fiscais ou texto em linguagem natural.
              </p>
            </div>
          </div>

          <div>
            {telegramStatus?.linked ? (
              <button
                type="button"
                onClick={() => setIsUnlinkDialogOpen(true)}
                disabled={telegramLoading}
                className="min-h-[44px] px-4 py-2 rounded-2xl text-xs font-bold text-danger bg-danger/10 hover:bg-danger/20 border border-danger/20 transition disabled:opacity-50"
              >
                Desvincular Telegram
              </button>
            ) : (
              <button
                type="button"
                onClick={handleGenerateTelegramLink}
                disabled={telegramLoading}
                className="min-h-[44px] px-5 py-2.5 rounded-2xl bg-primary text-on-primary font-bold text-xs hover:bg-primary-deep transition flex items-center gap-2 shadow-[var(--shadow-honey)] disabled:opacity-50"
              >
                {telegramLoading ? (
                  <CircleNotch size={16} className="animate-spin" />
                ) : (
                  <TelegramLogo size={18} weight="fill" />
                )}
                <span>Conectar Bot do Telegram</span>
              </button>
            )}
          </div>
        </div>

        {telegramStatus?.linked && (
          <div className="p-4 rounded-2xl bg-canvas border border-ink/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div>
              <p className="font-bold text-ink">
                Chat ID Conectado: <span className="font-mono text-brand">{telegramStatus.chatId}</span>
              </p>
              <p className="text-[11px] text-muted">
                Vinculado em: {telegramStatus.linkedAt ? new Date(telegramStatus.linkedAt).toLocaleDateString('pt-BR') : '-'}
              </p>
            </div>
            <div className="text-success font-semibold flex items-center gap-1.5">
              <CheckCircle size={16} weight="bold" />
              <span>Pronto para receber lançamentos</span>
            </div>
          </div>
        )}

        {botUrl && !telegramStatus?.linked && (
          <div className="p-5 rounded-2xl bg-canvas border border-brand/30 space-y-3">
            <h3 className="text-sm font-bold text-ink">Link Seguro de Vinculação Gerado:</h3>
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
              <a
                href={botUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[44px] px-5 py-2.5 rounded-2xl bg-primary text-on-primary font-extrabold text-xs inline-flex items-center gap-2 shadow-[var(--shadow-honey)] hover:bg-primary-deep transition"
              >
                <TelegramLogo size={18} weight="fill" />
                <span>Abrir no Telegram (/start)</span>
                <ArrowSquareOut size={16} weight="bold" />
              </a>
              <span className="text-[11px] text-muted">
                Link temporário válido por 10 minutos. Ao abrir, pressione <strong>INICIAR</strong>.
              </span>
            </div>
          </div>
        )}
      </section>

      {/* 4. Privacidade & Governança de Dados (LGPD) */}
      <section className="card-surface p-6 md:p-8 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-primary-soft text-brand flex items-center justify-center shrink-0">
            <ShieldCheck size={22} weight="duotone" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-extrabold text-ink">
              Privacidade & Proteção de Dados (LGPD)
            </h2>
            <p className="text-xs text-muted">
              Transparência, soberania de dados financeiros e direitos do titular
            </p>
          </div>
        </div>

        <p className="text-xs text-ink-soft leading-relaxed">
          Seus dados e transações são criptografados e restritos ao seu workspace. Em conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018), você pode exportar todos os seus dados a qualquer momento ou solicitar a revogação de consentimentos.
        </p>

        <div className="pt-2 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleExportData}
            disabled={exportingData}
            className="min-h-[44px] px-4 py-2 rounded-2xl bg-card border border-ink/10 hover:border-ink/20 text-xs font-bold text-ink flex items-center gap-2 transition shadow-sm disabled:opacity-50"
          >
            {exportingData ? (
              <CircleNotch size={16} className="animate-spin text-brand" />
            ) : (
              <FileText size={16} weight="bold" />
            )}
            <span>{exportingData ? 'Exportando Dados...' : 'Exportar Dados em JSON (Portabilidade LGPD)'}</span>
          </button>
        </div>
      </section>

      {/* Diálogo de Confirmação para Desvincular Telegram */}
      <ConfirmDialog
        open={isUnlinkDialogOpen}
        onClose={() => setIsUnlinkDialogOpen(false)}
        onConfirm={confirmUnlinkTelegram}
        loading={telegramLoading}
        title="Desvincular Bot do Telegram"
        description="Tem certeza de que deseja desconectar o assistente do Telegram? Você deixará de receber notificações e não poderá mais enviar lançamentos por áudio ou mensagem."
        confirmLabel="Sim, desvincular"
        cancelLabel="Cancelar"
        confirmVariant="danger"
      />

      {/* Diálogo de Confirmação para Encerrar Sessão */}
      <ConfirmDialog
        open={isLogoutDialogOpen}
        onClose={() => setIsLogoutDialogOpen(false)}
        onConfirm={() => {
          setIsLogoutDialogOpen(false);
          logout();
        }}
        title="Encerrar Sessão"
        description="Deseja realmente sair da sua conta MEIster no dispositivo atual?"
        confirmLabel="Sair da Conta"
        cancelLabel="Permanecer conectado"
        confirmVariant="danger"
      />
    </div>
  );
};

export default ProfilePage;
