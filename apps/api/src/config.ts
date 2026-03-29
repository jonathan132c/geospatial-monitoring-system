import path from 'node:path';
import type { SnapshotMode } from '../../../packages/core/src';

export interface ApiConfig {
  port: number;
  host: string;
  snapshotPath: string;
  snapshotMode: SnapshotMode;
  postgresUrl?: string;
  redisUrl?: string;
}

export const getConfig = (): ApiConfig => {
  const snapshotMode: SnapshotMode = process.env.SNAPSHOT_MODE === 'live' ? 'live' : 'demo';
  const defaultSnapshotFile = snapshotMode === 'live' ? 'live-snapshot.json' : 'demo-snapshot.json';

  return {
    port: Number(process.env.PORT ?? 3000),
    host: process.env.HOST ?? '0.0.0.0',
    snapshotPath: process.env.SNAPSHOT_PATH ?? path.resolve(process.cwd(), `data/generated/${defaultSnapshotFile}`),
    snapshotMode,
    postgresUrl: process.env.POSTGRES_URL,
    redisUrl: process.env.REDIS_URL
  };
};
