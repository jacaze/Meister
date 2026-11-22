// Textos e formatadores puros da página de Insights.

export type InsightSeverity = 'info' | 'atencao' | 'alerta';

const SEVERITY_LABELS: Record<InsightSeverity, string> = {
  alerta: 'Alerta',
  atencao: 'Atenção',
  info: 'Informação',
};

export function severityLabel(severity: InsightSeverity): string {
  return SEVERITY_LABELS[severity] ?? severity;
}

export function quickQuestions(hasPj: boolean): string[] {
  const base = [
    'Qual é o meu saldo atual em caixa?',
    'Como estão os meus potes financeiros?',
    'Quanto gastei com alimentação este mês?',
  ];
  return hasPj
    ? [
        base[0],
        'Como está o meu limite anual do MEI?',
        'Qual é a situação das minhas guias de DAS?',
        base[1],
        'Quanto gastei com mercadorias e insumos este mês?',
      ]
    : base;
}

export function askPlaceholder(hasPj: boolean): string {
  return hasPj
    ? 'Ex.: Quanto gastei com alimentação este mês? Como está meu limite MEI?'
    : 'Ex.: Quanto gastei com alimentação este mês? Qual é o meu saldo?';
}

export const EMPTY_INSIGHTS_TEXT = 'Ainda não há insights — eles aparecem conforme você registra lançamentos.';

export function askErrorMessage(err: unknown): string {
  const message =
    err && typeof err === 'object' && 'response' in err
      ? (err as { response?: { data?: { message?: unknown } } }).response?.data?.message
      : undefined;
  return typeof message === 'string' && message ? message : 'Não consegui responder agora. Tente novamente em instantes.';
}

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** Valor de evidência (somente exibição, a API envia número). */
export function formatEvidenceAmount(amount: number): string {
  return brl.format(amount);
}

/** "2026-11-10" (ou ISO completo) -> "10/11/2026", sem converter por fuso. */
export function formatIsoDateBR(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}
