import confetti from 'canvas-confetti';

const HONEY = ['#f2c94c', '#f6b51e', '#ffe27a', '#e08d0b', '#ffffff'];

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Chuva de mel: usado em metas batidas, lançamento confirmado e conquistas. */
export function celebrate(intensity: 'small' | 'big' = 'small'): void {
  if (prefersReducedMotion()) return;
  const hexagon = confetti.shapeFromPath({ path: 'M5 0 L10 3 L10 9 L5 12 L0 9 L0 3 Z' });
  const base = { colors: HONEY, shapes: [hexagon, 'circle' as const], ticks: 220, scalar: 1.1, disableForReducedMotion: true };

  if (intensity === 'small') {
    confetti({ ...base, particleCount: 60, spread: 70, startVelocity: 38, origin: { y: 0.75 } });
    return;
  }
  const fire = (ratio: number, opts: confetti.Options) =>
    confetti({ ...base, ...opts, particleCount: Math.floor(220 * ratio), origin: { y: 0.7 } });
  fire(0.25, { spread: 26, startVelocity: 55 });
  fire(0.2, { spread: 60 });
  fire(0.35, { spread: 100, decay: 0.91, scalar: 0.9 });
  fire(0.1, { spread: 120, startVelocity: 25, decay: 0.92, scalar: 1.3 });
  fire(0.1, { spread: 120, startVelocity: 45 });
}

/** Vibração curta no celular (onde suportado), para dar sensação física ao toque. */
export function haptic(pattern: number | number[] = 12): void {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(pattern);
}
