import type { Extraction } from '../../domain/extraction-schema.js';

export interface CategorySummary {
  readonly slug: string;
  readonly name: string;
  readonly type: 'receita' | 'despesa';
}

export interface ExtractFromTextInput {
  readonly text: string;
  readonly categories: readonly CategorySummary[];
  readonly referenceDateIso?: string;
}

export interface ExtractFromImageInput {
  readonly imageBase64: string;
  readonly mimeType: string;
  readonly categories: readonly CategorySummary[];
  readonly referenceDateIso?: string;
}

export interface LlmExtractor {
  extractFromText(input: ExtractFromTextInput): Promise<Extraction>;
  extractFromImage?(input: ExtractFromImageInput): Promise<Extraction>;
}
