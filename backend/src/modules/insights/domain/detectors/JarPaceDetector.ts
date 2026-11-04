import type { Detector } from './Detector.js';
import type { Finding } from '../Finding.js';
import type { FinancialSnapshot } from '../FinancialSnapshot.js';
import { Money } from '../../../../shared/index.js';

export class JarPaceDetector implements Detector {
  readonly id = 'jar_pace';
  readonly version = '1.0';

  run(snapshot: FinancialSnapshot, _today: Date): Finding[] {
    const daysRemaining = snapshot.daysInMonth - snapshot.dayOfMonth;
    if (daysRemaining < 3 || snapshot.dayOfMonth === 0) {
      return [];
    }

    const monthProgressPercent = Math.round((snapshot.dayOfMonth / snapshot.daysInMonth) * 100);
    const findings: Finding[] = [];

    for (const jar of snapshot.jars) {
      // Do not trigger if already breached
      if (jar.status === 'estourado') continue;
      if (jar.alocadoCents === 0n) continue;

      const usagePercent = jar.percentUsado;
      if (usagePercent < 50) continue;

      // Pacing difference >= 20 percentage points ahead of calendar
      const paceDiff = usagePercent - monthProgressPercent;
      if (paceDiff < 20) continue;

      // Linear projection for end of month
      const projectedPercent = Math.round((usagePercent / snapshot.dayOfMonth) * snapshot.daysInMonth);
      if (projectedPercent <= 100) continue;

      const severity = projectedPercent > 120 ? 'alerta' : 'atencao';
      const alocadoMoney = Money.fromCents(jar.alocadoCents);
      const usadoMoney = Money.fromCents(jar.usadoCents);
      const excedenteEstimadoCents = (jar.usadoCents * BigInt(snapshot.daysInMonth) / BigInt(snapshot.dayOfMonth)) - jar.alocadoCents;

      findings.push({
        detectorId: this.id,
        detectorVersion: this.version,
        entityId: snapshot.entityId,
        period: snapshot.period,
        severity,
        confidence: 'alta',
        impactAmountCents: excedenteEstimadoCents > 0n ? excedenteEstimadoCents : jar.usadoCents,
        metrics: [
          { key: 'pote', kind: 'enum', value: jar.name, display: jar.name },
          { key: 'percentual_uso', kind: 'percent', value: usagePercent, display: `${usagePercent}%` },
          { key: 'projecao_fim_mes', kind: 'percent', value: projectedPercent, display: `${projectedPercent}%` },
          { key: 'valor_usado', kind: 'money', value: usadoMoney.toDecimalString(), display: `R$ ${usadoMoney.toDecimalString().replace('.', ',')}` },
          { key: 'teto_alocado', kind: 'money', value: alocadoMoney.toDecimalString(), display: `R$ ${alocadoMoney.toDecimalString().replace('.', ',')}` },
        ],
        actions: [
          { kind: 'open_jar_plan', label: 'Ver plano de potes' },
          { kind: 'review_transactions', label: 'Revisar despesas deste pote' },
        ],
        dedupeKey: `jar_pace:${snapshot.period}:${jar.id}`,
      });
    }

    return findings;
  }
}
