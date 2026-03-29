import fs from 'node:fs/promises';
import type { FastifyInstance } from 'fastify';
import type { ApiConfig } from '../config';
import type { SnapshotRepository } from '../repositories/snapshot-repository';

export const registerHealthRoutes = (app: FastifyInstance, repository: SnapshotRepository, config: ApiConfig): void => {
  app.get('/health', async () => {
    const snapshot = await repository.getSnapshot();
    let snapshotAgeSeconds: number | null = null;
    try {
      const stat = await fs.stat(config.snapshotPath);
      snapshotAgeSeconds = Math.round((Date.now() - stat.mtimeMs) / 1000);
    } catch {
      snapshotAgeSeconds = null;
    }

    return {
      status: 'ok',
      mode: config.postgresUrl ? 'postgres-scaffolded' : 'file-backed-demo',
      generatedAt: snapshot.generatedAt,
      snapshotAgeSeconds,
      safetyProfile: {
        mode: 'non-operational-public-source-analytical-demo',
        delayed: true,
        coordinatePrecision: 'coarsened public display',
        tacticalUseProhibited: true,
        notice: 'Historical/seeded or delayed analytical output only. No live tactical guidance, no precision strike attribution, and no direct missile-tracking claims.'
      },
      dependencies: {
        postgresConfigured: Boolean(config.postgresUrl),
        redisConfigured: Boolean(config.redisUrl)
      }
    };
  });
};
