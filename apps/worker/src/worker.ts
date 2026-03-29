import fs from 'node:fs/promises';
import path from 'node:path';
import pino from 'pino';
import { buildMonitoringSnapshot, type SnapshotMode } from '../../../packages/core/src';

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });
const snapshotMode: SnapshotMode = process.env.SNAPSHOT_MODE === 'live' ? 'live' : 'demo';
const defaultSnapshotFile = snapshotMode === 'live' ? 'live-snapshot.json' : 'demo-snapshot.json';
const snapshotPath = process.env.SNAPSHOT_PATH ?? path.resolve(process.cwd(), `data/generated/${defaultSnapshotFile}`);
const intervalMs = Number(process.env.INGESTION_INTERVAL_MS ?? 300000);
const loop = process.env.WORKER_LOOP === 'true';

const runOnce = async (): Promise<void> => {
  const snapshot = await buildMonitoringSnapshot({
    logger,
    sourceMode: snapshotMode,
    now: snapshotMode === 'demo' ? process.env.DEMO_NOW : undefined
  });

  await fs.mkdir(path.dirname(snapshotPath), { recursive: true });
  await fs.writeFile(snapshotPath, JSON.stringify(snapshot, null, 2), 'utf8');
  logger.info({
    snapshotPath,
    snapshotMode,
    liveData: snapshot.sourceMetadata.liveData,
    activeProviders: snapshot.sourceMetadata.activeProviders,
    tracks: snapshot.tracks.length,
    events: snapshot.events.length,
    dedupeRate: snapshot.stats.dedupeRate
  }, 'Snapshot refreshed');
};

const start = async (): Promise<void> => {
  await runOnce();
  if (loop) {
    setInterval(() => {
      void runOnce().catch((error) => logger.error({ error, snapshotMode }, 'Snapshot refresh failed'));
    }, intervalMs);
  }
};

void start().catch((error) => {
  logger.error({ error, snapshotMode }, 'Worker failed');
  process.exit(1);
});
