import type { Transition, Variants } from 'motion/react';

/** Molas e variantes compartilhadas — mantêm o "jeito" das animações igual no app inteiro. */
export const spring: Transition = { type: 'spring', stiffness: 380, damping: 30 };
export const springSoft: Transition = { type: 'spring', stiffness: 220, damping: 26 };

/** Contêiner que faz os filhos entrarem em cascata. */
export const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
};

/** Item da cascata: sobe e aparece com mola. */
export const rise: Variants = {
  hidden: { opacity: 0, y: 18, scale: 0.98 },
  show: { opacity: 1, y: 0, scale: 1, transition: springSoft },
};

/** Transição entre telas. */
export const page: Variants = {
  initial: { opacity: 0, y: 14, filter: 'blur(4px)' },
  enter: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.38, ease: [0.16, 1, 0.3, 1] } },
  exit: { opacity: 0, y: -8, filter: 'blur(4px)', transition: { duration: 0.18, ease: 'easeIn' } },
};

/** Feedback de toque padrão para botões. */
export const tap = { scale: 0.96 };
