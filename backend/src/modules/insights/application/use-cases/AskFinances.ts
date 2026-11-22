import prisma from '../../../../config/prisma.js';
import type { WorkspaceScope } from '../../../../shared/index.js';
import { Money, formatBRL, formatBRLFromDecimal, formatCompetence, formatDateBR, formatPercent } from '../../../../shared/index.js';
import { PeriodResolver } from '../../domain/PeriodResolver.js';
import { getMeiLimit, listDas } from '../../../fiscal/public.js';
import { getJarsStatus } from '../../../jars/public.js';
import { resolveScopedEntityId } from '../EntityGuard.js';
import { validTransactionsWhere } from '../../../ledger/public.js';

export interface AskFinancesResult {
  readonly answer: string;
  readonly intent: string;
  readonly periodLabel?: string;
  readonly metrics?: Record<string, string | number>;
}

export async function askFinances(
  scope: WorkspaceScope,
  question: string,
  entityId?: string
): Promise<AskFinancesResult> {
  const scopedEntityId = await resolveScopedEntityId(scope, entityId);
  const entityWhere = scopedEntityId ? { entityId: scopedEntityId } : {};
  const q = question.toLowerCase().trim();

  // 1. Guard against financial product/investment recommendations
  if (
    /\binvestir\b|\binvestimento\b|\bcripto\b|\ba[çc][õo]es\b|\bqual\s+o\s+melhor\s+banco\b|\bcr[ée]dito\b|\baplica[çc][ãa]o\b/i.test(q)
  ) {
    return {
      intent: 'recusa_orientacao',
      answer: 'O MEIster é um assistente de gestão financeira e não faz recomendações de investimento ou crédito. Posso ajudar você com seus dados de receitas, despesas, saldo, potes, limite do MEI e guias do DAS.',
    };
  }

  const period = PeriodResolver.resolve(q);

  // 2. Limite MEI
  if (/\blimite\b|\bteto\b|\bfaturamento\b|\bquanto\s+posso\s+faturar\b/i.test(q)) {
    const limitEntityId = scopedEntityId ?? scope.defaultEntityIds.pj;
    if (!limitEntityId) {
      return {
        intent: 'limite_mei',
        answer: 'Esta conta não possui uma entidade MEI (PJ) vinculada para consulta de limite anual.',
      };
    }
    const mei = await getMeiLimit(scope, { entityId: limitEntityId });
    if (!mei) {
      return {
        intent: 'limite_mei',
        answer: 'Não foi possível carregar os dados de limite MEI no momento.',
      };
    }
    return {
      intent: 'limite_mei',
      answer: `Você faturou ${formatBRLFromDecimal(mei.faturamentoAno)} no ano de ${mei.ano}, o que representa ${formatPercent(mei.percentualUtilizado)} do teto anual proporcional de ${formatBRLFromDecimal(mei.limite)}. Ainda restam ${formatBRLFromDecimal(mei.restante)} disponíveis.`,
      metrics: {
        percentual: mei.percentualUtilizado,
        faturamentoAno: mei.faturamentoAno,
        restante: mei.restante,
      },
    };
  }

  // 3. Guia DAS
  if (/\bdas\b|\bimposto\b|\btributo\b/i.test(q)) {
    const dasList = await listDas(scope, { entityId: scopedEntityId });
    if (dasList.items.length === 0) {
      return {
        intent: 'das',
        answer: 'Não encontramos guias de DAS cadastradas para o seu MEI.',
      };
    }
    const pendente = dasList.items.find((d) => d.status === 'pendente' || d.status === 'atrasado');
    if (pendente) {
      return {
        intent: 'das',
        answer: `Você tem a guia DAS da competência ${formatCompetence(pendente.competence)} no valor de ${formatBRLFromDecimal(pendente.amount)} com vencimento em ${formatDateBR(pendente.dueDate)} (${pendente.status.toUpperCase()}).`,
      };
    }
    return {
      intent: 'das',
      answer: 'Todas as suas guias de DAS registradas estão com status PAGO! Parabéns pela organização.',
    };
  }

  // 4. Potes Financeiros
  if (/\bpote\b|\bpotes\b|\breserva\b/i.test(q)) {
    const jarsRes = await getJarsStatus(scope, { entityId: scopedEntityId });
    if (jarsRes.jars.length === 0) {
      return {
        intent: 'potes',
        answer: 'Você ainda não configurou um plano de potes financeiros. Acesse a aba Potes no painel para ativar a divisão inteligente de gastos.',
      };
    }
    const lines = jarsRes.jars.map(
      (j) => `• ${j.name}: ${formatBRLFromDecimal(j.usado)} de ${formatBRLFromDecimal(j.alocado)} (${formatPercent(j.percentUsado, 0)} usado)`
    );
    return {
      intent: 'potes',
      answer: `Situação atual dos seus potes financeiros:\n${lines.join('\n')}`,
    };
  }

  // 5. Saldo
  if (/\bsaldo\b|\bcaixa\b|\bquanto\s+tenho\b/i.test(q)) {
    const txs = await prisma.transaction.findMany({
      where: {
        workspaceId: scope.workspaceId,
        ...entityWhere,
        ...validTransactionsWhere(),
        type: { in: ['receita', 'despesa'] },
      },
    });
    let inCents = 0n;
    let outCents = 0n;
    for (const t of txs) {
      const val = Money.fromDecimalString(String(t.amount)).cents;
      if (t.type === 'receita') inCents += val;
      else if (t.type === 'despesa') outCents += val;
    }
    const balCents = inCents - outCents;
    return {
      intent: 'saldo',
      answer: `Seu saldo acumulado em caixa é de ${formatBRL(balCents)}.`,
      metrics: {
        totalEntradas: Money.fromCents(inCents).toDecimalString(),
        totalSaidas: Money.fromCents(outCents).toDecimalString(),
        saldo: Money.formatCents(balCents),
      },
    };
  }

  // 6. Gastos por Categoria ou Maiores Gastos no Período
  const startDate = new Date(period.startDate);
  const endDate = new Date(period.endDate + 'T23:59:59.999Z');

  const txs = await prisma.transaction.findMany({
    where: {
      workspaceId: scope.workspaceId,
      transactionDate: { gte: startDate, lte: endDate },
      ...entityWhere,
      ...validTransactionsWhere(),
      type: 'despesa',
    },
    include: { category: true },
  });

  const catMap = new Map<string, bigint>();
  let totalExpenseCents = 0n;

  for (const t of txs) {
    const val = Money.fromDecimalString(String(t.amount)).cents;
    totalExpenseCents += val;
    const catName = t.category?.name || 'Sem Categoria';
    catMap.set(catName, (catMap.get(catName) ?? 0n) + val);
  }

  // Check if user asked about a specific category
  const categories = await prisma.category.findMany({
    where: { workspaceId: scope.workspaceId },
  });
  const matchedCat = categories.find((c) => q.includes(c.name.toLowerCase()) || q.includes(c.slug));

  if (matchedCat) {
    const catCents = catMap.get(matchedCat.name) ?? 0n;
    return {
      intent: 'gasto_por_categoria',
      periodLabel: period.label,
      answer: `${period.phrase}, você gastou ${formatBRL(catCents)} na categoria "${matchedCat.name}".`,
    };
  }

  // General expense breakdown
  const sorted = Array.from(catMap.entries()).sort((a, b) => (b[1] < a[1] ? -1 : 1));

  if (sorted.length === 0) {
    return {
      intent: 'despesas_periodo',
      periodLabel: period.label,
      answer: `Nenhum lançamento de despesa foi encontrado (${period.label.toLowerCase()}).`,
    };
  }

  const topCategories = sorted.slice(0, 3).map(
    ([name, cents]) => `• ${name}: ${formatBRL(cents)}`
  );

  return {
    intent: 'maiores_gastos',
    periodLabel: period.label,
    answer: `${period.phrase}, seu total de despesas foi de ${formatBRL(totalExpenseCents)}. Principais categorias:\n${topCategories.join('\n')}`,
  };
}
