import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const snapshotPath = path.resolve(process.cwd(), 'data/generated/demo-snapshot.json');
const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8')) as Record<string, any>;

describe('repaired dataset integrity', () => {
  it('marks the dataset as demo-only and non-production-safe', () => {
    expect(snapshot.datasetMetadata?.datasetSuitability).toBe('demo only');
    expect(snapshot.datasetMetadata?.productionSafe).toBe(false);
    expect(snapshot.datasetMetadata?.eventTaxonomy?.removedTerms).toContain('confirmed_strike');
  });

  it('adds required provenance metadata to every top-level record', () => {
    for (const collection of ['regions', 'restrictions', 'tracks', 'indicators', 'events', 'rawPayloads'] as const) {
      for (const record of snapshot[collection]) {
        expect(record.recordStatus).toBeTruthy();
        expect(record.verificationStatus).toBeTruthy();
        expect(record.verificationNotes).toBeTruthy();
        expect(record.sourceTrustLevel).toBeTruthy();
        expect(Array.isArray(record.derivedFrom)).toBe(true);
        expect(record.lastReviewedAt).toBeTruthy();
        expect(record.externalVerificationStatus).toBeTruthy();
        expect(Array.isArray(record.externalSourcesChecked)).toBe(true);
        expect(record.externalMatchType).toBeTruthy();
        expect(record.externalVerificationNotes).toBeTruthy();
      }
    }
  });

  it('removes overstated event taxonomy and exposes fixture lineage explicitly', () => {
    expect(snapshot.events.some((event: any) => event.eventType === 'confirmed_strike')).toBe(false);
    expect(snapshot.events.every((event: any) => event.recordStatus === 'derived_inference')).toBe(true);
    expect(snapshot.restrictions.every((item: any) => item.recordStatus === 'synthetic_demo')).toBe(true);
    expect(snapshot.tracks.every((item: any) => item.recordStatus === 'synthetic_demo')).toBe(true);
    expect(snapshot.indicators.every((item: any) => item.recordStatus === 'synthetic_demo')).toBe(true);
    expect(snapshot.rawPayloads.every((item: any) => item.provider.includes('fixture'))).toBe(true);
  });
});
