import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useDragControls, useReducedMotion, type PanInfo } from 'motion/react';
import { X } from './icons.js';

interface SheetProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title?: React.ReactNode;
  readonly subtitle?: React.ReactNode;
  readonly icon?: React.ReactNode;
  /** Conteúdo fixo no rodapé (botões de ação), sempre visível acima da barra de gestos. */
  readonly footer?: React.ReactNode;
  /** 'auto' cresce com o conteúdo; 'full' ocupa quase a tela toda no celular. */
  readonly height?: 'auto' | 'full';
  readonly maxWidth?: string;
  readonly children: React.ReactNode;
}

const MOBILE_QUERY = '(max-width: 767px)';

/**
 * Painel modal: no celular sobe de baixo (arrastar para baixo fecha); no desktop vira diálogo central.
 * Nunca ultrapassa a altura da tela — o conteúdo rola por dentro, cabeçalho e rodapé ficam fixos.
 */
export const Sheet: React.FC<SheetProps> = ({
  open,
  onClose,
  title,
  subtitle,
  icon,
  footer,
  height = 'auto',
  maxWidth = 'md:max-w-lg',
  children,
}) => {
  const reduce = useReducedMotion();
  const drag = useDragControls();
  const panelRef = useRef<HTMLDivElement>(null);
  const isMobile = typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches;

  // onClose costuma vir inline do pai (nova função a cada render). Se fosse dependência do
  // efeito abaixo, cada render do pai devolveria o foco para trás do modal e de volta.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    window.addEventListener('keydown', onKey);
    const t = window.setTimeout(() => {
      panelRef.current?.querySelector<HTMLElement>('input, select, textarea, button:not([data-sheet-close])')?.focus({ preventScroll: true });
    }, 250);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(t);
      previous?.focus?.({ preventScroll: true });
    };
  }, [open]);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 120 || info.velocity.y > 600) onClose();
  };

  const panelMotion = isMobile
    ? { initial: { y: '100%' }, animate: { y: 0 }, exit: { y: '100%' } }
    : { initial: { opacity: 0, scale: 0.94, y: 16 }, animate: { opacity: 1, scale: 1, y: 0 }, exit: { opacity: 0, scale: 0.96, y: 8 } };

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center md:p-6" role="presentation">
          <motion.div
            className="absolute inset-0 bg-ink/40 backdrop-blur-[3px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={typeof title === 'string' ? title : undefined}
            className={`relative w-full ${maxWidth} bg-card shadow-[var(--shadow-float)] flex flex-col
              rounded-t-[28px] md:rounded-[28px]
              ${height === 'full' ? 'h-[92dvh] md:h-[min(780px,88dvh)]' : 'max-h-[92dvh] md:max-h-[88dvh]'}`}
            {...panelMotion}
            transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 380, damping: 34 }}
            drag={isMobile ? 'y' : false}
            dragControls={drag}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={onDragEnd}
          >
            {/* alça + cabeçalho (área de arrastar) */}
            <div
              className="shrink-0 px-5 pt-2.5 pb-3 md:pt-5 touch-none cursor-grab active:cursor-grabbing md:cursor-default"
              onPointerDown={(e) => isMobile && drag.start(e)}
            >
              <div className="mx-auto mb-3 h-1.5 w-11 rounded-full bg-ink/15 md:hidden" />
              {(title || icon) && (
                <div className="flex items-start gap-3">
                  {icon && <div className="shrink-0 mt-0.5">{icon}</div>}
                  <div className="min-w-0 flex-1">
                    {title && <h2 className="text-lg font-extrabold tracking-tight text-ink leading-tight">{title}</h2>}
                    {subtitle && <p className="text-sm text-muted mt-0.5">{subtitle}</p>}
                  </div>
                  <button
                    type="button"
                    data-sheet-close
                    onClick={onClose}
                    aria-label="Fechar"
                    className="shrink-0 -mr-1 grid place-items-center w-10 h-10 rounded-full text-muted hover:bg-field hover:text-ink transition"
                  >
                    <X size={20} weight="bold" />
                  </button>
                </div>
              )}
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 pb-4">{children}</div>

            {footer && (
              <div className="shrink-0 border-t border-ink/5 bg-card px-5 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] rounded-b-none md:rounded-b-[28px]">
                {footer}
              </div>
            )}
            {!footer && <div className="shrink-0 pb-[env(safe-area-inset-bottom)]" />}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
};

export default Sheet;
