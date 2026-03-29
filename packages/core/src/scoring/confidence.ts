import type { EventReasoning, ReasoningSignal } from '../types/domain';

interface ConfidenceOptions {
  hasOfficialRestriction: boolean;
  hasConflictBulletin: boolean;
  thermalClusterCount: number;
  independentReportCount: number;
  diversionCount: number;
  temporalAlignment: boolean;
  singleWeakSource: boolean;
}

const clamp = (value: number): number => Math.max(0, Math.min(1, value));

export const buildReasoning = (options: ConfidenceOptions): EventReasoning => {
  const signals: ReasoningSignal[] = [];
  let score = 0.08;

  if (options.hasOfficialRestriction) {
    signals.push({ label: 'Official airspace restriction', effect: 'increase', weight: 0.28, evidence: 'Restriction or closure bulletin overlaps the event window and geometry.' });
    score += 0.28;
  }

  if (options.hasConflictBulletin) {
    signals.push({ label: 'Conflict-zone bulletin', effect: 'increase', weight: 0.24, evidence: 'Conflict-zone bulletin or safety advisory corroborates elevated risk.' });
    score += 0.24;
  }

  if (options.thermalClusterCount > 0) {
    const thermalWeight = Math.min(0.26, 0.12 + options.thermalClusterCount * 0.05);
    signals.push({ label: 'Thermal anomaly clustering', effect: 'increase', weight: thermalWeight, evidence: `${options.thermalClusterCount} thermal indicator(s) clustered by time and distance.` });
    score += thermalWeight;
  }

  if (options.independentReportCount >= 2) {
    const reportWeight = Math.min(0.22, 0.12 + (options.independentReportCount - 2) * 0.03);
    signals.push({ label: 'Multiple independent reports', effect: 'increase', weight: reportWeight, evidence: `${options.independentReportCount} independent reports corroborate the event.` });
    score += reportWeight;
  } else if (options.independentReportCount === 1) {
    signals.push({ label: 'Single report only', effect: 'decrease', weight: 0.12, evidence: 'Only one report source supports this event.' });
    score -= 0.12;
  }

  if (options.diversionCount > 0) {
    const diversionWeight = Math.min(0.18, 0.08 + options.diversionCount * 0.03);
    signals.push({ label: 'Nearby diversion cluster', effect: 'increase', weight: diversionWeight, evidence: `${options.diversionCount} affected aircraft show reroute/transponder anomalies nearby.` });
    score += diversionWeight;
  }

  if (options.temporalAlignment) {
    signals.push({ label: 'Temporal clustering', effect: 'increase', weight: 0.1, evidence: 'Indicators align within a narrow time window.' });
    score += 0.1;
  }

  if (options.singleWeakSource) {
    signals.push({ label: 'Single weak-source penalty', effect: 'decrease', weight: 0.25, evidence: 'Event cannot be treated as confirmed from one weak source.' });
    score -= 0.25;
  }

  const normalized = clamp(score);
  const confidenceLabel = normalized >= 0.75 ? 'high' : normalized >= 0.45 ? 'moderate' : 'low';

  return {
    score: Number(normalized.toFixed(2)),
    confidenceLabel,
    signals,
    explanation: signals
      .map((signal) => `${signal.effect === 'increase' ? '+' : '-'}${signal.weight.toFixed(2)} ${signal.label}`)
      .join('; ')
  };
};
