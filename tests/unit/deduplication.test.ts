import { describe, expect, it } from 'vitest';
import { buildFlightTracks, deduplicateTrackObservations, defaultRegions, getTrackFixtures } from '../../packages/core/src';

describe('deduplication and track assembly', () => {
  it('deduplicates overlapping provider observations and preserves anomalies', () => {
    const raw = [
      ...getTrackFixtures('opensky').filter((item) => item.icao24 === 'abc001'),
      ...getTrackFixtures('adsb_exchange').filter((item) => item.icao24 === 'abc001'),
      ...getTrackFixtures('flightaware').filter((item) => item.icao24 === 'abc001')
    ];

    const { deduped, dedupeRate } = deduplicateTrackObservations(raw);
    const tracks = buildFlightTracks(deduped, defaultRegions);

    expect(deduped.length).toBeLessThan(raw.length);
    expect(dedupeRate).toBeGreaterThan(0);
    expect(tracks).toHaveLength(1);
    expect(tracks[0]?.providers.length).toBeGreaterThan(1);
    expect(tracks[0]?.anomalies.some((anomaly) => anomaly.type === 'route_deviation')).toBe(true);
  });
});
