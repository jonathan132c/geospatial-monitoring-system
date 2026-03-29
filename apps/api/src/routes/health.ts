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

    const snapshotMode = snapshot.sourceMetadata?.mode ?? config.snapshotMode;
    const activeProviders = snapshot.sourceMetadata?.activeProviders ?? [];

    return {
      status: 'ok',
      mode: config.postgresUrl ? `postgres-scaffolded-${snapshotMode}` : `file-backed-${snapshotMode}`,
      generatedAt: snapshot.generatedAt,
      snapshotAgeSeconds,
      sourceMetadata: snapshot.sourceMetadata,
      safetyProfile: {
        mode: snapshotMode === 'live'
          ? 'non-operational-public-source-analytical-live'
          : 'non-operational-public-source-analytical-demo',
        delayed: snapshotMode !== 'live',
        coordinatePrecision: 'coarsened public display',
        tacticalUseProhibited: true,
        notice: snapshotMode === 'live'
          ? 'Live public-source inputs may be present, but this output remains non-operational, coarsened for public display, and unsuitable for tactical guidance or precision attribution.'
          : 'Historical/seeded or delayed analytical output only. No live tactical guidance, no precision strike attribution, and no direct missile-tracking claims.'
      },
      dependencies: {
        postgresConfigured: Boolean(config.postgresUrl),
        redisConfigured: Boolean(config.redisUrl)
      },
      activeProviders
    };
  });
};
