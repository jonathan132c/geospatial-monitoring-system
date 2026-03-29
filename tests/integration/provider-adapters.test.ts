import { describe, expect, it, vi } from 'vitest';
import { InMemoryCacheAdapter, OpenSkyTrackProvider, OsintNewsProvider } from '../../packages/core/src';

const logger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined
};

describe('provider adapters', () => {
  it('caches fixture results and normalizes timestamps to UTC ISO', async () => {
    const loader = vi.fn(async () => ([{
      id: 'test',
      provider: 'opensky',
      observedAt: '2026-03-28T16:00:00Z',
      icao24: 'abc001',
      callsign: 'EM9001',
      latitude: 33.18,
      longitude: 35.42,
      altitudeFt: 33000,
      heading: 178,
      speedKts: 451,
      sourcePayloadId: 'raw-1'
    }]));

    const provider = new OpenSkyTrackProvider({ name: 'opensky', cache: new InMemoryCacheAdapter(), logger, loader });
    const context = { now: '2026-03-29T00:00:00Z', windowHours: 72 as const, regionIds: ['eastern-mediterranean'] };
    const first = await provider.fetch(context);
    const second = await provider.fetch(context);

    expect(loader).toHaveBeenCalledTimes(1);
    expect(first[0]?.observedAt).toBe('2026-03-28T16:00:00.000Z');
    expect(second[0]?.provider).toBe('opensky');
  });

  it('supports non-track conflict adapters behind the same fixture pattern', async () => {
    const provider = new OsintNewsProvider({
      name: 'osint_news',
      logger,
      loader: async () => ([{
        id: 'osint-1',
        provider: 'osint_news',
        type: 'osint_report',
        observedAt: '2026-03-28T17:55:00Z',
        geometry: { type: 'Point', coordinates: [35.6, 33.2] as [number, number] },
        regionIds: ['eastern-mediterranean'],
        headline: 'report',
        description: 'desc',
        severity: 'warning',
        sourcePayloadId: 'raw-2',
        independentSourceCount: 2,
        metadata: {}
      }])
    });

    const result = await provider.fetch({ now: '2026-03-29T00:00:00Z', windowHours: 72, regionIds: ['eastern-mediterranean'] });
    expect(result[0]?.observedAt).toBe('2026-03-28T17:55:00.000Z');
    expect(result[0]?.type).toBe('osint_report');
  });
});
