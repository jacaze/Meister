import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Calculator,
  ChartLineUp,
  Eye,
  EyeSlash,
  GraduationCap,
  Jar,
  Receipt,
  ShieldCheck,
  WarningCircle,
} from '../components/ui/icons.js';
import api from '../api/client.js';
import { useAuth } from '../context/AuthContext.js';
import Mel, { type MelMood } from '../components/brand/Mel.js';
import AnimatedNumber, { formatBRL } from '../components/ui/AnimatedNumber.js';
import TiltCard from '../components/ui/TiltCard.js';
import { rise, stagger } from '../lib/motion.js';

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

const limitTone = {
  ok: { label: 'Dentro do limite', chip: 'bg-success/10 text-success', bar: 'bg-success' },
  atencao: { label: 'Atenção: acima de 80%', chip: 'bg-primary/25 text-brand', bar: 'bg-primary-deep' },
  excedido: { label: 'Limite excedido', chip: 'bg-danger/10 text-danger', bar: 'bg-danger' },
  desenquadramento: { label: 'Risco de desenquadramento', chip: 'bg-danger/15 text-danger', bar: 'bg-danger' },
} as const;

const jarTone = {
  ok: { fill: '#f6b51e', label: 'tranquilo', text: 'text-success' },
  atencao: { fill: '#e0a91b', label: 'atenção', text: 'text-brand' },
  estourado: { fill: '#d23f3f', label: 'estourou', text: 'text-danger' },
} as const;

/** Data de coluna @db.Date (meia-noite UTC) → dd/mm sem deslocar o dia pelo fuso. */
const ddmm = (iso: string) => {
  const [, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}`;
};

export const DashboardPage: React.FC = () => {
  const { user, activeEntityId } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [showValues, setShowValues] = useState(true);
  const navigate = useNavigate();
  const reduce = useReducedMotion();

  const fetchDashboard = useCallback(() => {
    setLoading(true);
    setFailed(false);
    api
      .get(`/dashboard${activeEntityId ? `?entityId=${activeEntityId}` : ''}`)
      .then((res) => setData(res.data))
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, [activeEntityId]);

  useEffect(() => {
    fetchDashboard();
    const handleTxSaved = () => fetchDashboard();
    window.addEventListener('transaction-saved', handleTxSaved);
    return () => window.removeEventListener('transaction-saved', handleTxSaved);
  }, [fetchDashboard]);

  const money = (val: number | string | undefined, className?: string) =>
    showValues ? (
      <AnimatedNumber value={typeof val === 'number' ? val : Number(val || 0)} className={className} />
    ) : (
      <span className={className}>R$ ••••••</span>
    );

  if (loading && !data) return <DashboardSkeleton />;

  if (failed && !data) {
    return (
      <div className="card-surface mx-auto mt-10 flex max-w-md flex-col items-center p-8 text-center">
        <Mel size={110} mood="alert" />
        <h2 className="mt-3 text-xl font-extrabold">Não consegui carregar seus números</h2>
        <p className="mt-1 text-sm text-muted">Verifique sua conexão. Seus dados estão seguros.</p>
        <button onClick={fetchDashboard} className="mt-5 h-12 rounded-2xl bg-primary px-6 font-extrabold text-on-primary shadow-[var(--shadow-honey)]">
          Tentar de novo
        </button>
      </div>
    );
  }

  const limite = data?.limiteMei;
  const firstName = user?.name.split(' ')[0];
  const mood: MelMood =
    limite && limite.status !== 'ok' ? 'alert' : (data?.periodo.resultado ?? 0) > 0 ? 'happy' : 'idle';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';

  const shortcuts = [
    { label: 'Lançamentos', icon: Receipt, to: '/transacoes' },
    { label: 'Potes', icon: Jar, to: '/potes' },
    ...(user?.accountType === 'mei' ? [{ label: 'DAS', icon: Calculator, to: '/impostos' }] : []),
    { label: 'Relatórios', icon: ChartLineUp, to: '/relatorios' },
    { label: 'Lições', icon: GraduationCap, to: '/educacao' },
  ];

  return (
    <motion.div className="space-y-6 md:space-y-8" variants={stagger} initial={reduce ? false : 'hidden'} animate="show">
      {/* Saudação */}
      <motion.div variants={rise} className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="hidden sm:block">
            <Mel size={64} mood={mood} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-muted">{greeting},</p>
            <h1 className="truncate text-[28px] leading-tight font-extrabold tracking-tight md:text-4xl">{firstName} 👋</h1>
          </div>
        </div>
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => setShowValues((v) => !v)}
          aria-label={showValues ? 'Ocultar valores' : 'Mostrar valores'}
          className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-card text-ink-soft shadow-[var(--shadow-card)] ring-1 ring-ink/5"
        >
          {showValues ? <Eye size={22} /> : <EyeSlash size={22} />}
        </motion.button>
      </motion.div>

      {/* Cartão de saldo (mel) */}
      <motion.div variants={rise}>
        <TiltCard className="overflow-hidden rounded-[28px] bg-gradient-to-br from-[#ffe27a] via-primary to-[#f0a81a] p-6 text-on-primary shadow-[var(--shadow-honey)] md:p-8">
          <HoneycombDecoration />
          <div className="relative flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-on-primary/70">Saldo em caixa</p>
              <div className="mt-1 text-[40px] leading-none font-extrabold tracking-tight md:text-6xl">
                {money(data?.saldoAtual)}
              </div>
            </div>
            <div className="hidden sm:block -mt-2 -mr-2">
              <Mel size={88} mood={mood} />
            </div>
          </div>

          <div className="relative mt-6 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white/45 p-3.5 backdrop-blur-sm">
              <div className="flex items-center gap-1.5 text-xs font-bold text-on-primary/70">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-success text-white">
                  <ArrowUpRight size={14} weight="bold" />
                </span>
                Entradas do mês
              </div>
              <div className="mt-1.5 text-lg font-extrabold">{money(data?.periodo.totalEntradas)}</div>
            </div>
            <div className="rounded-2xl bg-white/45 p-3.5 backdrop-blur-sm">
              <div className="flex items-center gap-1.5 text-xs font-bold text-on-primary/70">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-danger text-white">
                  <ArrowDownRight size={14} weight="bold" />
                </span>
                Saídas do mês
              </div>
              <div className="mt-1.5 text-lg font-extrabold">{money(data?.periodo.totalDespesas)}</div>
            </div>
          </div>

          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => navigate('/transacoes')}
            className="relative mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-ink text-sm font-extrabold text-primary"
          >
            Ver extrato completo <ArrowRight size={18} weight="bold" />
          </motion.button>
        </TiltCard>
      </motion.div>

      {/* Atalhos */}
      <motion.div variants={rise} className="-mx-4 overflow-x-auto px-4 scrollbar-none md:mx-0 md:px-0">
        <div className="flex gap-3 md:grid md:grid-cols-5">
          {shortcuts.map((s) => {
            const I = s.icon;
            return (
              <motion.button
                key={s.to}
                whileTap={{ scale: 0.92 }}
                whileHover={reduce ? undefined : { y: -3 }}
                onClick={() => navigate(s.to)}
                className="flex w-[76px] shrink-0 flex-col items-center gap-2 md:w-auto"
              >
                <span className="grid h-16 w-16 place-items-center rounded-[22px] bg-card text-brand shadow-[var(--shadow-card)] ring-1 ring-ink/5">
                  <I size={28} weight="duotone" />
                </span>
                <span className="text-xs font-bold text-ink-soft">{s.label}</span>
              </motion.button>
            );
          })}
        </div>
      </motion.div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Termômetro MEI */}
        {limite && (
          <motion.section variants={rise} className="card-surface min-w-0 p-5 md:p-6 lg:col-span-2">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-muted">Limite MEI {limite.ano}</p>
                <h2 className="mt-1 text-lg font-extrabold leading-tight">Termômetro fiscal</h2>
              </div>
              <span className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-extrabold ${limitTone[limite.status].chip}`}>
                {limite.status === 'ok' ? <ShieldCheck size={16} weight="fill" /> : <WarningCircle size={16} weight="fill" />}
                {limitTone[limite.status].label}
              </span>
            </div>

            <div className="mt-5 flex items-end justify-between">
              <div className="text-4xl font-extrabold tracking-tight tabular">
                {showValues ? `${limite.percentualUtilizado.toFixed(1)}%` : '••%'}
              </div>
              <div className="text-right text-xs text-muted">
                de {showValues ? formatBRL(limite.limite) : 'R$ ••••'}
              </div>
            </div>
            <div className="relative mt-3 h-4 overflow-hidden rounded-full bg-field">
              <motion.div
                className={`h-full rounded-full ${limitTone[limite.status].bar}`}
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(limite.percentualUtilizado, 100)}%` }}
                transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.3 }}
              />
              <div className="absolute inset-y-0 left-[80%] w-0.5 bg-ink/20" title="80% — alerta" />
            </div>
            <div className="mt-2 flex justify-between text-[11px] font-bold text-faint">
              <span>0%</span>
              <span>80%</span>
              <span>100%</span>
            </div>

            <div className="mt-5 flex items-center justify-between gap-3 rounded-2xl bg-card-2 p-4">
              <div>
                <p className="text-xs font-semibold text-muted">Ainda pode faturar</p>
                <p className="text-lg font-extrabold">{money(limite.restante)}</p>
              </div>
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => navigate('/impostos')}
                className="flex h-11 items-center gap-1.5 rounded-xl bg-card px-3.5 text-sm font-extrabold text-brand ring-1 ring-ink/5"
              >
                DAS <ArrowRight size={16} weight="bold" />
              </motion.button>
            </div>
          </motion.section>
        )}

        {/* Últimos lançamentos */}
        <motion.section variants={rise} className={`card-surface min-w-0 p-5 md:p-6 ${limite ? 'lg:col-span-3' : 'lg:col-span-5'}`}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-extrabold">Últimos lançamentos</h2>
            <button onClick={() => navigate('/transacoes')} className="flex h-10 items-center gap-1 rounded-xl px-2 text-sm font-extrabold text-brand">
              Ver todos <ArrowRight size={16} weight="bold" />
            </button>
          </div>

          {data?.ultimasTransacoes && data.ultimasTransacoes.length > 0 ? (
            <motion.ul variants={stagger} initial={reduce ? false : 'hidden'} animate="show" className="divide-y divide-ink/5">
              {data.ultimasTransacoes.map((tx) => {
                const income = tx.type === 'receita';
                return (
                  <motion.li key={tx.id} variants={rise} className="flex items-center gap-3 py-3">
                    <span
                      className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${
                        income ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'
                      }`}
                    >
                      {income ? <ArrowUpRight size={20} weight="bold" /> : <ArrowDownRight size={20} weight="bold" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-bold">{tx.description}</p>
                      <p className="truncate text-xs text-muted">
                        {tx.category?.name ?? 'Sem categoria'} · {ddmm(tx.transactionDate)}
                      </p>
                    </div>
                    <span className={`shrink-0 text-[15px] font-extrabold tabular ${income ? 'text-success' : 'text-ink'}`}>
                      {showValues ? `${income ? '+' : '−'}${formatBRL(Math.abs(Number(tx.amount)))}` : 'R$ ••'}
                    </span>
                  </motion.li>
                );
              })}
            </motion.ul>
          ) : (
            <div className="flex flex-col items-center py-6 text-center">
              <Mel size={96} mood="wave" />
              <p className="mt-2 font-extrabold">Nenhum lançamento ainda</p>
              <p className="text-sm text-muted">Toque no + ou fale com a Mel para anotar o primeiro.</p>
            </div>
          )}
        </motion.section>
      </div>

      {/* Potes de mel */}
      {data?.potes && data.potes.length > 0 && (
        <motion.section variants={rise} className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-extrabold">Potes de mel do mês</h2>
            <button onClick={() => navigate('/potes')} className="flex h-10 items-center gap-1 rounded-xl px-2 text-sm font-extrabold text-brand">
              Ajustar <ArrowRight size={16} weight="bold" />
            </button>
          </div>
          <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 scrollbar-none md:mx-0 md:grid md:grid-cols-3 md:px-0">
            {data.potes.map((jar, i) => (
              <HoneyJarCard key={jar.id} jar={jar} index={i} showValues={showValues} />
            ))}
          </div>
        </motion.section>
      )}
    </motion.div>
  );
};

/** Pote de mel que enche conforme o quanto já foi usado do pote financeiro. */
const HoneyJarCard: React.FC<{
  jar: NonNullable<DashboardData['potes']>[number];
  index: number;
  showValues: boolean;
}> = ({ jar, index, showValues }) => {
  const tone = jarTone[jar.status];
  const level = Math.max(0, Math.min(jar.percentUsado, 100));
  const reduce = useReducedMotion();
  return (
    <motion.div
      whileTap={{ scale: 0.97 }}
      className="card-surface flex w-[78%] shrink-0 snap-start items-center gap-4 p-4 sm:w-[46%] md:w-auto"
    >
      <svg viewBox="0 0 64 76" className="h-20 w-16 shrink-0" aria-hidden>
        <defs>
          <clipPath id={`jar-${jar.id}`}>
            <path d="M12 20 Q8 24 8 32 L8 64 Q8 72 16 72 L48 72 Q56 72 56 64 L56 32 Q56 24 52 20 Z" />
          </clipPath>
        </defs>
        <rect x="14" y="6" width="36" height="10" rx="4" fill="#7a5c00" />
        <path d="M12 20 Q8 24 8 32 L8 64 Q8 72 16 72 L48 72 Q56 72 56 64 L56 32 Q56 24 52 20 Z" fill="#fff8e6" stroke="#e8d9b0" strokeWidth="2" />
        <g clipPath={`url(#jar-${jar.id})`}>
          <motion.rect
            x="0"
            width="64"
            height="76"
            fill={tone.fill}
            initial={{ y: 76 }}
            animate={{ y: 72 - (52 * level) / 100 }}
            transition={reduce ? { duration: 0 } : { duration: 1.4, delay: 0.2 + index * 0.12, ease: [0.16, 1, 0.3, 1] }}
          />
          <motion.path
            d="M0 0 Q8 -4 16 0 T32 0 T48 0 T64 0 L64 6 L0 6 Z"
            fill={tone.fill}
            initial={{ y: 76 }}
            animate={reduce ? { y: 69 - (52 * level) / 100 } : { y: 69 - (52 * level) / 100, x: [0, -6, 0] }}
            transition={{ y: { duration: 1.4, delay: 0.2 + index * 0.12, ease: [0.16, 1, 0.3, 1] }, x: { duration: 2.4, repeat: Infinity, ease: 'easeInOut' } }}
          />
        </g>
        <ellipse cx="20" cy="40" rx="3" ry="9" fill="#fff" opacity="0.6" />
      </svg>
      <div className="min-w-0">
        <p className="truncate font-extrabold">{jar.name}</p>
        <p className={`text-xs font-extrabold ${tone.text}`}>
          {Math.round(jar.percentUsado)}% usado · {tone.label}
        </p>
        <p className="mt-1.5 text-xs text-muted">Disponível</p>
        <p className="font-extrabold tabular">{showValues ? formatBRL(Number(jar.disponivel)) : 'R$ ••'}</p>
      </div>
    </motion.div>
  );
};

const HoneycombDecoration: React.FC = () => (
  <svg aria-hidden className="pointer-events-none absolute -right-6 -bottom-8 h-48 w-48 opacity-25" viewBox="0 0 120 120">
    {[
      [30, 20], [60, 20], [45, 46], [75, 46], [90, 20], [60, 72], [90, 72], [105, 46],
    ].map(([x, y], i) => (
      <path
        key={i}
        transform={`translate(${x} ${y})`}
        d="M0 -14 L12 -7 L12 7 L0 14 L-12 7 L-12 -7 Z"
        fill="none"
        stroke="#1c1b1b"
        strokeWidth="2"
      />
    ))}
  </svg>
);

const DashboardSkeleton: React.FC = () => (
  <div className="space-y-6" aria-busy="true" aria-label="Carregando painel">
    <div className="flex items-center justify-between">
      <div className="space-y-2">
        <div className="skeleton h-4 w-24 rounded-full" />
        <div className="skeleton h-8 w-40 rounded-full" />
      </div>
      <div className="skeleton h-12 w-12 rounded-full" />
    </div>
    <div className="skeleton h-64 rounded-[28px]" />
    <div className="flex gap-3">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="skeleton h-16 w-16 rounded-[22px]" />
      ))}
    </div>
    <div className="skeleton h-56 rounded-[24px]" />
  </div>
);

export default DashboardPage;
