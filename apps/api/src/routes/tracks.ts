import type { FastifyInstance } from 'fastify';
import type { SnapshotRepository } from '../repositories/snapshot-repository';
import { queryTracks } from '../services/query-service';
import { publicResponseMeta, toPublicTrack } from '../utils/public-view';
import { querySchema, parseBBox } from '../utils/queries';

export const registerTrackRoutes = (app: FastifyInstance, repository: SnapshotRepository): void => {
  app.get('/tracks', async (request) => {
    const parsed = querySchema.parse(request.query);
    const snapshot = await repository.getSnapshot();
    return {
      items: queryTracks(snapshot, {
        region: parsed.region,
        start: parsed.start,
        end: parsed.end,
        sourceType: parsed.sourceType,
        bbox: parseBBox(parsed.bbox),
        altitudeBand: parsed.minAltitude !== undefined || parsed.maxAltitude !== undefined
          ? { min: parsed.minAltitude, max: parsed.maxAltitude }
          : undefined
      }).map(toPublicTrack),
      meta: publicResponseMeta(snapshot, 'tracks')
    };
  });
};
