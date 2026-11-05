import React from 'react';
import { motion, useReducedMotion, type TargetAndTransition } from 'motion/react';

export type MelMood = 'idle' | 'happy' | 'thinking' | 'alert' | 'wave' | 'celebrate';

interface MelProps {
  readonly mood?: MelMood;
  readonly size?: number;
  /** Flutuar e bater asas continuamente (desligado em ícones pequenos). */
  readonly animated?: boolean;
  readonly className?: string;
  readonly title?: string;
}

const INK = '#2b2620';

/** Mel, a abelha mascote do MEIster. SVG puro + Motion; respeita "reduzir movimento". */
export const Mel: React.FC<MelProps> = ({
  mood = 'idle',
  size = 120,
  animated = true,
  className,
  title = 'Mel, a abelha do MEIster',
}) => {
  const reduce = useReducedMotion();
  const live = animated && !reduce;
  const id = React.useId().replace(/:/g, '');

  const bodyMotion: Record<MelMood, TargetAndTransition> = {
    idle: { y: [0, -5, 0], transition: { duration: 2.6, repeat: Infinity, ease: 'easeInOut' } },
    happy: { y: [0, -9, 0], transition: { duration: 0.9, repeat: Infinity, ease: 'easeInOut' } },
    thinking: { y: [0, -3, 0], rotate: [0, -4, 0], transition: { duration: 3.2, repeat: Infinity, ease: 'easeInOut' } },
    alert: { x: [0, -3, 3, -2, 2, 0], transition: { duration: 0.6, repeat: Infinity, repeatDelay: 1.4 } },
    wave: { y: [0, -4, 0], rotate: [0, 3, 0], transition: { duration: 1.6, repeat: Infinity, ease: 'easeInOut' } },
    celebrate: {
      y: [0, -28, 0, -14, 0],
      rotate: [0, -10, 10, -4, 0],
      transition: { duration: 1.2, repeat: Infinity, repeatDelay: 0.4, ease: 'easeOut' },
    },
  };

  const wingFlap = live
    ? { rotate: [-16, 16], transition: { duration: mood === 'celebrate' ? 0.06 : 0.09, repeat: Infinity, repeatType: 'mirror' as const } }
    : {};
  const blink = live && mood !== 'happy' && mood !== 'celebrate'
    ? { scaleY: [1, 1, 0.1, 1], transition: { duration: 4, times: [0, 0.92, 0.96, 1], repeat: Infinity } }
    : {};
  const happyEyes = mood === 'happy' || mood === 'celebrate';
  const center = { transformBox: 'fill-box' as const, transformOrigin: 'center' };

  return (
    <motion.svg
      viewBox="0 0 160 160"
      width={size}
      height={size}
      role="img"
      aria-label={title}
      className={className}
      animate={live ? bodyMotion[mood] : undefined}
      style={{ overflow: 'visible' }}
    >
      <defs>
        <linearGradient id={`body-${id}`} x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0%" stopColor="#ffe27a" />
          <stop offset="55%" stopColor="#f6b51e" />
          <stop offset="100%" stopColor="#e08d0b" />
        </linearGradient>
        <linearGradient id={`wing-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#d9eefc" stopOpacity="0.75" />
        </linearGradient>
        <clipPath id={`clip-${id}`}>
          <ellipse cx="80" cy="90" rx="46" ry="50" />
        </clipPath>
      </defs>

      {/* sombra no chão */}
      <motion.ellipse
        cx="80" cy="152" rx="30" ry="4.5" fill="#1c1b1b" opacity="0.1"
        animate={live ? { scaleX: [1, 0.86, 1], opacity: [0.12, 0.07, 0.12] } : undefined}
        transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
        style={center}
      />

      {/* asas */}
      <motion.g animate={wingFlap} style={{ transformBox: 'fill-box', transformOrigin: '100% 100%' }}>
        <ellipse cx="50" cy="50" rx="21" ry="30" transform="rotate(-32 50 50)" fill={`url(#wing-${id})`} stroke="#b9dcf2" strokeWidth="2" />
      </motion.g>
      <motion.g animate={live ? { ...wingFlap, rotate: [16, -16] } : {}} style={{ transformBox: 'fill-box', transformOrigin: '0% 100%' }}>
        <ellipse cx="110" cy="50" rx="21" ry="30" transform="rotate(32 110 50)" fill={`url(#wing-${id})`} stroke="#b9dcf2" strokeWidth="2" />
      </motion.g>

      {/* antenas */}
      <motion.g
        animate={live ? { rotate: [-3, 3, -3] } : undefined}
        transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
        style={{ transformBox: 'fill-box', transformOrigin: '50% 100%' }}
      >
        <path d="M68 44 Q62 26 56 18" stroke={INK} strokeWidth="3.5" fill="none" strokeLinecap="round" />
        <path d="M92 44 Q98 26 104 18" stroke={INK} strokeWidth="3.5" fill="none" strokeLinecap="round" />
        <circle cx="55" cy="17" r="5.5" fill={INK} />
        <circle cx="105" cy="17" r="5.5" fill={INK} />
      </motion.g>

      {/* ferrão */}
      <path d="M75 137 L80 149 L85 137 Z" fill={INK} />

      {/* corpo */}
      <ellipse cx="80" cy="90" rx="46" ry="50" fill={`url(#body-${id})`} />
      <g clipPath={`url(#clip-${id})`} fill={INK}>
        <path d="M28 108 Q80 120 132 108 L132 121 Q80 133 28 121 Z" />
        <path d="M28 128 Q80 140 132 128 L132 142 Q80 154 28 142 Z" />
      </g>
      <ellipse cx="62" cy="62" rx="15" ry="9" transform="rotate(-24 62 62)" fill="#fff" opacity="0.45" />

      {/* bracinhos */}
      <path d="M36 96 Q28 100 26 108" stroke={INK} strokeWidth="4" fill="none" strokeLinecap="round" />
      <motion.path
        d={mood === 'wave' || mood === 'celebrate' ? 'M124 94 Q134 84 138 70' : 'M124 96 Q132 100 134 108'}
        stroke={INK} strokeWidth="4" fill="none" strokeLinecap="round"
        animate={live && (mood === 'wave' || mood === 'celebrate') ? { rotate: [0, -22, 0] } : undefined}
        transition={{ duration: 0.5, repeat: Infinity, ease: 'easeInOut' }}
        style={{ transformBox: 'fill-box', transformOrigin: '0% 100%' }}
      />

      {/* sobrancelhas */}
      {mood === 'alert' && (
        <g stroke={INK} strokeWidth="3" strokeLinecap="round">
          <path d="M56 70 L70 74" />
          <path d="M104 70 L90 74" />
        </g>
      )}
      {mood === 'thinking' && (
        <g stroke={INK} strokeWidth="3" strokeLinecap="round" fill="none">
          <path d="M57 70 Q63 66 70 69" />
          <path d="M91 67 Q97 63 104 66" />
        </g>
      )}

      {/* olhos */}
      {happyEyes ? (
        <g stroke={INK} strokeWidth="3.5" fill="none" strokeLinecap="round">
          <path d="M56 85 Q63 76 70 85" />
          <path d="M90 85 Q97 76 104 85" />
        </g>
      ) : (
        <motion.g animate={blink} style={center}>
          <ellipse cx="63" cy={mood === 'thinking' ? 80 : 83} rx="6.5" ry="8" fill={INK} />
          <ellipse cx="97" cy={mood === 'thinking' ? 80 : 83} rx="6.5" ry="8" fill={INK} />
          <circle cx="65.5" cy={mood === 'thinking' ? 76.5 : 79.5} r="2.3" fill="#fff" />
          <circle cx="99.5" cy={mood === 'thinking' ? 76.5 : 79.5} r="2.3" fill="#fff" />
        </motion.g>
      )}

      {/* bochechas */}
      <ellipse cx="51" cy="96" rx="7.5" ry="4.5" fill="#ff8f7d" opacity="0.5" />
      <ellipse cx="109" cy="96" rx="7.5" ry="4.5" fill="#ff8f7d" opacity="0.5" />

      {/* boca */}
      {mood === 'happy' || mood === 'celebrate' ? (
        <g>
          <path d="M69 96 Q80 113 91 96 Z" fill={INK} />
          <path d="M74 103 Q80 108 86 103 Q80 101 74 103 Z" fill="#ff8f7d" />
        </g>
      ) : mood === 'alert' ? (
        <path d="M71 102 Q75.5 97 80 102 Q84.5 107 89 102" stroke={INK} strokeWidth="3" fill="none" strokeLinecap="round" />
      ) : mood === 'thinking' ? (
        <ellipse cx="86" cy="101" rx="3.5" ry="3" fill={INK} />
      ) : (
        <path d="M71 97 Q80 106 89 97" stroke={INK} strokeWidth="3.2" fill="none" strokeLinecap="round" />
      )}
    </motion.svg>
  );
};

export default Mel;
