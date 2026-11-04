export interface FiscalReceiptItem {
  readonly description: string;
  readonly quantity?: number;
  readonly unitPrice?: string;
  readonly total: string;
  readonly categorySlug?: string;
}

export const CNAE_CATEGORY_MAP: Record<string, string> = {
  '4711': 'alimentacao', // Supermercados
  '4712': 'alimentacao', // Minimercados
  '4771': 'saude', // Farmácias e drogarias
  '4731': 'transporte', // Postos de combustíveis
  '5611': 'alimentacao', // Restaurantes
  '5612': 'alimentacao', // Lanchonetes
  '4751': 'operacao', // Informática
  '4744': 'operacao', // Material de construção
  '4761': 'operacao', // Papelarias
};

export function suggestCategoryFromCnae(cnae?: string | null): string | null {
  if (!cnae) return null;
  const digits = cnae.replace(/\D/g, '');
  const prefix4 = digits.slice(0, 4);
  return CNAE_CATEGORY_MAP[prefix4] || null;
}

export function suggestCategoryFromKeywords(description: string): string | null {
  const lower = description.toLowerCase();

  if (/gasolina|etanol|diesel|combustivel|posto|estacionamento|uber|pedagio|taxi/i.test(lower)) {
    return 'transporte';
  }
  if (/mercado|supermercado|restaurante|refeicao|almoco|jantar|lanche|padaria|acougue|hortifruti|comida|cafe|marmita|marmitex|pizza|hamburguer/i.test(lower)) {
    return 'alimentacao';
  }
  if (/farmacia|drogaria|medicamento|remedio|exame|consulta|dentista|dipirona|dorflex|paracetamol|comprimido|vitamina/i.test(lower)) {
    return 'saude';
  }
  if (/materia-prima|insumo|peca|ferramenta|embalagem|mercadoria/i.test(lower)) {
    return 'mercadoria-insumos';
  }
  if (/aluguel|condominio|energia|luz|agua|internet|telefone|limpeza|manutencao|\bpapel\b|escritorio|papelaria|impressao|toner|chamex/i.test(lower)) {
    return 'operacao';
  }
  if (/das|imposto|tributo|receita federal|darf|taxa/i.test(lower)) {
    return 'impostos-das';
  }

  return null;
}
