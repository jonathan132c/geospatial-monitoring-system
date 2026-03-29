import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildMonitoringSnapshot } from '../../packages/core/src';
import { buildApp } from '../../apps/api/src/app';

const logger = { info: () => undefined, warn: () => undefined, error: () => undefined };
let snapshotPath = '';

beforeAll(async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'geo-api-test-'));
  snapshotPath = path.join(dir, 'demo-snapshot.json');
  process.env.SNAPSHOT_PATH = snapshotPath;
  const snapshot = await buildMonitoringSnapshot({ logger });
  await fs.writeFile(snapshotPath, JSON.stringify(snapshot, null, 2), 'utf8');
});

afterAll(async () => {
  if (snapshotPath) {
    await fs.rm(path.dirname(snapshotPath), { recursive: true, force: true });
  }
});

describe('API routes', () => {
  it('serves tracks, events, and health', async () => {
    const { app } = buildApp();
    const health = await app.inject({ method: 'GET', url: '/health' });
    const tracks = await app.inject({ method: 'GET', url: '/tracks?region=eastern-mediterranean' });
    const events = await app.inject({ method: 'GET', url: '/events?minConfidence=0.5' });

    expect(health.statusCode).toBe(200);
    expect(tracks.statusCode).toBe(200);
    expect(events.statusCode).toBe(200);
    expect(JSON.parse(health.body).safetyProfile?.tacticalUseProhibited).toBe(true);
    expect(JSON.parse(tracks.body).items.length).toBeGreaterThan(0);
    expect(JSON.parse(tracks.body).meta?.mode).toBe('non-operational-public-source-analytical-demo');
    expect(JSON.parse(events.body).items.some((event: any) => event.confidence >= 0.5)).toBe(true);
    expect(JSON.parse(events.body).items[0]?.displayTitle).toBeTruthy();

    await app.close();
  });
});
