import React from 'react';

/**
 * Renderizador leve para o markdown das lições e respostas da Mel.
 * Suporta: # a #### títulos, listas numeradas, marcadores (* ou -), um nível de
 * sub-lista por indentação, **negrito**, *itálico* e parágrafos. Monta elementos React
 * (nunca HTML cru), então o texto do servidor não injeta marcação.
 */

type ListItem = { text: string; children: string[] };
type Block =
  | { kind: 'heading'; level: 1 | 2 | 3 | 4; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; ordered: boolean; items: ListItem[] };

const ORDERED = /^(\s*)\d+[.)]\s+(.*)$/;
const BULLET = /^(\s*)[-*•]\s+(.*)$/;
const HEADING = /^(#{1,4})\s+(.*)$/;

function parse(source: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push({ kind: 'paragraph', text: paragraph.join(' ') });
      paragraph = [];
    }
  };

  for (const raw of source.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flushParagraph();
      continue;
    }

    const heading = line.trim().match(HEADING);
    if (heading) {
      flushParagraph();
      blocks.push({ kind: 'heading', level: heading[1]!.length as 1 | 2 | 3 | 4, text: heading[2]! });
      continue;
    }

    const ordered = line.match(ORDERED);
    const bullet = ordered ? null : line.match(BULLET);
    const match = ordered ?? bullet;
    if (match) {
      flushParagraph();
      const indented = match[1]!.length >= 2;
      const text = match[2]!;
      const last = blocks[blocks.length - 1];
      if (indented && last?.kind === 'list' && last.items.length) {
        last.items[last.items.length - 1]!.children.push(text);
      } else if (last?.kind === 'list' && last.ordered === Boolean(ordered)) {
        last.items.push({ text, children: [] });
      } else {
        blocks.push({ kind: 'list', ordered: Boolean(ordered), items: [{ text, children: [] }] });
      }
      continue;
    }

    paragraph.push(line.trim());
  }
  flushParagraph();
  return blocks;
}

function inline(text: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={i} className="font-bold text-ink">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return (
        <em key={i} className="italic text-ink">
          {part.slice(1, -1)}
        </em>
      );
    }
    return part;
  });
}

interface RichTextProps {
  readonly text: string;
  /** Oculta o primeiro título de nível 1 (quando ele repete o título do cabeçalho). */
  readonly hideFirstH1?: boolean;
  /** Versão compacta para respostas curtas (sem espaçamento de artigo). */
  readonly compact?: boolean;
}

export const RichText: React.FC<RichTextProps> = ({ text, hideFirstH1 = false, compact = false }) => {
  let blocks = parse(text);
  if (hideFirstH1 && blocks[0]?.kind === 'heading' && blocks[0].level === 1) {
    blocks = blocks.slice(1);
  }

  return (
    <div className={`text-ink-soft leading-relaxed ${compact ? 'space-y-2.5 text-sm' : 'space-y-4 text-[15px]'}`}>
      {blocks.map((block, i) => {
        if (block.kind === 'heading') {
          if (block.level === 1) {
            return (
              <h2 key={i} className="text-lg font-extrabold tracking-tight text-ink">
                {inline(block.text)}
              </h2>
            );
          }
          if (block.level === 4) {
            return (
              <h4 key={i} className={`font-bold text-ink ${compact ? 'text-sm' : 'pt-1 text-[15px]'}`}>
                {inline(block.text)}
              </h4>
            );
          }
          return (
            <h3
              key={i}
              className={`flex items-center gap-2.5 font-extrabold text-ink ${compact ? 'pt-1 text-sm' : 'pt-3 text-base'}`}
            >
              <span aria-hidden className="h-4 w-1 shrink-0 rounded-full bg-primary" />
              {inline(block.text.replace(/:\s*$/, ''))}
            </h3>
          );
        }

        if (block.kind === 'paragraph') {
          return <p key={i}>{inline(block.text)}</p>;
        }

        if (block.ordered) {
          return (
            <ol key={i} className="space-y-2.5">
              {block.items.map((item, j) => (
                <li key={j} className="flex gap-3 rounded-2xl bg-card-2 p-3.5 ring-1 ring-ink/5">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-primary-soft text-xs font-extrabold text-brand">
                    {j + 1}
                  </span>
                  <div className="min-w-0 flex-1 space-y-2">
                    <p>{inline(item.text)}</p>
                    {item.children.length > 0 && <SubList items={item.children} />}
                  </div>
                </li>
              ))}
            </ol>
          );
        }

        return (
          <ul key={i} className="space-y-2">
            {block.items.map((item, j) => (
              <li key={j} className="flex gap-3">
                <span aria-hidden className="mt-[0.6em] h-1.5 w-1.5 shrink-0 rounded-full bg-primary-deep" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <p>{inline(item.text)}</p>
                  {item.children.length > 0 && <SubList items={item.children} />}
                </div>
              </li>
            ))}
          </ul>
        );
      })}
    </div>
  );
};

const SubList: React.FC<{ items: string[] }> = ({ items }) => (
  <ul className="space-y-1.5 border-l-2 border-primary/30 pl-3">
    {items.map((t, k) => (
      <li key={k}>{inline(t)}</li>
    ))}
  </ul>
);

export default RichText;
