import prisma from '../../../../config/prisma.js';
import { NotFoundError, type WorkspaceScope } from '../../../../shared/index.js';

const DETECTOR_DESCRIPTIONS: Record<string, string> = {
  category_spike: 'Identifica quando os gastos de uma categoria específica aumentaram 30% ou mais em relação à sua média dos meses anteriores.',
  income_drop: 'Detecta queda expressiva no ritmo de faturamento do mês comparado ao histórico recente.',
  limit_pace: 'Mede o ritmo acumulado de receitas em relação ao teto anual proporcional do MEI (R$ 81.000/ano).',
  pf_in_pj: 'Alerta sobre pagamentos com perfil pessoal registrados na conta da empresa para manter a blindagem patrimonial.',
  jar_pace: 'Calcula o ritmo diário de consumo de um pote financeiro para alertar antes que ele estoure.',
  cash_forecast: 'Estima cenários conservadores e otimistas de saldo de caixa para o próximo mês com base nos últimos 3 meses.',
  positive_trend: 'Destaca resultados operacionais positivos consecutivos para incentivar boas práticas de gestão.',
};

export async function explainInsight(
  scope: WorkspaceScope,
  insightId: string
) {
  const insight = await prisma.insight.findFirst({
    where: { id: insightId, workspaceId: scope.workspaceId },
  });

  if (!insight) {
    throw new NotFoundError('Insight não encontrado.');
  }

  // Mark as seen
  if (insight.status === 'nova') {
    await prisma.insight.update({
      where: { id: insight.id },
      data: { status: 'vista', seenAt: new Date() },
    });
  }

  // Fetch recent evidence transactions if categoryId exists in metrics
  let evidenceTransactions: Array<{ id: string; description: string; amount: number; date: string }> = [];
  const metrics = insight.metrics as Array<{ key: string; value: unknown }>;
  const categoryMetric = metrics.find((m) => m.key === 'categoria');

  if (categoryMetric && typeof categoryMetric.value === 'string') {
    const txs = await prisma.transaction.findMany({
      where: {
        workspaceId: scope.workspaceId,
        category: { name: categoryMetric.value },
      },
      orderBy: { transactionDate: 'desc' },
      take: 5,
      select: { id: true, description: true, amount: true, transactionDate: true },
    });

    evidenceTransactions = txs.map((t) => ({
      id: t.id,
      description: t.description,
      amount: Number(t.amount),
      date: t.transactionDate.toISOString().slice(0, 10),
    }));
  }

  return {
    insight,
    description: DETECTOR_DESCRIPTIONS[insight.detectorId] || 'Análise calculada sobre o seu histórico financeiro.',
    evidenceTransactions,
  };
}
