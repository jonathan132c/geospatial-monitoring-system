import type { FastifyInstance } from 'fastify';
import type { SnapshotRepository } from '../repositories/snapshot-repository';
import { queryEvents } from '../services/query-service';
import { publicResponseMeta, sanitizeRawPayloadForApi, toPublicEvent } from '../utils/public-view';
import { querySchema, parseBBox } from '../utils/queries';

export const registerEventRoutes = (app: FastifyInstance, repository: SnapshotRepository): void => {
  app.get('/events', async (request) => {
    const parsed = querySchema.parse(request.query);
    const snapshot = await repository.getSnapshot();
    return {
      items: queryEvents(snapshot, {
        region: parsed.region,
        start: parsed.start,
        end: parsed.end,
        minConfidence: parsed.minConfidence,
        sourceType: parsed.sourceType,
        bbox: parseBBox(parsed.bbox)
      }).map(toPublicEvent),
      meta: publicResponseMeta('events')
    };
  });

  app.get('/events/:id', async (request, reply) => {
    const snapshot = await repository.getSnapshot();
    const params = request.params as { id: string };
    const event = snapshot.events.find((item) => item.id === params.id);
    if (!event) {
      reply.code(404);
      return { error: 'Event not found' };
    }

    const auditPayloads = event.evidence
      .map((evidence) => snapshot.rawPayloads.find((payload) => payload.id === evidence.sourcePayloadId))
      .filter((payload): payload is NonNullable<typeof payload> => Boolean(payload))
      .map(sanitizeRawPayloadForApi);

    return {
      ...toPublicEvent(event),
      auditPayloads,
      meta: publicResponseMeta('event_detail')
    };
  });
};
