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

/**
 * Transição entre telas: só opacidade e deslocamento.
 * Não usar `filter` aqui: mesmo `blur(0px)` faz o wrapper virar o bloco de referência de todo
 * `position: fixed` dentro da página (modais, widget do Pluggy) e prende o z-index deles.
 * `transitionEnd` garante `transform: none` em repouso pelo mesmo motivo.
 */
export const page: Variants = {
  initial: { opacity: 0, y: 12 },
  enter: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.32, ease: [0.16, 1, 0.3, 1] },
    transitionEnd: { transform: 'none' },
  },
  exit: { opacity: 0, y: -6, transition: { duration: 0.14, ease: 'easeIn' } },
};

/** Feedback de toque padrão para botões. */
export const tap = { scale: 0.96 };
