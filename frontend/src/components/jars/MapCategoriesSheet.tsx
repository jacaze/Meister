import React, { useEffect, useState } from 'react';
import Sheet from '../ui/Sheet.js';
import Mel from '../brand/Mel.js';
import { CircleNotch, Check, Tag } from '../ui/icons.js';
import api from '../../api/client.js';
import { useToast } from '../ui/Toast.js';
import { celebrate, haptic } from '../../lib/celebrate.js';

export interface JarOption {
  readonly id: string;
  readonly name: string;
  readonly percent?: number | null;
  readonly fixedAmount?: string | null;
}

export interface CategoryOption {
  readonly id: string;
  readonly name: string;
  readonly type: string;
}

interface MapCategoriesSheetProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly planId: string;
  readonly jars: readonly JarOption[];
  readonly categories: readonly CategoryOption[];
  readonly initialMappings: Record<string, string>; // categoryId -> jarId
  readonly onSaved: () => void;
}

export const MapCategoriesSheet: React.FC<MapCategoriesSheetProps> = ({
  open,
  onClose,
  planId,
  jars,
  categories,
  initialMappings,
  onSaved,
}) => {
  const toast = useToast();
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setMappings({ ...initialMappings });
      setError(null);
    }
  }, [open, initialMappings]);

  const handleJarChange = (categoryId: string, jarId: string) => {
    setMappings((prev) => ({
      ...prev,
      [categoryId]: jarId,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!planId) return;

    setLoading(true);
    setError(null);

    try {
      // Agrupa as categorias por jarId para envio em lote atômico:
      // PUT /jars/categories/batch { planId, mappings: [{ jarId, categoryIds }] }
      const jarToCategoryIds: Record<string, string[]> = {};
      for (const jar of jars) {
        jarToCategoryIds[jar.id] = [];
      }

      for (const [catId, jarId] of Object.entries(mappings)) {
        if (jarId && jarToCategoryIds[jarId]) {
          jarToCategoryIds[jarId].push(catId);
        }
      }

      const batchMappings = jars.map((jar) => ({
        jarId: jar.id,
        categoryIds: jarToCategoryIds[jar.id] || [],
      }));

      await api.put('/jars/categories/batch', {
        planId,
        mappings: batchMappings,
      });

      haptic([12, 40, 12]);
      celebrate('small');
      toast.success('Mapeamento de categorias salvo com sucesso!');
      onSaved();
      onClose();
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err && (err as { response?: { data?: { message?: string } } }).response?.data?.message
          ? (err as { response: { data: { message: string } } }).response.data.message
          : 'Falha ao salvar mapeamento das categorias.';
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
        className="flex-1 min-h-[44px] px-4 py-2.5 rounded-2xl bg-primary text-on-primary font-bold text-sm hover:bg-primary-deep flex items-center justify-center gap-2 transition disabled:opacity-50 active:scale-95 shadow-[var(--shadow-honey)]"
      >
        {loading ? <CircleNotch size={18} className="animate-spin" /> : <Check size={18} weight="bold" />}
        Salvar Mapeamentos
      </button>
    </div>
  );

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Organizar Categorias nos Potes"
      subtitle="Defina em qual pote cada tipo de despesa será debitado automaticamente."
      icon={<Mel size={44} mood={loading ? 'thinking' : 'idle'} />}
      footer={footer}
    >
      <form onSubmit={handleSubmit} className="space-y-4 py-2">
        {error && (
          <div className="p-3.5 bg-danger/10 border border-danger/20 rounded-2xl text-danger text-xs font-semibold leading-relaxed">
            {error}
          </div>
        )}

        <p className="text-xs text-muted leading-relaxed">
          Toda vez que você lançar uma despesa com uma dessas categorias, ela consumirá o limite do pote escolhido.
        </p>

        <div className="divide-y divide-ink/5 max-h-[60vh] overflow-y-auto pr-1">
          {categories.map((cat) => {
            const currentJarId = mappings[cat.id] || '';

            return (
              <div
                key={cat.id}
                className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Tag size={16} className="text-muted shrink-0" weight="duotone" />
                  <span className="text-sm font-bold text-ink truncate">{cat.name}</span>
                </div>

                <div className="w-full sm:w-60 shrink-0">
                  <select
                    value={currentJarId}
                    onChange={(e) => handleJarChange(cat.id, e.target.value)}
                    className="w-full min-h-[44px] px-3 py-2 bg-canvas border border-ink/10 rounded-xl text-xs font-bold text-ink focus:outline-none focus:border-primary transition"
                  >
                    <option value="">(Sem pote vinculado)</option>
                    {jars.map((j) => (
                      <option key={j.id} value={j.id}>
                        {j.name} {j.percent ? `(${j.percent}%)` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            );
          })}
        </div>
      </form>
    </Sheet>
  );
};

export default MapCategoriesSheet;
