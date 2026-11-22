import { describe, expect, it } from 'vitest';
import { normalizeDescription } from '../domain/description.js';

describe('normalizeDescription', () => {
  it('encurta a frase inteira do usuário sem valor, data e verbo', () => {
    const raw = 'recebi 3500 de um cliente pelo pix hoje';
    expect(normalizeDescription(raw, raw)).toBe('Recebimento de cliente via PIX');
  });

  it('remove valor com R$ e pontuação decimal', () => {
    const raw = 'Paguei R$ 1.250,50 de gasolina ontem';
    expect(normalizeDescription(raw, raw)).toBe('Pagamento de gasolina');
  });

  it('mantém descrição curta do extrator, só capitalizando', () => {
    expect(normalizeDescription('aluguel sala 2', 'paguei 800 de aluguel sala 2')).toBe('Aluguel sala 2');
  });

  it('limita o tamanho', () => {
    expect(normalizeDescription('a'.repeat(200), 'x').length).toBeLessThanOrEqual(80);
  });
});
