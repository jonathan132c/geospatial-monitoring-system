import fs from 'node:fs/promises';
import path from 'node:path';
import pino from 'pino';
import { buildMonitoringSnapshot, DEMO_NOW } from '../packages/core/src';

const logger = pino({ level: 'info' });
const snapshotPath = path.resolve(process.cwd(), 'data/generated/demo-snapshot.json');

const main = async (): Promise<void> => {
  const snapshot = await buildMonitoringSnapshot({ logger, now: process.env.DEMO_NOW ?? DEMO_NOW, windowHours: 72, sourceMode: 'demo' });
  await fs.mkdir(path.dirname(snapshotPath), { recursive: true });
  await fs.writeFile(snapshotPath, JSON.stringify(snapshot, null, 2), 'utf8');
  logger.info({ snapshotPath, tracks: snapshot.tracks.length, events: snapshot.events.length }, 'Demo snapshot written');
};

void main();
