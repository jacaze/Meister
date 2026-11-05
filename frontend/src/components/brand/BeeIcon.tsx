import React from 'react';

interface BeeIconProps {
  readonly size?: number;
  readonly weight?: 'regular' | 'bold';
  readonly className?: string;
  /** Bate as asas ao passar o mouse no elemento pai com a classe `group`. */
  readonly flutter?: boolean;
}

/**
 * Abelha em traço, no mesmo estilo dos ícones Phosphor (currentColor, cantos redondos).
 * Ícone de marca da Mel para ações "inteligentes" no lugar da estrela genérica de IA.
 */
export const BeeIcon: React.FC<BeeIconProps> = ({ size = 20, weight = 'regular', className = '', flutter = false }) => {
  const sw = weight === 'bold' ? 2 : 1.6;
  const wing = flutter
    ? 'origin-[12px_11px] transition-transform duration-200 group-hover:[animation:bee-flutter_0.18s_ease-in-out_3_alternate]'
    : '';

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {/* asas: saem das laterais do corpo, sem cruzar as antenas */}
      <g className={wing}>
        <path d="M8.3 11.6C5.4 12 3.4 10.1 4.1 8.2c.7-1.9 3.5-1.6 5.5.9" />
        <path d="M15.7 11.6c2.9.4 4.9-1.5 4.2-3.4-.7-1.9-3.5-1.6-5.5.9" />
      </g>
      {/* corpo e listras */}
      <ellipse cx="12" cy="14.4" rx="4" ry="5.4" />
      <path d="M8.3 13h7.4M8.6 16.2h6.8" />
      {/* antenas curtas no topo */}
      <path d="M11 9.2 10 6.4M13 9.2l1-2.8" />
    </svg>
  );
};

export default BeeIcon;
