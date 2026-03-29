import path from 'node:path';

export interface ApiConfig {
  port: number;
  host: string;
  snapshotPath: string;
  postgresUrl?: string;
  redisUrl?: string;
}

export const getConfig = (): ApiConfig => ({
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? '0.0.0.0',
  snapshotPath: process.env.SNAPSHOT_PATH ?? path.resolve(process.cwd(), 'data/generated/demo-snapshot.json'),
  postgresUrl: process.env.POSTGRES_URL,
  redisUrl: process.env.REDIS_URL
});
