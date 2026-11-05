import React, { Suspense, useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate, useOutlet } from 'react-router-dom';
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'motion/react';
import {
  Bank,
  Calculator,
  ChartLineUp,
  DotsNine,
  GraduationCap,
  House,
  Jar,
  Plus,
  Receipt,
  SignOut,
  Storefront,
  type Icon,
} from '../ui/icons.js';
import { useAuth } from '../../context/AuthContext.js';
import QuickTransactionModal from '../modals/QuickTransactionModal.js';
import FloatingAssistantWidget from '../assistant/FloatingAssistantWidget.js';
import Logo from '../brand/Logo.js';
import Mel from '../brand/Mel.js';
import HoneyBackground from '../ui/HoneyBackground.js';
import Sheet from '../ui/Sheet.js';
import { page, spring } from '../../lib/motion.js';
import { haptic } from '../../lib/celebrate.js';

interface NavItem {
  readonly label: string;
  readonly short: string;
  readonly path: string;
  readonly icon: Icon;
}

export const AppLayout: React.FC = () => {
  const { user, workspace, activeEntityId, setActiveEntityId, logout } = useAuth();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const outlet = useOutlet();
  const reduce = useReducedMotion();
  const isMei = user?.accountType === 'mei';

  const primary: NavItem[] = [
    { label: 'Início', short: 'Início', path: '/', icon: House },
    { label: 'Lançamentos', short: 'Lançam.', path: '/transacoes', icon: Receipt },
    { label: 'Potes de mel', short: 'Potes', path: '/potes', icon: Jar },
  ];
  const secondary: NavItem[] = [
    { label: 'Extratos & Open Finance', short: 'Extratos', path: '/revisao', icon: Bank },
    { label: 'Educação & Lições', short: 'Lições', path: '/educacao', icon: GraduationCap },
    ...(isMei ? [{ label: 'Impostos & DAS', short: 'DAS', path: '/impostos', icon: Calculator }] : []),
    { label: 'Relatórios', short: 'Relatórios', path: '/relatorios', icon: ChartLineUp },
    { label: 'Perfil & MEI', short: 'Perfil', path: '/perfil', icon: Storefront },
  ];
  const all = [...primary, ...secondary];
  const isActive = (path: string) => (path === '/' ? location.pathname === '/' : location.pathname.startsWith(path));
  const moreActive = secondary.some((i) => isActive(i.path));

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    setMoreOpen(false);
  }, [location.pathname]);

  const openNewTransaction = () => {
    haptic(10);
    setIsModalOpen(true);
  };

  const entities = workspace?.entities ?? [];
  const EntitySwitch = ({ compact = false }: { compact?: boolean }) =>
    entities.length > 1 ? (
      <LayoutGroup id={compact ? 'entity-m' : 'entity-d'}>
        <div className="relative flex rounded-full bg-field p-1" role="tablist" aria-label="Visão atual">
          {entities.map((ent) => {
            const active = ent.id === activeEntityId;
            return (
              <button
                key={ent.id}
                role="tab"
                aria-selected={active}
                onClick={() => setActiveEntityId(ent.id)}
                className={`relative z-10 rounded-full font-bold transition-colors ${
                  compact ? 'px-3 py-1.5 text-xs' : 'flex-1 px-3 py-2 text-sm'
                } ${active ? 'text-on-primary' : 'text-muted'}`}
              >
                {active && (
                  <motion.span
                    layoutId="entity-pill"
                    className="absolute inset-0 -z-10 rounded-full bg-primary shadow-[var(--shadow-honey)]"
                    transition={spring}
                  />
                )}
                {ent.kind === 'pj' ? 'PJ' : 'PF'}
                {!compact && <span className="font-medium opacity-70"> · {ent.name}</span>}
              </button>
            );
          })}
        </div>
      </LayoutGroup>
    ) : null;

  return (
    <div className="min-h-dvh text-ink md:flex">
      <HoneyBackground />

      {/* ===== Desktop: barra lateral ===== */}
      <aside className="hidden md:flex sticky top-0 h-dvh w-72 shrink-0 flex-col justify-between border-r border-ink/5 bg-card/70 backdrop-blur-xl p-5">
        <div className="space-y-7">
          <button onClick={() => navigate('/')} className="block text-left" aria-label="Ir para o início">
            <Logo size="md" animated tagline />
          </button>

          <EntitySwitch />

          <motion.button
            whileHover={reduce ? undefined : { y: -2 }}
            whileTap={{ scale: 0.97 }}
            onClick={openNewTransaction}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-3.5 font-extrabold text-on-primary shadow-[var(--shadow-honey)]"
          >
            <Plus size={20} weight="bold" /> Novo lançamento
          </motion.button>

          <LayoutGroup id="side">
            <nav className="space-y-1" aria-label="Navegação principal">
              {all.map((item) => {
                const active = isActive(item.path);
                const I = item.icon;
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    end={item.path === '/'}
                    className={`relative flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold transition-colors ${
                      active ? 'text-ink' : 'text-muted hover:text-ink hover:bg-ink/[0.03]'
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="side-pill"
                        className="absolute inset-0 -z-10 rounded-2xl bg-primary-soft ring-1 ring-primary/40"
                        transition={spring}
                      />
                    )}
                    <I size={22} weight={active ? 'duotone' : 'regular'} className={active ? 'text-brand' : ''} />
                    {item.label}
                  </NavLink>
                );
              })}
            </nav>
          </LayoutGroup>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-ink/5 pt-4">
          <button onClick={() => navigate('/perfil')} className="flex min-w-0 items-center gap-3 text-left">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary-soft font-extrabold text-brand ring-2 ring-primary/40">
              {user?.name?.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-ink">{user?.name}</p>
              <p className="truncate text-xs text-muted">{isMei ? 'MEI · Empresa' : 'Pessoa Física'}</p>
            </div>
          </button>
          <button
            onClick={logout}
            aria-label="Sair"
            className="grid h-10 w-10 place-items-center rounded-full text-muted transition hover:bg-danger/10 hover:text-danger"
          >
            <SignOut size={20} />
          </button>
        </div>
      </aside>

      {/* ===== Conteúdo ===== */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Celular: cabeçalho */}
        <header className="md:hidden sticky top-0 z-30 pt-safe glass-panel border-x-0 border-t-0">
          <div className="flex h-14 items-center justify-between gap-3 px-4">
            <Logo size="sm" animated />
            <div className="flex items-center gap-2">
              <EntitySwitch compact />
              <button
                onClick={() => navigate('/perfil')}
                aria-label="Perfil"
                className="grid h-10 w-10 place-items-center rounded-full bg-primary-soft font-extrabold text-brand ring-2 ring-primary/40"
              >
                {user?.name?.charAt(0).toUpperCase()}
              </button>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pt-4 pb-[calc(112px+env(safe-area-inset-bottom))] md:px-8 md:pt-8 md:pb-10">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={location.pathname}
              variants={reduce ? undefined : page}
              initial="initial"
              animate="enter"
              exit="exit"
            >
              <Suspense fallback={<PageLoading />}>{outlet}</Suspense>
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* ===== Celular: barra inferior ===== */}
      <nav
        aria-label="Navegação principal"
        className="md:hidden fixed inset-x-0 bottom-0 z-40 glass-panel border-x-0 border-b-0 pb-safe"
      >
        <LayoutGroup id="tabs">
          <div className="grid h-[68px] grid-cols-5 items-end px-2">
            {primary.slice(0, 2).map((item) => (
              <TabButton key={item.path} item={item} active={isActive(item.path)} />
            ))}

            <div className="relative flex justify-center">
              <motion.button
                onClick={openNewTransaction}
                aria-label="Novo lançamento"
                whileTap={{ scale: 0.9, rotate: 90 }}
                transition={spring}
                className="absolute -top-9 grid h-16 w-16 place-items-center rounded-[22px] bg-primary text-on-primary shadow-[var(--shadow-honey)] ring-4 ring-canvas"
              >
                <Plus size={30} weight="bold" />
              </motion.button>
              <span className="pb-2.5 text-[11px] font-bold text-brand">Lançar</span>
            </div>

            <TabButton item={primary[2]!} active={isActive(primary[2]!.path)} />
            <TabButton
              item={{ label: 'Mais', short: 'Mais', path: '#mais', icon: DotsNine }}
              active={moreActive}
              onClick={() => setMoreOpen(true)}
            />
          </div>
        </LayoutGroup>
      </nav>

      {/* ===== "Mais" (celular) ===== */}
      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="Mais opções" subtitle="Tudo o que a Mel organiza pra você">
        <div className="grid grid-cols-2 gap-3 pb-2">
          {secondary.map((item, i) => {
            const I = item.icon;
            const active = isActive(item.path);
            return (
              <motion.button
                key={item.path}
                initial={reduce ? undefined : { opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...spring, delay: 0.04 * i }}
                whileTap={{ scale: 0.96 }}
                onClick={() => navigate(item.path)}
                className={`flex min-h-[96px] flex-col items-start justify-between rounded-3xl p-4 text-left ring-1 transition ${
                  active ? 'bg-primary-soft ring-primary/50' : 'bg-card-2 ring-ink/5'
                }`}
              >
                <span className={`grid h-10 w-10 place-items-center rounded-2xl ${active ? 'bg-primary text-on-primary' : 'bg-card text-brand'}`}>
                  <I size={22} weight="duotone" />
                </span>
                <span className="text-sm font-bold leading-tight text-ink">{item.label}</span>
              </motion.button>
            );
          })}
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={logout}
            className="flex min-h-[96px] flex-col items-start justify-between rounded-3xl bg-danger/5 p-4 text-left ring-1 ring-danger/15"
          >
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-card text-danger">
              <SignOut size={22} weight="duotone" />
            </span>
            <span className="text-sm font-bold text-danger">Sair da conta</span>
          </motion.button>
        </div>
      </Sheet>

      <FloatingAssistantWidget />

      {isModalOpen && <QuickTransactionModal onClose={() => setIsModalOpen(false)} />}
    </div>
  );
};

const PageLoading: React.FC = () => (
  <div className="flex min-h-[50dvh] flex-col items-center justify-center gap-2" aria-busy="true" aria-label="Carregando">
    <Mel size={84} mood="thinking" />
    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-field">
      <div className="skeleton h-full w-full" />
    </div>
  </div>
);

const TabButton: React.FC<{ item: NavItem; active: boolean; onClick?: () => void }> = ({ item, active, onClick }) => {
  const I = item.icon;
  const content = (
    <>
      <span className="relative grid h-9 w-14 place-items-center">
        {active && (
          <motion.span
            layoutId="tab-pill"
            className="absolute inset-0 rounded-full bg-primary-soft ring-1 ring-primary/40"
            transition={spring}
          />
        )}
        <motion.span
          className="relative"
          animate={active ? { y: [0, -3, 0], scale: [1, 1.12, 1] } : { y: 0, scale: 1 }}
          transition={{ duration: 0.35 }}
        >
          <I size={24} weight={active ? 'fill' : 'regular'} className={active ? 'text-brand' : 'text-muted'} />
        </motion.span>
      </span>
      <span className={`text-[11px] font-bold ${active ? 'text-ink' : 'text-muted'}`}>{item.short}</span>
    </>
  );
  const cls = 'flex flex-col items-center gap-0.5 pb-2 pt-1.5';
  if (onClick) {
    return (
      <motion.button whileTap={{ scale: 0.9 }} onClick={onClick} className={cls} aria-label={item.label}>
        {content}
      </motion.button>
    );
  }
  return (
    <NavLink to={item.path} end={item.path === '/'} className={cls} aria-label={item.label} onClick={() => haptic(6)}>
      {content}
    </NavLink>
  );
};

export default AppLayout;
