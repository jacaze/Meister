import React from 'react';
import { motion, useReducedMotion, type TargetAndTransition } from 'motion/react';
import type { Icon, IconProps } from './icons.js';

export type IconMotion = 'wave' | 'twinkle' | 'pulse' | 'pop' | 'bounce' | 'wiggle';

const motions: Record<IconMotion, TargetAndTransition> = {
  // mão que acena: gira a partir do pulso, pausa e repete
  wave: { rotate: [0, 18, -8, 18, -4, 0], transition: { duration: 1.1, repeat: Infinity, repeatDelay: 1.6, ease: 'easeInOut' } },
  // brilho: cresce e gira levemente
  twinkle: { scale: [1, 1.25, 1], rotate: [0, 20, 0], transition: { duration: 1.6, repeat: Infinity, ease: 'easeInOut' } },
  // alerta: pulsa duas vezes e para
  pulse: { scale: [1, 1.2, 1, 1.12, 1], transition: { duration: 0.9, ease: 'easeOut' } },
  // aparece com mola (confirmações)
  pop: { scale: [0.4, 1.15, 1], opacity: [0, 1, 1], transition: { duration: 0.45, ease: 'easeOut' } },
  // quica devagar (chamar atenção sem incomodar)
  bounce: { y: [0, -3, 0], transition: { duration: 1.4, repeat: Infinity, ease: 'easeInOut' } },
  // balança (anexo, cadeado)
  wiggle: { rotate: [0, -10, 10, -6, 0], transition: { duration: 0.7, repeat: Infinity, repeatDelay: 2.4 } },
};

interface MotionIconProps extends IconProps {
  readonly icon: Icon;
  readonly animate?: IconMotion;
  readonly className?: string;
}

/** Ícone Phosphor com um movimento curto e coerente com o resto do app. Substitui emojis na interface. */
export const MotionIcon: React.FC<MotionIconProps> = ({ icon: I, animate = 'pop', className, ...iconProps }) => {
  const reduce = useReducedMotion();
  return (
    <motion.span
      aria-hidden
      className={`inline-grid place-items-center align-[-0.15em] ${className ?? ''}`}
      style={{ transformOrigin: animate === 'wave' ? '70% 80%' : 'center' }}
      animate={reduce ? undefined : motions[animate]}
    >
      <I {...iconProps} />
    </motion.span>
  );
};

export default MotionIcon;
