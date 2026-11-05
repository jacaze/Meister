import React, { useState, useEffect } from 'react';
import api from '../api/client.js';
import { TelegramLogo } from '../components/ui/icons.js';
import { useAuth } from '../context/AuthContext.js';

// Strict Brazilian CNPJ check digit algorithm
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

  const pjEntity = workspace?.entities.find((e) => e.kind === 'pj');

  const [cnpj, setCnpj] = useState('');
  const [legalName, setLegalName] = useState('');
  const [tradeName, setTradeName] = useState('');
  const [openedOn, setOpenedOn] = useState('');
  const [activity, setActivity] = useState<'comercio' | 'servicos' | 'misto'>('servicos');

  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Telegram Link State
  const [telegramStatus, setTelegramStatus] = useState<{ linked: boolean; chatId?: string; linkedAt?: string } | null>(null);
  const [botUrl, setBotUrl] = useState<string | null>(null);
  const [telegramLoading, setTelegramLoading] = useState(false);

  useEffect(() => {
    fetchTelegramStatus();
  }, []);

  const fetchTelegramStatus = async () => {
    try {
      const res = await api.get('/telegram/status');
      setTelegramStatus(res.data);
    } catch {
      // Ignore if endpoint not reachable
    }
  };

  const handleGenerateTelegramLink = async () => {
    setTelegramLoading(true);
    try {
      const res = await api.post('/telegram/link-token');
      setBotUrl(res.data.botUrl);
    } catch (err: any) {
      setErrorMessage(err.response?.data?.message || 'Erro ao gerar link de conexão com Telegram.');
    } finally {
      setTelegramLoading(false);
    }
  };

  const handleUnlinkTelegram = async () => {
    if (!confirm('Deseja realmente desvincular seu Telegram?')) return;
    setTelegramLoading(true);
    try {
      await api.post('/telegram/unlink');
      setBotUrl(null);
      await fetchTelegramStatus();
      setSuccessMessage('Telegram desvinculado com sucesso.');
    } catch (err: any) {
      setErrorMessage(err.response?.data?.message || 'Erro ao desvincular Telegram.');
    } finally {
      setTelegramLoading(false);
    }
  };

  useEffect(() => {
    if (pjEntity) {
      setCnpj(pjEntity.cnpj ? formatCnpj(pjEntity.cnpj) : '');
      setLegalName(pjEntity.legalName || '');
      setTradeName(pjEntity.name || '');
      setOpenedOn(pjEntity.openedOn ? pjEntity.openedOn.slice(0, 10) : '');
      setActivity(pjEntity.activity || 'servicos');
    }
  }, [pjEntity]);

  const handleCnpjChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatCnpj(e.target.value);
    setCnpj(formatted);
  };

  const handleSaveBusinessProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMessage(null);
    setErrorMessage(null);

    if (!pjEntity) {
      setErrorMessage('Entidade PJ não encontrada neste workspace.');
      return;
    }

    const cleanCnpj = cnpj.replace(/\D/g, '');
    if (cleanCnpj && !isValidCnpj(cleanCnpj)) {
      setErrorMessage('CNPJ inválido. Verifique os dígitos informados.');
      return;
    }

    setSaving(true);
    try {
      await api.put(`/entities/${pjEntity.id}/business-profile`, {
        cnpj: cleanCnpj || undefined,
        legalName: legalName.trim() || undefined,
        tradeName: tradeName.trim() || undefined,
        openedOn: openedOn || undefined,
        activity,
      });

      await refreshWorkspace();
      setSuccessMessage('Perfil empresarial atualizado com sucesso!');
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setErrorMessage(err.response?.data?.message || 'Erro ao salvar perfil empresarial.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-ink flex items-center gap-2">
          <span className="material-symbols-outlined text-brand text-3xl">settings</span>
          Perfil & Configurações
        </h1>
        <p className="text-xs md:text-sm text-ink-soft mt-1">
          Gerencie seus dados de usuário, parâmetros fiscais MEI e contas vinculadas.
        </p>
      </div>

      {/* User Information Card */}
      <section className="bg-card border border-ink/5 rounded-3xl p-6 md:p-8 shadow-lg">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-primary to-primary-soft text-on-primary flex items-center justify-center font-extrabold text-2xl shadow-lg">
            {user?.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h2 className="text-xl font-bold text-ink">{user?.name}</h2>
            <p className="text-xs text-muted">{user?.email}</p>
            <span className="inline-block mt-1 text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-field text-brand uppercase tracking-wider">
              {user?.accountType === 'mei' ? 'Conta MEI / PJ + PF' : 'Pessoa Física'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-muted pt-4 border-t border-ink/4">
          <div>
            <span className="block text-[10px] uppercase font-bold text-muted">
              Workspace ID
            </span>
            <span className="font-mono text-ink-soft mt-0.5 block truncate">
              {workspace?.workspace.id || '-'}
            </span>
          </div>
          <div>
            <span className="block text-[10px] uppercase font-bold text-muted">
              Plano de Assinatura
            </span>
            <span className="text-ink-soft font-bold capitalize mt-0.5 block">
              {workspace?.workspace.plan || 'Free MEIster'}
            </span>
          </div>
        </div>
      </section>

      {/* Business Profile (MEI) Form */}
      {user?.accountType === 'mei' && (
        <section className="bg-card border border-ink/5 rounded-3xl p-6 md:p-8 shadow-xl relative">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-primary/10 text-brand flex items-center justify-center">
                <span className="material-symbols-outlined text-xl">storefront</span>
              </div>
              <div>
                <h3 className="font-extrabold text-lg text-ink">Dados da Empresa MEI</h3>
                <p className="text-xs text-muted">
                  Essenciais para cálculo do limite proporcional e valores exatos do DAS.
                </p>
              </div>
            </div>

            {pjEntity?.profileComplete ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-success/10 text-success border border-success/20">
                <span className="material-symbols-outlined text-xs">check_circle</span>
                Completo
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-primary/10 text-brand border border-primary/20">
                <span className="material-symbols-outlined text-xs">pending</span>
                Pendente
              </span>
            )}
          </div>

          {successMessage && (
            <div className="mb-6 p-4 rounded-2xl bg-success/10 border border-success/20 text-success text-xs font-bold flex items-center gap-2">
              <span className="material-symbols-outlined text-base">check_circle</span>
              {successMessage}
            </div>
          )}

          {errorMessage && (
            <div className="mb-6 p-4 rounded-2xl bg-danger/10 border border-danger/20 text-danger text-xs font-bold flex items-center gap-2">
              <span className="material-symbols-outlined text-base">error</span>
              {errorMessage}
            </div>
          )}

          <form onSubmit={handleSaveBusinessProfile} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* CNPJ */}
              <div>
                <label className="text-xs font-bold text-muted uppercase tracking-wider block mb-1">
                  CNPJ
                </label>
                <input
                  type="text"
                  placeholder="00.000.000/0000-00"
                  value={cnpj}
                  onChange={handleCnpjChange}
                  maxLength={18}
                  className="w-full bg-canvas text-sm text-ink rounded-xl px-3.5 py-2.5 border border-ink/5 focus:outline-none focus:border-primary font-mono"
                />
              </div>

              {/* Data de Abertura */}
              <div>
                <label className="text-xs font-bold text-muted uppercase tracking-wider block mb-1">
                  Data de Abertura do MEI
                </label>
                <input
                  type="date"
                  value={openedOn}
                  onChange={(e) => setOpenedOn(e.target.value)}
                  className="w-full bg-canvas text-sm text-ink rounded-xl px-3.5 py-2.5 border border-ink/5 focus:outline-none focus:border-primary"
                />
                <span className="text-[10px] text-muted mt-1 block">
                  Define o cálculo proporcional do limite MEI se aberto no ano corrente.
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Razão Social */}
              <div>
                <label className="text-xs font-bold text-muted uppercase tracking-wider block mb-1">
                  Razão Social
                </label>
                <input
                  type="text"
                  placeholder="Ex: João Vitor da Silva 12345678900"
                  value={legalName}
                  onChange={(e) => setLegalName(e.target.value)}
                  className="w-full bg-canvas text-sm text-ink rounded-xl px-3.5 py-2.5 border border-ink/5 focus:outline-none focus:border-primary"
                />
              </div>

              {/* Nome Fantasia */}
              <div>
                <label className="text-xs font-bold text-muted uppercase tracking-wider block mb-1">
                  Nome Fantasia
                </label>
                <input
                  type="text"
                  placeholder="Ex: JV Serviços Digitais"
                  value={tradeName}
                  onChange={(e) => setTradeName(e.target.value)}
                  className="w-full bg-canvas text-sm text-ink rounded-xl px-3.5 py-2.5 border border-ink/5 focus:outline-none focus:border-primary"
                />
              </div>
            </div>

            {/* Atividade Principal */}
            <div>
              <label className="text-xs font-bold text-muted uppercase tracking-wider block mb-1">
                Atividade Principal (Define o valor exato do DAS)
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label
                  className={`flex flex-col p-3 rounded-2xl border cursor-pointer transition ${
                    activity === 'comercio'
                      ? 'bg-field border-primary text-ink'
                      : 'bg-canvas border-ink/5 text-muted'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="activity"
                      value="comercio"
                      checked={activity === 'comercio'}
                      onChange={() => setActivity('comercio')}
                      className="text-brand focus:ring-0"
                    />
                    <strong className="text-xs text-ink">Comércio / Indústria</strong>
                  </div>
                  <span className="text-[11px] text-muted mt-1">ICMS (+ R$ 1,00)</span>
                </label>

                <label
                  className={`flex flex-col p-3 rounded-2xl border cursor-pointer transition ${
                    activity === 'servicos'
                      ? 'bg-field border-primary text-ink'
                      : 'bg-canvas border-ink/5 text-muted'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="activity"
                      value="servicos"
                      checked={activity === 'servicos'}
                      onChange={() => setActivity('servicos')}
                      className="text-brand focus:ring-0"
                    />
                    <strong className="text-xs text-ink">Serviços</strong>
                  </div>
                  <span className="text-[11px] text-muted mt-1">ISS (+ R$ 5,00)</span>
                </label>

                <label
                  className={`flex flex-col p-3 rounded-2xl border cursor-pointer transition ${
                    activity === 'misto'
                      ? 'bg-field border-primary text-ink'
                      : 'bg-canvas border-ink/5 text-muted'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="activity"
                      value="misto"
                      checked={activity === 'misto'}
                      onChange={() => setActivity('misto')}
                      className="text-brand focus:ring-0"
                    />
                    <strong className="text-xs text-ink">Comércio e Serviços</strong>
                  </div>
                  <span className="text-[11px] text-muted mt-1">ICMS + ISS (+ R$ 6,00)</span>
                </label>
              </div>
            </div>

            <div className="pt-4 flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="bg-primary hover:bg-primary-soft text-on-primary font-bold text-xs md:text-sm px-6 py-3 rounded-2xl shadow-[0_0_20px_rgba(242,201,76,0.25)] transition disabled:opacity-50"
              >
                {saving ? 'Salvando...' : 'Salvar Dados da Empresa'}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Telegram AI Assistant Connection */}
      <section className="bg-card border border-ink/5 rounded-3xl p-6 md:p-8 shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-extrabold text-lg text-ink">Assistente Telegram & IA</h3>
              {telegramStatus?.linked ? (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-success/20 text-success border border-success/30">
                  CONECTADO
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-muted/20 text-muted border border-ink/5">
                  NÃO VINCULADO
                </span>
              )}
            </div>
            <p className="text-xs text-muted">
              Lance despesas e receitas em linguagem natural por texto no Telegram com suporte da IA Gemini.
            </p>
          </div>

          <div>
            {telegramStatus?.linked ? (
              <button
                type="button"
                onClick={handleUnlinkTelegram}
                disabled={telegramLoading}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-danger bg-danger/10 hover:bg-danger/20 border border-danger/20 transition disabled:opacity-50"
              >
                {telegramLoading ? 'Processando...' : 'Desvincular Telegram'}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleGenerateTelegramLink}
                disabled={telegramLoading}
                className="px-5 py-2.5 rounded-xl text-xs font-bold text-on-primary bg-info hover:bg-info transition shadow-[0_0_15px_rgba(41,182,246,0.25)] disabled:opacity-50 inline-flex items-center gap-2"
              >
                <span>Conectar Bot do Telegram</span>
              </button>
            )}
          </div>
        </div>

        {telegramStatus?.linked && (
          <div className="p-4 rounded-2xl bg-canvas border border-ink/4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
            <div>
              <p className="font-bold text-ink">Chat ID Vinculado: <span className="font-mono text-brand">{telegramStatus.chatId}</span></p>
              <p className="text-[11px] text-muted">Vinculado em: {new Date(telegramStatus.linkedAt || '').toLocaleDateString('pt-BR')}</p>
            </div>
            <div className="text-success text-xs font-semibold flex items-center gap-1">
              Pronto para receber lançamentos
            </div>
          </div>
        )}

        {botUrl && !telegramStatus?.linked && (
          <div className="mt-4 p-5 rounded-2xl bg-canvas border border-info/30 animate-fade-in">
            <h4 className="text-sm font-bold text-ink mb-2">Clique no link abaixo para abrir o Telegram:</h4>
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
              <a
                href={botUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-6 py-3 rounded-xl bg-info hover:bg-info text-on-primary font-extrabold text-xs inline-flex items-center gap-2 transition"
              >
                <TelegramLogo size={18} weight="fill" />
                <span>Abrir no Telegram (/start)</span>
              </a>
              <span className="text-[11px] text-muted">
                Válido por 10 minutos. Ao abrir, clique em <strong>INICIAR</strong> no Telegram.
              </span>
            </div>
          </div>
        )}
      </section>

      {/* Workspace Entities Info */}
      <section className="bg-card border border-ink/5 rounded-3xl p-6 md:p-8 shadow-lg">
        <h3 className="font-extrabold text-lg text-ink mb-1">Entidades Vinculadas</h3>
        <p className="text-xs text-muted mb-4">
          Isolamento estrito entre finanças da empresa (PJ) e despesas pessoais (PF).
        </p>

        <div className="space-y-3">
          {workspace?.entities.map((ent) => (
            <div
              key={ent.id}
              className="p-4 rounded-2xl bg-canvas border border-ink/4 flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-field text-brand flex items-center justify-center font-bold text-sm">
                  {ent.kind === 'pj' ? 'PJ' : 'PF'}
                </div>
                <div>
                  <h4 className="font-bold text-sm text-ink">{ent.name}</h4>
                  <p className="text-[11px] text-muted">
                    {ent.kind === 'pj' ? 'Pessoa Jurídica (Empresa)' : 'Pessoa Física (Pessoal)'}
                  </p>
                </div>
              </div>
              <span className="text-xs font-mono text-muted">{ent.id}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Logout Action */}
      <div className="pt-4 flex justify-end">
        <button
          onClick={logout}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl text-xs font-bold text-danger bg-danger/10 hover:bg-danger/20 border border-danger/20 transition"
        >
          <span className="material-symbols-outlined text-base">logout</span>
          Encerrar Sessão
        </button>
      </div>
    </div>
  );
};

export default ProfilePage;
