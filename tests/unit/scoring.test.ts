import { describe, expect, it } from 'vitest';
import { buildReasoning } from '../../packages/core/src';

describe('confidence scoring', () => {
  it('elevates multi-signal events and penalizes weak single sources', () => {
    const strong = buildReasoning({
      hasOfficialRestriction: true,
      hasConflictBulletin: true,
      thermalClusterCount: 3,
      independentReportCount: 4,
      diversionCount: 2,
      temporalAlignment: true,
      singleWeakSource: false
    });

    const weak = buildReasoning({
      hasOfficialRestriction: false,
      hasConflictBulletin: false,
      thermalClusterCount: 0,
      independentReportCount: 1,
      diversionCount: 0,
      temporalAlignment: false,
      singleWeakSource: true
    });

    expect(strong.score).toBeGreaterThan(0.85);
    expect(strong.confidenceLabel).toBe('high');
    expect(weak.score).toBeLessThan(0.2);
    expect(weak.confidenceLabel).toBe('low');
  });
});
