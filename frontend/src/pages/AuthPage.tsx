import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'motion/react';
import { CircleNotch, Envelope, EyeSlash, HandWaving, Lightning, LockKey, Sparkle, Storefront, User, UserCircle, WarningCircle } from '../components/ui/icons.js';
import MotionIcon from '../components/ui/MotionIcon.js';
import { useAuth } from '../context/AuthContext.js';
import Mel, { type MelMood } from '../components/brand/Mel.js';
import HoneyBackground from '../components/ui/HoneyBackground.js';
import { spring } from '../lib/motion.js';
import { celebrate, haptic } from '../lib/celebrate.js';

const fieldCls =
  'w-full h-14 rounded-2xl border border-ink/10 bg-canvas pl-12 pr-4 text-base text-ink placeholder:text-faint transition focus:border-primary focus:bg-card focus:outline-none focus:ring-4 focus:ring-primary/20';

export const AuthPage: React.FC = () => {
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [accountType, setAccountType] = useState<'mei' | 'pessoa_fisica'>('mei');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [passwordFocus, setPasswordFocus] = useState(false);

  const { login, register } = useAuth();
  const navigate = useNavigate();
  const reduce = useReducedMotion();

  const mood: MelMood = loading
    ? 'thinking'
    : error
      ? 'alert'
      : passwordFocus
        ? 'happy'
        : isRegister
          ? 'wave'
          : 'idle';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isRegister) {
        if (!name.trim()) {
          setError('Por favor, informe seu nome completo.');
          setLoading(false);
          return;
        }
        await register(name.trim(), email.trim(), password, accountType);
        celebrate('big');
      } else {
        await login(email.trim(), password);
      }
      haptic(12);
      navigate('/');
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Falha na autenticação. Verifique suas credenciais.';
      setError(msg);
      haptic([30, 40, 30]);
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (register: boolean) => {
    setIsRegister(register);
    setError(null);
  };

  return (
    <div className="relative min-h-dvh flex flex-col items-center justify-center px-5 pt-safe pb-safe">
      <HoneyBackground />

      <motion.div
        className="w-full max-w-md py-8"
        initial={reduce ? undefined : { opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* Mel + marca */}
        <div className="flex flex-col items-center text-center mb-6">
          <motion.div
            initial={reduce ? undefined : { scale: 0.4, rotate: -20, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 14, delay: 0.1 }}
          >
            <Mel size={132} mood={mood} />
          </motion.div>

          <AnimatePresence mode="wait">
            <motion.p
              key={mood}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="mt-1 flex items-center gap-2 rounded-full bg-card px-4 py-1.5 text-sm font-semibold text-ink-soft shadow-[var(--shadow-card)] ring-1 ring-ink/5"
            >
              {mood === 'thinking' && (<><CircleNotch size={18} weight="bold" className="animate-spin text-brand" />Só um instante…</>)}
              {mood === 'alert' && (<><MotionIcon icon={WarningCircle} animate="pulse" size={18} weight="fill" className="text-danger" />Opa, algo não bateu</>)}
              {mood === 'happy' && (<><MotionIcon icon={EyeSlash} animate="pop" size={18} weight="bold" className="text-brand" />Não tô olhando, pode digitar!</>)}
              {mood === 'wave' && (<><MotionIcon icon={HandWaving} animate="wave" size={18} weight="fill" className="text-primary-deep" />Que bom te ver chegando!</>)}
              {mood === 'idle' && (<><MotionIcon icon={Sparkle} animate="twinkle" size={18} weight="fill" className="text-primary-deep" />Oi! Eu sou a Mel</>)}
            </motion.p>
          </AnimatePresence>

          <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-ink">
            <span className="text-brand">MEI</span>ster
          </h1>
          <p className="mt-1 text-base text-muted">Suas finanças organizadas como um favo de mel.</p>
        </div>

        {/* Cartão do formulário */}
        <div className="card-surface p-6 shadow-[var(--shadow-float)]">
          <LayoutGroup id="auth-tabs">
            <div className="relative mb-6 grid grid-cols-2 rounded-2xl bg-field p-1.5" role="tablist">
              {[
                { label: 'Entrar', value: false },
                { label: 'Criar conta', value: true },
              ].map((tab) => {
                const active = isRegister === tab.value;
                return (
                  <button
                    key={tab.label}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => switchMode(tab.value)}
                    className={`relative h-11 rounded-xl text-sm font-extrabold transition-colors ${active ? 'text-on-primary' : 'text-muted'}`}
                  >
                    {active && (
                      <motion.span
                        layoutId="auth-tab"
                        className="absolute inset-0 rounded-xl bg-primary shadow-[var(--shadow-honey)]"
                        transition={spring}
                      />
                    )}
                    <span className="relative">{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </LayoutGroup>

          <AnimatePresence>
            {error && (
              <motion.div
                role="alert"
                initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                animate={{ opacity: 1, height: 'auto', marginBottom: 16, x: reduce ? 0 : [0, -8, 8, -4, 4, 0] }}
                exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                className="flex items-start gap-2.5 overflow-hidden rounded-2xl bg-danger/10 px-4 py-3 text-sm font-semibold text-danger ring-1 ring-danger/20"
              >
                <WarningCircle size={20} weight="fill" className="mt-0.5 shrink-0" />
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          <form onSubmit={handleSubmit} className="space-y-3.5">
            <AnimatePresence initial={false}>
              {isRegister && (
                <motion.div
                  key="register-fields"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                  className="space-y-3.5 overflow-hidden"
                >
                  <label className="relative block">
                    <span className="sr-only">Nome completo</span>
                    <User size={22} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-faint" />
                    <input
                      type="text"
                      autoComplete="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Seu nome completo"
                      className={fieldCls}
                    />
                  </label>

                  <div className="grid grid-cols-2 gap-2.5" role="radiogroup" aria-label="Tipo de conta">
                    {[
                      { value: 'mei' as const, label: 'Sou MEI', hint: 'PJ + PF', icon: Storefront },
                      { value: 'pessoa_fisica' as const, label: 'Pessoa física', hint: 'Só PF', icon: UserCircle },
                    ].map((opt) => {
                      const active = accountType === opt.value;
                      const I = opt.icon;
                      return (
                        <motion.button
                          key={opt.value}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          whileTap={{ scale: 0.96 }}
                          onClick={() => setAccountType(opt.value)}
                          className={`flex items-center gap-2.5 rounded-2xl p-3 text-left ring-2 transition ${
                            active ? 'bg-primary-soft ring-primary' : 'bg-canvas ring-ink/5'
                          }`}
                        >
                          <I size={26} weight={active ? 'duotone' : 'regular'} className={active ? 'text-brand' : 'text-muted'} />
                          <span className="leading-tight">
                            <span className="block text-sm font-extrabold text-ink">{opt.label}</span>
                            <span className="text-xs text-muted">{opt.hint}</span>
                          </span>
                        </motion.button>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <label className="relative block">
              <span className="sr-only">E-mail</span>
              <Envelope size={22} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-faint" />
              <input
                type="email"
                required
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                className={fieldCls}
              />
            </label>

            <label className="relative block">
              <span className="sr-only">Senha</span>
              <LockKey size={22} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-faint" />
              <input
                type="password"
                required
                autoComplete={isRegister ? 'new-password' : 'current-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onFocus={() => setPasswordFocus(true)}
                onBlur={() => setPasswordFocus(false)}
                placeholder="Sua senha"
                className={fieldCls}
              />
            </label>

            <motion.button
              type="submit"
              disabled={loading}
              whileHover={reduce ? undefined : { y: -2 }}
              whileTap={{ scale: 0.97 }}
              className="relative mt-2 h-14 w-full overflow-hidden rounded-2xl bg-primary text-base font-extrabold text-on-primary shadow-[var(--shadow-honey)] disabled:opacity-60"
            >
              {!reduce && (
                <motion.span
                  aria-hidden
                  className="absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-white/50 to-transparent"
                  animate={{ left: ['-35%', '135%'] }}
                  transition={{ duration: 2.4, repeat: Infinity, repeatDelay: 1.2, ease: 'easeInOut' }}
                />
              )}
              <span className="relative">
                {loading ? 'Entrando…' : isRegister ? 'Criar minha conta grátis' : 'Entrar no MEIster'}
              </span>
            </motion.button>

            {import.meta.env.DEV && !isRegister && (
              <button
                type="button"
                onClick={() => {
                  setEmail('demo@meister.com');
                  setPassword('senha123');
                  setError(null);
                }}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-ink/15 py-3 text-sm font-bold text-muted transition hover:border-primary hover:text-brand"
              >
                <Lightning size={18} weight="fill" className="text-primary-deep" />
                Preencher conta de demonstração (só em desenvolvimento)
              </button>
            )}
          </form>
        </div>

        <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-xs text-faint">
          <LockKey size={14} weight="fill" />
          Feito para MEI e pessoa física · seus dados ficam protegidos
        </p>
      </motion.div>
    </div>
  );
};

export default AuthPage;
