import React from 'react';
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'motion/react';

interface TiltCardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Inclinação máxima em graus. */
  readonly intensity?: number;
  /** Brilho que segue o ponteiro. */
  readonly glare?: boolean;
  readonly children: React.ReactNode;
}

/**
 * Cartão com profundidade: inclina em 3D seguindo o mouse e "afunda" ao toque.
 * Em telas de toque e com "reduzir movimento", fica só o afundar.
 */
export const TiltCard: React.FC<TiltCardProps> = ({
  intensity = 7,
  glare = true,
  className,
  children,
  ...rest
}) => {
  const reduce = useReducedMotion();
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const spring = { stiffness: 260, damping: 22 };
  const rotateX = useSpring(useTransform(py, [0, 1], [intensity, -intensity]), spring);
  const rotateY = useSpring(useTransform(px, [0, 1], [-intensity, intensity]), spring);
  const glareX = useTransform(px, (v) => `${v * 100}%`);
  const glareY = useTransform(py, (v) => `${v * 100}%`);
  const glareBg = useTransform(
    [glareX, glareY] as never,
    ([x, y]: string[]) => `radial-gradient(420px circle at ${x} ${y}, rgb(255 255 255 / 0.55), transparent 45%)`
  );

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (reduce || e.pointerType !== 'mouse') return;
    const r = e.currentTarget.getBoundingClientRect();
    px.set((e.clientX - r.left) / r.width);
    py.set((e.clientY - r.top) / r.height);
  };
  const reset = () => {
    px.set(0.5);
    py.set(0.5);
  };

  return (
    <div style={{ perspective: 900 }} className="h-full">
      <motion.div
        {...(rest as object)}
        className={`relative h-full ${className ?? ''}`}
        style={reduce ? undefined : { rotateX, rotateY, transformStyle: 'preserve-3d' }}
        onPointerMove={onPointerMove}
        onPointerLeave={reset}
        whileTap={reduce ? undefined : { scale: 0.985 }}
        transition={{ type: 'spring', stiffness: 400, damping: 28 }}
      >
        {children}
        {glare && !reduce && (
          <motion.div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 hover:opacity-100 transition-opacity duration-300 mix-blend-soft-light"
            style={{ background: glareBg }}
          />
        )}
      </motion.div>
    </div>
  );
};

export default TiltCard;
