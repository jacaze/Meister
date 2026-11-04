import type { Finding } from './Finding.js';

export class TemplateNarrator {
  static narrate(finding: Finding): string {
    const metricMap = new Map<string, string>();
    for (const m of finding.metrics) {
      metricMap.set(m.key, m.display);
    }

    switch (finding.detectorId) {
      case 'category_spike': {
        const cat = metricMap.get('categoria') ?? 'esta categoria';
        const current = metricMap.get('gasto_atual') ?? '';
        const pct = metricMap.get('percentual_aumento') ?? '';
        const med = metricMap.get('mediana_anterior') ?? '';
        return `Os gastos com ${cat} somam ${current} este mês, ficando ${pct} acima da sua mediana recente (${med}).`;
      }

      case 'income_drop': {
        const current = metricMap.get('receita_atual') ?? '';
        const proj = metricMap.get('receita_projetada') ?? '';
        const pct = metricMap.get('percentual_queda') ?? '';
        const med = metricMap.get('mediana_anterior') ?? '';
        return `A receita registrada até agora (${current}) projeta ${proj} no mês (${pct} em relação à mediana recente de ${med}).`;
      }

      case 'limit_pace': {
        const fat = metricMap.get('faturamento_acumulado') ?? '';
        const pct = metricMap.get('percentual_utilizado') ?? '';
        const teto = metricMap.get('teto_anual') ?? '';
        const rest = metricMap.get('disponivel_restante') ?? '';
        return `O faturamento do ano (${fat}) atingiu ${pct} do teto anual do MEI (${teto}). Restam ${rest} de margem.`;
      }

      case 'pf_in_pj': {
        const qty = metricMap.get('quantidade_lancamentos') ?? 'despesas';
        const total = metricMap.get('total_pessoal') ?? '';
        return `Identificamos ${qty} com características pessoais registradas na empresa, totalizando ${total} este mês.`;
      }

      case 'jar_pace': {
        const pote = metricMap.get('pote') ?? 'analisado';
        const uso = metricMap.get('percentual_uso') ?? '';
        const proj = metricMap.get('projecao_fim_mes') ?? '';
        const val = metricMap.get('valor_usado') ?? '';
        const teto = metricMap.get('teto_alocado') ?? '';
        return `O pote ${pote} consumiu ${uso} do limite alocado (${val} de ${teto}), projetando ${proj} até o fim do mês se mantido o ritmo.`;
      }

      case 'cash_forecast': {
        const cons = metricMap.get('saldo_cenario_conservador') ?? '';
        const cen = metricMap.get('saldo_cenario_central') ?? '';
        const otim = metricMap.get('saldo_cenario_otimista') ?? '';
        return `Previsão para o próximo mês (estimativa baseada nos últimos 3 meses): saldo projetado entre ${cons} (conservador) e ${otim} (otimista), com cenário central de ${cen}.`;
      }

      case 'positive_trend': {
        const saldo = metricMap.get('saldo_positivo') ?? '';
        return `Seu fluxo de caixa está positivo em ${saldo} este mês, mantendo a consistência dos resultados operacionais.`;
      }

      default:
        return 'Observação financeira identificada com base no seu histórico recente.';
    }
  }
}
