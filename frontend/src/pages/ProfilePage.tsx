import React, { useState, useEffect } from 'react';
import api from '../api/client.js';
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
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
          <span className="material-symbols-outlined text-[#f2c94c] text-3xl">settings</span>
          Perfil & Configurações
        </h1>
        <p className="text-xs md:text-sm text-[#d0c5af] mt-1">
          Gerencie seus dados de usuário, parâmetros fiscais MEI e contas vinculadas.
        </p>
      </div>

      {/* User Information Card */}
      <section className="bg-[#1c1b1b] border border-[#ffffff0d] rounded-3xl p-6 md:p-8 shadow-lg">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-[#f2c94c] to-[#ffe8ad] text-[#131313] flex items-center justify-center font-extrabold text-2xl shadow-lg">
            {user?.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">{user?.name}</h2>
            <p className="text-xs text-[#99907b]">{user?.email}</p>
            <span className="inline-block mt-1 text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-[#2a2a2a] text-[#f2c94c] uppercase tracking-wider">
              {user?.accountType === 'mei' ? 'Conta MEI / PJ + PF' : 'Pessoa Física'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-[#99907b] pt-4 border-t border-[#ffffff08]">
          <div>
            <span className="block text-[10px] uppercase font-bold text-[#99907b]">
              Workspace ID
            </span>
            <span className="font-mono text-[#d0c5af] mt-0.5 block truncate">
              {workspace?.workspace.id || '-'}
            </span>
          </div>
          <div>
            <span className="block text-[10px] uppercase font-bold text-[#99907b]">
              Plano de Assinatura
            </span>
            <span className="text-[#d0c5af] font-bold capitalize mt-0.5 block">
              {workspace?.workspace.plan || 'Free MEIster'}
            </span>
          </div>
        </div>
      </section>

      {/* Business Profile (MEI) Form */}
      {user?.accountType === 'mei' && (
        <section className="bg-[#1c1b1b] border border-[#ffffff0d] rounded-3xl p-6 md:p-8 shadow-xl relative">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-[#f2c94c]/10 text-[#f2c94c] flex items-center justify-center">
                <span className="material-symbols-outlined text-xl">storefront</span>
              </div>
              <div>
                <h3 className="font-extrabold text-lg text-white">Dados da Empresa MEI</h3>
                <p className="text-xs text-[#99907b]">
                  Essenciais para cálculo do limite proporcional e valores exatos do DAS.
                </p>
              </div>
            </div>

            {pjEntity?.profileComplete ? (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-[#27ae60]/10 text-[#27ae60] border border-[#27ae60]/20">
                <span className="material-symbols-outlined text-xs">check_circle</span>
                Completo
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-[#f2c94c]/10 text-[#f2c94c] border border-[#f2c94c]/20">
                <span className="material-symbols-outlined text-xs">pending</span>
                Pendente
              </span>
            )}
          </div>

          {successMessage && (
            <div className="mb-6 p-4 rounded-2xl bg-[#27ae60]/10 border border-[#27ae60]/20 text-[#27ae60] text-xs font-bold flex items-center gap-2">
              <span className="material-symbols-outlined text-base">check_circle</span>
              {successMessage}
            </div>
          )}

          {errorMessage && (
            <div className="mb-6 p-4 rounded-2xl bg-[#eb5757]/10 border border-[#eb5757]/20 text-[#ffb4ab] text-xs font-bold flex items-center gap-2">
              <span className="material-symbols-outlined text-base">error</span>
              {errorMessage}
            </div>
          )}

          <form onSubmit={handleSaveBusinessProfile} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* CNPJ */}
              <div>
                <label className="text-xs font-bold text-[#99907b] uppercase tracking-wider block mb-1">
                  CNPJ
                </label>
                <input
                  type="text"
                  placeholder="00.000.000/0000-00"
                  value={cnpj}
                  onChange={handleCnpjChange}
                  maxLength={18}
                  className="w-full bg-[#131313] text-sm text-[#e5e2e1] rounded-xl px-3.5 py-2.5 border border-[#ffffff0d] focus:outline-none focus:border-[#f2c94c] font-mono"
                />
              </div>

              {/* Data de Abertura */}
              <div>
                <label className="text-xs font-bold text-[#99907b] uppercase tracking-wider block mb-1">
                  Data de Abertura do MEI
                </label>
                <input
                  type="date"
                  value={openedOn}
                  onChange={(e) => setOpenedOn(e.target.value)}
                  className="w-full bg-[#131313] text-sm text-[#e5e2e1] rounded-xl px-3.5 py-2.5 border border-[#ffffff0d] focus:outline-none focus:border-[#f2c94c]"
                />
                <span className="text-[10px] text-[#99907b] mt-1 block">
                  Define o cálculo proporcional do limite MEI se aberto no ano corrente.
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Razão Social */}
              <div>
                <label className="text-xs font-bold text-[#99907b] uppercase tracking-wider block mb-1">
                  Razão Social
                </label>
                <input
                  type="text"
                  placeholder="Ex: João Vitor da Silva 12345678900"
                  value={legalName}
                  onChange={(e) => setLegalName(e.target.value)}
                  className="w-full bg-[#131313] text-sm text-[#e5e2e1] rounded-xl px-3.5 py-2.5 border border-[#ffffff0d] focus:outline-none focus:border-[#f2c94c]"
                />
              </div>

              {/* Nome Fantasia */}
              <div>
                <label className="text-xs font-bold text-[#99907b] uppercase tracking-wider block mb-1">
                  Nome Fantasia
                </label>
                <input
                  type="text"
                  placeholder="Ex: JV Serviços Digitais"
                  value={tradeName}
                  onChange={(e) => setTradeName(e.target.value)}
                  className="w-full bg-[#131313] text-sm text-[#e5e2e1] rounded-xl px-3.5 py-2.5 border border-[#ffffff0d] focus:outline-none focus:border-[#f2c94c]"
                />
              </div>
            </div>

            {/* Atividade Principal */}
            <div>
              <label className="text-xs font-bold text-[#99907b] uppercase tracking-wider block mb-1">
                Atividade Principal (Define o valor exato do DAS)
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label
                  className={`flex flex-col p-3 rounded-2xl border cursor-pointer transition ${
                    activity === 'comercio'
                      ? 'bg-[#2a2a2a] border-[#f2c94c] text-white'
                      : 'bg-[#131313] border-[#ffffff0d] text-[#99907b]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="activity"
                      value="comercio"
                      checked={activity === 'comercio'}
                      onChange={() => setActivity('comercio')}
                      className="text-[#f2c94c] focus:ring-0"
                    />
                    <strong className="text-xs text-white">Comércio / Indústria</strong>
                  </div>
                  <span className="text-[11px] text-[#99907b] mt-1">ICMS (+ R$ 1,00)</span>
                </label>

                <label
                  className={`flex flex-col p-3 rounded-2xl border cursor-pointer transition ${
                    activity === 'servicos'
                      ? 'bg-[#2a2a2a] border-[#f2c94c] text-white'
                      : 'bg-[#131313] border-[#ffffff0d] text-[#99907b]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="activity"
                      value="servicos"
                      checked={activity === 'servicos'}
                      onChange={() => setActivity('servicos')}
                      className="text-[#f2c94c] focus:ring-0"
                    />
                    <strong className="text-xs text-white">Serviços</strong>
                  </div>
                  <span className="text-[11px] text-[#99907b] mt-1">ISS (+ R$ 5,00)</span>
                </label>

                <label
                  className={`flex flex-col p-3 rounded-2xl border cursor-pointer transition ${
                    activity === 'misto'
                      ? 'bg-[#2a2a2a] border-[#f2c94c] text-white'
                      : 'bg-[#131313] border-[#ffffff0d] text-[#99907b]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="activity"
                      value="misto"
                      checked={activity === 'misto'}
                      onChange={() => setActivity('misto')}
                      className="text-[#f2c94c] focus:ring-0"
                    />
                    <strong className="text-xs text-white">Comércio e Serviços</strong>
                  </div>
                  <span className="text-[11px] text-[#99907b] mt-1">ICMS + ISS (+ R$ 6,00)</span>
                </label>
              </div>
            </div>

            <div className="pt-4 flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="bg-[#f2c94c] hover:bg-[#ffe8ad] text-[#131313] font-bold text-xs md:text-sm px-6 py-3 rounded-2xl shadow-[0_0_20px_rgba(242,201,76,0.25)] transition disabled:opacity-50"
              >
                {saving ? 'Salvando...' : 'Salvar Dados da Empresa'}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Workspace Entities Info */}
      <section className="bg-[#1c1b1b] border border-[#ffffff0d] rounded-3xl p-6 md:p-8 shadow-lg">
        <h3 className="font-extrabold text-lg text-white mb-1">Entidades Vinculadas</h3>
        <p className="text-xs text-[#99907b] mb-4">
          Isolamento estrito entre finanças da empresa (PJ) e despesas pessoais (PF).
        </p>

        <div className="space-y-3">
          {workspace?.entities.map((ent) => (
            <div
              key={ent.id}
              className="p-4 rounded-2xl bg-[#131313] border border-[#ffffff08] flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#2a2a2a] text-[#f2c94c] flex items-center justify-center font-bold text-sm">
                  {ent.kind === 'pj' ? 'PJ' : 'PF'}
                </div>
                <div>
                  <h4 className="font-bold text-sm text-white">{ent.name}</h4>
                  <p className="text-[11px] text-[#99907b]">
                    {ent.kind === 'pj' ? 'Pessoa Jurídica (Empresa)' : 'Pessoa Física (Pessoal)'}
                  </p>
                </div>
              </div>
              <span className="text-xs font-mono text-[#99907b]">{ent.id}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Logout Action */}
      <div className="pt-4 flex justify-end">
        <button
          onClick={logout}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl text-xs font-bold text-[#ffb4ab] bg-[#eb5757]/10 hover:bg-[#eb5757]/20 border border-[#eb5757]/20 transition"
        >
          <span className="material-symbols-outlined text-base">logout</span>
          Encerrar Sessão
        </button>
      </div>
    </div>
  );
};

export default ProfilePage;
