import React, { useId } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { haptic } from '../../lib/celebrate.js';

interface CheckRowProps {
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly label: string;
  readonly hint?: string;
  readonly disabled?: boolean;
}

/**
 * Linha com caixa de marcar em mel. O checkbox nativo fica escondido (sr-only), então
 * teclado, leitor de tela e formulário continuam funcionando; o visual é desenhado ao lado.
 */
export const CheckRow: React.FC<CheckRowProps> = ({ checked, onChange, label, hint, disabled }) => {
  const id = useId();
  const reduce = useReducedMotion();

  return (
    <label
      htmlFor={id}
      className={`flex min-h-[56px] items-center gap-3 rounded-2xl p-3 pl-3.5 ring-1 transition-colors duration-300 ${
        checked ? 'bg-primary-soft/50 ring-primary/40' : 'bg-card-2 ring-ink/5 hover:ring-primary/30'
      } ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
    >
      <input
        id={id}
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(e) => {
          haptic(8);
          onChange(e.target.checked);
        }}
      />
      <motion.span
        aria-hidden
        initial={false}
        animate={checked && !reduce ? { scale: [1, 0.86, 1.06, 1] } : { scale: 1 }}
        transition={{ duration: 0.32, ease: 'easeOut' }}
        className={`grid h-[22px] w-[22px] shrink-0 place-items-center rounded-[7px] transition-colors duration-200 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary-deep ${
          checked
            ? 'bg-primary shadow-[inset_0_1px_1px_rgb(255_255_255_/_0.6),0_2px_6px_-2px_rgb(224_169_27_/_0.7)]'
            : 'bg-card ring-[1.5px] ring-line-strong'
        }`}
      >
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 text-on-primary" fill="none">
          <motion.path
            d="M3.5 8.5 6.5 11.5 12.5 4.5"
            stroke="currentColor"
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={false}
            animate={{ pathLength: checked ? 1 : 0, opacity: checked ? 1 : 0 }}
            transition={reduce ? { duration: 0 } : { duration: 0.26, ease: 'easeOut', delay: checked ? 0.05 : 0 }}
          />
        </svg>
      </motion.span>

      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-ink">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-muted">{hint}</span>}
      </span>
    </label>
  );
};

export default CheckRow;
