const MAX_DESCRIPTION_LENGTH = 80;

const LEADING_VERBS: ReadonlyArray<readonly [RegExp, string]> = [
  [/^(recebi|ganhei)\b/i, 'Recebimento'],
  [/^(vendi|faturei)\b/i, 'Venda'],
  [/^gastei\b/i, 'Gasto'],
  [/^paguei\b/i, 'Pagamento'],
  [/^comprei\b/i, 'Compra'],
];

function capitalize(text: string): string {
  return text.length === 0 ? text : text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Descrição curta para o lançamento. Quando o extrator devolveu a própria frase do usuário
 * (sem descrição própria), tira valores, datas relativas e o verbo ("recebi 3500 de um cliente pelo
 * pix hoje" -> "Recebimento de cliente via PIX"). Descrições já curtas do extrator só ganham
 * a primeira letra maiúscula.
 */
export function normalizeDescription(description: string, rawText: string): string {
  const trimmed = description.trim().replace(/\s+/g, ' ');
  const isRawSentence = trimmed.toLowerCase() === rawText.trim().replace(/\s+/g, ' ').toLowerCase();
  if (!isRawSentence) return capitalize(trimmed).slice(0, MAX_DESCRIPTION_LENGTH);

  let text = trimmed
    .replace(/(?:r\$\s*)?\d+(?:[.,]\d+)*(?:\s*(?:reais|real|conto|contos))?/gi, ' ')
    .replace(/\b(hoje|ontem|anteontem|agora)\b/gi, ' ')
    .replace(/\b(pelo|por|no|na|com|via)\s+pix\b/gi, 'via PIX')
    .replace(/\bpix\b/gi, 'PIX')
    .replace(/\b(de|do|da)\s+(um|uma)\b/gi, '$1')
    .replace(/\b(de|do|da|no|na|em|com|pelo|pela|por)\s*$/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  for (const [pattern, replacement] of LEADING_VERBS) {
    if (pattern.test(text)) {
      text = text.replace(pattern, replacement);
      break;
    }
  }
  text = text.replace(/\s+/g, ' ').trim();
  return capitalize(text).slice(0, MAX_DESCRIPTION_LENGTH);
}
