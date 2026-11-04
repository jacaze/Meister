import type { Detector } from './Detector.js';
import { CategorySpikeDetector } from './CategorySpikeDetector.js';
import { IncomeDropDetector } from './IncomeDropDetector.js';
import { LimitPaceDetector } from './LimitPaceDetector.js';
import { PfInPjDetector } from './PfInPjDetector.js';
import { JarPaceDetector } from './JarPaceDetector.js';
import { CashForecastDetector } from './CashForecastDetector.js';
import { PositiveTrendDetector } from './PositiveTrendDetector.js';

export * from './Detector.js';
export * from './CategorySpikeDetector.js';
export * from './IncomeDropDetector.js';
export * from './LimitPaceDetector.js';
export * from './PfInPjDetector.js';
export * from './JarPaceDetector.js';
export * from './CashForecastDetector.js';
export * from './PositiveTrendDetector.js';

export function createDefaultDetectors(): Detector[] {
  return [
    new CategorySpikeDetector(),
    new IncomeDropDetector(),
    new LimitPaceDetector(),
    new PfInPjDetector(),
    new JarPaceDetector(),
    new CashForecastDetector(),
    new PositiveTrendDetector(),
  ];
}
