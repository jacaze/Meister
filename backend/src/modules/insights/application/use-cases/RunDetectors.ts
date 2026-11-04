import prisma from '../../../../config/prisma.js';
import type { WorkspaceScope } from '../../../../shared/index.js';
import type { FinancialSnapshotReader } from '../ports/FinancialSnapshotReader.js';
import { PrismaFinancialSnapshotReader } from '../../infra/PrismaFinancialSnapshotReader.js';
import type { Detector } from '../../domain/detectors/Detector.js';
import { createDefaultDetectors } from '../../domain/detectors/index.js';
import { TemplateNarrator } from '../../domain/TemplateNarrator.js';
import { PolicyGuard, LengthGuard, NumberGuard } from '../../domain/NarratorGuards.js';

export interface RunDetectorsInput {
  readonly entityId?: string;
  readonly referenceDate?: Date;
  readonly snapshotReader?: FinancialSnapshotReader;
  readonly detectors?: readonly Detector[];
}

export async function runDetectors(
  scope: WorkspaceScope,
  input: RunDetectorsInput = {}
) {
  const reader = input.snapshotReader ?? new PrismaFinancialSnapshotReader();
  const detectors = input.detectors ?? createDefaultDetectors();
  const referenceDate = input.referenceDate ?? new Date();

  // 1. Read Snapshot
  const snapshot = await reader.readSnapshot(scope, input.entityId, referenceDate);

  // 2. Fetch User Preferences / Snoozed Detectors
  const preferences = await prisma.insightPreference.findMany({
    where: { userId: scope.actorUserId },
  });
  const snoozedDetectorIds = new Set<string>();
  for (const pref of preferences) {
    if (!pref.enabled) {
      if (pref.detectorId) snoozedDetectorIds.add(pref.detectorId);
    }
    if (pref.snoozedUntil && pref.snoozedUntil > new Date()) {
      if (pref.detectorId) snoozedDetectorIds.add(pref.detectorId);
    }
  }

  // 3. Run Detectors
  const createdInsights = [];

  for (const detector of detectors) {
    if (snoozedDetectorIds.has(detector.id)) {
      continue;
    }

    let findings;
    try {
      findings = detector.run(snapshot, referenceDate);
    } catch (detErr) {
      console.warn(`[RunDetectors] Detector ${detector.id} failed:`, detErr);
      continue;
    }

    for (const finding of findings) {
      // 4. Narrate with template
      let text = TemplateNarrator.narrate(finding);

      // Verify guards
      const polCheck = PolicyGuard.validate(text);
      const lenCheck = LengthGuard.validate(text);
      const numCheck = NumberGuard.validate(text, finding);

      if (!polCheck.valid || !lenCheck.valid || !numCheck.valid) {
        text = 'Observação identificada sobre suas movimentações recentes.';
      }

      // 5. Deduplicate and Persist
      try {
        const insight = await prisma.insight.upsert({
          where: { dedupeKey: finding.dedupeKey },
          create: {
            workspaceId: scope.workspaceId,
            userId: scope.actorUserId,
            entityId: snapshot.entityId,
            detectorId: finding.detectorId,
            detectorVersion: finding.detectorVersion,
            period: finding.period,
            severity: finding.severity,
            confidence: finding.confidence,
            metrics: JSON.parse(JSON.stringify(finding.metrics)),
            actions: JSON.parse(JSON.stringify(finding.actions)),
            narrationText: text,
            narrationSource: 'template',
            dedupeKey: finding.dedupeKey,
            status: 'nova',
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
          },
          update: {
            narrationText: text,
            metrics: JSON.parse(JSON.stringify(finding.metrics)),
            actions: JSON.parse(JSON.stringify(finding.actions)),
          },
        });
        createdInsights.push(insight);
      } catch (dbErr) {
        console.warn(`[RunDetectors] Error saving insight ${finding.dedupeKey}:`, dbErr);
      }
    }
  }

  return createdInsights;
}
