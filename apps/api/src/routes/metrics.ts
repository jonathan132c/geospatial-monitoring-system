import type { FastifyInstance } from 'fastify';
import type { SnapshotRepository } from '../repositories/snapshot-repository';
import { registry, updateMetricsFromSnapshot } from '../plugins/metrics';

export const registerMetricsRoutes = (app: FastifyInstance, repository: SnapshotRepository): void => {
  app.get('/metrics', async (_request, reply) => {
    const snapshot = await repository.getSnapshot();
    updateMetricsFromSnapshot(snapshot);
    reply.header('Content-Type', registry.contentType);
    return registry.metrics();
  });
};
