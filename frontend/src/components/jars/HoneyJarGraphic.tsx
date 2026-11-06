import React from 'react';
import { motion, useReducedMotion } from 'motion/react';

export interface HoneyJarGraphicProps {
  readonly id: string;
  readonly level: number; // 0 to 100+
  readonly status: 'ok' | 'atencao' | 'estourado';
  readonly size?: 'sm' | 'md' | 'lg';
  readonly animated?: boolean;
}

const statusTone = {
  ok: { fill: '#f6b51e', stroke: '#e8d9b0', bg: '#fff8e6' },
  atencao: { fill: '#e0a91b', stroke: '#e8d9b0', bg: '#fff8e6' },
  estourado: { fill: '#a8492f', stroke: '#ecc9bd', bg: '#fbefe9' },
} as const;

export const HoneyJarGraphic: React.FC<HoneyJarGraphicProps> = ({
  id,
  level,
  status,
  size = 'md',
  animated = true,
}) => {
  const reduce = useReducedMotion();
  const shouldAnimate = animated && !reduce;
  const clampedLevel = Math.max(0, Math.min(level, 100));
  const tone = statusTone[status] || statusTone.ok;

  // Dimensoes por tamanho
  const sizeClasses = {
    sm: 'h-14 w-11',
    md: 'h-20 w-16',
    lg: 'h-28 w-22',
  }[size];

  // Altura do liquido dentro do pote: y=72 (vazio, fundo) ate y=20 (cheio, pescoco)
  const targetY = 72 - (52 * clampedLevel) / 100;
  const waveTargetY = 69 - (52 * clampedLevel) / 100;

  return (
    <svg
      viewBox="0 0 64 76"
      className={`${sizeClasses} shrink-0 select-none overflow-visible`}
      aria-hidden="true"
    >
      <defs>
        <clipPath id={`honey-jar-clip-${id}`}>
          <path d="M12 20 Q8 24 8 32 L8 64 Q8 72 16 72 L48 72 Q56 72 56 64 L56 32 Q56 24 52 20 Z" />
        </clipPath>
      </defs>

      {/* Tampa de cortiça / madeira dourada */}
      <rect x="14" y="6" width="36" height="10" rx="4" fill="var(--color-ink, #261f18)" opacity="0.85" />
      <rect x="16" y="8" width="32" height="2" rx="1" fill="#fff" opacity="0.2" />

      {/* Corpo de vidro do pote */}
      <path
        d="M12 20 Q8 24 8 32 L8 64 Q8 72 16 72 L48 72 Q56 72 56 64 L56 32 Q56 24 52 20 Z"
        fill={tone.bg}
        stroke={tone.stroke}
        strokeWidth="2"
      />

      {/* Conteúdo líquido mascarado no pote */}
      <g clipPath={`url(#honey-jar-clip-${id})`}>
        {shouldAnimate ? (
          <>
            <motion.rect
              x="0"
              width="64"
              height="76"
              fill={tone.fill}
              initial={{ y: 76 }}
              animate={{ y: targetY }}
              transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
            />
            <motion.path
              d="M0 0 Q8 -4 16 0 T32 0 T48 0 T64 0 L64 6 L0 6 Z"
              fill={tone.fill}
              initial={{ y: 76 }}
              animate={{ y: waveTargetY, x: [0, -6, 0] }}
              transition={{
                y: { duration: 1.2, ease: [0.16, 1, 0.3, 1] },
                x: { duration: 2.8, repeat: Infinity, ease: 'easeInOut' },
              }}
            />
          </>
        ) : (
          <>
            <rect x="0" y={targetY} width="64" height="76" fill={tone.fill} />
            <path
              d="M0 0 Q8 -4 16 0 T32 0 T48 0 T64 0 L64 6 L0 6 Z"
              fill={tone.fill}
              transform={`translate(0, ${waveTargetY})`}
            />
          </>
        )}
      </g>

      {/* Brilho do vidro */}
      <ellipse cx="18" cy="38" rx="2.5" ry="10" fill="#ffffff" opacity="0.55" />
      <path
        d="M48 30 L48 58"
        stroke="#ffffff"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.3"
      />
    </svg>
  );
};

export default HoneyJarGraphic;
