import React from 'react';
import { motion, useReducedMotion } from 'motion/react';

/** Fundo da aplicação: favo de mel sutil + brilhos de mel que respiram devagar. */
export const HoneyBackground: React.FC = () => {
  const reduce = useReducedMotion();
  const blob = (delay: number) =>
    reduce
      ? undefined
      : {
          x: [0, 30, -20, 0],
          y: [0, -24, 18, 0],
          scale: [1, 1.12, 0.94, 1],
          transition: { duration: 22, delay, repeat: Infinity, ease: 'easeInOut' as const },
        };

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-canvas">
      <motion.div
        className="absolute -top-32 -right-24 h-[420px] w-[420px] rounded-full bg-primary/35 blur-[90px]"
        animate={blob(0)}
      />
      <motion.div
        className="absolute top-1/3 -left-40 h-[380px] w-[380px] rounded-full bg-honey/20 blur-[100px]"
        animate={blob(4)}
      />
      <motion.div
        className="absolute -bottom-40 right-1/4 h-[360px] w-[360px] rounded-full bg-primary-soft/80 blur-[90px]"
        animate={blob(8)}
      />
      <svg className="absolute inset-0 h-full w-full opacity-[0.05]">
        <defs>
          <pattern id="honeycomb" width="56" height="97" patternUnits="userSpaceOnUse" patternTransform="scale(0.9)">
            <path
              d="M28 0 L56 16 L56 48 L28 64 L0 48 L0 16 Z M28 64 L28 97 M0 113 L0 81 M56 81 L56 113"
              fill="none"
              stroke="#7a5c00"
              strokeWidth="1.4"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#honeycomb)" />
      </svg>
    </div>
  );
};

export default HoneyBackground;
