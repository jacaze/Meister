import React, { useEffect, useState } from 'react';
import Sheet from '../ui/Sheet.js';
import Mel from '../brand/Mel.js';
import { CircleNotch } from '../ui/icons.js';
import BeeIcon from '../brand/BeeIcon.js';
import api from '../../api/client.js';
import { useToast } from '../ui/Toast.js';
import ConfirmDialog from '../ui/ConfirmDialog.js';
import { celebrate, haptic } from '../../lib/celebrate.js';

export interface JarTemplateItem {
  readonly slug: string;
  readonly name: string;
  readonly percent?: number;
  readonly fixedAmount?: string;
  readonly rollover: boolean;
}

export interface JarTemplate {
  readonly slug: string;
  readonly name: string;
  readonly targetKind: 'pj' | 'pf' | 'ambas';
  readonly jars: readonly JarTemplateItem[];
}

interface ConfigurePlanSheetProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly entityId?: string;
  readonly entityKind?: 'pj' | 'pf';
  readonly templates: readonly JarTemplate[];
  readonly currentPlanName?: string;
  readonly planId?: string;
  readonly currentTemplateSlug?: string;
  readonly currentBaseMode?: string;
  readonly onSaved: () => void;
}

export const ConfigurePlanSheet: React.FC<ConfigurePlanSheetProps> = ({
  open,
  onClose,
  entityId,
  entityKind = 'pj',
  templates,
  planId,
  currentTemplateSlug,
  currentBaseMode,
  onSaved,
}) => {
  const toast = useToast();
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [selectedBaseMode, setSelectedBaseMode] = useState<'mes_atual' | 'mes_anterior' | 'media_3_meses'>('mes_anterior');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  // Define template inicial inteligente baseado no tipo de entidade (PJ vs PF)
  useEffect(() => {
    if (open) {
      setError(null);
      if (currentTemplateSlug) {
        setSelectedTemplate(currentTemplateSlug);
      } else {
        const defaultSlug = entityKind === 'pf' ? 'seis-potes' : 'mei-empresa';
        setSelectedTemplate(defaultSlug);
      }

      if (currentBaseMode === 'mes_atual' || currentBaseMode === 'mes_anterior' || currentBaseMode === 'media_3_meses') {
        setSelectedBaseMode(currentBaseMode);
      } else {
        setSelectedBaseMode('mes_anterior');
      }
    }
  }, [open, currentTemplateSlug, currentBaseMode, entityKind]);

  const errorMessage = (err: unknown) =>
    err && typeof err === 'object' && 'response' in err && (err as { response?: { data?: { message?: string } } }).response?.data?.message
      ? (err as { response: { data: { message: string } } }).response.data.message
      : 'Falha ao configurar plano de potes.';

  const finish = (message: string, big: boolean) => {
    haptic([12, 40, 12]);
    if (big) celebrate('big');
    toast.success(message);
    onSaved();
    onClose();
  };

  // Opções de rádio feitas com div: Enter e espaço também selecionam.
  const selectOnKey = (e: React.KeyboardEvent, select: () => void) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      select();
    }
  };

  // Mesmo template: só troca a base, preservando categorias e saldo acumulado.
  const keepsTemplate = Boolean(planId && currentTemplateSlug && selectedTemplate === currentTemplateSlug);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!selectedTemplate) {
      setError('Selecione um método de distribuição de potes.');
      return;
    }
    if (keepsTemplate) {
      if (selectedBaseMode === currentBaseMode) {
        onClose();
        return;
      }
      setLoading(true);
      setError(null);
      try {
        await api.patch(`/jars/plan/${planId}`, { baseMode: selectedBaseMode });
        finish('Base de cálculo atualizada. Seus potes e categorias continuam iguais.', false);
      } catch (err: unknown) {
        const msg = errorMessage(err);
        setError(msg);
        toast.error(msg);
      } finally {
        setLoading(false);
      }
      return;
    }
    // Trocar de método recria o plano: avisa antes de apagar vínculos e saldo acumulado.
    if (planId) {
      setConfirmReset(true);
      return;
    }
    await createPlan();
  };

  const createPlan = async () => {
    setLoading(true);
    setError(null);
    try {
      await api.post('/jars/plan', {
        templateSlug: selectedTemplate,
        baseMode: selectedBaseMode,
        entityId: entityId || undefined,
      });
      setConfirmReset(false);
      finish('Plano de potes ativado com sucesso!', true);
    } catch (err: unknown) {
      const msg = errorMessage(err);
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const footer = (
    <div className="flex items-center gap-3 w-full">
      <button
        type="button"
        onClick={onClose}
        disabled={loading}
        className="flex-1 min-h-[44px] px-4 py-2.5 rounded-2xl border border-ink/10 bg-card text-ink font-bold text-sm hover:bg-field disabled:opacity-50 transition"
      >
        Cancelar
      </button>
      <button
        type="button"
        onClick={handleSubmit}
        disabled={loading}
        className="group flex-1 min-h-[44px] px-4 py-2.5 rounded-2xl bg-primary text-on-primary font-bold text-sm hover:bg-primary-deep flex items-center justify-center gap-2 transition disabled:opacity-50 active:scale-95 shadow-[var(--shadow-honey)]"
      >
        {loading ? <CircleNotch size={18} className="animate-spin" /> : <BeeIcon size={20} weight="bold" flutter />}
        {keepsTemplate ? 'Salvar' : 'Aplicar Plano'}
      </button>
    </div>
  );

  return (
    <>
    <Sheet
      open={open}
      onClose={onClose}
      title="Escolher Método de Potes"
      subtitle="Distribua sua renda de forma automática e nunca mais fique no aperto."
      icon={<Mel size={44} mood={loading ? 'thinking' : 'happy'} />}
      footer={footer}
    >
      <form onSubmit={handleSubmit} className="space-y-5 py-2">
        {error && (
          <div className="p-3.5 bg-danger/10 border border-danger/20 rounded-2xl text-danger text-xs font-semibold leading-relaxed">
            {error}
          </div>
        )}

        {/* Escolha do Template */}
        <div>
          <span id="plan-template-label" className="block text-xs font-bold text-ink uppercase tracking-wider mb-2">
            Modelo Financeiro Recomendado
          </span>
          <div role="radiogroup" aria-labelledby="plan-template-label" className="space-y-2.5">
            {templates
              .filter((t) => t.slug !== 'personalizado')
              .map((tmpl) => {
                const isSelected = selectedTemplate === tmpl.slug;
                const isRecommended =
                  (entityKind === 'pf' && (tmpl.slug === 'seis-potes' || tmpl.slug === '50-30-20')) ||
                  (entityKind === 'pj' && tmpl.slug === 'mei-empresa');

                return (
                  <div
                    key={tmpl.slug}
                    role="radio"
                    aria-checked={isSelected}
                    tabIndex={0}
                    onClick={() => setSelectedTemplate(tmpl.slug)}
                    onKeyDown={(e) => selectOnKey(e, () => setSelectedTemplate(tmpl.slug))}
                    className={`p-3.5 rounded-2xl border cursor-pointer transition flex flex-col gap-2 focus-visible:outline-2 focus-visible:outline-primary-deep ${
                      isSelected
                        ? 'bg-card border-brand shadow-sm ring-1 ring-brand'
                        : 'bg-card border-ink/10 hover:border-ink/20'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${
                          isSelected ? 'border-brand bg-primary' : 'border-ink/30'
                        }`} />
                        <span className="font-extrabold text-sm text-ink">{tmpl.name}</span>
                      </div>
                      {isRecommended && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary-soft text-brand">
                          Recomendado para {entityKind.toUpperCase()}
                        </span>
                      )}
                    </div>

                    {/* Prévia dos potes do template */}
                    <div className="flex flex-wrap gap-1.5 pl-5">
                      {tmpl.jars.map((j) => (
                        <span
                          key={j.slug}
                          className="text-[11px] font-medium px-2 py-0.5 rounded-lg bg-field text-ink-soft border border-ink/5"
                        >
                          {j.name} {j.percent !== undefined && j.percent !== null ? `(${j.percent}%)` : ''}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        {/* Base de Cálculo do Mês */}
        <div>
          <span id="plan-base-label" className="block text-xs font-bold text-ink uppercase tracking-wider mb-2">
            Base de Distribuição Mensal
          </span>
          <p className="text-xs text-muted mb-2.5">
            Define como o MEIster calcula o valor total disponível para abastecer os potes a cada mês.
          </p>
          <div role="radiogroup" aria-labelledby="plan-base-label" className="grid grid-cols-1 gap-2">
            {([
              {
                id: 'mes_anterior',
                title: 'Faturamento do Mês Anterior (Mais Recomendado)',
                desc: 'Você gasta este mês apenas o dinheiro que realmente já entrou e confirmou no mês passado.',
              },
              {
                id: 'mes_atual',
                title: 'Faturamento do Mês Atual (Tempo Real)',
                desc: 'Os potes aumentam proporcionalmente a cada receita recebida durante o mês em curso.',
              },
              {
                id: 'media_3_meses',
                title: 'Média Móvel dos Últimos 3 Meses',
                desc: 'Ideal para negócios com faturamento sazonal ou que oscilam muito de mês a mês.',
              },
            ] as const).map((mode) => {
              const isSelected = selectedBaseMode === mode.id;
              return (
                <div
                  key={mode.id}
                  role="radio"
                  aria-checked={isSelected}
                  tabIndex={0}
                  onClick={() => setSelectedBaseMode(mode.id)}
                  onKeyDown={(e) => selectOnKey(e, () => setSelectedBaseMode(mode.id))}
                  className={`p-3 rounded-2xl border cursor-pointer transition focus-visible:outline-2 focus-visible:outline-primary-deep ${
                    isSelected
                      ? 'bg-card border-brand shadow-sm ring-1 ring-brand'
                      : 'bg-card border-ink/10 hover:border-ink/20'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center ${
                      isSelected ? 'border-brand bg-primary' : 'border-ink/30'
                    }`} />
                    <span className="font-bold text-xs text-ink">{mode.title}</span>
                  </div>
                  <p className="text-[11px] text-muted pl-5">{mode.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </form>
    </Sheet>
    <ConfirmDialog
      open={confirmReset}
      onClose={() => setConfirmReset(false)}
      onConfirm={createPlan}
      loading={loading}
      title="Trocar o método de potes?"
      description="Um plano novo será criado com os potes desse método. As categorias vinculadas e o saldo acumulado do plano atual não passam para ele."
      confirmLabel="Trocar método"
      cancelLabel="Manter o atual"
      confirmVariant="primary"
    />
    </>
  );
};

export default ConfigurePlanSheet;
