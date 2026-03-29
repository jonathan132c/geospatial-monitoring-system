import type { FastifyInstance } from 'fastify';
import type { SnapshotRepository } from '../repositories/snapshot-repository';
import { queryRestrictions } from '../services/query-service';
import { publicResponseMeta, toPublicRestriction } from '../utils/public-view';
import { querySchema } from '../utils/queries';

export const registerAirspaceRoutes = (app: FastifyInstance, repository: SnapshotRepository): void => {
  app.get('/airspace/restrictions', async (request) => {
    const parsed = querySchema.parse(request.query);
    const snapshot = await repository.getSnapshot();
    return {
      items: queryRestrictions(snapshot, {
        region: parsed.region,
        start: parsed.start,
        end: parsed.end
      }).map(toPublicRestriction),
      meta: publicResponseMeta(snapshot, 'airspace_restrictions')
    };
  });
};
