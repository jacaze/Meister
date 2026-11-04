import React, { useEffect, useState, useRef, useCallback } from 'react';
import api from '../api/client.js';

interface Category {
  id: string;
  name: string;
  slug: string;
  type: string;
}

interface BankTransactionItem {
  id: string;
  direction: 'in' | 'out';
  amount: string;
  occurredOn: string;
  description: string;
  provider: string;
  status: string;
  suggestedCategoryId?: string;
  isTransferSuspect?: boolean;
}

export const ReviewInboxPage: React.FC = () => {
  const [items, setItems] = useState<BankTransactionItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'nova' | 'importada' | 'ignorada'>('nova');
  const [selectedCategories, setSelectedCategories] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [itemsRes, catsRes] = await Promise.all([
        api.get('/imports', { params: { status: statusFilter } }),
        api.get('/categories'),
      ]);
      const fetchedItems: BankTransactionItem[] = itemsRes.data.items || [];
      setItems(fetchedItems);
      setCategories(catsRes.data || []);

      // Pre-fill categories from suggested
      const catMap: Record<string, string> = {};
      for (const it of fetchedItems) {
        if (it.suggestedCategoryId) {
          catMap[it.id] = it.suggestedCategoryId;
        }
      }
      setSelectedCategories(catMap);
    } catch (err) {
      console.error('Erro ao buscar caixa de revisão:', err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const text = await file.text();
      const provider = file.name.endsWith('.ofx') ? 'ofx' : 'csv';
      const res = await api.post('/imports/statement', {
        content: text,
        provider,
        institution: file.name,
      });

      alert(`Extrato processado com sucesso! ${res.data.importedCount} novas transações importadas.`);
      setStatusFilter('nova');
      await fetchData();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Erro ao processar arquivo de extrato.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleApprove = async (item: BankTransactionItem) => {
    try {
      const categoryId = selectedCategories[item.id] || item.suggestedCategoryId;
      await api.post('/imports/approve', {
        bankTransactionId: item.id,
        categoryId,
      });
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    } catch (err: any) {
      alert(err.response?.data?.message || 'Erro ao aprovar lançamento.');
    }
  };

  const handleIgnore = async (item: BankTransactionItem) => {
    try {
      await api.post('/imports/ignore', { bankTransactionId: item.id });
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    } catch (err: any) {
      alert(err.response?.data?.message || 'Erro ao ignorar lançamento.');
    }
  };

  const handleBatchApprove = async () => {
    if (items.length === 0) return;
    try {
      const payload = items.map((it) => ({
        bankTransactionId: it.id,
        categoryId: selectedCategories[it.id] || it.suggestedCategoryId,
      }));
      await api.post('/imports/batch-approve', { items: payload });
      await fetchData();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Erro ao aprovar em lote.');
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-3">
            <span className="material-symbols-outlined text-[#f2c94c] text-3xl">inbox</span>
            Caixa de Revisão de Extratos
          </h1>
          <p className="text-sm text-[#99907b] mt-1">
            Importe arquivos OFX e CSV do seu banco e aprove lançamentos pendentes com conciliação inteligente.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".ofx,.csv"
            className="hidden"
            onChange={handleFileUpload}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="px-4 py-2.5 rounded-2xl bg-[#ffffff0a] hover:bg-[#ffffff14] border border-[#f2c94c]/30 text-xs font-bold text-[#f2c94c] flex items-center justify-center gap-2 transition disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-sm">
              {uploading ? 'hourglass_top' : 'upload_file'}
            </span>
            {uploading ? 'Importando...' : 'Importar Extrato (OFX / CSV)'}
          </button>

          {statusFilter === 'nova' && items.length > 0 && (
            <button
              onClick={handleBatchApprove}
              className="px-4 py-2.5 rounded-2xl bg-[#f2c94c] text-[#131313] text-xs font-bold shadow-[0_0_15px_rgba(242,201,76,0.3)] hover:scale-[1.02] active:scale-[0.98] transition"
            >
              Aprovar Todos ({items.length})
            </button>
          )}
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 border-b border-[#ffffff0d] pb-3">
        {(['nova', 'importada', 'ignorada'] as const).map((st) => (
          <button
            key={st}
            onClick={() => setStatusFilter(st)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition capitalize ${
              statusFilter === st
                ? 'bg-[#ffffff12] text-white border border-[#ffffff14]'
                : 'text-[#99907b] hover:text-white'
            }`}
          >
            {st === 'nova' ? 'Pendentes de Revisão' : st === 'importada' ? 'Aprovadas' : 'Ignoradas'}
          </button>
        ))}
      </div>

      {/* Items List */}
      {loading ? (
        <div className="p-12 text-center text-[#99907b]">
          <span className="material-symbols-outlined text-4xl animate-spin text-[#f2c94c] mb-2">sync</span>
          <p className="text-sm font-medium">Carregando transações do extrato...</p>
        </div>
      ) : items.length === 0 ? (
        <div className="p-12 rounded-3xl bg-[#1c1b1b] border border-[#ffffff0d] text-center space-y-3">
          <span className="material-symbols-outlined text-4xl text-[#f2c94c]">mark_email_read</span>
          <h4 className="text-base font-bold text-white">Nenhuma transação pendente!</h4>
          <p className="text-xs text-[#99907b] max-w-md mx-auto">
            Sua caixa de extratos está em dia. Importe um arquivo OFX ou CSV do seu banco para conciliar novos lançamentos.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((it) => {
            const isIncome = it.direction === 'in';
            const availableCategories = categories.filter(
              (c) => c.type === (isIncome ? 'receita' : 'despesa')
            );

            return (
              <div
                key={it.id}
                className="p-5 rounded-2xl bg-[#1c1b1b] border border-[#ffffff14] flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                {/* Details */}
                <div className="flex items-center gap-4 flex-1">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      isIncome ? 'bg-[#27ae60]/15 text-[#27ae60]' : 'bg-[#eb5757]/15 text-[#eb5757]'
                    }`}
                  >
                    <span className="material-symbols-outlined text-xl">
                      {isIncome ? 'arrow_downward' : 'arrow_upward'}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white">{it.description}</span>
                      {it.isTransferSuspect && (
                        <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-[#f2c94c]/15 text-[#f2c94c] border border-[#f2c94c]/30">
                          Transferência Própria?
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-[#99907b] flex items-center gap-3">
                      <span>{it.occurredOn}</span>
                      <span>•</span>
                      <span className="uppercase text-[10px]">{it.provider}</span>
                    </div>
                  </div>
                </div>

                {/* Amount & Category */}
                <div className="flex flex-col md:flex-row md:items-center gap-4 shrink-0">
                  <div className="text-right">
                    <span
                      className={`text-base font-extrabold block ${
                        isIncome ? 'text-[#27ae60]' : 'text-white'
                      }`}
                    >
                      {isIncome ? '+' : '-'} R$ {Number(it.amount).toFixed(2).replace('.', ',')}
                    </span>
                  </div>

                  {statusFilter === 'nova' && (
                    <div className="flex items-center gap-2">
                      <select
                        value={selectedCategories[it.id] || it.suggestedCategoryId || ''}
                        onChange={(e) =>
                          setSelectedCategories((prev) => ({
                            ...prev,
                            [it.id]: e.target.value,
                          }))
                        }
                        className="px-3 py-2 bg-[#131313] border border-[#ffffff14] rounded-xl text-xs text-white focus:outline-none focus:border-[#f2c94c]"
                      >
                        <option value="">Selecione categoria...</option>
                        {availableCategories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>

                      <button
                        onClick={() => handleApprove(it)}
                        className="px-3.5 py-2 rounded-xl bg-[#27ae60] text-white text-xs font-bold hover:scale-[1.02] transition"
                      >
                        Aprovar
                      </button>

                      <button
                        onClick={() => handleIgnore(it)}
                        className="p-2 rounded-xl text-[#99907b] hover:text-[#eb5757] hover:bg-[#ffffff0a] transition"
                        title="Ignorar"
                      >
                        <span className="material-symbols-outlined text-sm">close</span>
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
  );
};

export default ReviewInboxPage;
