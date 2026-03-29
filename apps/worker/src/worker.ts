import fs from 'node:fs/promises';
import path from 'node:path';
import pino from 'pino';
import { buildMonitoringSnapshot } from '../../../packages/core/src';

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });
const snapshotPath = process.env.SNAPSHOT_PATH ?? path.resolve(process.cwd(), 'data/generated/demo-snapshot.json');
const intervalMs = Number(process.env.INGESTION_INTERVAL_MS ?? 300000);
const loop = process.env.WORKER_LOOP === 'true';

const runOnce = async (): Promise<void> => {
  const snapshot = await buildMonitoringSnapshot({ logger, now: process.env.DEMO_NOW });
  await fs.mkdir(path.dirname(snapshotPath), { recursive: true });
  await fs.writeFile(snapshotPath, JSON.stringify(snapshot, null, 2), 'utf8');
  logger.info({ snapshotPath, tracks: snapshot.tracks.length, events: snapshot.events.length, dedupeRate: snapshot.stats.dedupeRate }, 'Snapshot refreshed');
};

const start = async (): Promise<void> => {
  await runOnce();
  if (loop) {
    setInterval(() => {
      void runOnce().catch((error) => logger.error({ error }, 'Snapshot refresh failed'));
    }, intervalMs);
  }
};

void start().catch((error) => {
  logger.error({ error }, 'Worker failed');
  process.exit(1);
});
