import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';
import { useToast } from '../components/ui/Toast.js';
import Mel from '../components/brand/Mel.js';
import {
  ArrowLeft,
  Briefcase,
  CircleNotch,
  Plus,
  Storefront,
  Trash,
  UserCircle,
  Users,
  UsersThree,
  WarningCircle,
} from '../components/ui/icons.js';
import {
  BUSINESS_TYPE_LABEL,
  needsBusiness,
  validateOnboarding,
  type BusinessDraft,
  type BusinessType,
  type WorkspaceProfile,
} from '../lib/onboarding.js';

const PROFILES: ReadonlyArray<{
  value: WorkspaceProfile;
  title: string;
  hint: string;
  icon: React.ElementType;
}> = [
  { value: 'individual', title: 'Só eu', hint: 'Minhas finanças pessoais', icon: UserCircle },
  { value: 'negocio', title: 'Eu e meu negócio', hint: 'MEI, empresa ou trabalho autônomo', icon: Storefront },
  { value: 'familia', title: 'Família ou casal', hint: 'Finanças da casa, sem negócio', icon: Users },
  { value: 'familia_negocio', title: 'Família com negócio', hint: 'A casa e o negócio de cada um', icon: UsersThree },
];

const EMPTY_DRAFT: BusinessDraft = { type: 'mei', name: '' };

function errorMessage(err: unknown, fallback: string): string {
  return err && typeof err === 'object' && 'response' in err && (err as { response?: { data?: { message?: string } } }).response?.data?.message
    ? (err as { response: { data: { message: string } } }).response.data.message
    : fallback;
}

export const OnboardingPage: React.FC = () => {
  const { workspace, refreshWorkspace, refreshUser } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const existingBusinesses = (workspace?.entities ?? []).filter((e) => e.kind !== 'pf');
  const [profile, setProfile] = useState<WorkspaceProfile | null>(
    (workspace?.workspace.profile as WorkspaceProfile | null | undefined) ?? null
  );
  const [step, setStep] = useState<'perfil' | 'negocios'>('perfil');
  const [drafts, setDrafts] = useState<BusinessDraft[]>([EMPTY_DRAFT]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [archivingId, setArchivingId] = useState<string | null>(null);
  const isRevisit = Boolean(workspace?.workspace.onboardingCompleted);

  const submit = async (chosen: WorkspaceProfile) => {
    const { businesses, error: validation } = validateOnboarding(chosen, drafts, existingBusinesses.length);
    if (validation) {
      setError(validation);
      return;
    }
    setSaving(true);
    try {
      await api.post('/onboarding', { profile: chosen, businesses });
      await Promise.all([refreshWorkspace(), refreshUser()]);
      toast.success('Tudo pronto. O Meister está configurado para o seu caso.');
      navigate('/', { replace: true });
    } catch (err: unknown) {
      setError(errorMessage(err, 'Não foi possível salvar. Tente de novo.'));
    } finally {
      setSaving(false);
    }
  };

  const chooseProfile = (value: WorkspaceProfile) => {
    setProfile(value);
    setError(null);
    if (needsBusiness(value)) setStep('negocios');
    else void submit(value);
  };

  const updateDraft = (index: number, patch: Partial<BusinessDraft>) => {
    setDrafts((prev) => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)));
    setError(null);
  };

  const archive = async (entityId: string) => {
    setArchivingId(entityId);
    try {
      await api.delete(`/workspace/businesses/${entityId}`);
      await Promise.all([refreshWorkspace(), refreshUser()]);
      toast.success('Negócio arquivado. Os lançamentos continuam guardados.');
    } catch (err: unknown) {
      toast.error(errorMessage(err, 'Não foi possível arquivar.'));
    } finally {
      setArchivingId(null);
    }
  };

  return (
    <div className="min-h-dvh bg-canvas px-4 py-8 flex justify-center">
      <div className="w-full max-w-xl space-y-6">
        <div className="flex flex-col items-center text-center gap-2">
          <Mel size={72} mood={saving ? 'thinking' : 'idle'} />
          <h1 className="text-2xl font-extrabold text-ink">
            {step === 'perfil' ? 'Qual é o seu caso?' : 'Quais são os negócios?'}
          </h1>
          <p className="text-sm text-muted max-w-sm">
            {step === 'perfil'
              ? 'O Meister se organiza conforme a sua resposta. Dá para mudar depois no perfil.'
              : 'MEI, outra empresa ou trabalho autônomo sem CNPJ. Cada um fica separado das finanças pessoais.'}
          </p>
        </div>

        {step === 'perfil' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" role="radiogroup" aria-label="Qual é o seu caso">
            {PROFILES.map((opt) => {
              const Icon = opt.icon;
              const active = profile === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={saving}
                  onClick={() => chooseProfile(opt.value)}
                  className={`min-h-[88px] flex items-center gap-3 rounded-2xl p-4 text-left ring-2 transition disabled:opacity-60 ${
                    active ? 'bg-primary-soft ring-primary' : 'bg-card ring-ink/5 hover:ring-primary/40'
                  }`}
                >
                  <Icon size={30} weight={active ? 'duotone' : 'regular'} className={active ? 'text-brand' : 'text-muted'} />
                  <span className="leading-tight">
                    <span className="block text-base font-extrabold text-ink">{opt.title}</span>
                    <span className="text-xs text-muted">{opt.hint}</span>
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="space-y-3">
            {existingBusinesses.map((b) => (
              <div key={b.id} className="flex items-center justify-between gap-2 p-3.5 rounded-2xl bg-card ring-1 ring-ink/5">
                <span className="flex items-center gap-2 min-w-0">
                  <Briefcase size={18} className="text-brand shrink-0" />
                  <span className="font-bold text-sm text-ink truncate">{b.tradeName || b.name}</span>
                  <span className="text-[11px] text-muted font-bold shrink-0">
                    {b.kind === 'autonomo' ? 'Autônomo' : b.isMei ? 'MEI' : 'PJ'}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => archive(b.id)}
                  disabled={archivingId === b.id}
                  aria-label={`Arquivar ${b.tradeName || b.name}`}
                  className="min-h-[40px] min-w-[40px] grid place-items-center rounded-xl text-muted hover:text-danger hover:bg-danger/10 transition disabled:opacity-50"
                >
                  {archivingId === b.id ? <CircleNotch size={16} className="animate-spin" /> : <Trash size={16} />}
                </button>
              </div>
            ))}

            {drafts.map((draft, index) => (
              <div key={index} className="p-3.5 rounded-2xl bg-card ring-1 ring-ink/5 space-y-2.5">
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={`Tipo do negócio ${index + 1}`}>
                  {(Object.keys(BUSINESS_TYPE_LABEL) as BusinessType[]).map((type) => (
                    <button
                      key={type}
                      type="button"
                      role="radio"
                      aria-checked={draft.type === type}
                      onClick={() => updateDraft(index, { type })}
                      className={`min-h-[40px] px-3.5 py-2 rounded-xl text-sm font-bold border transition ${
                        draft.type === type
                          ? 'bg-primary text-on-primary border-primary'
                          : 'bg-canvas text-ink border-ink/10 hover:border-primary/40'
                      }`}
                    >
                      {BUSINESS_TYPE_LABEL[type]}
                    </button>
                  ))}
                </div>
                <label className="block">
                  <span className="sr-only">Nome do negócio {index + 1}</span>
                  <input
                    type="text"
                    value={draft.name}
                    maxLength={120}
                    onChange={(e) => updateDraft(index, { name: e.target.value })}
                    placeholder={draft.type === 'autonomo' ? 'Ex.: Aulas de violão' : 'Ex.: Clínica Sorriso'}
                    className="w-full min-h-[44px] px-3.5 py-2.5 bg-canvas border border-ink/10 rounded-2xl text-sm text-ink focus:outline-none focus:border-primary transition"
                  />
                </label>
              </div>
            ))}

            <button
              type="button"
              onClick={() => setDrafts((prev) => [...prev, EMPTY_DRAFT])}
              className="w-full min-h-[44px] rounded-2xl border border-dashed border-ink/20 text-sm font-bold text-ink hover:border-primary/50 transition flex items-center justify-center gap-2"
            >
              <Plus size={16} weight="bold" />
              Adicionar outro negócio
            </button>

            {profile === 'familia_negocio' && (
              <p className="text-xs text-muted text-center">
                Os negócios do seu cônjuge entram quando ele(a) aceitar o convite, na função Família (em breve).
              </p>
            )}
          </div>
        )}

        {profile && (profile === 'familia' || profile === 'familia_negocio') && step === 'perfil' && (
          <p className="text-xs text-muted text-center">O convite para o cônjuge chega com a função Família (em breve).</p>
        )}

        {error && (
          <p role="alert" className="p-3 rounded-2xl bg-danger/10 border border-danger/30 text-xs font-semibold text-danger flex items-center gap-2">
            <WarningCircle size={16} weight="bold" />
            {error}
          </p>
        )}

        <div className="flex items-center justify-between gap-3">
          {step === 'negocios' ? (
            <button
              type="button"
              onClick={() => {
                setStep('perfil');
                setError(null);
              }}
              className="min-h-[44px] px-4 rounded-2xl text-sm font-bold text-ink hover:bg-field transition flex items-center gap-1.5"
            >
              <ArrowLeft size={16} weight="bold" />
              Voltar
            </button>
          ) : isRevisit ? (
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="min-h-[44px] px-4 rounded-2xl text-sm font-bold text-ink hover:bg-field transition"
            >
              Cancelar
            </button>
          ) : (
            <span />
          )}
          {step === 'negocios' && profile && (
            <button
              type="button"
              onClick={() => submit(profile)}
              disabled={saving}
              className="min-h-[44px] px-6 rounded-2xl bg-primary text-on-primary font-bold text-sm hover:bg-primary-deep transition flex items-center gap-2 disabled:opacity-50"
            >
              {saving && <CircleNotch size={16} className="animate-spin" />}
              Concluir
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default OnboardingPage;
