import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { buildMonitoringSnapshot } from '../../packages/core/src';
import { buildApp } from '../../apps/api/src/app';

const logger = { info: () => undefined, warn: () => undefined, error: () => undefined };

const buildMockResponse = (body: unknown) => ({
  ok: true,
  status: 200,
  async json() {
    return body;
  },
  async text() {
    return JSON.stringify(body);
  }
});

describe('live ingestion', () => {
  it('builds a live snapshot from actual-style OpenSky payloads without fixture fallback', async () => {
    const now = '2026-03-29T12:00:00.000Z';
    const snapshot = await buildMonitoringSnapshot({
      logger,
      now,
      windowHours: 6,
      sourceMode: 'live',
      fetchImpl: async () => buildMockResponse({
        time: 1774785590,
        states: [
          ['abc001', 'EM9001  ', 'Test', 1774785590, 1774785590, 35.42, 33.18, 10000, false, 250, 178, 0, null, 10300, '4312', false, 0],
          ['ground01', 'GROUND  ', 'Test', 1774785590, 1774785590, 35.0, 33.0, 0, true, 0, 0, 0, null, 0, '0000', false, 0],
          ['stale01', 'STALE   ', 'Test', 1774781000, 1774781000, 35.3, 33.1, 9500, false, 240, 170, 0, null, 9600, '1200', false, 0],
          ['outside1', 'OUTSIDE ', 'Test', 1774785590, 1774785590, 10.0, 10.0, 10000, false, 260, 150, 0, null, 10100, '2200', false, 0]
        ]
      })
    });

    expect(snapshot.sourceMetadata.mode).toBe('live');
    expect(snapshot.sourceMetadata.liveData).toBe(true);
    expect(snapshot.sourceMetadata.fixtureBacked).toBe(false);
    expect(snapshot.sourceMetadata.activeProviders).toContain('opensky');
    expect(snapshot.sourceMetadata.notes.some((note) => note.includes('does not fall back to fixtures'))).toBe(true);
    expect(snapshot.tracks).toHaveLength(1);
    expect(snapshot.tracks[0]?.icao24).toBe('abc001');
    expect(snapshot.events).toHaveLength(0);
    expect(snapshot.rawPayloads).toHaveLength(1);
    expect(snapshot.rawPayloads[0]?.provider).toBe('opensky');
    expect(snapshot.rawPayloads[0]?.attribution.note.includes('no fixture fallback')).toBe(true);
    expect(snapshot.sourceMetadata.providerStatuses.find((status) => status.provider === 'nasa_firms')?.status).toBe('disabled');
    expect(snapshot.sourceMetadata.providerStatuses.find((status) => status.provider === 'adsb_exchange')?.status).toBe('unsupported');
  });

  it('surfaces live snapshot mode through the API metadata and health route', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'geo-live-api-test-'));
    const snapshotPath = path.join(dir, 'live-snapshot.json');
    process.env.SNAPSHOT_PATH = snapshotPath;
    process.env.SNAPSHOT_MODE = 'live';

    const snapshot = await buildMonitoringSnapshot({
      logger,
      now: '2026-03-29T12:00:00.000Z',
      sourceMode: 'live',
      fetchImpl: async () => buildMockResponse({
        time: 1774785590,
        states: [
          ['abc001', 'EM9001  ', 'Test', 1774785590, 1774785590, 35.42, 33.18, 10000, false, 250, 178, 0, null, 10300, '4312', false, 0]
        ]
      })
    });

    await fs.writeFile(snapshotPath, JSON.stringify(snapshot, null, 2), 'utf8');
    const { app } = buildApp();

    const health = await app.inject({ method: 'GET', url: '/health' });
    const tracks = await app.inject({ method: 'GET', url: '/tracks?region=eastern-mediterranean' });

    expect(health.statusCode).toBe(200);
    expect(JSON.parse(health.body).mode).toBe('file-backed-live');
    expect(JSON.parse(health.body).sourceMetadata?.mode).toBe('live');
    expect(JSON.parse(tracks.body).meta?.mode).toBe('non-operational-public-source-analytical-live');
    expect(JSON.parse(tracks.body).meta?.liveData).toBe(true);
    expect(JSON.parse(tracks.body).items.length).toBeGreaterThan(0);

    await app.close();
    await fs.rm(dir, { recursive: true, force: true });
    delete process.env.SNAPSHOT_PATH;
    delete process.env.SNAPSHOT_MODE;
  });
});

afterAll(() => {
  delete process.env.SNAPSHOT_PATH;
  delete process.env.SNAPSHOT_MODE;
});
