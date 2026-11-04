import prisma from '../../../../config/prisma.js';
import type { WorkspaceScope } from '../../../../shared/index.js';
import { Money } from '../../../../shared/index.js';
import { PeriodResolver } from '../../domain/PeriodResolver.js';
import { getMeiLimit, listDas } from '../../../fiscal/public.js';
import { getJarsStatus } from '../../../jars/public.js';

export interface AskFinancesResult {
  readonly answer: string;
  readonly intent: string;
  readonly periodLabel?: string;
  readonly metrics?: Record<string, string | number>;
}

export async function askFinances(
  scope: WorkspaceScope,
  question: string
): Promise<AskFinancesResult> {
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
    if (!scope.defaultEntityIds.pj) {
      return {
        intent: 'limite_mei',
        answer: 'Esta conta não possui uma entidade MEI (PJ) vinculada para consulta de limite anual.',
      };
    }
    const mei = await getMeiLimit(scope, { entityId: scope.defaultEntityIds.pj });
    if (!mei) {
      return {
        intent: 'limite_mei',
        answer: 'Não foi possível carregar os dados de limite MEI no momento.',
      };
    }
    const pct = mei.percentualUtilizado.toFixed(1);
    return {
      intent: 'limite_mei',
      answer: `Você faturou R$ ${mei.faturamentoAno.replace('.', ',')} no ano de ${mei.ano}, o que representa ${pct}% do teto anual proporcional de R$ ${mei.limite.replace('.', ',')}. Ainda restam R$ ${mei.restante.replace('.', ',')} disponíveis.`,
      metrics: {
        percentual: mei.percentualUtilizado,
        faturamentoAno: mei.faturamentoAno,
        restante: mei.restante,
      },
    };
  }

  // 3. Guia DAS
  if (/\bdas\b|\bimposto\b|\btributo\b/i.test(q)) {
    const dasList = await listDas(scope);
    if (dasList.items.length === 0) {
      return {
        intent: 'das',
        answer: 'Não encontramos guias de DAS cadastradas para o seu MEI.',
      };
    }
    const pendente = dasList.items.find((d) => d.status === 'pendente' || d.status === 'vencido');
    if (pendente) {
      return {
        intent: 'das',
        answer: `Você tem a guia DAS da competência ${pendente.competence} no valor de R$ ${pendente.amount.replace('.', ',')} com vencimento em ${pendente.dueDate} (${pendente.status.toUpperCase()}).`,
      };
    }
    return {
      intent: 'das',
      answer: 'Todas as suas guias de DAS registradas estão com status PAGO! Parabéns pela organização.',
    };
  }

  // 4. Potes Financeiros
  if (/\bpote\b|\bpotes\b|\breserva\b/i.test(q)) {
    const jarsRes = await getJarsStatus(scope);
    if (jarsRes.jars.length === 0) {
      return {
        intent: 'potes',
        answer: 'Você ainda não configurou um plano de potes financeiros. Acesse a aba Potes no painel para ativar a divisão inteligente de gastos.',
      };
    }
    const lines = jarsRes.jars.map(
      (j) => `• ${j.name}: R$ ${j.usado} de R$ ${j.alocado} (${j.percentUsado.toFixed(0)}% usado)`
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
    const balMoney = Money.fromCents(balCents < 0n ? -balCents : balCents);
    const sign = balCents < 0n ? '-' : '';
    return {
      intent: 'saldo',
      answer: `Seu saldo acumulado em caixa é de ${sign}R$ ${balMoney.toDecimalString().replace('.', ',')}.`,
      metrics: {
        totalEntradas: Money.fromCents(inCents).toDecimalString(),
        totalSaidas: Money.fromCents(outCents).toDecimalString(),
        saldo: `${sign}${balMoney.toDecimalString()}`,
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
    const catMoney = Money.fromCents(catCents);
    return {
      intent: 'gasto_por_categoria',
      periodLabel: period.label,
      answer: `Em ${period.label}, você gastou R$ ${catMoney.toDecimalString().replace('.', ',')} na categoria "${matchedCat.name}".`,
    };
  }

  // General expense breakdown
  const sorted = Array.from(catMap.entries()).sort((a, b) => (b[1] < a[1] ? -1 : 1));
  const totalMoney = Money.fromCents(totalExpenseCents);

  if (sorted.length === 0) {
    return {
      intent: 'despesas_periodo',
      periodLabel: period.label,
      answer: `Nenhum lançamento de despesa foi encontrado em ${period.label}.`,
    };
  }

  const topCategories = sorted.slice(0, 3).map(
    ([name, cents]) => `• ${name}: R$ ${Money.fromCents(cents).toDecimalString().replace('.', ',')}`
  );

  return {
    intent: 'maiores_gastos',
    periodLabel: period.label,
    answer: `Em ${period.label}, seu total de despesas foi de R$ ${totalMoney.toDecimalString().replace('.', ',')}. Principais categorias:\n${topCategories.join('\n')}`,
  };
}
