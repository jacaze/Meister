import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';

interface DashboardData {
  saldoAtual: number;
  periodo: {
    inicio: string;
    fim: string;
    totalEntradas: number;
    totalDespesas: number;
    resultado: number;
  };
  limiteMei?: {
    ano: number;
    limite: number;
    limiteComTolerancia: number;
    faturamentoAno: number;
    percentualUtilizado: number;
    restante: number;
    status: 'ok' | 'atencao' | 'excedido' | 'desenquadramento';
  } | null;
  ultimasTransacoes: Array<{
    id: string;
    type: 'receita' | 'despesa';
    description: string;
    amount: number | string;
    paymentMethod?: string;
    transactionDate: string;
    category?: { id: string; name: string };
  }>;
  potes?: Array<{
    id: string;
    slug: string;
    name: string;
    alocado: string;
    usado: string;
    disponivel: string;
    percentUsado: number;
    status: 'ok' | 'atencao' | 'estourado';
  }>;
}

export const DashboardPage: React.FC = () => {
  const { user, activeEntityId } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showValues, setShowValues] = useState(true);
  const navigate = useNavigate();

  const fetchDashboard = useCallback(() => {
    setLoading(true);
    api.get(`/dashboard${activeEntityId ? `?entityId=${activeEntityId}` : ''}`)
      .then((res) => setData(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [activeEntityId]);

  useEffect(() => {
    fetchDashboard();

    const handleTxSaved = () => fetchDashboard();
    window.addEventListener('transaction-saved', handleTxSaved);
    return () => window.removeEventListener('transaction-saved', handleTxSaved);
  }, [fetchDashboard]);

  const formatBrl = (val: number | string | undefined) => {
    if (!showValues) return '••••••';
    const num = typeof val === 'number' ? val : Number(val || 0);
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#f2c94c]"></div>
      </div>
    );
  }

  const limite = data?.limiteMei;

  return (
    <div className="space-y-6 md:space-y-8 animate-in fade-in duration-300">
      {/* Top Welcome & Visibility Toggle */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
            Olá, {user?.name.split(' ')[0]} 👋
          </h1>
          <p className="text-xs text-[#99907b] font-medium mt-0.5">
            Visão geral da sua saúde financeira
          </p>
        </div>
        <button
          onClick={() => setShowValues(!showValues)}
          className="flex items-center gap-2 px-3 py-2 rounded-2xl bg-[#1c1b1b] border border-[#ffffff0d] text-xs font-semibold text-[#d0c5af] hover:text-white hover:bg-[#201f1f] transition"
        >
          <span className="material-symbols-outlined text-base">
            {showValues ? 'visibility' : 'visibility_off'}
          </span>
          <span className="hidden sm:inline">{showValues ? 'Ocultar' : 'Exibir'} valores</span>
        </button>
      </div>

      {/* Main Saldo & Flows Card (Luminous Finance Hero Card) */}
      <div className="bg-[#1c1b1b] border border-[#ffffff14] rounded-3xl p-6 md:p-8 shadow-xl relative overflow-hidden">
        {/* Subtle decorative background glow */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#f2c94c]/5 rounded-full blur-3xl pointer-events-none"></div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <span className="text-[11px] font-bold tracking-widest text-[#99907b] uppercase block mb-1">
              Saldo em Caixa
            </span>
            <div className="text-3xl md:text-5xl font-black text-white tracking-tight">
              {formatBrl(data?.saldoAtual)}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/transacoes')}
              className="px-5 py-2.5 bg-[#201f1f] hover:bg-[#2a2a2a] border border-[#ffffff0d] text-xs font-bold text-[#f2c94c] rounded-2xl transition"
            >
              Extrato Completo
            </button>
          </div>
        </div>

        {/* Divider line */}
        <div className="h-px bg-white/10 my-6"></div>

        {/* Inflows & Outflows */}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#27ae60]/15 flex items-center justify-center text-[#27ae60]">
              <span className="material-symbols-outlined text-xl">trending_up</span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-[#99907b] uppercase tracking-wider block">
                Entradas (Mês)
              </span>
              <span className="text-sm md:text-lg font-bold text-[#61de8a]">
                +{formatBrl(data?.periodo.totalEntradas)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#eb5757]/15 flex items-center justify-center text-[#eb5757]">
              <span className="material-symbols-outlined text-xl">trending_down</span>
            </div>
            <div>
              <span className="text-[10px] font-bold text-[#99907b] uppercase tracking-wider block">
                Saídas (Mês)
              </span>
              <span className="text-sm md:text-lg font-bold text-[#ffb4ab]">
                -{formatBrl(data?.periodo.totalDespesas)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* MEI Limit Card (Thermometer) */}
      {limite && (
        <div className="bg-[#1c1b1b] border border-[#ffffff14] rounded-3xl p-6 md:p-8 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <span className="material-symbols-outlined text-[#f2c94c]">shield</span>
              <h2 className="text-base font-bold text-white tracking-tight">
                Termômetro Fiscal MEI ({limite.ano})
              </h2>
            </div>
            <span
              className={`px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider ${
                limite.status === 'ok'
                  ? 'bg-[#27ae60]/20 text-[#61de8a] border border-[#27ae60]/30'
                  : limite.status === 'atencao'
                  ? 'bg-[#f2c94c]/20 text-[#f2c94c] border border-[#f2c94c]/40 animate-pulse'
                  : 'bg-[#93000a]/40 text-[#ffb4ab] border border-[#ffb4ab]/40'
              }`}
            >
              {limite.status === 'ok'
                ? 'Dentro do Limite'
                : limite.status === 'atencao'
                ? 'Atenção (≥ 80%)'
                : 'Teto Excedido!'}
            </span>
          </div>

          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="w-full bg-[#201f1f] h-3.5 rounded-full overflow-hidden p-0.5 border border-[#ffffff0d]">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  limite.status === 'ok'
                    ? 'bg-gradient-to-r from-[#27ae60] to-[#61de8a]'
                    : limite.status === 'atencao'
                    ? 'bg-gradient-to-r from-[#f2c94c] to-[#ffe8ad]'
                    : 'bg-gradient-to-r from-[#eb5757] to-[#ffb4ab]'
                }`}
                style={{ width: `${Math.min(limite.percentualUtilizado, 100)}%` }}
              ></div>
            </div>

            <div className="flex justify-between items-center text-xs font-semibold text-[#99907b] pt-1">
              <span>{limite.percentualUtilizado.toFixed(1)}% faturado ({formatBrl(limite.faturamentoAno)})</span>
              <span>Teto: {formatBrl(limite.limite)}</span>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-[#ffffff0d] flex items-center justify-between text-xs">
            <span className="text-[#99907b]">
              Margem segura restante: <strong className="text-white">{formatBrl(limite.restante)}</strong>
            </span>
            <button
              onClick={() => navigate('/impostos')}
              className="text-[#f2c94c] font-bold hover:underline"
            >
              Ver DAS e Tributos →
            </button>
          </div>
        </div>
      )}

      {/* Potes Financeiros Preview Section */}
      {data?.potes && data.potes.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <span className="material-symbols-outlined text-[#f2c94c]">savings</span>
              Potes Financeiros do Mês
            </h2>
            <button
              onClick={() => navigate('/potes')}
              className="text-xs font-bold text-[#f2c94c] hover:underline"
            >
              Configurar Potes →
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.potes.slice(0, 3).map((jar) => (
              <div
                key={jar.id}
                className="bg-[#1c1b1b] border border-[#ffffff14] rounded-2xl p-5 space-y-3 hover:border-[#f2c94c]/40 transition"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-white truncate">{jar.name}</span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      jar.status === 'ok'
                        ? 'bg-[#27ae60]/15 text-[#61de8a]'
                        : jar.status === 'atencao'
                        ? 'bg-[#f2c94c]/15 text-[#f2c94c]'
                        : 'bg-[#eb5757]/15 text-[#ffb4ab]'
                    }`}
                  >
                    {jar.percentUsado.toFixed(0)}% usado
                  </span>
                </div>

                <div className="flex justify-between items-baseline">
                  <div>
                    <span className="text-[10px] text-[#99907b] uppercase block">Disponível</span>
                    <span className="text-base font-bold text-white">{formatBrl(jar.disponivel)}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-[#99907b] uppercase block">Alocado</span>
                    <span className="text-xs font-semibold text-[#d0c5af]">{formatBrl(jar.alocado)}</span>
                  </div>
                </div>

                <div className="w-full bg-[#201f1f] h-2 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      jar.status === 'ok' ? 'bg-[#27ae60]' : jar.status === 'atencao' ? 'bg-[#f2c94c]' : 'bg-[#eb5757]'
                    }`}
                    style={{ width: `${Math.min(jar.percentUsado, 100)}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Transactions List */}
      <div className="bg-[#1c1b1b] border border-[#ffffff14] rounded-3xl p-6 md:p-8 shadow-xl">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <span className="material-symbols-outlined text-[#f2c94c]">receipt_long</span>
            Últimos Lançamentos
          </h2>
          <button
            onClick={() => navigate('/transacoes')}
            className="text-xs font-bold text-[#f2c94c] hover:underline"
          >
            Ver todos ({data?.ultimasTransacoes.length || 0})
          </button>
        </div>

        {data?.ultimasTransacoes && data.ultimasTransacoes.length > 0 ? (
          <div className="divide-y divide-[#ffffff0d]">
            {data.ultimasTransacoes.map((tx) => (
              <div key={tx.id} className="py-3.5 flex items-center justify-between hover:bg-[#201f1f]/50 px-2 rounded-xl transition">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-9 h-9 rounded-2xl flex items-center justify-center ${
                      tx.type === 'receita' ? 'bg-[#27ae60]/15 text-[#61de8a]' : 'bg-[#eb5757]/15 text-[#ffb4ab]'
                    }`}
                  >
                    <span className="material-symbols-outlined text-lg">
                      {tx.type === 'receita' ? 'arrow_downward' : 'arrow_upward'}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white truncate max-w-[180px] sm:max-w-xs">
                      {tx.description}
                    </p>
                    <div className="flex items-center gap-2 text-[11px] text-[#99907b] mt-0.5">
                      <span>{tx.category?.name || 'Geral'}</span>
                      <span>•</span>
                      <span>{new Date(tx.transactionDate).toLocaleDateString('pt-BR')}</span>
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <span
                    className={`text-sm font-extrabold ${
                      tx.type === 'receita' ? 'text-[#61de8a]' : 'text-white'
                    }`}
                  >
                    {tx.type === 'receita' ? '+' : '-'} {formatBrl(tx.amount)}
                  </span>
                  {tx.paymentMethod && (
                    <span className="text-[10px] text-[#99907b] block uppercase mt-0.5">
                      {tx.paymentMethod.replace('_', ' ')}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-10 text-[#99907b]">
            <span className="material-symbols-outlined text-4xl mb-2 text-[#99907b]/50 block">inbox</span>
            <p className="text-sm font-medium">Nenhum lançamento registrado neste mês.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default DashboardPage;
