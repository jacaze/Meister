import React, { useEffect, useRef } from 'react';
import { animate, useInView, useReducedMotion } from 'motion/react';

interface AnimatedNumberProps {
  readonly value: number;
  readonly format?: (n: number) => string;
  readonly duration?: number;
  readonly className?: string;
}

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const formatBRL = (n: number) => brl.format(n);

/** Conta do valor anterior até o novo quando entra na tela (sem re-render por quadro). */
export const AnimatedNumber: React.FC<AnimatedNumberProps> = ({
  value,
  format = formatBRL,
  duration = 1.1,
  className,
}) => {
  const ref = useRef<HTMLSpanElement>(null);
  const from = useRef(0);
  const inView = useInView(ref, { once: true });
  const reduce = useReducedMotion();

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (reduce || !inView) {
      node.textContent = format(inView || reduce ? value : from.current);
      if (reduce) from.current = value;
      return;
    }
    const controls = animate(from.current, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        node.textContent = format(v);
      },
    });
    from.current = value;
    return () => controls.stop();
  }, [value, inView, reduce, duration, format]);

  return (
    <span ref={ref} className={`tabular ${className ?? ''}`}>
      {format(0)}
    </span>
  );
};

export default AnimatedNumber;
