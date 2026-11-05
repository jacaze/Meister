import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Camera, CircleNotch } from '../ui/icons.js';
import api from '../../api/client.js';
import { useAuth } from '../../context/AuthContext.js';
import Sheet from '../ui/Sheet.js';
import Mel from '../brand/Mel.js';
import { celebrate, haptic } from '../../lib/celebrate.js';

interface QuickTransactionModalProps {
  readonly onClose: () => void;
  readonly onSaved?: () => void;
}

interface Category {
  id: string;
  name: string;
  type: string;
  slug: string;
}

interface SplitItem {
  categoryId: string;
  categoryName: string;
  amount: string;
  description: string;
  jarName?: string;
}

export const QuickTransactionModal: React.FC<QuickTransactionModalProps> = ({ onClose, onSaved }) => {
  const { workspace, activeEntityId } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Mantém o painel montado durante a animação de saída antes de avisar o pai.
  const [open, setOpen] = useState(true);
  const close = () => {
    setOpen(false);
    window.setTimeout(onClose, 260);
  };
  const [type, setType] = useState<'receita' | 'despesa'>('despesa');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('pix');
  const [transactionDate, setTransactionDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [entityId, setEntityId] = useState(activeEntityId || '');
  const [viaPersonalAccount, setViaPersonalAccount] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Receipts / NFC-e Vision states
  const [scanningReceipt, setScanningReceipt] = useState(false);
  const [receiptWarning, setReceiptWarning] = useState<string | null>(null);
  const [receiptAccessKey, setReceiptAccessKey] = useState<string | null>(null);
  const [receiptIssuerCnpj, setReceiptIssuerCnpj] = useState<string | null>(null);
  const [splits, setSplits] = useState<SplitItem[] | null>(null);
  const [useSplits, setUseSplits] = useState(true);

  useEffect(() => {
    api.get(`/categories?type=${type}`)
      .then((res) => {
        setCategories(res.data);
        if (res.data.length > 0) {
          setCategoryId(res.data[0].id);
        } else {
          setCategoryId('');
        }
      })
      .catch(() => {});
  }, [type]);

  const handleReceiptFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setScanningReceipt(true);
    setError(null);
    setReceiptWarning(null);

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64Data = (reader.result as string).split(',')[1];
          const res = await api.post('/receipts/parse', {
            imageBase64: base64Data,
            mimeType: file.type || 'image/jpeg',
            entityId: entityId || undefined,
          });

          const data = res.data;
          setType('despesa');
          if (data.total) setAmount(data.total);
          if (data.issuerName) {
            setDescription(`Compra em ${data.issuerName}`);
          } else if (data.items && data.items.length > 0) {
            setDescription(`Nota Fiscal: ${data.items.slice(0, 2).map((i: any) => i.description).join(', ')}`);
          }
          if (data.issuedOn) setTransactionDate(data.issuedOn);
          if (data.accessKey) setReceiptAccessKey(data.accessKey);
          if (data.issuerCnpj) setReceiptIssuerCnpj(data.issuerCnpj);

          if (data.duplicate?.isDuplicate) {
            setReceiptWarning(`Atenção: Esta nota fiscal já foi registrada no sistema em ${data.duplicate.registeredAt}.`);
          }

          if (data.splitProposal && data.splitProposal.splits && data.splitProposal.splits.length > 1) {
            setSplits(data.splitProposal.splits);
            setUseSplits(true);
            setCategoryId(data.splitProposal.dominantCategoryId || '');
          } else if (data.splitProposal?.dominantCategoryId) {
            setCategoryId(data.splitProposal.dominantCategoryId);
            setSplits(null);
          }
        } catch (err: any) {
          setError(err.response?.data?.message || 'Falha ao processar a foto da nota fiscal.');
        } finally {
          setScanningReceipt(false);
        }
      };
      reader.readAsDataURL(file);
    } catch {
      setScanningReceipt(false);
      setError('Erro ao ler arquivo da imagem.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanAmount = amount.replace(',', '.').trim();
    if (!cleanAmount || isNaN(Number(cleanAmount)) || Number(cleanAmount) <= 0) {
      setError('Informe um valor válido e positivo.');
      return;
    }

    if (!description.trim()) {
      setError('Informe a descrição do lançamento.');
      return;
    }

    if (!useSplits && !categoryId) {
      setError('Selecione uma categoria.');
      return;
    }

    setLoading(true);
    try {
      if (useSplits && splits && splits.length > 1) {
        await api.post('/receipts/confirm', {
          total: Number(cleanAmount).toFixed(2),
          description: description.trim(),
          date: transactionDate,
          entityId: entityId || undefined,
          paymentMethod,
          accessKey: receiptAccessKey || undefined,
          issuerCnpj: receiptIssuerCnpj || undefined,
          splits: splits.map((s) => ({
            categoryId: s.categoryId,
            amount: s.amount,
            description: s.description,
          })),
        });
      } else {
        await api.post('/transactions', {
          type,
          amount: Number(cleanAmount).toFixed(2),
          description: description.trim(),
          categoryId,
          paymentMethod,
          transactionDate,
          entityId: entityId || undefined,
          viaPersonalAccount,
          sourceRef: receiptAccessKey ? `nfe:${receiptAccessKey}` : undefined,
        });
      }

      if (onSaved) onSaved();
      haptic([12, 40, 12]);
      celebrate('small');
      close();
      window.dispatchEvent(new CustomEvent('transaction-saved'));
    } catch (err: any) {
      setError(err.response?.data?.message || 'Falha ao salvar lançamento.');
    } finally {
      setLoading(false);
    }
  };

  const selectedEntity = workspace?.entities.find((e) => e.id === entityId);

  const footer = (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={close}
        className="h-12 flex-1 rounded-2xl text-sm font-bold text-muted transition hover:bg-field hover:text-ink"
      >
        Cancelar
      </button>
      <motion.button
        type="submit"
        form="quick-tx-form"
        whileTap={{ scale: 0.97 }}
        disabled={loading}
        className="h-12 flex-[2] rounded-2xl bg-primary text-sm font-extrabold text-on-primary shadow-[var(--shadow-honey)] transition disabled:opacity-50"
      >
        {loading ? 'Salvando…' : 'Confirmar lançamento'}
      </motion.button>
    </div>
  );

  return (
    <Sheet
      open={open}
      onClose={close}
      title="Novo lançamento"
      subtitle="A Mel anota pra você"
      icon={<Mel size={44} mood={loading || scanningReceipt ? 'thinking' : 'idle'} />}
      footer={footer}
    >

        {/* Hidden receipt file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleReceiptFileChange}
        />

        {/* Scan receipt button */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={scanningReceipt}
          className="w-full mb-5 min-h-12 py-3 px-4 rounded-2xl bg-primary-soft/60 hover:bg-primary-soft border border-dashed border-primary transition flex items-center justify-center gap-2.5 text-sm font-bold text-brand"
        >
          {scanningReceipt ? <CircleNotch size={20} className="animate-spin" /> : <Camera size={20} weight="duotone" />}
          {scanningReceipt ? 'A Mel está lendo a nota…' : 'Fotografar nota fiscal'}
        </button>

        {receiptWarning && (
          <div className="mb-4 p-3 rounded-2xl bg-primary/10 border border-primary/30 text-brand text-xs flex items-center gap-2">
            <span className="material-symbols-outlined text-sm">warning</span>
            <span>{receiptWarning}</span>
          </div>
        )}

        {error && (
          <div className="mb-5 p-3.5 rounded-xl bg-danger/30 border border-danger/40 text-danger text-xs font-semibold">
            {error}
          </div>
        )}

        <form id="quick-tx-form" onSubmit={handleSubmit} className="space-y-4">
          {/* Type Selector (Receita / Despesa) */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-canvas rounded-2xl border border-ink/5">
            <button
              type="button"
              onClick={() => setType('despesa')}
              className={`py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
                type === 'despesa'
                  ? 'bg-danger text-ink shadow-[0_0_15px_rgba(235,87,87,0.3)]'
                  : 'text-muted hover:text-ink'
              }`}
            >
              <span className="material-symbols-outlined text-sm">trending_down</span>
              Despesa (Saída)
            </button>
            <button
              type="button"
              onClick={() => setType('receita')}
              className={`py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
                type === 'receita'
                  ? 'bg-success text-ink shadow-[0_0_15px_rgba(39,174,96,0.3)]'
                  : 'text-muted hover:text-ink'
              }`}
            >
              <span className="material-symbols-outlined text-sm">trending_up</span>
              Receita (Entrada)
            </button>
          </div>

          {/* Valor */}
          <div>
            <label className="block text-[11px] font-bold text-muted uppercase tracking-wider mb-1.5">
              Valor (R$)
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-bold text-muted">
                R$
              </span>
              <input
                type="text"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0,00"
                className="w-full pl-12 pr-4 py-3 bg-canvas border border-ink/8 rounded-2xl text-xl font-bold text-ink focus:outline-none focus:border-primary transition"
                autoFocus
              />
            </div>
          </div>

          {/* Descrição */}
          <div>
            <label className="block text-[11px] font-bold text-muted uppercase tracking-wider mb-1.5">
              Descrição
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex: Venda de serviço, Almoço comercial, Material"
              className="w-full px-4 py-3 bg-canvas border border-ink/8 rounded-2xl text-sm font-medium text-ink focus:outline-none focus:border-primary transition"
            />
          </div>

          {/* Splits Preview from NFC-e */}
          {splits && splits.length > 1 && (
            <div className="p-3.5 bg-canvas rounded-2xl border border-ink/8 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-brand uppercase tracking-wider flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-sm">call_split</span>
                  Divisão em Potes ({splits.length} categorias)
                </span>
                <button
                  type="button"
                  onClick={() => setUseSplits(!useSplits)}
                  className="text-[10px] text-muted underline hover:text-ink"
                >
                  {useSplits ? 'Usar categoria única' : 'Reativar divisão'}
                </button>
              </div>
              {useSplits ? (
                <div className="space-y-1.5">
                  {splits.map((s, idx) => (
                    <div key={idx} className="flex items-center justify-between text-xs py-1 border-b border-ink/4 last:border-none">
                      <div className="flex items-center gap-1.5 text-ink font-medium">
                        <span>{s.categoryName}</span>
                        {s.jarName && (
                          <span className="text-[10px] text-brand bg-primary/10 px-1.5 py-0.5 rounded">
                            Pote: {s.jarName}
                          </span>
                        )}
                      </div>
                      <span className="font-bold text-ink">R$ {s.amount}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted">Divisão desativada. O total será associado à categoria única abaixo.</p>
              )}
            </div>
          )}

          {/* Categoria & Forma de Pagamento */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-muted uppercase tracking-wider mb-1.5">
                Categoria {useSplits && splits && splits.length > 1 ? '(Principal)' : ''}
              </label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                disabled={useSplits && !!splits && splits.length > 1}
                className="w-full px-3 py-2.5 bg-canvas border border-ink/8 rounded-2xl text-sm text-ink focus:outline-none focus:border-primary transition disabled:opacity-50"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-muted uppercase tracking-wider mb-1.5">
                Forma de Pagamento
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full px-3 py-2.5 bg-canvas border border-ink/8 rounded-2xl text-sm text-ink focus:outline-none focus:border-primary transition capitalize"
              >
                <option value="pix">PIX</option>
                <option value="cartao_debito">Cartão de Débito</option>
                <option value="cartao_credito">Cartão de Crédito</option>
                <option value="dinheiro">Dinheiro</option>
                <option value="boleto">Boleto</option>
                <option value="outro">Outro</option>
              </select>
            </div>
          </div>

          {/* Data & Entidade */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-muted uppercase tracking-wider mb-1.5">
                Data do Lançamento
              </label>
              <input
                type="date"
                value={transactionDate}
                onChange={(e) => setTransactionDate(e.target.value)}
                className="w-full px-3 py-2.5 bg-canvas border border-ink/8 rounded-2xl text-sm text-ink focus:outline-none focus:border-primary transition"
              />
            </div>

            {workspace && workspace.entities.length > 1 && (
              <div>
                <label className="block text-[11px] font-bold text-muted uppercase tracking-wider mb-1.5">
                  Conta / Entidade
                </label>
                <select
                  value={entityId}
                  onChange={(e) => setEntityId(e.target.value)}
                  className="w-full px-3 py-2.5 bg-canvas border border-ink/8 rounded-2xl text-sm text-ink focus:outline-none focus:border-primary transition"
                >
                  {workspace.entities.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.kind === 'pj' ? 'PJ — ' : 'PF — '}{e.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Via Personal Account Checkbox (MEI Reality) */}
          {selectedEntity?.kind === 'pj' && (
            <label className="flex items-center gap-3 p-3 bg-canvas rounded-2xl border border-ink/5 cursor-pointer hover:border-primary/40 transition">
              <input
                type="checkbox"
                checked={viaPersonalAccount}
                onChange={(e) => setViaPersonalAccount(e.target.checked)}
                className="w-4 h-4 rounded text-brand focus:ring-0 bg-field border-ink/10"
              />
              <span className="text-xs text-ink-soft">
                Pago/recebido através da conta bancária física (PF)?
              </span>
            </label>
          )}

        </form>
    </Sheet>
  );
};

export default QuickTransactionModal;
