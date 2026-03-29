import Fastify from 'fastify';
import cors from '@fastify/cors';
import { getConfig } from './config';
import { FileSnapshotRepository, PostgresSnapshotRepository } from './repositories/snapshot-repository';
import { registerAirspaceRoutes } from './routes/airspace';
import { registerEventRoutes } from './routes/events';
import { registerHealthRoutes } from './routes/health';
import { registerMetricsRoutes } from './routes/metrics';
import { registerRegionRoutes } from './routes/regions';
import { registerTrackRoutes } from './routes/tracks';

export const buildApp = () => {
  const config = getConfig();
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } });
  const repository = config.postgresUrl
    ? new PostgresSnapshotRepository(config.postgresUrl)
    : new FileSnapshotRepository(config.snapshotPath);

  void app.register(cors, { origin: true });

  registerTrackRoutes(app, repository);
  registerEventRoutes(app, repository);
  registerAirspaceRoutes(app, repository);
  registerRegionRoutes(app, repository);
  registerHealthRoutes(app, repository, config);
  registerMetricsRoutes(app, repository);

  app.setErrorHandler((error, _request, reply) => {
    app.log.error({ error }, 'Unhandled API error');
    reply.code(400).send({ error: error instanceof Error ? error.message : 'Unknown error' });
  });

  return { app, config };
};
