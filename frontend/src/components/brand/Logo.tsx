import React from 'react';
import Mel from './Mel.js';

interface LogoProps {
  readonly size?: 'sm' | 'md' | 'lg';
  readonly animated?: boolean;
  readonly tagline?: boolean;
}

const sizes = { sm: { mel: 34, text: 'text-lg' }, md: { mel: 42, text: 'text-xl' }, lg: { mel: 64, text: 'text-3xl' } };

/** Marca: Mel + "MEIster" (com "MEI" em âmbar). */
export const Logo: React.FC<LogoProps> = ({ size = 'md', animated = false, tagline = false }) => {
  const s = sizes[size];
  return (
    <div className="flex items-center gap-2.5 select-none">
      <Mel size={s.mel} animated={animated} title="MEIster" />
      <div className="leading-none">
        <span className={`${s.text} font-extrabold tracking-tight text-ink`}>
          <span className="text-brand">MEI</span>ster
        </span>
        {tagline && (
          <span className="block mt-1 text-[11px] font-bold uppercase tracking-[0.14em] text-muted">
            suas finanças, docinho
          </span>
        )}
      </div>
    </div>
  );
};

export default Logo;
