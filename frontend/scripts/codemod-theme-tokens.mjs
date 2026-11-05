// Codemod: troca cores fixas do tema escuro (classes Tailwind arbitrárias `*-[#hex]`)
// por tokens semânticos definidos em src/index.css. Uso único na migração para o tema claro.
// node scripts/codemod-theme-tokens.mjs [--dry]
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DRY = process.argv.includes('--dry');
const ROOT = new URL('../src', import.meta.url).pathname;

// Tokens por papel: superfície (bg/from/to/via/fill/accent), texto e borda.
const surface = {
  '131313': 'canvas', '1c1b1b': 'card', '151515': 'card', '171616': 'card', '171717': 'card', '181818': 'card', '161616': 'card', '1f1d18': 'card-2', '262626': 'field', '219653': 'success',
  '201f1f': 'card-2', '2a2a2a': 'field', '353534': 'raised', '303030': 'raised', '333': 'raised',
  'f2c94c': 'primary', 'ffe8ad': 'primary-soft', '3a3220': 'primary-soft', '2a261f': 'primary-soft',
  '27ae60': 'success', '56d364': 'success', '4cd964': 'success', '61de8a': 'success',
  'eb5757': 'danger', 'ffb4ab': 'danger', '93000a': 'danger',
  '2f80ed': 'info', '29b6f6': 'info', '60d0ff': 'info',
  'e5e2e1': 'ink', 'd0c5af': 'ink-soft', '99907b': 'muted', '6e685c': 'faint', '706c64': 'faint', '555': 'faint', 'ccc': 'line-strong',
};
const text = {
  ...surface,
  'f2c94c': 'brand', 'ffe8ad': 'brand', '131313': 'on-primary', '1c1b1b': 'on-primary', '201f1f': 'on-primary', '2a2a2a': 'on-primary',
};
const border = {
  ...surface,
  '131313': 'line-strong', '1c1b1b': 'line-strong', '2a2a2a': 'line-strong', 'd0c5af': 'line-strong', '99907b': 'faint',
};
const roleOf = (prefix) => {
  if (['text', 'placeholder', 'caret', 'decoration'].includes(prefix)) return text;
  if (['border', 'ring', 'outline', 'divide', 'stroke', 'shadow', 'ring-offset'].includes(prefix)) return border;
  return surface;
};

const files = [];
const walk = (dir) => readdirSync(dir).forEach((f) => {
  const p = join(dir, f);
  if (statSync(p).isDirectory()) walk(p);
  else if (/\.(tsx|ts)$/.test(f)) files.push(p);
});
walk(ROOT);

let total = 0;
const unmapped = new Map();
for (const file of files) {
  const src = readFileSync(file, 'utf8');
  let count = 0;
  let out = src.replace(
    /\b(bg|text|border(?:-[trblxy])?|from|to|via|ring(?:-offset)?|outline|divide|stroke|fill|shadow|placeholder|caret|accent|decoration)-\[#([0-9a-fA-F]{3,8})\]/g,
    (m, prefix, hexRaw) => {
      const hex = hexRaw.toLowerCase();
      const base = prefix.replace(/-[trblxy]$/, '');
      // Brancos com alfa (#ffffffXX) eram "véus" sobre o escuro: viram véu escuro com o mesmo alfa.
      if (/^ffffff[0-9a-f]{2}$/.test(hex)) {
        const alpha = Math.round((parseInt(hex.slice(6), 16) / 255) * 100);
        count++;
        return `${prefix}-ink/${Math.max(alpha, 4)}`;
      }
      const token = roleOf(base)[hex];
      if (!token) { unmapped.set(m, (unmapped.get(m) || 0) + 1); return m; }
      count++;
      return `${prefix}-${token}`;
    }
  );
  out = out
    .replace(/\b(hover:|focus:|group-hover:)?text-white\b/g, (_m, v = '') => { count++; return `${v}text-ink`; })
    .replace(/\bbg-black\/(60|75|80)\b/g, () => { count++; return 'bg-ink/40'; });
  if (out !== src) {
    total += count;
    if (!DRY) writeFileSync(file, out);
    console.log(`${String(count).padStart(4)}  ${file.replace(ROOT + '/', '')}`);
  }
}
console.log(`\ntotal trocado: ${total}`);
if (unmapped.size) console.log('não mapeado:', Object.fromEntries(unmapped));
